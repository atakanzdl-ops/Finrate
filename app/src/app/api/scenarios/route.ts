/**
 * Finrate — Senaryo API
 *
 * POST /api/scenarios
 * Body: { analysisId: string, targetGrade: string }
 * Response: { scenarios: ScenarioResult[], currentScore: number, currentGrade: string, sector: string }
 */

import { NextRequest }           from 'next/server'
import { jsonUtf8 }              from '@/lib/http/jsonUtf8'
import { prisma }                from '@/lib/db'
import { getUserIdFromRequest }  from '@/lib/auth'
import type { BalanceSheet }     from '@/lib/scoring/mutation'
import { runScenarios }          from '@/lib/scoring/scenarioEngine'
import { scoreToRating }         from '@/lib/scoring/score'

// ─── POST /api/scenarios ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  let body: { analysisId?: string; targetGrade?: string }
  try {
    body = await req.json()
  } catch {
    return jsonUtf8({ error: 'Geçersiz JSON.' }, { status: 400 })
  }

  const { analysisId, targetGrade } = body
  if (!analysisId || !targetGrade) {
    return jsonUtf8({ error: 'analysisId ve targetGrade zorunludur.' }, { status: 400 })
  }

  // Analiz + finansal veri + entity (sektör için)
  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, userId },
    include: {
      financialData: true,
      entity: { select: { sector: true } },
    },
  })

  if (!analysis) {
    return jsonUtf8({ error: 'Analiz bulunamadı.' }, { status: 404 })
  }

  const fd     = analysis.financialData
  const sector = analysis.entity?.sector ?? 'Diğer'

  if (!fd) {
    return jsonUtf8({ error: 'Finansal veri bulunamadı.' }, { status: 422 })
  }

  const currentScore = analysis.finalScore ?? 0

  // ─── FinancialData → BalanceSheet ──────────────────────────────────────────
  //
  // BalanceSheet alanı           ← FinancialData alanı
  // ──────────────────────────────────────────────────
  // cash                         ← fd.cash
  // tradeReceivables             ← fd.tradeReceivables
  // otherReceivables             ← fd.otherReceivables
  // inventory                    ← fd.inventory
  // advancesPaid                 ← fd.prepaidSuppliers      (159 Sipariş Avansları)
  // otherCurrentAssets           ← fd.otherCurrentAssets
  // tangibleAssets               ← fd.tangibleAssets
  // intangibleAssets             ← fd.intangibleAssets
  // otherNonCurrentAssets        ← fd.otherNonCurrentAssets
  // shortTermFinancialDebt       ← fd.shortTermFinancialDebt
  // tradePayables                ← fd.tradePayables
  // otherShortTermLiabilities    ← fd.otherShortTermPayables
  // advancesReceived             ← fd.advancesReceived
  // taxPayables                  ← fd.taxPayables
  // longTermFinancialDebt        ← fd.longTermFinancialDebt
  // otherLongTermLiabilities     ← fd.otherNonCurrentLiabilities
  // paidInCapital                ← fd.paidInCapital
  // retainedEarnings             ← (fd.retainedEarnings ?? 0) - (fd.retainedLosses ?? 0)
  // revenue                      ← fd.revenue
  // costOfSales                  ← fd.cogs
  // operatingExpenses            ← fd.operatingExpenses
  // interestExpense              ← fd.interestExpense
  // netProfit                    ← fd.netProfitCurrentYear  (cari yıl net kârı)

  const n = (v: number | null | undefined): number | null => (v != null ? v : null)

  const retainedNet = ((fd.retainedEarnings ?? 0) - (fd.retainedLosses ?? 0)) || null

  const sheet: BalanceSheet = {
    cash:                    n(fd.cash),
    tradeReceivables:        n(fd.tradeReceivables),
    otherReceivables:        n(fd.otherReceivables),
    inventory:               n(fd.inventory),
    advancesPaid:            n(fd.prepaidSuppliers),
    otherCurrentAssets:      n(fd.otherCurrentAssets),
    tangibleAssets:          n(fd.tangibleAssets),
    intangibleAssets:        n(fd.intangibleAssets),
    otherNonCurrentAssets:   n(fd.otherNonCurrentAssets),
    shortTermFinancialDebt:  n(fd.shortTermFinancialDebt),
    tradePayables:           n(fd.tradePayables),
    otherShortTermLiabilities: n(fd.otherShortTermPayables),
    advancesReceived:        n(fd.advancesReceived),
    taxPayables:             n(fd.taxPayables),
    longTermFinancialDebt:   n(fd.longTermFinancialDebt),
    otherLongTermLiabilities: n(fd.otherNonCurrentLiabilities),
    paidInCapital:           n(fd.paidInCapital),
    retainedEarnings:        retainedNet,
    revenue:                 n(fd.revenue),
    costOfSales:             n(fd.cogs),
    operatingExpenses:       n(fd.operatingExpenses),
    interestExpense:         n(fd.interestExpense),
    netProfit:               n(fd.netProfitCurrentYear),
  }

  // ─── Senaryo motoru ────────────────────────────────────────────────────────

  const scenarios = runScenarios(sheet, sector, currentScore, targetGrade)

  return jsonUtf8({
    scenarios,
    currentScore,
    currentGrade: scoreToRating(currentScore),
    sector,
  })
}
