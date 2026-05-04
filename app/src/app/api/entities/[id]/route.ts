import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calculateRatios, TURKEY_PPI } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'
import { createOptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'

const VALID_SECTORS = new Set([
  'Üretim', 'Ticaret', 'Hizmet', 'İnşaat', 'Turizm', 'Tarım',
  'Enerji', 'Sağlık', 'Eğitim', 'Finans', 'Teknoloji', 'Diğer',
])

const VALID_ENTITY_TYPES = new Set(['STANDALONE', 'PARENT', 'SUBSIDIARY', 'JV'])

// GET /api/entities/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const entity = await prisma.entity.findFirst({
    where: { id, userId },
    include: {
      financialData: { orderBy: [{ year: 'desc' }, { period: 'asc' }] },
      group: { select: { id: true, name: true } },
    },
  })

  if (!entity) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })
  return jsonUtf8({ entity })
}

// PATCH /api/entities/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.entity.findFirst({ where: { id, userId } })
  if (!existing) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  try {
    const body = await req.json()
    const { name, taxNumber, sector, entityType, groupId, ownershipPct, weightBasis } = body

    // ── Validasyon ────────────────────────────────────────────────────────────
    if (name !== undefined && name.trim().length < 2) {
      return jsonUtf8({ error: 'Şirket adı en az 2 karakter olmalıdır.' }, { status: 400 })
    }
    if (taxNumber !== undefined && taxNumber !== null && taxNumber !== '') {
      if (!/^\d{10}$/.test(String(taxNumber))) {
        return jsonUtf8({ error: 'VKN 10 haneli rakam olmalıdır.' }, { status: 400 })
      }
    }
    if (sector !== undefined && sector !== null && sector !== '') {
      if (!VALID_SECTORS.has(sector)) {
        return jsonUtf8({ error: 'Geçersiz sektör.' }, { status: 400 })
      }
    }
    if (entityType !== undefined && entityType !== null) {
      if (!VALID_ENTITY_TYPES.has(entityType)) {
        return jsonUtf8({ error: 'Geçersiz şirket tipi.' }, { status: 400 })
      }
    }

    // Sektör değişti mi? (boş string → null normalleştirmesi dahil)
    const sectorChanged = sector !== undefined && (sector || null) !== existing.sector

    const entity = await prisma.entity.update({
      where: { id },
      data: {
        ...(name        !== undefined && { name: name.trim() }),
        ...(taxNumber   !== undefined && { taxNumber: taxNumber || null }),
        ...(sector      !== undefined && { sector: sector || null }),
        ...(entityType  !== undefined && { entityType }),
        ...(groupId     !== undefined && { groupId }),
        ...(ownershipPct !== undefined && { ownershipPct }),
        ...(weightBasis  !== undefined && { weightBasis }),
      },
    })

    // ── Sektör değişince analiz recalc ───────────────────────────────────────
    let recalculated = 0
    if (sectorChanged) {
      const newSector = sector || null
      const allData = await prisma.financialData.findMany({
        where: { entityId: id },
        include: { analysis: true },
      })
      for (const fd of allData) {
        let prevYearData = await prisma.financialData.findFirst({
          where: { entityId: id, year: fd.year - 1, period: fd.period },
          select: { revenue: true, inventory: true, tradeReceivables: true, tradePayables: true, advancesReceived: true },
        })
        if (!prevYearData) {
          prevYearData = await prisma.financialData.findFirst({
            where: { entityId: id, year: fd.year - 1 },
            orderBy: { period: 'desc' },
            select: { revenue: true, inventory: true, tradeReceivables: true, tradePayables: true, advancesReceived: true },
          })
        }
        const fields = fd as unknown as Record<string, unknown>
        const enriched = {
          ...fields,
          sector:               newSector,
          prevRevenue:          prevYearData?.revenue           ?? null,
          prevInventory:        prevYearData?.inventory         ?? null,
          prevTradeReceivables: prevYearData?.tradeReceivables  ?? null,
          prevTradePayables:    prevYearData?.tradePayables     ?? null,
          prevAdvancesReceived: prevYearData?.advancesReceived  ?? null,
          ppiRate: TURKEY_PPI[fd.year] ?? TURKEY_PPI[2024],
        }
        const ratios = calculateRatios(enriched as Parameters<typeof calculateRatios>[0])
        const score  = calculateScore(ratios, newSector)
        const optimizerSnapshot = createOptimizerSnapshot(ratios, score.finalScore, newSector)

        if (fd.analysis) {
          // Subjektif + finansal puan meta alanlarını koru
          let existingMeta: Record<string, unknown> = {}
          try {
            if (fd.analysis.ratios) existingMeta = JSON.parse(fd.analysis.ratios as string)
          } catch { /* bozuk JSON → meta sıfırlanır, kritik değil */ }

          await prisma.analysis.update({
            where: { id: fd.analysis.id },
            data: {
              finalScore:         score.finalScore,
              finalRating:        score.finalRating,
              liquidityScore:     score.liquidityScore,
              profitabilityScore: score.profitabilityScore,
              leverageScore:      score.leverageScore,
              activityScore:      score.activityScore,
              ratios: JSON.stringify({
                ...ratios,
                __overallCoverage:        score.overallCoverage ?? null,
                __insufficientCategories: score.insufficientCategories,
                ...(existingMeta.__subjectiveTotal !== undefined && { __subjectiveTotal: existingMeta.__subjectiveTotal }),
                ...(existingMeta.__financialScore  !== undefined && { __financialScore:  existingMeta.__financialScore }),
              }),
              optimizerSnapshot: JSON.stringify(optimizerSnapshot),
              updatedAt:         new Date(),
            },
          })
          recalculated++
        }
      }
    }

    return jsonUtf8({ entity, recalculated })
  } catch (err) {
    console.error('[PATCH /api/entities]', err)
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}

// DELETE /api/entities/[id] — soft delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.entity.findFirst({ where: { id, userId } })
  if (!existing) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  await prisma.entity.update({ where: { id }, data: { isActive: false } })
  return jsonUtf8({ success: true })
}
