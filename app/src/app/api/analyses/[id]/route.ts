import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { sortPeriods } from '@/lib/periods'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params

  // Manuel dönem seçimi: compareIds sorgu parametresi
  // compareIdsParam !== null  →  manuel mod (boş string bile manuel)
  // compareIdsParam === null  →  otomatik mod (eski davranış)
  const url = new URL(req.url)
  const compareIdsParam = url.searchParams.get('compareIds')
  const hasManualSelection = compareIdsParam !== null

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
      roadmapSnapshot:   true,   // YENİ — Faz 7.3.60.2
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
          // BUG-4: Bilanço residual hesabı için detay alanları
          otherCurrentAssets: true,
          advancesReceived: true,
          taxPayables: true,
          shortTermProvisions: true,
          deferredRevenue: true,
          otherShortTermPayables: true,
          otherCurrentLiabilities: true,
          otherNonCurrentLiabilities: true,
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

  // ─── Trend verisi ────────────────────────────────────────────────────────
  // Manuel mod: compareIds'teki analizler (mevcut hariç) — max 5
  // Otomatik mod: aynı dönem tipi, önceki 3 yıl (eski davranış)
  const trendSelect = {
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
        cogs: true,
        grossProfit: true,
        operatingExpenses: true,
        ebit: true,
        interestExpense: true,
        ebt: true,
        netProfit: true,
        ebitda: true,
        taxExpense: true,
        totalAssets: true,
        totalEquity: true,
        totalLiabilitiesAndEquity: true,
        cash: true,
        tradeReceivables: true,
        inventory: true,
        totalCurrentAssets: true,
        tangibleAssets: true,
        intangibleAssets: true,
        totalNonCurrentAssets: true,
        shortTermFinancialDebt: true,
        tradePayables: true,
        totalCurrentLiabilities: true,
        longTermFinancialDebt: true,
        totalNonCurrentLiabilities: true,
        paidInCapital: true,
        retainedEarnings: true,
        retainedLosses: true,
        // BUG-4: Bilanço residual için detay alanları
        otherCurrentAssets: true,
        advancesReceived: true,
        taxPayables: true,
        shortTermProvisions: true,
        deferredRevenue: true,
        otherShortTermPayables: true,
        otherCurrentLiabilities: true,
        otherNonCurrentLiabilities: true,
      },
    },
  } as const

  let trendRaw: Awaited<ReturnType<typeof prisma.analysis.findMany<{ select: typeof trendSelect }>>>

  if (hasManualSelection && entityId) {
    // Manuel mod: seçilen ID'ler (mevcut analiz ID'si hariç, max 5)
    const manualIds = (compareIdsParam ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s !== id)
      .slice(0, 5)

    trendRaw = manualIds.length > 0
      ? await prisma.analysis.findMany({
          where: { id: { in: manualIds }, entityId, userId },
          select: trendSelect,
        })
      : []
  } else if (entityId) {
    // Otomatik mod: aynı dönem tipi, önceki yıllar, maks 3
    trendRaw = await prisma.analysis.findMany({
      where: {
        entityId,
        userId,
        period: a.period,
        year: { lt: a.year },
      },
      orderBy: { year: 'desc' },
      take: 3,
      select: trendSelect,
    })
  } else {
    trendRaw = []
  }

  // Kronolojik sıraya al — grafik için
  const trendAnalyses = sortPeriods(trendRaw).map(ta => ({
    ...ta,
    ratios: ta.ratios ? JSON.parse(ta.ratios as string) : null,
  }))

  // ─── Yanıt ───────────────────────────────────────────────────────────────
  return jsonUtf8({
    ...a,
    reportedAt: a.reportedAt?.toISOString() ?? null,   // N1: Date → ISO string (jsonUtf8 Date guard ile çift güvence)
    ratios: a.ratios ? JSON.parse(a.ratios as string) : null,
    optimizerSnapshot: a.optimizerSnapshot ? JSON.parse(a.optimizerSnapshot as string) : null,
    // YENİ — parse edilmiş wrapper dön (optimizerSnapshot pattern ile aynı, Codex D7)
    roadmapSnapshot:   a.roadmapSnapshot   ? JSON.parse(a.roadmapSnapshot   as string) : null,
    subjectiveInput,      // SubjectiveInput | null
    trendAnalyses,        // önceki yıllar asc, maks 3 kayıt
  })
}
