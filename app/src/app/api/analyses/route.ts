import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import {
  detectMissingQuarterlySource,
  hasBalanceAccounts,
  hasIncomeAccounts,
} from '@/lib/analysis/missingDataDetection'

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
      entity: { select: { id: true, name: true, sector: true, taxNumber: true } },
      financialAccounts: {
        select: { accountCode: true },
      },
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

  const analyses = raw.map((a: (typeof raw)[number]) => {
    const { financialAccounts, ...rest } = a

    const parsedRatios = rest.ratios ? JSON.parse(rest.ratios as string) : null
    const overallCoverage: number | null = parsedRatios?.__overallCoverage ?? null
    const insufficientCategories: string[] = parsedRatios?.__insufficientCategories ?? []

    const accountCodes = (financialAccounts ?? []).map(fa => fa.accountCode)

    return {
      ...rest,
      ratios: parsedRatios,
      overallCoverage,
      insufficientCategories,
      hasBalanceAccounts:              hasBalanceAccounts(accountCodes),
      hasIncomeAccounts:               hasIncomeAccounts(accountCodes),
      missingQuarterlySourceWarning:   detectMissingQuarterlySource(a.period, accountCodes),
    }
  })

  return jsonUtf8({ analyses })
}
