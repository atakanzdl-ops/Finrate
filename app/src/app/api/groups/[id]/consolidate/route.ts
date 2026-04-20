import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calculateRatios } from '@/lib/scoring/ratios'
import { calculateScore, scoreToRating } from '@/lib/scoring/score'
import { calcSubjectiveScore, combineScores } from '@/lib/scoring/subjective'

// Konsolide bilanço bölüm toplamlarını alt kalemlerden hesapla.
// totalCurrentAssets ve totalNonCurrentAssets her zaman alt kalemlerden override edilir.
// totalAssets: PDF'deki "AKTİF TOPLAM" satırı güvenilir olduğundan DB değeri korunur;
// sadece alt kalem toplamı daha büyükse (DB yanlış düşükse) override edilir.
// Not: bazı şirketlerin duran alt kalemleri parse edilemeyebilir (DEKA 2024 gibi),
// bu durumda totalNonCurrentAssets 0 olur ve override yapılmaz — DB değeri kullanılır.
function recalcBilancoTotals(data: Record<string, number>): void {
  // Dönen Varlıklar — tüm alt kalemler
  const cur =
    (data.cash                 ?? 0) +
    (data.shortTermInvestments ?? 0) +
    (data.tradeReceivables     ?? 0) +
    (data.otherReceivables     ?? 0) +
    (data.inventory            ?? 0) +
    (data.prepaidSuppliers     ?? 0) +
    (data.prepaidExpenses      ?? 0) +
    (data.constructionCosts    ?? 0) +
    (data.otherCurrentAssets   ?? 0)

  // Duran Varlıklar — tüm alt kalemler
  const ncur =
    (data.longTermTradeReceivables  ?? 0) +
    (data.longTermOtherReceivables  ?? 0) +
    (data.longTermInvestments       ?? 0) +
    (data.tangibleAssets            ?? 0) +
    (data.intangibleAssets          ?? 0) +
    (data.depletableAssets          ?? 0) +
    (data.longTermPrepaidExpenses   ?? 0) +
    (data.otherNonCurrentAssets     ?? 0)

  // Dönen ve duran toplamlarını her zaman alt kalemlerden hesapla
  if (cur  > 0) data.totalCurrentAssets    = cur
  if (ncur > 0) data.totalNonCurrentAssets = ncur

  // AKTİF TOPLAM: DB değerini koru (PDF "AKTİF TOPLAM" satırı güvenilir).
  // Sadece alt kalemler daha büyükse override et (DB yanlış düşükse).
  const computed = cur + ncur
  const stored   = data.totalAssets ?? 0
  if (computed > stored) data.totalAssets = computed
}

// Toplanabilir tüm finansal alanlar
const SUMMABLE_FIELDS = [
  // Dönen Varlıklar
  'cash', 'shortTermInvestments', 'tradeReceivables', 'otherReceivables', 'inventory',
  'constructionCosts', 'prepaidExpenses', 'prepaidSuppliers', 'otherCurrentAssets', 'totalCurrentAssets',
  // Duran Varlıklar
  'longTermTradeReceivables', 'longTermOtherReceivables', 'longTermInvestments',
  'tangibleAssets', 'intangibleAssets', 'depletableAssets', 'longTermPrepaidExpenses',
  'otherNonCurrentAssets', 'totalNonCurrentAssets', 'totalAssets',
  // KV Borçlar
  'shortTermFinancialDebt', 'tradePayables', 'otherShortTermPayables', 'advancesReceived',
  'constructionProgress', 'taxPayables', 'shortTermProvisions', 'deferredRevenue',
  'otherCurrentLiabilities', 'totalCurrentLiabilities',
  // UV Borçlar
  'longTermFinancialDebt', 'longTermTradePayables', 'longTermOtherPayables',
  'longTermAdvancesReceived', 'longTermProvisions', 'otherNonCurrentLiabilities',
  'totalNonCurrentLiabilities',
  // Öz Kaynaklar
  'paidInCapital', 'capitalReserves', 'profitReserves', 'retainedEarnings',
  'retainedLosses', 'netProfitCurrentYear', 'totalEquity', 'totalLiabilitiesAndEquity',
  // Gelir Tablosu
  'grossSales', 'salesDiscounts', 'revenue', 'cogs', 'grossProfit',
  'operatingExpenses', 'ebit', 'otherIncome', 'otherExpense', 'interestExpense',
  'ebt', 'extraordinaryIncome', 'extraordinaryExpense', 'taxExpense', 'netProfit',
  'depreciation', 'ebitda', 'purchases',
] as const

