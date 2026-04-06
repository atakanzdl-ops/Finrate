/**
 * Finrate — Skor Motoru v2.1
 *
 * Kategori ağırlıkları:
 *   Likidite      25%
 *   Karlılık      30%
 *   Kaldıraç      30%
 *   Faaliyet      15%
 *
 * v2.1 değişiklikleri:
 *   - linearScore: metrik bazlı softFactor (sf) parametresi
 *     Operasyonel metrikler → sf=0.10–0.15 (kademeli ceza)
 *     Kârlılık kritik metrikleri → sf=0.00 (sert, cliff-edge korunuyor)
 *   - Kategori içi ağırlıklı ortalama
 *   - debtToEbitda bağımsız blok
 *   - interestCoverage=Infinity → borç düzeyine göre puan
 *   - Floor/cap kuralları
 */

import { RatioResult } from './ratios'
import { getSectorBenchmark, SectorBenchmark } from './benchmarks'

export interface CategoryScores {
  liquidityScore:     number
  profitabilityScore: number
  leverageScore:      number
  activityScore:      number
}

export interface ScoringResult extends CategoryScores {
  finalScore:  number
  finalRating: string
}

// ─── Derecelendirme Tablosu ────────────────────────────────────────────────
const RATING_BANDS = [
  { min: 92, label: 'AAA' },
  { min: 84, label: 'AA'  },
  { min: 76, label: 'A'   },
  { min: 68, label: 'BBB' },
  { min: 60, label: 'BB'  },
  { min: 52, label: 'B'   },
  { min: 44, label: 'CCC' },
  { min: 36, label: 'CC'  },
  { min: 28, label: 'C'   },
  { min: 0,  label: 'D'   },
]

export function scoreToRating(score: number): string {
  for (const band of RATING_BANDS) {
    if (score >= band.min) return band.label
  }
  return 'D'
}

/**
 * Doğrusal skorlama — metrik bazlı yumuşak eşik desteğiyle
 *
 * sf (softFactor): bad eşiğini gerçek sıfır noktasından uzaklaştırır.
 *
 *   sf = 0.00 → sert (bad = 0 puan) — kritik karlılık metrikleri için
 *   sf = 0.08 → hafif yumuşak       — karlılık destek metrikleri
 *   sf = 0.10 → orta yumuşak        — kaldıraç metrikleri
 *   sf = 0.15 → yumuşak             — likidite ve faaliyet metrikleri
 *
 * Örnek (sf=0.15, CCC, Pazarlama benchmark):
 *   bad=150 gün (→ ~13 puan), extBad=171 gün (→ 0 puan), good=36 gün (→ 100 puan)
 *
 * Örnek (sf=0.00, EBITDA marjı):
 *   bad=0 (→ 0 puan, sert sınır korunuyor), good=0.195 (→ 100 puan)
 */
function linearScore(
  value: number | null,
  bad: number,
  good: number,
  lowerIsBetter = false,
  sf = 0,           // softFactor: 0 = sert (default), >0 = kademeli
): number {
  if (value == null) return 50

  // sf > 0 ise: gerçek sıfır noktası bad'ın sf kadar ötesine taşınır
  // bad eşiğinde sf/(sf+1)*100 puan verilir (~%13 sf=0.15 için)
  const eBad = sf > 0 ? bad + (bad - good) * sf : bad

  const v = lowerIsBetter ? -value : value
  const b = lowerIsBetter ? -eBad  : eBad
  const g = lowerIsBetter ? -good  : good

  const raw = ((v - b) / (g - b)) * 100
  return Math.min(100, Math.max(0, raw))
}

/** Ağırlıklı ortalama — [puan, ağırlık] çiftleri */
function weightedAvg(items: [number, number][]): number {
  if (!items.length) return 50
  const totalW = items.reduce((s, [, w]) => s + w, 0)
  if (totalW === 0) return 50
  return items.reduce((s, [v, w]) => s + v * w, 0) / totalW
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, v))
}

// ─── LİKİDİTE ─────────────────────────────────────────────────────────────
// Operasyonel metrikler — kademeli ceza (sf=0.15)
// Gerekçe: cari oran 0.85 ile 0.75 arasındaki fark yoruma açık,
// cliff-edge yerine gradyan daha gerçekçidir.
function calcLiquidity(r: RatioResult, bm: SectorBenchmark | null): number {
  return weightedAvg([
    // Cari Oran — temel likidite, en yüksek ağırlık
    [linearScore(r.currentRatio,
      bm ? bm.currentRatio * 0.5 : 0.8,
      bm ? bm.currentRatio * 1.5 : 2.0,
      false, 0.15), 1.5],

    // Hızlı Oran — stok hariç anlık ödeme gücü
    [linearScore(r.quickRatio,
      bm ? bm.quickRatio * 0.5 : 0.5,
      bm ? bm.quickRatio * 1.5 : 1.2,
      false, 0.15), 1.5],

    // Net Çalışma Sermayesi / Aktif
    [linearScore(r.netWorkingCapitalRatio, -0.1, 0.25, false, 0.15), 1.0],

    // Nakit Oranı — tek başına yanıltıcı olabilir, düşük ağırlık
    [linearScore(r.cashRatio, 0.05, 0.5, false, 0.15), 0.75],

    // Nakit Dönüşüm Süresi — işletme döngüsü verimliliği
    [linearScore(r.cashConversionCycle, 120, 20, true, 0.15), 0.75],
  ])
}

