/**
 * Finrate — Skor Motoru v3.0  (Hibrit Scoring)
 *
 * Kategori ağırlıkları:
 *   Likidite      25%
 *   Karlılık      30%
 *   Kaldıraç      30%
 *   Faaliyet      15%
 *
 * v3.0 hibrit model:
 *   Her metrik skoru = abs_weight × MutlakSkor + bm_weight × BenchmarkSkor
 *
 *   Mutlak skor   → sabit Türkiye eşiklerine göre linearScore
 *   Benchmark skor → şirket/sektör oranıyla piecewise-linear (0.3→0, 1.0→60, 1.8→100)
 *
 *   Sektöre bağımlı metrikler  (HYBRID_BM_HEAVY):  %25 abs / %75 bm
 *   Varsayılan dengeli metrikler (HYBRID_DEFAULT):  %40 abs / %60 bm
 *   Sektörden bağımsız metrikler (HYBRID_ABS_HEAVY): %70 abs / %30 bm
 *
 * v3.0 ek değişiklikler:
 *   - null metrik → atlanır (50 değil), coverage normalize edilir
 *   - coverage < 0.5 → skor 50'ye çekilir (tek metrik hakimiyeti engeli)
 *   - Penalty kuralları genişletildi (özkaynak negatif, IC < 1.5, D/EBITDA > 6)
 *   - Rating bantları yeniden kalibre edildi (ort. firma BB~BBB bölgesine düşer)
 */

import { RatioResult } from './ratios'
import { getSectorBenchmark, getSectorWeights, SectorBenchmark } from './benchmarks'

export interface CategoryScores {
  liquidityScore:     number
  profitabilityScore: number
  leverageScore:      number
  activityScore:      number
}

export interface ScoringResult extends CategoryScores {
  finalScore:  number
  finalRating: string
  // Coverage (0–1): eksik veri kalitesi
  liquidityCoverage?:     number
  profitabilityCoverage?: number
  leverageCoverage?:      number
  activityCoverage?:      number
  overallCoverage?:       number
  // Coverage < 0.5 olan kategoriler — UI'da "Veri yetersiz" gösterilir
  insufficientCategories: string[]
}

// ─── HİBRİT AĞIRLIK KONFİGÜRASYONU ──────────────────────────────────────
// Bu sabitleri değiştirerek tüm modeli yeniden kalibre edebilirsiniz.

/** Varsayılan: %40 mutlak risk, %60 sektör benchmark */
const HYBRID_DEFAULT   = { abs: 0.40, bm: 0.60 } as const

/**
 * Sektöre bağımlı metrikler: cari oran, hızlı oran, nakit oranı,
 * FAVÖK marjı, net kar marjı, DSO / DIO / DPO / NDS, aktif devir.
 * Benchmark ağırlığı baskın.
 */
const HYBRID_BM_HEAVY  = { abs: 0.25, bm: 0.75 } as const

/**
 * Sektörden bağımsız metrikler: faiz karşılama, borç/özkaynak,
 * özkaynak kalitesi, net borç/FAVÖK.
 * Mutlak eşik ağırlığı baskın.
 */
const HYBRID_ABS_HEAVY = { abs: 0.70, bm: 0.30 } as const

// ─── DÜZELTİLMİŞ RATING BANTLARI ────────────────────────────────────────
/**
 * Kalibre mantığı:
 *   Ortalama Türkiye firması (sektör ortalamasında)  → hibrit ≈ 58–63 → BB / BBB
 *   Sektör üstü güçlü firma                          → ≥ 78             → AA
 *   Gerçekten istisnai                                → ≥ 88             → AAA
 */
export const RATING_BANDS = [
  { min: 92, label: 'AAA' },
  { min: 84, label: 'AA'  },
  { min: 76, label: 'A'   },
  { min: 68, label: 'BBB' },
  { min: 60, label: 'BB'  },
  { min: 54, label: 'B'   },
  { min: 50, label: 'CCC' },
  { min: 42, label: 'CC'  },
  { min: 30, label: 'C'   },
  { min: 0,  label: 'D'   },
]

