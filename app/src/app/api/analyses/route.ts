import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const raw = await prisma.analysis.findMany({
    where: { userId, mode: 'SOLO', entity: { isActive: true } },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      year: true,
      period: true,
      updatedAt: true,
      finalScore: true,
      finalRating: true,
      liquidityScore: true,
      profitabilityScore: true,
      leverageScore: true,
      activityScore: true,
      ratios: true,
      optimizerSnapshot: true,
      entity: { select: { id: true, name: true, sector: true } },
      financialData: {
        select: {
          revenue: true, cogs: true, grossProfit: true,
          operatingExpenses: true, ebit: true, ebitda: true,
          interestExpense: true, ebt: true, netProfit: true, depreciation: true,
          cash: true, tradeReceivables: true, inventory: true,
          totalCurrentAssets: true, tangibleAssets: true,
          totalNonCurrentAssets: true, totalAssets: true,
          shortTermFinancialDebt: true, tradePayables: true,
          totalCurrentLiabilities: true, longTermFinancialDebt: true,
          totalNonCurrentLiabilities: true,
          totalEquity: true, totalLiabilitiesAndEquity: true,
        },
      },
    },
    take: 100,
  })

  const analyses = raw.map((a) => {
    const parsedRatios = a.ratios ? JSON.parse(a.ratios as string) : null
    const overallCoverage: number | null = parsedRatios?.__overallCoverage ?? null
    return {
      ...a,
      ratios: parsedRatios,
      overallCoverage,
      optimizerSnapshot: a.optimizerSnapshot ? JSON.parse(a.optimizerSnapshot as string) : null,
    }
  })

  return jsonUtf8({ analyses })
}
