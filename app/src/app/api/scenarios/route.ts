/**
 * Finrate — Senaryo API
 *
 * POST /api/scenarios
 *
 * Solo analiz:
 *   Body: { analysisId: string, targetGrade: string }
 *
 * Grup analizi:
 *   Body: { groupId: string, targetGrade: string, currentScore: number }
 *
 * Response: { scenarios: ScenarioResult[], currentScore: number, currentGrade: string, sector: string }
 */

import { NextRequest }           from 'next/server'
import { jsonUtf8 }              from '@/lib/http/jsonUtf8'
import { prisma }                from '@/lib/db'
import { getUserIdFromRequest }  from '@/lib/auth'
import type { BalanceSheet }     from '@/lib/scoring/mutation'
import { runScenarios }          from '@/lib/scoring/scenarioEngine'
import { calculateScore, scoreToRating } from '@/lib/scoring/score'
import type { RatioResult }      from '@/lib/scoring/ratios'

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

const n = (v: number | null | undefined): number | null => (v != null ? v : null)

/** Sadece en son dönem için GRANULAR_FIELDS sıralaması */
function periodOrderNum(yr: number, per: string): number {
  const m: Record<string, number> = { Q1: 1, H1: 2, Q2: 3, Q3: 6, H2: 9, Q4: 12, ANNUAL: 13 }
  return yr * 100 + (m[per] ?? 5)
}

/** FinancialData satırını (tip Record) BalanceSheet'e dönüştür */
function fdToSheet(fd: Record<string, number | null>): BalanceSheet {
  const retainedNet = ((fd.retainedEarnings ?? 0) - (fd.retainedLosses ?? 0)) || null
  return {
    cash:                     n(fd.cash),
    tradeReceivables:         n(fd.tradeReceivables),
    otherReceivables:         n(fd.otherReceivables),
    inventory:                n(fd.inventory),
    advancesPaid:             n(fd.prepaidSuppliers),
    otherCurrentAssets:       n(fd.otherCurrentAssets),
    tangibleAssets:           n(fd.tangibleAssets),
    intangibleAssets:         n(fd.intangibleAssets),
    otherNonCurrentAssets:    n(fd.otherNonCurrentAssets),
    shortTermFinancialDebt:   n(fd.shortTermFinancialDebt),
    tradePayables:            n(fd.tradePayables),
    otherShortTermLiabilities: n(fd.otherShortTermPayables),
    advancesReceived:         n(fd.advancesReceived),
    taxPayables:              n(fd.taxPayables),
    longTermFinancialDebt:    n(fd.longTermFinancialDebt),
    otherLongTermLiabilities: n(fd.otherNonCurrentLiabilities),
    paidInCapital:            n(fd.paidInCapital),
    retainedEarnings:         retainedNet,
    revenue:                  n(fd.revenue),
    costOfSales:              n(fd.cogs),
    operatingExpenses:        n(fd.operatingExpenses),
    interestExpense:          n(fd.interestExpense),
    netProfit:                n(fd.netProfitCurrentYear),
  }
}

