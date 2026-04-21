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

  // 7. Çok dönemli bilanço/gelir tablosu (granüler kalemler)
  const GRANULAR_FIELDS = [
    'cash','tradeReceivables','otherReceivables','inventory','prepaidSuppliers',
    'otherCurrentAssets','totalCurrentAssets','tangibleAssets','intangibleAssets',
    'longTermPrepaidExpenses','totalNonCurrentAssets','totalAssets',
    'shortTermFinancialDebt','tradePayables','otherShortTermPayables','advancesReceived',
    'taxPayables','totalCurrentLiabilities','longTermFinancialDebt','otherNonCurrentLiabilities',
    'totalNonCurrentLiabilities','paidInCapital','retainedEarnings','retainedLosses',
    'netProfitCurrentYear','totalEquity','totalLiabilitiesAndEquity',
    'revenue','cogs','grossProfit','operatingExpenses','ebit','interestExpense','netProfit',
  ]

  // (year, period) bazında entity analizlerini grupla
  type PeriodEntry = { year: number; period: string; entityData: Map<string, typeof allAnalyses[0]> }
  const periodEntriesMap = new Map<string, PeriodEntry>()
  for (const a of allAnalyses) {
    if (!a.entityId) continue
    const pKey = `${a.year}-${a.period}`
    if (!periodEntriesMap.has(pKey))
      periodEntriesMap.set(pKey, { year: a.year, period: a.period, entityData: new Map() })
    const p = periodEntriesMap.get(pKey)!
    if (!p.entityData.has(a.entityId)) p.entityData.set(a.entityId, a)
  }

  function periodOrderNum(yr: number, per: string): number {
    const m: Record<string, number> = { Q1: 1, H1: 2, Q2: 3, Q3: 6, H2: 9, Q4: 12, ANNUAL: 13 }
    return yr * 100 + (m[per] ?? 5)
  }

  const consolidatedPeriods = [...periodEntriesMap.values()]
    .sort((a, b) => periodOrderNum(a.year, a.period) - periodOrderNum(b.year, b.period))
    .slice(-5)  // En fazla 5 dönem
    .map(({ year, period, entityData }) => {
      const agg: Record<string, number> = {}
      for (const entity of group.entities.filter(e => e.consolidationInclude)) {
        const ownershipPct100 = (entity.ownershipPct ?? 1) * 100
        if (ownershipPct100 < 50) continue
        const fd = entityData.get(entity.id)?.financialData
        if (!fd) continue
        for (const f of GRANULAR_FIELDS) {
          agg[f] = (agg[f] ?? 0) + (((fd as unknown) as Record<string, number | null>)[f] ?? 0)
        }
      }
      // Eliminasyonları uygula (tüm dönemler için aynı eliminasyonlar)
      const e = eliminations
      agg.revenue               = Math.max(0, (agg.revenue               ?? 0) - e.intercompanySales)
      agg.cogs                  = Math.max(0, (agg.cogs                  ?? 0) - e.intercompanyPurchases)
      agg.grossProfit           = Math.max(0, agg.revenue - agg.cogs)
      agg.totalCurrentAssets    = Math.max(0, (agg.totalCurrentAssets    ?? 0) - e.intercompanyReceivables - e.intercompanyAdvancesGiven)
      agg.totalNonCurrentAssets = Math.max(0, (agg.totalNonCurrentAssets ?? 0) - e.intercompanyProfit)
      agg.totalAssets           = Math.max(0, (agg.totalAssets           ?? 0) - e.intercompanyReceivables - e.intercompanyAdvancesGiven - e.intercompanyProfit)
      agg.totalCurrentLiabilities = Math.max(0, (agg.totalCurrentLiabilities ?? 0) - e.intercompanyPayables - e.intercompanyAdvancesReceived)
      agg.totalEquity             = (agg.totalEquity ?? 0) - e.intercompanyProfit  // negatife düşebilir
      agg.totalLiabilitiesAndEquity = agg.totalCurrentLiabilities + (agg.totalNonCurrentLiabilities ?? 0) + agg.totalEquity
      return {
        year, period,
        label: period === 'ANNUAL' ? String(year) : `${year}/${period}`,
        financials: agg,
      }
    })

  // 8. Konsolide skor + kategori skorları
  let consolidated = null
  if (consolidationInputs.length > 0) {
    const aggregated = aggregateFinancials(consolidationInputs)
    const individualScores = entitiesOut
      .filter(e => e.latestAnalysis !== null)
      .map(e => ({ finalScore: e.latestAnalysis!.finalScore, totalAssets: e.totalAssets }))
    const result = calculateConsolidatedScore(aggregated, eliminations, sector, individualScores)

    // Kategori skorlarını consolidatedRatios'dan hesapla
    const catScores = calculateScore(result.consolidatedRatios, sector)

    // Debug: kârlılık rasyoları sıfır çıkıyorsa sebebini bul
    console.log('[consolidation] kârlılık rasyoları:', {
      grossMargin:     result.consolidatedRatios.grossMargin,
      ebitdaMargin:    result.consolidatedRatios.ebitdaMargin,
      ebitMargin:      result.consolidatedRatios.ebitMargin,
      netProfitMargin: result.consolidatedRatios.netProfitMargin,
      roa:             result.consolidatedRatios.roa,
      roe:             result.consolidatedRatios.roe,
      roic:            result.consolidatedRatios.roic,
      profitabilityScore: catScores.profitabilityScore,
    })
    console.log('[consolidation] eliminasyon sonrası finansallar:', {
      revenue:    result.eliminatedFinancials.revenue,
      ebit:       result.eliminatedFinancials.ebit,
      ebitda:     result.eliminatedFinancials.ebitda,
      netProfit:  result.eliminatedFinancials.netProfit,
      totalAssets: result.eliminatedFinancials.totalAssets,
      totalEquity: result.eliminatedFinancials.totalEquity,
    })

    consolidated = {
      consolidatedScore:    result.consolidatedScore,
      consolidatedGrade:    result.consolidatedGrade,
      weightedAverageScore: result.weightedAverageScore,
      weakestLinkApplied:   result.weakestLinkApplied,
      liquidityScore:       catScores.liquidityScore,
      profitabilityScore:   catScores.profitabilityScore,
      leverageScore:        catScores.leverageScore,
      activityScore:        catScores.activityScore,
      eliminatedFinancials: result.eliminatedFinancials,
      consolidatedRatios:   result.consolidatedRatios,
    }
  }

  return jsonUtf8({
    group:               { id: group.id, name: group.name, sector },
    entities:            entitiesOut,
    consolidated,
    consolidatedPeriods,
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
