import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { getUserIdFromRequest }      from '@/lib/auth'
import { runEngineV3 }               from '@/lib/scoring/scenarioV3/engineV3'
import { buildDecisionAnswer }       from '@/lib/scoring/scenarioV3/decisionLayer'
import type { SectorCode }           from '@/lib/scoring/scenarioV3/contracts'
import type { RatingGrade }          from '@/lib/scoring/scenarioV3/ratingReasoning'

// ─── SECTOR STRING → SECTORCODE MAPPING ──────────────────────────────────────

/**
 * V2 sector string'lerini V3 SectorCode'a esler.
 * Bilinmeyen sector'ler MANUFACTURING'e fallback edilir.
 */
function mapSectorCode(sectorStr: string | null | undefined): SectorCode {
  if (!sectorStr) return 'MANUFACTURING'
  // toLocaleLowerCase('tr') kullanilir: Turkce 'I' → 'ı', 'İ' → 'i' (ASCII i)
  // .toLowerCase() yanlis: 'İnşaat'.toLowerCase() === 'i̇nşaat' (dotted, ASCII degil)
  const s = sectorStr.toLocaleLowerCase('tr')
  if (s.includes('inşaat') || s.includes('insaat') || s.includes('taahhüt') || s.includes('construction')) return 'CONSTRUCTION'
  if (s.includes('imalat') || s.includes('üretim') || s.includes('sanayi') || s.includes('manufactur'))   return 'MANUFACTURING'
  if (s.includes('toptan') || s.includes('ticaret') || s.includes('trade') || s.includes('wholesale'))    return 'TRADE'
  if (s.includes('perakende') || s.includes('retail'))                                                    return 'RETAIL'
  if (s.includes('bilişim') || s.includes('yazılım') || s.includes('teknoloji') || s.includes('it'))      return 'IT'
  if (s.includes('hizmet') || s.includes('service'))                                                      return 'SERVICES'
  return 'MANUFACTURING'
}

// ─── INCOME STATEMENT BUILDER ────────────────────────────────────────────────

/**
 * TDHP hesap bakiyelerinden gelir tablosu ozeti tureter.
 *
 * KRITIK: Math.abs KULLANILMAZ.
 * Gelir hesaplari (6xx) dogal isaretli float olarak okunur.
 * (V2 ratios.ts ile tutarli: netSales = 600+601+602 - 610+611+612)
 *
 * 6xx hesaplar TDHP'de:
 *   600 Yurtici Satislar   → pozitif
 *   601 Yurtdisi Satislar  → pozitif
 *   602 Diger Gelirler     → pozitif
 *   610 Satis Iadeleri     → contra (negatif veya pozitif konvansiyona gore)
 *   611 Satis Iskontosu    → contra
 *   612 Diger Indirimler   → contra
 *   620-623 COGS           → negatif (gider)
 *   630 Satis Pazarlama    → negatif
 *   631 Genel Yonetim      → negatif
 *   660 Kisa Vadeli Faiz   → negatif
 *   661 Uzun Vadeli Faiz   → negatif
 *
 * Net Sales formulu: (600+601+602) - (610+611+612)
 * COGS:              620+621+622+623
 */
function buildIncomeStatement(balances: Record<string, number>) {
  // Dogal isaretli dogrudan toplam — Math.abs KULLANILMAZ
  const getSum = (codes: string[]) =>
    codes.reduce((sum, code) => sum + (balances[code] ?? 0), 0)

  const grossRevenue    = getSum(['600', '601', '602'])
  const revenueDeductions = getSum(['610', '611', '612'])
  const netSales        = grossRevenue - revenueDeductions

  const costOfGoodsSold = getSum(['620', '621', '622', '623'])
  const grossProfit     = netSales - costOfGoodsSold

  const sellingExpenses = getSum(['630', '631', '632'])
  const operatingProfit = grossProfit - sellingExpenses

  // Finans giderleri: 660 kisa, 661 uzun vadeli faiz
  const interestExpense = Math.abs(getSum(['660', '661']))  // tutar olarak pozitif

  // Net gelir yaklasimlari
  const otherIncome     = getSum(['640', '641', '642', '643', '644', '645', '646', '647', '648', '649'])
  const otherExpense    = getSum(['650', '651', '652', '653', '654', '655', '656', '657', '658', '659'])
  const netIncome       = operatingProfit + otherIncome - Math.abs(otherExpense) - interestExpense

  return {
    netSales,
    costOfGoodsSold,
    grossProfit,
    operatingProfit,
    netIncome,
    interestExpense,
    operatingCashFlow: undefined as number | undefined,
  }
}

// ─── CURRENT RATING HELPER ───────────────────────────────────────────────────

const RATING_ORDER: RatingGrade[] = [
  'D', 'C', 'CC',
  'CCC-', 'CCC', 'CCC+',
  'B-', 'B', 'B+',
  'BB-', 'BB', 'BB+',
  'BBB-', 'BBB', 'BBB+',
  'A-', 'A', 'A+',
  'AA-', 'AA', 'AA+', 'AAA',
]

/**
 * Skor => V3 RatingGrade eslemesi.
 * V2 scoreToRating ile yakin kalibrasyon.
 */
function scoreToRatingGrade(score: number): RatingGrade {
  if (score >= 95) return 'AAA'
  if (score >= 92) return 'AA+'
  if (score >= 89) return 'AA'
  if (score >= 86) return 'AA-'
  if (score >= 83) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 76) return 'A-'
  if (score >= 73) return 'BBB+'
  if (score >= 70) return 'BBB'
  if (score >= 66) return 'BBB-'
  if (score >= 62) return 'BB+'
  if (score >= 58) return 'BB'
  if (score >= 54) return 'BB-'
  if (score >= 50) return 'B+'
  if (score >= 46) return 'B'
  if (score >= 42) return 'B-'
  if (score >= 38) return 'CCC+'
  if (score >= 34) return 'CCC'
  if (score >= 30) return 'CCC-'
  if (score >= 25) return 'CC'
  if (score >= 20) return 'C'
  return 'D'
}