export function scoreToRating(score: number): string {
  for (const band of RATING_BANDS) {
    if (score >= band.min) return band.label
  }
  return 'D'
}

export function getRatingMinimum(label: string): number {
  return RATING_BANDS.find((band) => band.label === label)?.min ?? 0
}

// ─── TEMEL SKORLAMA FONKSİYONLARI ────────────────────────────────────────

/**
 * Mutlak linearScore — Türkiye geneli sabit eşiklerine göre
 * value null → null döner (50 değil), caller null'ı coverage hesabında atlar.
 * sf: softFactor (0 = sert cliff, 0.15 = kademeli).
 */
function linearScore(
  value: number | null,
  bad: number,
  good: number,
  lowerIsBetter = false,
  sf = 0,
): number | null {
  if (value == null) return null
  const eBad = sf > 0 ? bad + (bad - good) * sf : bad
  const v = lowerIsBetter ? -value : value
  const b = lowerIsBetter ? -eBad  : eBad
  const g = lowerIsBetter ? -good  : good
  return Math.min(100, Math.max(0, ((v - b) / (g - b)) * 100))
}

/**
 * Sektör benchmark skoru — piecewise linear, smooth
 *
 * ratio = company / sector  (veya sector / company, lowerIsBetter için ters)
 *
 * ratio ≥ 1.8  → 100 (çok güçlü)
 * ratio = 1.2  → 80  (sektör üstü)
 * ratio = 1.0  → 60  (sektör ortalaması)
 * ratio = 0.8  → 40  (ortalamanın altı)
 * ratio = 0.3  → 0   (çok zayıf)
 * ratio < 0.3  → 0
 *
 * Sektör ortalaması yoksa null döner → hybridMetricScore sadece mutlak skor kullanır.
 */
function benchScore(
  value: number | null,
  sectorAvg: number | null | undefined,
  lowerIsBetter = false,
): number | null {
  if (value == null || sectorAvg == null || sectorAvg === 0) return null
  // Borçsuz şirket (D/E=0, D/A=0) → lowerIsBetter için mükemmel benchmark
  if (lowerIsBetter && value === 0) return 100
  const ratio = lowerIsBetter ? sectorAvg / value : value / sectorAvg
  if (!isFinite(ratio) || ratio < 0) return null
  if (ratio >= 1.8) return 100
  if (ratio >= 1.2) return 80 + (ratio - 1.2) / 0.6 * 20
  if (ratio >= 0.8) return 40 + (ratio - 0.8) / 0.4 * 40
  if (ratio >= 0.3) return       (ratio - 0.3) / 0.5 * 40
  return 0
}

/**
 * Hibrit metrik skoru
 *
 * hybridScore = abs × absoluteScore + bm × benchmarkScore
 *
 * Benchmark yoksa (sektör verisi mevcut değil): yalnızca mutlak skor.
 * Value null ise null döner → weightedAvgCov tarafından atlanır.
 */
function hybridMetricScore(
  value: number | null,
  absThreshold: { bad: number; good: number; lowerIsBetter?: boolean; sf?: number },
  sectorAvg: number | null | undefined,
  weights: { abs: number; bm: number } = HYBRID_DEFAULT,
): number | null {
  if (value == null) return null
  const { bad, good, lowerIsBetter = false, sf = 0 } = absThreshold

  const abs = linearScore(value, bad, good, lowerIsBetter, sf)
  if (abs == null) return null

  const bm = benchScore(value, sectorAvg, lowerIsBetter)
  if (bm == null) return abs   // sektör verisi yok → sadece mutlak

  return weights.abs * abs + weights.bm * bm
}

/**
 * Ağırlıklı ortalama — null metrikleri atlayarak coverage hesaplar.
 *
 * Coverage: mevcut metrik ağırlık toplamı / tüm metrik ağırlık toplamı
 * Coverage < 0.5 → yetersiz veri; skor üretilmez (50 döner), insufficient: true.
 * Coverage >= 0.5 → sadece mevcut metriklerin ağırlıklı ortalaması alınır.
 */
