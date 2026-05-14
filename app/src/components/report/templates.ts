// ─── FİNRATE RAPOR METİN ŞABLONLARI ──────────────────────────────────────────
// RatioResult + SectorBenchmark verilerinden dinamik Türkçe metin üretir.
// Sayfa 2, 4 ve özet kutuları için kullanılır.

import type { SectorBenchmark } from '@/lib/scoring/benchmarks'

// ─── TİP ─────────────────────────────────────────────────────────────────────

interface RatiosLike {
  currentRatio?:           number | null
  quickRatio?:             number | null
  cashRatio?:              number | null
  netProfitMargin?:        number | null
  ebitdaMargin?:           number | null
  grossMargin?:            number | null
  roa?:                    number | null
  roe?:                    number | null
  revenueGrowth?:          number | null
  debtToEquity?:           number | null
  interestCoverage?:       number | null
  receivablesTurnoverDays?: number | null
  inventoryTurnoverDays?:  number | null
  cashConversionCycle?:    number | null
  assetTurnover?:          number | null
  equityRatio?:            number | null
  debtToAssets?:           number | null
}

// ─── GÜÇLÜ YÖNLER ─────────────────────────────────────────────────────────────

/**
 * Ratioları sektör ortalamasıyla karşılaştırarak 2–5 güçlü yön üretir.
 */
export function buildStrengths(
  r: RatiosLike,
  bm: SectorBenchmark,
  sector: string | null | undefined,
): string[] {
  const items: string[] = []

  // Likidite
  if (r.currentRatio != null && r.currentRatio > bm.currentRatio * 1.10)
    items.push(`Cari oran ${r.currentRatio.toFixed(2)}x ile sektör ortalaması (${bm.currentRatio.toFixed(2)}x) üzerinde — kısa vadeli likidite güçlü.`)

  if (r.cashRatio != null && r.cashRatio > bm.cashRatio * 1.15)
    items.push(`Nakit oranı ${(r.cashRatio * 100).toFixed(1)}% ile sektör üzerinde — ani yükümlülük karşılama kapasitesi yüksek.`)

  // Kârlılık
  if (r.grossMargin != null && r.grossMargin > bm.grossMargin * 1.10)
    items.push(`Brüt kâr marjı %${(r.grossMargin * 100).toFixed(1)} ile sektör (%${(bm.grossMargin * 100).toFixed(1)}) üzerinde — fiyatlama gücü korunuyor.`)

  if (r.ebitdaMargin != null && r.ebitdaMargin > bm.ebitdaMargin * 1.10)
    items.push(`FAVÖK marjı %${(r.ebitdaMargin * 100).toFixed(1)} ile sektör (%${(bm.ebitdaMargin * 100).toFixed(1)}) üzerinde — operasyonel verimlilik olumlu.`)

  if (r.netProfitMargin != null && r.netProfitMargin > bm.netProfitMargin * 1.10)
    items.push(`Net kâr marjı %${(r.netProfitMargin * 100).toFixed(1)} ile sektörün üzerinde — kârlılık sürekliliği destekleyici.`)

  if (r.roe != null && r.roe > bm.roe * 1.10)
    items.push(`Özkaynak kârlılığı (ROE) %${(r.roe * 100).toFixed(1)} ile sektör (%${(bm.roe * 100).toFixed(1)}) üzerinde.`)

  if (r.revenueGrowth != null && r.revenueGrowth > bm.revenueGrowth * 1.05)
    items.push(`Gelir büyümesi %${(r.revenueGrowth * 100).toFixed(1)} ile sektör büyümesinin (%${(bm.revenueGrowth * 100).toFixed(1)}) üzerinde.`)

  // Kaldıraç
  if (r.interestCoverage != null && r.interestCoverage > bm.interestCoverage * 1.10)
    items.push(`Faiz karşılama oranı ${r.interestCoverage.toFixed(1)}x — borç servis kapasitesi güçlü.`)

  if (r.debtToEquity != null && r.debtToEquity < bm.debtToEquity * 0.85)
    items.push(`Borç/Özkaynak ${r.debtToEquity.toFixed(2)}x ile sektör (${bm.debtToEquity.toFixed(2)}x) altında — finansal kaldıraç dengeli.`)

  // Faaliyet
  if (r.assetTurnover != null && r.assetTurnover > bm.assetTurnover * 1.10)
    items.push(`Aktif devir hızı ${r.assetTurnover.toFixed(2)}x — varlık kullanım etkinliği sektör üzerinde.`)

  if (r.receivablesTurnoverDays != null && r.receivablesTurnoverDays < bm.receivablesDays * 0.85)
    items.push(`Alacak tahsil süresi ${Math.round(r.receivablesTurnoverDays)} gün ile sektör (${Math.round(bm.receivablesDays)} gün) altında — nakit dönüşüm hızlı.`)

  return items.slice(0, 5)
}

