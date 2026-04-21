import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import {
  aggregateFinancials,
  calculateConsolidatedScore,
  type InterCompanyEliminations,
} from '@/lib/scoring/consolidation'
import type { RatioResult } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'

// GET /api/groups/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params

  // 1. Grup + aktif entity'ler + kayıtlı eliminasyon
  const group = await prisma.group.findFirst({
    where: { id, userId },
    include: {
      entities: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          entityType: true,
          ownershipPct: true,
          sector: true,
          consolidationInclude: true,
        },
      },
      groupElimination: true,
    },
  })

  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  // 2. Her entity için en son analiz + finansal veriler
  const entityIds = group.entities.map(e => e.id)

  const allAnalyses = await prisma.analysis.findMany({
    where: { entityId: { in: entityIds } },
    include: { financialData: true },
    orderBy: [{ year: 'desc' }, { period: 'desc' }],
  })

  // En son analizi entity başına tut (ilk eşleşme = en yeni)
  const latestByEntity = new Map<string, typeof allAnalyses[0]>()
  for (const a of allAnalyses) {
    if (a.entityId && !latestByEntity.has(a.entityId)) {
      latestByEntity.set(a.entityId, a)
    }
  }

  // 3. UI'a dönecek entity listesi
  const entitiesOut = group.entities.map(entity => {
    const analysis = latestByEntity.get(entity.id) ?? null
    // ownershipPct DB'de 0–1 aralığında saklanır → UI için 0–100'e çevir
    const ownershipPct100 = (entity.ownershipPct ?? 1) * 100
    return {
      id:           entity.id,
      name:         entity.name,
      ownershipPct: Math.round(ownershipPct100),
      totalAssets:  analysis?.financialData?.totalAssets ?? 0,
      latestAnalysis: analysis
        ? { finalScore: analysis.finalScore ?? 0, grade: analysis.finalRating ?? 'N/A' }
        : null,
    }
  })

  // 4. Konsolidasyona girecek entity'ler (consolidationInclude = true)
  const consolidationInputs = group.entities
    .filter(e => e.consolidationInclude)
    .flatMap(entity => {
      const analysis = latestByEntity.get(entity.id)
      if (!analysis?.financialData) return []

      let ratios: RatioResult | null = null
      try { ratios = analysis.ratios ? JSON.parse(analysis.ratios) : null } catch { /* skip */ }
      if (!ratios) return []

      const fd = analysis.financialData
      // ownershipPct DB'de 0–1 → aggregateFinancials 0–100 bekler
      const ownershipPct100 = (entity.ownershipPct ?? 1) * 100
      return [{
        ratios,
        financials: fd,
        ownershipPct: ownershipPct100,
        totalAssets:  fd.totalAssets ?? 0,
      }]
    })

  // 5. Sektör — PARENT entity'den, yoksa ilk entity'den al
  const parentEntity = group.entities.find(e => e.entityType === 'PARENT')
  const sector = parentEntity?.sector ?? group.entities[0]?.sector ?? 'Diğer'

  // 6. Eliminasyonlar — DB'den çek, yoksa sıfır değerler
  const eliminations: InterCompanyEliminations = group.groupElimination ?? {
    intercompanySales:            0,
    intercompanyPurchases:        0,
    intercompanyReceivables:      0,
    intercompanyPayables:         0,
    intercompanyAdvancesGiven:    0,
    intercompanyAdvancesReceived: 0,
    intercompanyProfit:           0,
  }

  // 7. Konsolide skor + kategori skorları
  let consolidated = null
  if (consolidationInputs.length > 0) {
    const aggregated = aggregateFinancials(consolidationInputs)
    const individualScores = entitiesOut
      .filter(e => e.latestAnalysis !== null)
      .map(e => ({ finalScore: e.latestAnalysis!.finalScore, totalAssets: e.totalAssets }))
    const result = calculateConsolidatedScore(aggregated, eliminations, sector, individualScores)

    // Kategori skorlarını consolidatedRatios'dan hesapla
    const catScores = calculateScore(result.consolidatedRatios, sector)
    consolidated = {
      consolidatedScore:    result.consolidatedScore,
      consolidatedGrade:    result.consolidatedGrade,
      weightedAverageScore: result.weightedAverageScore,
      weakestLinkApplied:   result.weakestLinkApplied,
      liquidityScore:       catScores.liquidityScore,
      profitabilityScore:   catScores.profitabilityScore,
      leverageScore:        catScores.leverageScore,
      activityScore:        catScores.activityScore,
    }
  }

  return jsonUtf8({
    group:        { id: group.id, name: group.name, sector },
    entities:     entitiesOut,
    consolidated,
    eliminations,
  })
}

// PATCH /api/groups/[id] — şirket ekle/çıkar veya adı güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const body = await req.json()

  // Şirket gruba ekle/çıkar — ownership kontrolü zorunlu
  if (body.addEntityId) {
    const entityToAdd = await prisma.entity.findFirst({ where: { id: body.addEntityId, userId } })
    if (!entityToAdd) return jsonUtf8({ error: 'Şirket bulunamadı veya erişim yetkiniz yok.' }, { status: 404 })
    await prisma.entity.update({
      where: { id: body.addEntityId },
      data: { groupId: id, entityType: body.entityType ?? 'SUBSIDIARY' },
    })
  }
  if (body.removeEntityId) {
    const entityToRemove = await prisma.entity.findFirst({ where: { id: body.removeEntityId, userId } })
    if (!entityToRemove) return jsonUtf8({ error: 'Şirket bulunamadı veya erişim yetkiniz yok.' }, { status: 404 })
    await prisma.entity.update({
      where: { id: body.removeEntityId },
      data: { groupId: null, entityType: 'STANDALONE' },
    })
  }

  // Ad güncellemesi
  if (body.name) {
    await prisma.group.update({ where: { id }, data: { name: body.name.trim() } })
  }

  const updated = await prisma.group.findFirst({
    where: { id },
    include: { entities: { where: { isActive: true }, select: { id: true, name: true, entityType: true } } },
  })

  return jsonUtf8({ group: updated })
}

// DELETE /api/groups/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  // Gruptaki şirketleri standalone yap
  await prisma.entity.updateMany({ where: { groupId: id }, data: { groupId: null, entityType: 'STANDALONE' } })
  await prisma.group.delete({ where: { id } })

  return jsonUtf8({ success: true })
}