function weightedAvgCov(items: [number | null, number][]): { score: number; coverage: number; insufficient: boolean } {
  const valid = items.filter((x): x is [number, number] => x[0] != null)
  if (!valid.length) return { score: 50, coverage: 0, insufficient: true }

  const totalWeightAll   = items.reduce((s, [, w]) => s + w, 0)
  const totalWeightValid = valid.reduce((s, [, w]) => s + w, 0)
  const coverage = totalWeightAll > 0 ? totalWeightValid / totalWeightAll : 0

  if (coverage < 0.5) return { score: 50, coverage, insufficient: true }

  const rawScore = valid.reduce((s, [v, w]) => s + v * w, 0) / totalWeightValid
  return { score: rawScore, coverage, insufficient: false }
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, v))
}

// ─── LİKİDİTE ─────────────────────────────────────────────────────────────
// Sektöre bağımlı metrikler (BM_HEAVY): cari, hızlı, nakit oran
// Mutlak bazlı: NÇS/Aktif, NDS (benchmark yok)
function calcLiquidity(r: RatioResult, bm: SectorBenchmark | null): { score: number; coverage: number; insufficient: boolean } {
  return weightedAvgCov([
    // Cari Oran — sektöre göre yorumlanır (BM_HEAVY)
    [hybridMetricScore(r.currentRatio,
      { bad: 0.8, good: 2.0, sf: 0.15 },
      bm?.currentRatio,
      HYBRID_BM_HEAVY), 1.5],

    // Hızlı Oran — sektöre göre yorumlanır (BM_HEAVY)
    [hybridMetricScore(r.quickRatio,
      { bad: 0.5, good: 1.2, sf: 0.15 },
      bm?.quickRatio,
      HYBRID_BM_HEAVY), 1.5],

    // NÇS / Aktif — artık sektör benchmark'ı var (BM_HEAVY)
    [hybridMetricScore(r.netWorkingCapitalRatio,
      { bad: -0.10, good: 0.25, sf: 0.15 },
      bm?.netWorkingCapitalRatio,
      HYBRID_BM_HEAVY), 1.0],

    // Nakit Oranı — artık sektör benchmark'ı var (BM_HEAVY)
    [hybridMetricScore(r.cashRatio,
      { bad: 0.05, good: 0.50, sf: 0.15 },
      bm?.cashRatio,
      HYBRID_BM_HEAVY), 0.75],

    // Nakit Dönüşüm Süresi — artık sektör benchmark'ı var, gün bazlı (BM_HEAVY)
    [hybridMetricScore(r.cashConversionCycle,
      { bad: 150, good: 20, lowerIsBetter: true, sf: 0.15 },
      bm?.cashConversionCycle,
      HYBRID_BM_HEAVY), 0.75],
  ])
}