// ─── DİKKAT ALANLARI ──────────────────────────────────────────────────────────

/**
 * Sektörün altında kalan oranlardan 2–4 dikkat alanı üretir.
 */
export function buildWatchAreas(
  r: RatiosLike,
  bm: SectorBenchmark,
): string[] {
  const items: string[] = []

  // Likidite
  if (r.currentRatio != null && r.currentRatio < bm.currentRatio * 0.85)
    items.push(`Cari oran ${r.currentRatio.toFixed(2)}x — sektör ortalaması (${bm.currentRatio.toFixed(2)}x) altında; kısa vadeli yükümlülük yönetimine dikkat.`)

  if (r.quickRatio != null && r.quickRatio < 1.0)
    items.push(`Asit-test oranı ${r.quickRatio.toFixed(2)}x — stok dışlandığında likidite sıkışıklığı riski.`)

  // Kârlılık
  if (r.netProfitMargin != null && r.netProfitMargin < bm.netProfitMargin * 0.70)
    items.push(`Net kâr marjı %${(r.netProfitMargin * 100).toFixed(1)} ile sektör (%${(bm.netProfitMargin * 100).toFixed(1)}) belirgin altında.`)

  if (r.ebitdaMargin != null && r.ebitdaMargin < bm.ebitdaMargin * 0.75)
    items.push(`FAVÖK marjı %${(r.ebitdaMargin * 100).toFixed(1)} ile operasyonel verimlilik geliştirilebilir.`)

  // Kaldıraç
  if (r.debtToEquity != null && r.debtToEquity > bm.debtToEquity * 1.25)
    items.push(`Borç/Özkaynak ${r.debtToEquity.toFixed(2)}x ile sektörün (${bm.debtToEquity.toFixed(2)}x) üzerinde — kaldıraç riski izlenmeli.`)

  if (r.interestCoverage != null && r.interestCoverage < bm.interestCoverage * 0.75)
    items.push(`Faiz karşılama ${r.interestCoverage.toFixed(1)}x — finansal yük sınırda; faiz riski yönetimi önemli.`)

  // Faaliyet
  if (r.receivablesTurnoverDays != null && r.receivablesTurnoverDays > bm.receivablesDays * 1.25)
    items.push(`Alacak tahsil süresi ${Math.round(r.receivablesTurnoverDays)} gün — sektör (${Math.round(bm.receivablesDays)} gün) üzerinde; tahsilat hızlandırılmalı.`)

  if (r.inventoryTurnoverDays != null && r.inventoryTurnoverDays > bm.inventoryDays * 1.25)
    items.push(`Stok devir süresi ${Math.round(r.inventoryTurnoverDays)} gün — sektör (${Math.round(bm.inventoryDays)} gün) üzerinde; stok yönetimi iyileştirilebilir.`)

  if (r.cashConversionCycle != null && r.cashConversionCycle > bm.cashConversionCycle * 1.25)
    items.push(`Nakit dönüşüm çevrimi ${Math.round(r.cashConversionCycle)} gün — yüksek çalışma sermayesi ihtiyacı söz konusu.`)

  return items.slice(0, 4)
}

// ─── GENEL DEĞERLENDİRME ──────────────────────────────────────────────────────