// ─── KARLILIK ─────────────────────────────────────────────────────────────
// Kritik metrikler (FAVÖK, Net Kar, ROA, ROE) → sf=0.00 (sert)
// Gerekçe: düşük kârlılık gerçek bir uyarı sinyalidir, yumuşatılmamalı.
// Destek metrikler (Brüt Kar, FVÖK, ROIC, Büyüme) → sf=0.08 (hafif)
function calcProfitability(r: RatioResult, bm: SectorBenchmark | null): number {
  const items: [number, number][] = [
    // FAVÖK Marjı — borç ödeme kapasitesi, SERT (sf=0)
    [linearScore(r.ebitdaMargin,
      0,
      bm ? Math.max(0.06, bm.ebitdaMargin * 1.5) : 0.12,
      false, 0.00), 1.5],

    // Net Kar Marjı — gerçek kârlılık, SERT (sf=0)
    [linearScore(r.netProfitMargin,
      -0.03,
      bm ? Math.max(0.05, bm.netProfitMargin * 1.5) : 0.10,
      false, 0.00), 1.5],

    // ROA — varlık verimliliği, SERT (sf=0)
    [linearScore(r.roa,
      -0.02,
      bm ? Math.max(0.04, bm.roa * 1.5) : 0.08,
      false, 0.00), 1.25],

    // ROE — özkaynak getirisi, SERT (sf=0)
    [linearScore(r.roe,
      -0.05,
      bm ? Math.max(0.08, bm.roe * 1.5) : 0.15,
      false, 0.00), 1.25],

    // Brüt Kar Marjı — sektörel rekabet, hafif yumuşak (sf=0.08)
    [linearScore(r.grossMargin,
      0,
      bm ? Math.max(0.15, bm.grossMargin * 1.4) : 0.30,
      false, 0.08), 1.0],

    // FVÖK Marjı — operasyonel gerçeğe yakın, net kâra bir adım uzak → sf=0.05
    [linearScore(r.ebitMargin, -0.05, 0.10, false, 0.05), 1.0],

    // ROIC — yatırım getirisi, hafif yumuşak (sf=0.08)
    [linearScore(r.roic, -0.02, 0.12, false, 0.08), 0.75],
  ]

  // Büyüme — veri varsa ekle, hafif yumuşak (sf=0.08)
  if (r.realGrowth != null) {
    items.push([linearScore(r.realGrowth, -0.20, 0.15, false, 0.08), 0.75])
  } else if (r.revenueGrowth != null) {
    items.push([linearScore(r.revenueGrowth, -0.10, 0.25, false, 0.08), 0.50])
  }

  return weightedAvg(items)
}

// ─── KALDIRAC ─────────────────────────────────────────────────────────────
// Kaldıraç metrikleri orta yumuşak (sf=0.10)
// Gerekçe: Borç/Özkaynak 2.1x ile 2.5x arasındaki fark sektöre göre
// yoruma açık; tam sıfır vermek fazla sert. KV Borç oranı ise
// şirketin finansman yapısına bağlı, düşük ağırlık + çok az yumuşak.
function calcLeverage(r: RatioResult, bm: SectorBenchmark | null): number {
  const items: [number, number][] = [
    // Borç / Özkaynak
    [linearScore(r.debtToEquity,
      bm ? Math.min(6.0, bm.debtToEquity * 2.5) : 5.0,
      bm ? Math.max(0.3, bm.debtToEquity * 0.4) : 0.5,
      true, 0.10), 1.5],

    // Özkaynak Oranı — finansal sağlamlık
    [linearScore(r.equityRatio, 0.10, 0.60, false, 0.10), 1.5],

    // Borç / Aktif
    [linearScore(r.debtToAssets,
      bm ? Math.min(0.90, bm.debtToAssets * 1.6) : 0.85,
      bm ? Math.max(0.20, bm.debtToAssets * 0.5) : 0.30,
      true, 0.10), 1.0],

    // KV Borç Oranı — sektör/yapıya bağlı, düşük ağırlık + minimal yumuşak
    [linearScore(r.shortTermDebtRatio, 1.0, 0.3, true, 0.05), 0.5],
  ]

  // Net Borç / FAVÖK — FAVÖK varsa her zaman hesapla (faizden bağımsız)
  if (r.debtToEbitda != null) {
    items.push([linearScore(r.debtToEbitda, 10.0, 3.0, true, 0.10), 1.0])
  }

  // Faiz Karşılama — 3 durum:
  if (r.interestCoverage === Infinity) {
    // Faiz gideri 0: borç düzeyine göre değerlendir
    // Net borç negatif (nakit > borç) → net nakit pozisyonu → güçlü sinyal
    // Borç var ama faiz raporlanmamış → veri şüpheli → ihtiyatlı puan
    const icScore = (r.debtToEbitda != null && r.debtToEbitda < 0) ? 95 : 75
    items.push([icScore, 1.0])
  } else if (r.interestCoverage != null) {
    items.push([linearScore(r.interestCoverage,
      0.5,
      bm ? Math.max(3.0, bm.interestCoverage * 1.4) : 5.0,
      false, 0.10), 1.0])
  }
  // interestCoverage = null → veri yok, metrik atlanır

  return weightedAvg(items)
}