// GET /api/groups/[id]/consolidate?year=2024&period=ANNUAL
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? '')
  const period = searchParams.get('period') ?? 'ANNUAL'

  if (!year) return jsonUtf8({ error: 'year parametresi gerekli.' }, { status: 400 })

  const group = await prisma.group.findFirst({
    where: { id, userId },
    include: {
      entities: {
        where: { isActive: true },
        select: { id: true, name: true, sector: true },
      },
    },
  })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })
  if (group.entities.length === 0) return jsonUtf8({ error: 'Grupta şirket yok.' }, { status: 400 })

  // Her şirket için seçili dönem verisini çek
  const financialDataList = await prisma.financialData.findMany({
    where: {
      entityId: { in: group.entities.map((e) => e.id) },
      year,
      period,
    },
  })

  const entityMap = Object.fromEntries(group.entities.map((e) => [e.id, e.name]))
  const includedIds  = new Set(financialDataList.map((fd) => fd.entityId))
  const included = group.entities.filter((e) => includedIds.has(e.id)).map((e) => ({ id: e.id, name: e.name }))
  const missing  = group.entities.filter((e) => !includedIds.has(e.id)).map((e) => ({ id: e.id, name: e.name }))

  // Tam toplama — sahiplik ağırlığı yok
  const consolidated: Record<string, number> = {}
  for (const fd of financialDataList) {
    for (const field of SUMMABLE_FIELDS) {
      const val = (fd as Record<string, unknown>)[field]
      if (typeof val === 'number') {
        consolidated[field] = (consolidated[field] ?? 0) + val
      }
    }
  }

  // Bilanço bölüm toplamlarını alt-kalemlerden yeniden hesapla (DÜZELTME B)
  // DB'deki totalCurrentAssets/totalNonCurrentAssets PDF parse hatasından yanlış olabilir.
  // Alt-kalemler doğru parse edildiğinden, bunların toplamı gerçek bölüm toplamıdır.
  recalcBilancoTotals(consolidated)

  // Tenzilat uygula
  const tenzilatEntries = await prisma.tenzilatEntry.findMany({
    where: { groupId: id, year, period, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  const consolidatedAfterTenzilat = { ...consolidated }
  for (const entry of tenzilatEntries) {
    const field = entry.adjustmentType
    if (field in consolidatedAfterTenzilat) {
      consolidatedAfterTenzilat[field] = (consolidatedAfterTenzilat[field] ?? 0) - entry.adjustmentAmount
    }
  }

  // Tenzilat sonrası toplamları tekrar hesapla (tenzilat alt-kalemleri etkileyebilir)
  recalcBilancoTotals(consolidatedAfterTenzilat)

  // Grup sektörünü belirle: tüm şirketler İnşaat ise inşaat metodolojisi devreye girer
  const groupSector = group.entities.every((e: { sector: string | null }) => e.sector?.includes('İnşaat'))
    ? 'İnşaat'
    : group.entities.some((e: { sector: string | null }) => e.sector?.includes('İnşaat'))
      ? 'İnşaat'
      : null

  // Oran ve finansal skor hesapla
  const ratios   = calculateRatios({ ...consolidatedAfterTenzilat, sector: groupSector })
  const scoring  = calculateScore(ratios, groupSector)

  // Şirketlerin subjektif puanlarını totalAssets ağırlığıyla ortala
  const subjectiveInputs = await prisma.subjectiveInput.findMany({
    where: { entityId: { in: group.entities.map(e => e.id) } },
  })

  let weightedSubjTotal = 0
  let subjectiveBreakdown: Record<string, number> = {}

  if (subjectiveInputs.length > 0) {
    let totalWeight = 0
    let weightedSum = 0

    for (const si of subjectiveInputs) {
      const fd   = financialDataList.find(f => f.entityId === si.entityId)
      const wght = fd?.totalAssets ? Number(fd.totalAssets) : 1  // aktif yoksa eşit ağırlık
      const subj = calcSubjectiveScore(si)
      weightedSum    += subj.total * wght
      totalWeight    += wght

      subjectiveBreakdown[si.entityId] = subj.total
    }

    weightedSubjTotal = totalWeight > 0 ? weightedSum / totalWeight : 0
  }

  const combinedScore  = combineScores(scoring.finalScore, weightedSubjTotal)
  const combinedRating = scoreToRating(combinedScore)

  return jsonUtf8({
    year,
    period,
    consolidated: consolidatedAfterTenzilat,
    rawConsolidated: consolidated,
    tenzilatEntries,
    ratios,
    scoring: {
      ...scoring,
      // Birleşik (finansal + subjektif) skor
      combinedScore,
      combinedRating,
      weightedSubjTotal: Math.round(weightedSubjTotal * 10) / 10,
      subjectiveBreakdown,   // entityId → subjektif puan
      hasSubjective: subjectiveInputs.length > 0,
    },
    included,
    missing,
  })
}