// ─── POST /api/scenarios ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  let body: {
    analysisId?:  string
    groupId?:     string
    targetGrade?: string
    currentScore?: number
  }
  try {
    body = await req.json()
  } catch {
    return jsonUtf8({ error: 'Geçersiz JSON.' }, { status: 400 })
  }

  const { analysisId, groupId, targetGrade } = body

  if (!targetGrade) {
    return jsonUtf8({ error: 'targetGrade zorunludur.' }, { status: 400 })
  }
  if (!analysisId && !groupId) {
    return jsonUtf8({ error: 'analysisId veya groupId zorunludur.' }, { status: 400 })
  }

  // ── SOLO PATH ──────────────────────────────────────────────────────────────

  if (analysisId) {
    const analysis = await prisma.analysis.findFirst({
      where:   { id: analysisId, userId },
      include: { financialData: true, entity: { select: { sector: true } } },
    })

    if (!analysis)           return jsonUtf8({ error: 'Analiz bulunamadı.' },         { status: 404 })
    if (!analysis.financialData) return jsonUtf8({ error: 'Finansal veri bulunamadı.' }, { status: 422 })

    const fd     = analysis.financialData as unknown as Record<string, number | null>
    const sector = analysis.entity?.sector ?? 'Diğer'

    // Finansal skoru belirle: ratios.__financialScore → calculateScore → finalScore
    let currentScore: number
    if (analysis.ratios) {
      const parsedRatios = JSON.parse(analysis.ratios as string) as RatioResult & { __financialScore?: number }
      if (parsedRatios.__financialScore != null) {
        currentScore = parsedRatios.__financialScore
      } else {
        currentScore = calculateScore(parsedRatios, sector).finalScore
      }
    } else {
      currentScore = analysis.finalScore ?? 0
    }

    const sheet = fdToSheet(fd)
    try {
      const scenarios = runScenarios(sheet, sector, currentScore, targetGrade)
      return jsonUtf8({ scenarios, currentScore, currentGrade: scoreToRating(currentScore), sector })
    } catch (error) {
      return jsonUtf8({ error: String(error) }, { status: 400 })
    }
  }

  // ── GROUP PATH ─────────────────────────────────────────────────────────────

  if (groupId) {
    const currentScore = body.currentScore ?? 0

    // Grup + konsolidasyona dahil entity'ler
    const group = await prisma.group.findFirst({
      where:   { id: groupId, userId },
      include: {
        entities: {
          where:  { isActive: true },
          select: {
            id:                   true,
            entityType:           true,
            ownershipPct:         true,
            sector:               true,
            consolidationInclude: true,
          },
        },
        groupElimination: true,
      },
    })

    if (!group) return jsonUtf8({ error: 'Grup bulunamadı.' }, { status: 404 })

    // Sektör — parent entity'den, yoksa ilk entity'den
    const parentEntity = group.entities.find(e => e.entityType === 'PARENT')
    const sector       = parentEntity?.sector ?? group.entities[0]?.sector ?? 'Diğer'

    // Her entity için en son analizin finansal verisini getir
    const entityIds = group.entities
      .filter(e => e.consolidationInclude)
      .map(e => e.id)

    const allAnalyses = await prisma.analysis.findMany({
      where:    { entityId: { in: entityIds } },
      include:  { financialData: true },
      orderBy:  [{ year: 'desc' }, { period: 'desc' }],
    })

    // Entity başına en son analiz
    const latestByEntity = new Map<string, typeof allAnalyses[0]>()
    for (const a of allAnalyses) {
      if (a.entityId && !latestByEntity.has(a.entityId)) {
        latestByEntity.set(a.entityId, a)
      }
    }

    // En son dönemi bul (periodOrderNum'a göre)
    let bestOrder = -Infinity
    let latestYear = 0; let latestPeriod = 'ANNUAL'
    for (const a of latestByEntity.values()) {
      const ord = periodOrderNum(a.year, a.period)
      if (ord > bestOrder) { bestOrder = ord; latestYear = a.year; latestPeriod = a.period }
    }

    // GRANULAR_FIELDS — gruplar/[id]/route.ts ile aynı liste
    const GRANULAR_FIELDS = [
      'cash','tradeReceivables','otherReceivables','inventory','prepaidSuppliers',
      'otherCurrentAssets','tangibleAssets','intangibleAssets',
      'otherNonCurrentAssets',
      'shortTermFinancialDebt','tradePayables','otherShortTermPayables','advancesReceived',
      'taxPayables',
      'longTermFinancialDebt','otherNonCurrentLiabilities',
      'paidInCapital','retainedEarnings','retainedLosses','netProfitCurrentYear',
      'revenue','cogs','operatingExpenses','interestExpense','netProfit',
    ]

    // Ağırlıklı toplama (%50+ hisse)
    const agg: Record<string, number> = {}
    for (const entity of group.entities.filter(e => e.consolidationInclude)) {
      const ownershipPct = (entity.ownershipPct ?? 1) * 100
      if (ownershipPct < 50) continue
      const latest = latestByEntity.get(entity.id)
      const fd     = latest?.financialData
      if (!fd) continue
      const fdRec  = fd as unknown as Record<string, number | null>
      for (const f of GRANULAR_FIELDS) {
        agg[f] = (agg[f] ?? 0) + (fdRec[f] ?? 0)
      }
    }

    // Eliminasyonlar uygula
    const e = group.groupElimination ?? {
      intercompanySales: 0, intercompanyPurchases: 0,
      intercompanyReceivables: 0, intercompanyPayables: 0,
      intercompanyAdvancesGiven: 0, intercompanyAdvancesReceived: 0,
      intercompanyProfit: 0,
    }
    agg.revenue              = Math.max(0, (agg.revenue ?? 0) - e.intercompanySales)
    agg.cogs                 = Math.max(0, (agg.cogs ?? 0) - e.intercompanyPurchases)
    agg.tradeReceivables     = Math.max(0, (agg.tradeReceivables ?? 0) - e.intercompanyReceivables)
    agg.tradePayables        = Math.max(0, (agg.tradePayables ?? 0) - e.intercompanyPayables)
    agg.prepaidSuppliers     = Math.max(0, (agg.prepaidSuppliers ?? 0) - e.intercompanyAdvancesGiven)
    agg.advancesReceived     = Math.max(0, (agg.advancesReceived ?? 0) - e.intercompanyAdvancesReceived)
    // Gerçekleşmemiş grup kârı stoklardan / aktiften düşülür
    agg.inventory            = Math.max(0, (agg.inventory ?? 0) - e.intercompanyProfit)
    agg.retainedEarnings     = (agg.retainedEarnings ?? 0) - e.intercompanyProfit

    // Null güvenli toplam: negatif bakiye yerine null döner
    const aggNullable: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(agg)) {
      aggNullable[k] = v !== 0 ? v : null
    }

    const sheet = fdToSheet(aggNullable)
    try {
      const scenarios = runScenarios(sheet, sector, currentScore, targetGrade)
      return jsonUtf8({ scenarios, currentScore, currentGrade: scoreToRating(currentScore), sector })
    } catch (error) {
      return jsonUtf8({ error: String(error) }, { status: 400 })
    }
  }

  return jsonUtf8({ error: 'Geçersiz istek.' }, { status: 400 })
}
