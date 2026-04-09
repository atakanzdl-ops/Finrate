import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params

  const a = await prisma.analysis.findFirst({
    where: { id, userId },
    select: {
      id: true,
      year: true,
      period: true,
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
  })

  if (!a) return jsonUtf8({ error: 'Analiz bulunamadı.' }, { status: 404 })

  return jsonUtf8({
    ...a,
    ratios: a.ratios ? JSON.parse(a.ratios as string) : null,
    optimizerSnapshot: a.optimizerSnapshot ? JSON.parse(a.optimizerSnapshot as string) : null,
  })
}