// ─── FAALİYET ─────────────────────────────────────────────────────────────
// Tüm faaliyet metrikleri kademeli (sf=0.15)
// Gerekçe: gün bazlı metrikler sektöre, sezona ve stratejiye göre değişir.
// 150 gün stok ile 170 gün stok arasındaki fark sıfır ile aynı cezayı hak etmez.
function calcActivity(r: RatioResult, bm: SectorBenchmark | null): number {
  return weightedAvg([
    // Aktif Devir Hızı
    [linearScore(r.assetTurnover,
      bm ? Math.max(0.1, bm.assetTurnover * 0.3) : 0.2,
      bm ? bm.assetTurnover * 1.8 : 1.5,
      false, 0.15), 1.0],

    // Stok Devir Süresi — gün bazlı, kademeli
    [linearScore(r.inventoryTurnoverDays,
      bm ? Math.min(300, bm.inventoryDays * 2.5) : 180,
      bm ? Math.max(10,  bm.inventoryDays * 0.6) : 60,
      true, 0.15), 1.0],

    // Alacak Tahsil Süresi — gün bazlı, kademeli
    [linearScore(r.receivablesTurnoverDays,
      bm ? Math.min(200, bm.receivablesDays * 2.5) : 120,
      bm ? Math.max(10,  bm.receivablesDays * 0.5) : 30,
      true, 0.15), 1.0],

    // Borç Ödeme Süresi — uzun = tedarikçi finansmanı avantajı
    [linearScore(r.payablesTurnoverDays, 15, 60, false, 0.15), 1.0],

    // Duran Varlık Devir Hızı
    [linearScore(r.fixedAssetTurnover, 0.3, 2.5, false, 0.15), 1.0],

    // Faaliyet Gideri Oranı
    [linearScore(r.operatingExpenseRatio, 0.5, 0.22, true, 0.15), 1.0],
  ])
}

// ─── FLOOR / CAP KURALLARI ────────────────────────────────────────────────
/**
 * Uç vaka koruyucuları:
 *
 * FLOOR (alt sınır):
 *   Net borç negatif → kaldıraç min 40
 *   (düşük kârlılık gibi başka sorunlar kaldıracı tamamen batırmasın)
 *
 * CAP (üst sınır):
 *   Net kâr marjı < -%5 (ciddi zarar) → final skor max 55
 *   (güçlü kaldıraç/faaliyet skoru zararlı firmayı abartmasın)
 */
function applyFloorCap(
  liq: number, prof: number, lev: number, act: number,
  r: RatioResult,
): { liq: number; prof: number; lev: number; act: number; cap?: number } {
  let levAdj = lev

  // FLOOR: Net nakit pozisyonu → kaldıraç min 40
  if (r.debtToEbitda != null && r.debtToEbitda < 0) {
    levAdj = Math.max(lev, 40)
  }

  // CAP: Ciddi zarar → tavan 55 (B üstüne çıkamaz)
  const cap = (r.netProfitMargin != null && r.netProfitMargin < -0.05)
    ? 55
    : undefined

  return { liq, prof, lev: levAdj, act, cap }
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────
export function calculateScore(ratios: RatioResult, sector?: string | null): ScoringResult {
  const bm = sector ? getSectorBenchmark(sector) : null

  const rawLiq  = clamp(calcLiquidity(ratios, bm))
  const rawProf = clamp(calcProfitability(ratios, bm))
  const rawLev  = clamp(calcLeverage(ratios, bm))
  const rawAct  = clamp(calcActivity(ratios, bm))

  const { liq, prof, lev, act, cap } = applyFloorCap(rawLiq, rawProf, rawLev, rawAct, ratios)

  let final = clamp(liq * 0.25 + prof * 0.30 + lev * 0.30 + act * 0.15)
  if (cap !== undefined) final = Math.min(final, cap)

  const rating = scoreToRating(final)

  return {
    liquidityScore:     Math.round(liq  * 100) / 100,
    profitabilityScore: Math.round(prof * 100) / 100,
    leverageScore:      Math.round(lev  * 100) / 100,
    activityScore:      Math.round(act  * 100) / 100,
    finalScore:         Math.round(final * 100) / 100,
    finalRating:        rating,
  }
}