export function buildConclusion(
  rating: string,
  score: number,
  sector: string | null | undefined,
  companyName: string,
): string {
  const sectorLabel = sector ?? 'genel'
  const band = getRatingBand(rating)

  const intros: Record<string, string> = {
    investment: `${companyName}, ${sectorLabel} sektöründe ${score} puan ve ${rating} derecelendirmesiyle yatırım yapılabilir segment içinde yer almaktadır.`,
    speculative: `${companyName}, ${sectorLabel} sektöründe ${score} puan ve ${rating} derecelendirmesiyle spekülatif segmentte konumlanmaktadır.`,
    high_risk: `${companyName}, ${sectorLabel} sektöründe ${score} puan ve ${rating} derecelendirmesiyle yüksek risk segmentindedir.`,
  }

  const middles: Record<string, string> = {
    investment: 'Finansal yapı temel göstergelerde sektör ortalamalarıyla uyum içindedir. Mevcut koşullar devam ettiği sürece kredi kullanımı ve banka ilişkileri sürdürülebilir görünmektedir.',
    speculative: 'Belirli finansal göstergelerde iyileştirme potansiyeli bulunmakta; senaryo planı kapsamındaki aksiyonlarla bir sonraki derecelendirme notuna ulaşmak 6–12 ay içinde mümkündür.',
    high_risk: 'Finansal göstergeler güçlü iyileştirme aksiyonları gerektirmektedir. Kredi kullanımı için teminat yapısının ve yönetim planının banka ile paylaşılması önerilmektedir.',
  }

  return `${intros[band]} ${middles[band]}`
}

function getRatingBand(rating: string): string {
  const ratingUpper = rating.toUpperCase().replace(/[+-]$/, '')
  if (['AAA', 'AA', 'A', 'BBB'].includes(ratingUpper)) return 'investment'
  if (['BB', 'B', 'CCC'].includes(ratingUpper)) return 'speculative'
  return 'high_risk'
}

// ─── TAAHHÜT NOTU ─────────────────────────────────────────────────────────────

export function buildCollateralNote(rating: string, score: number): string {
  if (score >= 75) return 'Maddi teminatsız kefalet yeterli — banka onay olasılığı yüksek.'
  if (score >= 65) return 'Kefalet veya müşteri çeki karşılığı — teminat yapısı yeterli.'
  if (score >= 55) return 'İpotek veya gayrimenkul teminatı önerilir.'
  return 'Güçlü teminat paketi gerekli (ipotek + kefalet + çek).'
}

// ─── SENARYO NOTU ─────────────────────────────────────────────────────────────

export function buildScenarioNote(rating: string, score: number): string {
  if (score >= 80) return 'En üst derecelendirme segmentlerinden birinde. Teminatsız kredi imkânı mevcuttur.'
  if (score >= 70) return 'Yatırım yapılabilir segment. Kefalet veya müşteri çeki karşılığı kullanım uygundur.'
  if (score >= 60) return 'Yatırım yapılabilir alt segment. Ek teminat ile kredi kullanımı mümkündür.'
  if (score >= 50) return 'Spekülatif segment. Güçlü teminat paketi ve detaylı iş planı sunulması önerilir.'
  return 'Yüksek risk segmenti. Yapısal finansal iyileştirmeler öncelikli hedef olmalıdır.'
}

// ─── ÖZNEL KART ÖZETİ ─────────────────────────────────────────────────────────

export function buildKkbSummary(
  score: number,
  maxScore: number,
  isEmpty: boolean,
): string {
  if (isEmpty) return 'KKB verisi girilmemiş. Kredi sicili bilgisi eklendiğinde bu alan otomatik değerlendirilecektir.'
  const pct = score / maxScore
  if (pct >= 0.85) return 'Kredi sicili temiz; gecikme veya olumsuz kayıt bulunmuyor. Güçlü KKB profili kredi başvurusunu olumlu etkiler.'
  if (pct >= 0.65) return 'Kredi sicilinde küçük gecikmeler mevcut ancak ciddi olumsuz kayıt yok. Banka değerlendirmesinde orta-olumlu profil.'
  if (pct >= 0.40) return 'Kredi sicilinde dikkat gerektiren kayıtlar mevcut. Banka ilişkisinin güçlendirilmesi önerilir.'
  return 'KKB profilinde önemli olumsuz kayıtlar var. Kredi kullanımı için sicil iyileştirmesi öncelikli adım olmalıdır.'
}

