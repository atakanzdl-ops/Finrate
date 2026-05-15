import { NextRequest } from 'next/server'
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
      reportedAt: true,   // Rapor oluşturulma tarihi
      entity: { select: { id: true, name: true, sector: true, taxNumber: true, entityType: true } },
      financialData: {
        select: {
          revenue: true, cogs: true, grossProfit: true,
          operatingExpenses: true, ebit: true, ebitda: true,
          interestExpense: true, ebt: true, netProfit: true, depreciation: true,
          taxExpense: true,   // Vergi gideri — gelir tablosu için
          cash: true, tradeReceivables: true, inventory: true,
          totalCurrentAssets: true, tangibleAssets: true,
          totalNonCurrentAssets: true, totalAssets: true,
          shortTermFinancialDebt: true, tradePayables: true,
          totalCurrentLiabilities: true, longTermFinancialDebt: true,
          totalNonCurrentLiabilities: true,
          totalEquity: true, totalLiabilitiesAndEquity: true,
          intangibleAssets: true,    // Maddi Olmayan Duran Varlıklar
          paidInCapital: true,       // Ödenmiş Sermaye
          retainedEarnings: true,    // Geçmiş Yıllar Kârı
          retainedLosses: true,      // Geçmiş Yıllar Zararı
        },
      },
    },
  })

  if (!a) return jsonUtf8({ error: 'Analiz bulunamadı.' }, { status: 404 })

  const entityId = a.entity?.id ?? null

  // ─── SubjectiveInput — entityId @unique üzerinden (analysisId değil) ────
  const subjectiveInput = entityId
    ? await prisma.subjectiveInput.findUnique({ where: { entityId } })
    : null

  // ─── Trend verisi — aynı entity'nin önceki analizleri (maks 3 yıl) ──────
  // Mevcut analizin yılından küçük, aynı dönem tipi, en yakın 3 yıl alınır
  // → desc order + take 3 → sonra asc sıralanır (grafik için sol→sağ)
  const trendRaw = entityId
    ? await prisma.analysis.findMany({
        where: {
          entityId,
          userId,
          period: a.period,
          year: { lt: a.year },
        },
        orderBy: { year: 'desc' },
        take: 3,
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
          financialData: {
            select: {
              revenue: true,
              netProfit: true,
              ebitda: true,
              totalAssets: true,
              totalEquity: true,
              totalCurrentAssets: true,
              totalCurrentLiabilities: true,
              shortTermFinancialDebt: true,
              longTermFinancialDebt: true,
              tradeReceivables: true,
              inventory: true,
              tradePayables: true,
              intangibleAssets: true,
              paidInCapital: true,
              retainedEarnings: true,
              retainedLosses: true,
            },
          },
        },
      })
    : []

  // Kronolojik sıraya al (asc) — grafik için
  const trendAnalyses = trendRaw
    .sort((x, y) => x.year - y.year)
    .map(ta => ({
      ...ta,
      ratios: ta.ratios ? JSON.parse(ta.ratios as string) : null,
    }))

  // ─── Yanıt ───────────────────────────────────────────────────────────────
  return jsonUtf8({
    ...a,
    ratios: a.ratios ? JSON.parse(a.ratios as string) : null,
    optimizerSnapshot: a.optimizerSnapshot ? JSON.parse(a.optimizerSnapshot as string) : null,
    subjectiveInput,      // SubjectiveInput | null
    trendAnalyses,        // önceki yıllar asc, maks 3 kayıt
  })
}