// ─── KARLILIK ─────────────────────────────────────────────────────────────
// FAVÖK, net kar, ROA, ROE → sektöre bağımlı (BM_HEAVY), ama mutlak sıfır eşiği kritik
// Brüt kar, FVÖK, ROIC → dengeli (DEFAULT)
function calcProfitability(r: RatioResult, bm: SectorBenchmark | null): { score: number; coverage: number; insufficient: boolean } {
  // Büyüme: en iyi mevcut metriği seç
  const growthScore = r.realGrowth != null
    ? linearScore(r.realGrowth,    -0.20, 0.20, false, 0.08)
    : linearScore(r.revenueGrowth, -0.10, 0.30, false, 0.08)
  const growthWeight = r.realGrowth != null ? 0.75 : 0.50

  return weightedAvgCov([
    // FAVÖK Marjı — sektöre bağımlı, ama negatif FAVÖK sert cezalı (sf=0 abs için)
    [hybridMetricScore(r.ebitdaMargin,
      { bad: 0, good: 0.15, sf: 0.00 },
      bm?.ebitdaMargin,
      HYBRID_BM_HEAVY), 1.5],

    // Net Kar Marjı — sektöre bağımlı, negatif marj sert
    [hybridMetricScore(r.netProfitMargin,
      { bad: -0.03, good: 0.10, sf: 0.00 },
      bm?.netProfitMargin,
      HYBRID_BM_HEAVY), 1.5],

    // ROA — sektöre bağımlı
    [hybridMetricScore(r.roa,
      { bad: -0.02, good: 0.08, sf: 0.00 },
      bm?.roa,
      HYBRID_BM_HEAVY), 1.25],

    // ROE — sektöre bağımlı
    [hybridMetricScore(r.roe,
      { bad: -0.05, good: 0.15, sf: 0.00 },
      bm?.roe,
      HYBRID_DEFAULT), 1.25],

    // Brüt Kar Marjı — sektör rekabeti, dengeli
    [hybridMetricScore(r.grossMargin,
      { bad: 0, good: 0.30, sf: 0.08 },
      bm?.grossMargin,
      HYBRID_DEFAULT), 1.0],

    // FVÖK Marjı — artık sektör benchmark'ı var (BM_HEAVY)
    [hybridMetricScore(r.ebitMargin,
      { bad: -0.05, good: 0.10, sf: 0.05 },
      bm?.ebitMargin,
      HYBRID_BM_HEAVY), 1.0],

    // ROIC — artık sektör benchmark'ı var (DEFAULT)
    [hybridMetricScore(r.roic,
      { bad: -0.02, good: 0.12, sf: 0.08 },
      bm?.roic,
      HYBRID_DEFAULT), 0.75],

    // Büyüme — artık sektör benchmark'ı var (DEFAULT)
    [growthScore, growthWeight],
  ])
}

// ─── KALDIRAC ─────────────────────────────────────────────────────────────
// D/E, D/A, faiz karşılama → sektörden bağımsız (ABS_HEAVY)
// Özkaynak oranı → dengeli
function calcLeverage(r: RatioResult, bm: SectorBenchmark | null): { score: number; coverage: number; insufficient: boolean } {
  const items: [number | null, number][] = [
    // Borç / Özkaynak — ABS_HEAVY (sektörden bağımsız risk kriteri)
    [hybridMetricScore(r.debtToEquity,
      { bad: 5.0, good: 0.5, lowerIsBetter: true, sf: 0.10 },
      bm?.debtToEquity,
      HYBRID_ABS_HEAVY), 1.5],

    // Özkaynak Oranı — dengeli (sektör yapısına göre değişir ama mutlak alt sınır kritik)
    [hybridMetricScore(r.equityRatio,
      { bad: 0.10, good: 0.60, sf: 0.10 },
      null,
      HYBRID_DEFAULT), 1.5],

    // Borç / Aktif — ABS_HEAVY
    [hybridMetricScore(r.debtToAssets,
      { bad: 0.85, good: 0.30, lowerIsBetter: true, sf: 0.10 },
      bm?.debtToAssets,
      HYBRID_ABS_HEAVY), 1.0],

    // KV Borç Oranı — artık sektör benchmark'ı var (DEFAULT)
    [hybridMetricScore(r.shortTermDebtRatio,
      { bad: 1.0, good: 0.3, lowerIsBetter: true, sf: 0.05 },
      bm?.shortTermDebtRatio,
      HYBRID_DEFAULT), 0.5],

    // Net Borç / FAVÖK — artık sektör benchmark'ı var (ABS_HEAVY)
    [r.debtToEbitda != null
      ? hybridMetricScore(r.debtToEbitda,
          { bad: 10.0, good: 3.0, lowerIsBetter: true, sf: 0.10 },
          bm?.debtToEbitda,
          HYBRID_ABS_HEAVY)
      : null, 1.0],
  ]

  // Faiz Karşılama — ABS_HEAVY (sektörden bağımsız borç ödeme kapasitesi)
  if (r.interestCoverage != null && r.interestCoverage >= 9999) {
    // Faiz gideri sıfır: borç düzeyine göre değerlendir
    // Net nakit pozisyonu (debtToEbitda < 0) → güçlü ama ihtiyatlı
    const icScore = (r.debtToEbitda != null && r.debtToEbitda < 0) ? 90 : 65
    items.push([icScore, 1.0])
  } else {
    items.push([
      hybridMetricScore(r.interestCoverage,
        { bad: 0.5, good: 5.0, sf: 0.10 },
        bm?.interestCoverage,
        HYBRID_ABS_HEAVY),
      1.0,
    ])
  }

  return weightedAvgCov(items)
}