/**
 * targetGrade string'i V3 RatingGrade'e parse eder.
 * Gecersiz deger 'BBB'e fallback.
 */
function parseRatingGrade(grade: string): RatingGrade {
  if ((RATING_ORDER as string[]).includes(grade)) return grade as RatingGrade
  return 'BBB'
}

// ─── ROUTE HANDLER ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── 1. AUTH ──────────────────────────────────────────────────────────────
    const userId = getUserIdFromRequest(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 2. BODY PARSE ─────────────────────────────────────────────────────────
    const body = await req.json()
    const {
      analysisId,
      targetGrade,
      currentScoreOverride,
      includeV2Comparison = false,
    } = body

    // currentScoreOverride kabul edilir ama V3'te kullanilmaz (sayisal skor yok)
    // explicit olarak ignore ediliyor
    void currentScoreOverride

    if (!targetGrade) {
      return NextResponse.json({ error: 'targetGrade gerekli' }, { status: 400 })
    }

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId gerekli' }, { status: 400 })
    }

    // ── 3. DB — financialData OLMADAN ─────────────────────────────────────────
    // V3 sadece financialAccounts (TDHP hesap kodlari) kullanir.
    // V2'den farkli: financialData: true CIKARILDI (schema_v3 uyumu)
    const analysis = await prisma.analysis.findFirst({
      where: {
        id:     analysisId,
        entity: { userId },
      },
      include: {
        entity:            true,
        financialAccounts: true,
      },
    })

    if (!analysis || !analysis.entity) {
      return NextResponse.json({ error: 'Analiz bulunamadı' }, { status: 404 })
    }

    if (analysis.financialAccounts.length === 0) {
      return NextResponse.json(
        {
          error: 'Bu analiz için hesap kodu verisi yok. Mizan yüklemesi gerekli.',
          engine: 'v3',
          requiresAccountData: true,
        },
        { status: 400 }
      )
    }

    // ── 4. HESAP BAKIYELERİ ───────────────────────────────────────────────────
    const balances: Record<string, number> = {}
    for (const acc of analysis.financialAccounts) {
      balances[acc.accountCode] = Number(acc.amount)
    }

    // ── 5. GELİR TABLOSU ──────────────────────────────────────────────────────
    // buildIncomeStatement: Math.abs KULLANILMAZ (6xx hesaplar dogal isaretli)
    const incomeStatement = buildIncomeStatement(balances)

    // ── 6. SEKTOR KODU ────────────────────────────────────────────────────────
    const sector = mapSectorCode(analysis.entity.sector)

    // ── 7. MEVCUT RATİNG ─────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawScoreFinal = (analysis as any).scoreFinal
    const baseScore     = rawScoreFinal != null ? Number(rawScoreFinal) : 50
    const currentRating = scoreToRatingGrade(baseScore)
    const targetRating  = parseRatingGrade(targetGrade)

    // ── 8. V3 ENGINE ─────────────────────────────────────────────────────────
    const engineResult = runEngineV3({
      sector,
      currentRating,
      targetRating,
      accountBalances: balances,
      incomeStatement,
    })

    // ── 9. DECISION LAYER ─────────────────────────────────────────────────────
    const decisionAnswer = buildDecisionAnswer(
      engineResult,
      targetRating,
      null,       // v2Result — V2 karsilastirma bu route'ta calistirilmiyor
      balances,   // PATCH 1: dataQualityWarning icin hesap sayisi
    )

    // ── 10. RESPONSE ──────────────────────────────────────────────────────────
    return NextResponse.json({
      engine:         'v3',
      analysisId,
      sector,
      currentRating,
      targetRating,
      notchesGained:  engineResult.notchesGained,
      confidence:     engineResult.confidence,

      // Ana karar cevabi — UI bu objeyi kullanir
      decisionAnswer,

      // Raw engine result — debug ve advanced kullanim icin
      engineResult: {
        version:            engineResult.version,
        finalTargetRating:  engineResult.finalTargetRating,
        confidenceModifier: engineResult.confidenceModifier,
        portfolio:          engineResult.portfolio,
        horizons:           engineResult.horizons,
        feasibility:        engineResult.feasibility,
        reasoning:          engineResult.reasoning,
        decisionTrace:      engineResult.decisionTrace,
        // PATCH 2: BankerPerspective metrics icin
        layerSummaries:     engineResult.layerSummaries ?? null,
        debug:              process.env.NODE_ENV === 'development'
          ? engineResult.debug
          : undefined,
      },

      // Opsiyonel V2 karsilastirma — henuz desteklenmiyor bu route'ta
      v2Comparison: includeV2Comparison
        ? { note: 'V2 karşılaştırması bu endpoint üzerinden desteklenmiyor. /api/scenarios/v2 ve /api/scenarios/v3 sonuçlarını client-side karşılaştırın.' }
        : undefined,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'V3 senaryo hesaplanamadı'
    const stack   = err instanceof Error ? err.stack   : undefined
    console.error('[scenarios/v3] error:', err)
    return NextResponse.json(
      {
        error:  message,
        engine: 'v3',
        stack:  process.env.NODE_ENV === 'development' ? stack : undefined,
      },
      { status: 500 }
    )
  }
}
