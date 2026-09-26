import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import {
  detectMissingQuarterlySource,
  hasBalanceAccounts,
  hasIncomeAccounts,
} from '@/lib/analysis/missingDataDetection'
import { getAccountFlags } from '@/lib/analysis/accountFlags'

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  // Sayfalama (isteğe bağlı): ?limit=50&offset=0 — verilmezse eski davranış (ilk 1000)
  const sp = req.nextUrl?.searchParams
  const limitParam  = Number(sp?.get('limit') ?? '')
  const offsetParam = Number(sp?.get('offset') ?? '')
  const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 1000
  const skip = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0

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
      roadmapSnapshot: true,   // YENİ — boolean olarak expose edilecek
      entity: { select: { id: true, name: true, sector: true, taxNumber: true } },
      // Hesap satırları listeye taşınmaz; bayraklar tek GROUP BY sorgusuyla hesaplanır (getAccountFlags).
      // financialAccounts yalnızca yedek yol (sorgu başarısızsa) için 1 kayıtla sınırlı DEĞİL — eski mock'lar için korunur.
      financialAccounts: {
        select: { accountCode: true },
        take: 0,
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
    take,
    skip,
  })

  const flags = await getAccountFlags(raw.map(a => a.id))

  const analyses = raw.map((a: (typeof raw)[number]) => {
    const { financialAccounts, roadmapSnapshot, ...rest } = a

    const parsedRatios = rest.ratios ? JSON.parse(rest.ratios as string) : null
    const overallCoverage: number | null = parsedRatios?.__overallCoverage ?? null
    const insufficientCategories: string[] = parsedRatios?.__insufficientCategories ?? []

    // Bayraklar: toplu sorgudan; yoksa (yedek) satır listesinden
    const f = flags.get(a.id)
    const accountCodes = (financialAccounts ?? []).map(fa => fa.accountCode)
    const hasBal = f ? f.hasBalance : hasBalanceAccounts(accountCodes)
    const hasInc = f ? f.hasIncome  : hasIncomeAccounts(accountCodes)
    const pseudoCodes = f ? [...(hasBal ? ['1'] : []), ...(hasInc ? ['6'] : [])] : accountCodes

    return {
      ...rest,
      ratios: parsedRatios,
      overallCoverage,
      insufficientCategories,
      subjectiveMissing: parsedRatios?.__subjectiveTotal == null,
      hasBalanceAccounts:              hasBal,
      hasIncomeAccounts:               hasInc,
      missingQuarterlySourceWarning:   detectMissingQuarterlySource(a.period, pseudoCodes),
      // YENİ — boolean (frontend tüm JSON'a ihtiyacı yok, performans)
      hasRoadmapSnapshot:              roadmapSnapshot != null,
    }
  })

  return jsonUtf8({ analyses })
}