// ─── FAALİYET ─────────────────────────────────────────────────────────────
// DSO, DIO, aktif devir, faaliyet gideri oranı → sektöre bağımlı (BM_HEAVY)
// Duran varlık devir, DPO → dengeli (benchmark eksik veya sektör bağımsız)
function calcActivity(r: RatioResult, bm: SectorBenchmark | null): { score: number; coverage: number; insufficient: boolean } {
  return weightedAvgCov([
    // Aktif Devir Hızı — sektöre bağımlı
    [hybridMetricScore(r.assetTurnover,
      { bad: 0.2, good: 1.5, sf: 0.15 },
      bm?.assetTurnover,
      HYBRID_BM_HEAVY), 1.0],

    // Stok Devir Süresi (DIO) — sektöre bağımlı, gün bazlı
    [hybridMetricScore(r.inventoryTurnoverDays,
      { bad: 180, good: 60, lowerIsBetter: true, sf: 0.15 },
      bm?.inventoryDays,
      HYBRID_BM_HEAVY), 1.0],

    // Alacak Tahsil Süresi (DSO) — sektöre bağımlı
    [hybridMetricScore(r.receivablesTurnoverDays,
      { bad: 120, good: 30, lowerIsBetter: true, sf: 0.15 },
      bm?.receivablesDays,
      HYBRID_BM_HEAVY), 1.0],

    // Borç Ödeme Süresi (DPO) — artık sektör benchmark'ı var (DEFAULT)
    [hybridMetricScore(r.payablesTurnoverDays,
      { bad: 15, good: 60, sf: 0.15 },
      bm?.payablesTurnoverDays,
      HYBRID_DEFAULT), 1.0],

    // Duran Varlık Devir — artık sektör benchmark'ı var (BM_HEAVY)
    [hybridMetricScore(r.fixedAssetTurnover,
      { bad: 0.3, good: 2.5, sf: 0.15 },
      bm?.fixedAssetTurnover,
      HYBRID_BM_HEAVY), 1.0],

    // Faaliyet Gideri Oranı — artık sektör benchmark'ı var (BM_HEAVY)
    [hybridMetricScore(r.operatingExpenseRatio,
      { bad: 0.5, good: 0.22, lowerIsBetter: true, sf: 0.15 },
      bm?.operatingExpenseRatio,
      HYBRID_BM_HEAVY), 1.0],
  ])
}

// ─── FLOOR / CAP / PENALTY KURALLARI ─────────────────────────────────────
/**
 * Genişletilmiş penalty kuralları:
 *
 * FLOOR (alt sınır):
 *   Net nakit (debtToEbitda < 0)       → kaldıraç min 40
 *   Özkaynak negatif (equityRatio ≤ 0) → kaldıraç max 15 (çok ciddi risk)
 *
 * HARD CAP (tavan):
 *   Net kar marjı < -%5                → final max 55 (ciddi zarar)
 *   Faiz karşılama < 1.5 (gerçek değer) → kaldıraç max 45
 *   Net borç/FAVÖK > 6                 → kaldıraç max 55
 *
 * NOT: Likidite < 0.6 ve borç yüksekse ayrıca likiditede sert düşüş
 * doğrudan hybridMetricScore içinden gelir (linearScore sf=0.15 ile).
 */