export function buildBankSummary(
  score: number,
  maxScore: number,
  isEmpty: boolean,
): string {
  if (isEmpty) return 'Banka ilişki bilgisi girilmemiş. Bu alan doldurulduğunda subjektif skor güncellenecektir.'
  const pct = score / maxScore
  if (pct >= 0.85) return 'Çok bankacılık ilişkisi, düşük limit kullanım oranı ve uzun vadeli kredi yapısıyla sağlıklı banka profili oluşturulmuş.'
  if (pct >= 0.65) return 'Banka ilişkileri genel olarak düzenli; limit kullanım oranı izlenmeli, vade yapısı güçlendirilebilir.'
  if (pct >= 0.40) return 'Yüksek limit kullanımı veya kısa vadeli yoğunlaşma söz konusu. Banka çeşitlendirmesi önerilir.'
  return 'Banka ilişki profili risk içeriyor. Limit kullanım düzeyi ve vade yapısı acil iyileştirme gerektiriyor.'
}

export function buildCorpSummary(
  score: number,
  maxScore: number,
  isEmpty: boolean,
): string {
  if (isEmpty) return 'Kurumsal yapı bilgisi girilmemiş.'
  const pct = score / maxScore
  if (pct >= 0.85) return 'Bağımsız denetim, deneyimli ortaklık yapısı ve kurumsal şeffaflık — güçlü kurumsal profil.'
  if (pct >= 0.55) return 'Makul denetim düzeyi ve ortaklık yapısı. YMM yeterlilik belgesi ile kurumsal profil güçlendirilebilir.'
  return 'Denetim düzeyi ve kurumsal yapı geliştirilebilir. Bağımsız denetim veya tam tasdik bankacılık süreçlerini olumlu etkiler.'
}

export function buildComplianceSummary(
  score: number,
  maxScore: number,
  isEmpty: boolean,
): string {
  if (isEmpty) return 'Uyum ve risk bilgisi girilmemiş.'
  const pct = score / maxScore
  if (pct >= 0.90) return 'Vergi/SGK borcu bulunmuyor, aktif dava yok — temiz uyum profili.'
  if (pct >= 0.65) return 'Küçük yükümlülükler dışında uyum profili genel olarak olumlu.'
  return 'Vergi/SGK borcu veya aktif dava mevcut. Bu durum banka kredisi süreçlerini olumsuz etkileyebilir; öncelikli çözüm önerilir.'
}

// ─── DURUM ETİKETİ ────────────────────────────────────────────────────────────

export function getSubjectiveStatus(
  score: number,
  maxScore: number,
): { status: string; statusColor: string; barColor: string; summaryBg: string; summaryColor: string } {
  const pct = score / maxScore
  if (pct >= 0.80) return {
    status: 'İyi',
    statusColor: '#22c55e',
    barColor: 'linear-gradient(90deg,#2dd4bf,#0891b2)',
    summaryBg: '#f0fdf4',
    summaryColor: '#16a34a',
  }
  if (pct >= 0.60) return {
    status: 'Orta-İyi',
    statusColor: '#2dd4bf',
    barColor: 'linear-gradient(90deg,#2dd4bf,#0891b2)',
    summaryBg: '#f0fdfa',
    summaryColor: '#0f766e',
  }
  if (pct >= 0.40) return {
    status: 'Orta',
    statusColor: '#f59e0b',
    barColor: 'linear-gradient(90deg,#f59e0b,#fb923c)',
    summaryBg: '#fefce8',
    summaryColor: '#92400e',
  }
  return {
    status: 'Zayıf',
    statusColor: '#ef4444',
    barColor: 'linear-gradient(90deg,#ef4444,#dc2626)',
    summaryBg: '#fef2f2',
    summaryColor: '#991b1b',
  }
}