function applyFloorCap(
  liq: number, prof: number, lev: number, act: number,
  r: RatioResult,
): { liq: number; prof: number; lev: number; act: number; cap?: number } {
  let liqAdj = liq
  let levAdj = lev
  let cap: number | undefined

  // FLOOR: Net nakit pozisyonu → kaldıraç min 40
  if (r.debtToEbitda != null && r.debtToEbitda < 0) {
    levAdj = Math.max(levAdj, 40)
  }

  // HARD FLOOR DOWN: Özkaynak negatif → kaldıraç max 15
  if (r.equityRatio != null && r.equityRatio <= 0) {
    levAdj = Math.min(levAdj, 15)
    cap = Math.min(cap ?? 999, 45)  // tüm skor da baskılansın
  }

  // CAP: Net kar marjı ciddi negatif (< -%5)
  if (r.netProfitMargin != null && r.netProfitMargin < -0.05) {
    cap = Math.min(cap ?? 999, 55)
  }

  // CAP: Faiz karşılama < 1.5 (gerçek borç yükü altında ezilen firma)
  if (r.interestCoverage != null && r.interestCoverage < 9999 && r.interestCoverage < 1.5) {
    levAdj = Math.min(levAdj, 45)
  }

  // CAP: Net borç/FAVÖK > 6 (aşırı kaldıraç)
  if (r.debtToEbitda != null && r.debtToEbitda > 6) {
    levAdj = Math.min(levAdj, 55)
  }

  return { liq: liqAdj, prof, lev: levAdj, act, cap: cap === 999 ? undefined : cap }
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────
export function calculateScore(ratios: RatioResult, sector?: string | null): ScoringResult {
  const bm = sector ? getSectorBenchmark(sector) : null
  const w  = getSectorWeights(sector)   // sektöre özgü ağırlık profili

  const liqResult  = calcLiquidity(ratios, bm)
  const profResult = calcProfitability(ratios, bm)
  const levResult  = calcLeverage(ratios, bm)
  const actResult  = calcActivity(ratios, bm)

  const rawLiq  = clamp(liqResult.score)
  const rawProf = clamp(profResult.score)
  const rawLev  = clamp(levResult.score)
  const rawAct  = clamp(actResult.score)

  const { liq, prof, lev, act, cap } = applyFloorCap(rawLiq, rawProf, rawLev, rawAct, ratios)

  let final = clamp(liq * w.liquidity + prof * w.profitability + lev * w.leverage + act * w.activity)
  if (cap !== undefined) final = Math.min(final, cap)

  const overallCoverage =
    liqResult.coverage  * w.liquidity     +
    profResult.coverage * w.profitability +
    levResult.coverage  * w.leverage      +
    actResult.coverage  * w.activity

  const rating = scoreToRating(final)

  const insufficientCategories: string[] = []
  if (liqResult.insufficient)  insufficientCategories.push('likidite')
  if (profResult.insufficient) insufficientCategories.push('karlılık')
  if (levResult.insufficient)  insufficientCategories.push('borçluluk')
  if (actResult.insufficient)  insufficientCategories.push('faaliyet')

  return {
    liquidityScore:        Math.round(liq  * 100) / 100,
    profitabilityScore:    Math.round(prof * 100) / 100,
    leverageScore:         Math.round(lev  * 100) / 100,
    activityScore:         Math.round(act  * 100) / 100,
    finalScore:            Math.round(final * 100) / 100,
    finalRating:           rating,
    liquidityCoverage:     Math.round(liqResult.coverage  * 100) / 100,
    profitabilityCoverage: Math.round(profResult.coverage * 100) / 100,
    leverageCoverage:      Math.round(levResult.coverage  * 100) / 100,
    activityCoverage:      Math.round(actResult.coverage  * 100) / 100,
    overallCoverage:       Math.round(overallCoverage * 100) / 100,
    insufficientCategories,
  }
}
