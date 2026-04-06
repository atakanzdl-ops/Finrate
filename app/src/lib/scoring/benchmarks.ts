/**
 * Finrate — Sektör Kıyaslama Veritabanı
 *
 * Kaynak: TCMB Sektör Bilançoları İstatistikleri 2025 Yayını
 *         (2023-2024 verileri, Yayın: 24 Kasım 2025)
 *         GİB'e beyanname veren tüm kurumlar vergisi mükellefleri (~180.000 firma)
 *         NACE Rev.2 sınıflandırması
 *
 * Değerler: Q (aktif büyüklüğüne göre ağırlıklı ortalama), 2024 yılı
 * Not: debtToEquity = kaldıraç / (1 - kaldıraç) formülüyle türetilmiştir
 *      ebitdaMargin TCMB'de doğrudan yayınlanmıyor — faaliyet karı marjına
 *      ortalama amortisman payı eklenerek tahmin edilmiştir
 */

export interface SectorBenchmark {
  label: string
  currentRatio: number
  quickRatio: number
  debtToEquity: number
  debtToAssets: number
  grossMargin: number
  ebitdaMargin: number
  netProfitMargin: number
  roa: number
  roe: number
  assetTurnover: number
  receivablesDays: number
  inventoryDays: number
  interestCoverage: number
}

export const SECTOR_BENCHMARKS: Record<string, SectorBenchmark> = {
  // ── A: Tarım, Ormancılık, Balıkçılık ──────────────────────────────────────
  'Tarım': {
    label: 'Tarım ve Hayvancılık',
    currentRatio: 1.93,  quickRatio: 0.75,
    debtToEquity: 0.79,  debtToAssets: 0.44,
    grossMargin: 0.20,   ebitdaMargin: 0.10,  netProfitMargin: 0.016,
    roa: 0.013,          roe: 0.023,
    assetTurnover: 0.68,
    receivablesDays: 34, inventoryDays: 82,   interestCoverage: 2.46,
  },

  // ── C: İmalat ─────────────────────────────────────────────────────────────
  'İmalat': {
    label: 'İmalat Sanayi',
    currentRatio: 1.73,  quickRatio: 1.00,
    debtToEquity: 0.93,  debtToAssets: 0.48,
    grossMargin: 0.20,   ebitdaMargin: 0.09,  netProfitMargin: 0.025,
    roa: 0.023,          roe: 0.044,
    assetTurnover: 0.87,
    receivablesDays: 53, inventoryDays: 70,   interestCoverage: 3.91,
  },

  // ── D: Elektrik, Gaz, Buhar ───────────────────────────────────────────────
  'Enerji': {
    label: 'Enerji ve Elektrik',
    currentRatio: 2.29,  quickRatio: 1.42,
    debtToEquity: 0.76,  debtToAssets: 0.43,
    grossMargin: 0.19,   ebitdaMargin: 0.22,  netProfitMargin: 0.086,
    roa: 0.015,          roe: 0.026,
    assetTurnover: 0.32,
    receivablesDays: 35, inventoryDays: 10,   interestCoverage: 3.50,
  },

  // ── F: İnşaat ─────────────────────────────────────────────────────────────
  'İnşaat': {
    label: 'İnşaat',
    currentRatio: 1.50,  quickRatio: 0.94,
    debtToEquity: 1.90,  debtToAssets: 0.66,
    grossMargin: 0.24,   ebitdaMargin: 0.09,  netProfitMargin: 0.050,
    roa: 0.010,          roe: 0.029,
    assetTurnover: 0.32,
    receivablesDays: 79, inventoryDays: 78,   interestCoverage: 6.87,
  },

  // ── G: Toptan Ticaret ─────────────────────────────────────────────────────
  'Toptan Ticaret': {
    label: 'Toptan Ticaret',
    currentRatio: 1.56,  quickRatio: 0.88,
    debtToEquity: 1.51,  debtToAssets: 0.60,
    grossMargin: 0.14,   ebitdaMargin: 0.05,  netProfitMargin: 0.014,
    roa: 0.019,          roe: 0.048,
    assetTurnover: 1.66,
    receivablesDays: 37, inventoryDays: 60,   interestCoverage: 4.72,
  },

  // ── G: Perakende Ticaret ──────────────────────────────────────────────────
  'Perakende Ticaret': {
    label: 'Perakende Ticaret',
    currentRatio: 1.50,  quickRatio: 0.80,
    debtToEquity: 1.51,  debtToAssets: 0.60,
    grossMargin: 0.25,   ebitdaMargin: 0.07,  netProfitMargin: 0.020,
    roa: 0.019,          roe: 0.048,
    assetTurnover: 1.80,
    receivablesDays: 20, inventoryDays: 40,   interestCoverage: 4.72,
  },

  // ── H: Ulaştırma ve Depolama ──────────────────────────────────────────────
  'Ulaştırma': {
    label: 'Ulaştırma ve Lojistik',
    currentRatio: 1.73,  quickRatio: 1.38,
    debtToEquity: 0.83,  debtToAssets: 0.45,
    grossMargin: 0.14,   ebitdaMargin: 0.13,  netProfitMargin: 0.081,
    roa: 0.029,          roe: 0.053,
    assetTurnover: 0.61,
    receivablesDays: 31, inventoryDays: 6,    interestCoverage: 3.54,
  },

  // ── I: Konaklama ve Yiyecek-İçecek ───────────────────────────────────────
  'Turizm': {
    label: 'Turizm ve Konaklama',
    currentRatio: 1.50,  quickRatio: 0.98,
    debtToEquity: 0.70,  debtToAssets: 0.41,
    grossMargin: 0.32,   ebitdaMargin: 0.22,  netProfitMargin: 0.105,
    roa: 0.035,          roe: 0.059,
    assetTurnover: 0.61,
    receivablesDays: 11, inventoryDays: 24,   interestCoverage: 5.10,
  },

  // ── J: Bilgi ve İletişim ──────────────────────────────────────────────────
  'Bilişim': {
    label: 'Bilişim ve Teknoloji',
    currentRatio: 1.91,  quickRatio: 1.62,
    debtToEquity: 0.54,  debtToAssets: 0.35,
    grossMargin: 0.36,   ebitdaMargin: 0.18,  netProfitMargin: 0.027,
    roa: 0.053,          roe: 0.081,
    assetTurnover: 0.55,
    receivablesDays: 65, inventoryDays: 19,   interestCoverage: 14.59,
  },

  // ── Q: Sağlık ve Sosyal Hizmetler ────────────────────────────────────────
  'Sağlık': {
    label: 'Sağlık Hizmetleri',
    currentRatio: 2.03,  quickRatio: 1.36,
    debtToEquity: 0.61,  debtToAssets: 0.38,
    grossMargin: 0.27,   ebitdaMargin: 0.16,  netProfitMargin: 0.071,
    roa: 0.056,          roe: 0.090,
    assetTurnover: 0.79,
    receivablesDays: 42, inventoryDays: 22,   interestCoverage: 13.26,
  },

  // ── C (alt): Gıda ve İçecek İmalatı ──────────────────────────────────────
  'Gıda': {
    label: 'Gıda ve İçecek',
    currentRatio: 1.65,  quickRatio: 0.82,
    debtToEquity: 1.10,  debtToAssets: 0.52,
    grossMargin: 0.22,   ebitdaMargin: 0.10,  netProfitMargin: 0.030,
    roa: 0.025,          roe: 0.052,
    assetTurnover: 1.20,
    receivablesDays: 40, inventoryDays: 45,   interestCoverage: 3.20,
  },

  // ── C (alt): Tekstil ve Hazır Giyim ──────────────────────────────────────
  'Tekstil': {
    label: 'Tekstil ve Hazır Giyim',
    currentRatio: 1.55,  quickRatio: 0.78,
    debtToEquity: 1.20,  debtToAssets: 0.55,
    grossMargin: 0.22,   ebitdaMargin: 0.09,  netProfitMargin: 0.030,
    roa: 0.025,          roe: 0.056,
    assetTurnover: 1.10,
    receivablesDays: 75, inventoryDays: 65,   interestCoverage: 3.00,
  },

  // ── M (alt): Mimarlık ve Mühendislik ─────────────────────────────────────
  'Mimarlık': {
    label: 'Mimarlık ve Mühendislik',
    currentRatio: 1.80,  quickRatio: 1.55,
    debtToEquity: 0.65,  debtToAssets: 0.39,
    grossMargin: 0.38,   ebitdaMargin: 0.16,  netProfitMargin: 0.080,
    roa: 0.075,          roe: 0.123,
    assetTurnover: 0.90,
    receivablesDays: 80, inventoryDays: 10,   interestCoverage: 5.50,
  },

  // ── Genel Hizmetler (M/N) ─────────────────────────────────────────────────
  'Hizmet': {
    label: 'Hizmetler',
    currentRatio: 1.70,  quickRatio: 1.35,
    debtToEquity: 0.85,  debtToAssets: 0.46,
    grossMargin: 0.35,   ebitdaMargin: 0.13,  netProfitMargin: 0.060,
    roa: 0.050,          roe: 0.093,
    assetTurnover: 0.85,
    receivablesDays: 55, inventoryDays: 12,   interestCoverage: 4.50,
  },

  // ── G (alt): Pazarlama / Dağıtım / Distribütörlük ───────────────────────
  // Toptan ticarete yakın ama stok süresi daha uzun, marj daha düşük
  'Pazarlama': {
    label: 'Pazarlama ve Dağıtım',
    currentRatio: 1.50,  quickRatio: 0.75,
    debtToEquity: 1.40,  debtToAssets: 0.58,
    grossMargin: 0.28,   ebitdaMargin: 0.06,  netProfitMargin: 0.015,
    roa: 0.018,          roe: 0.043,
    assetTurnover: 1.50,
    receivablesDays: 30, inventoryDays: 60,   interestCoverage: 3.50,
  },

  // ── G (alt): Otomotiv Bayi ve Servis ──────────────────────────────────────
  'Otomotiv': {
    label: 'Otomotiv ve Bayi',
    currentRatio: 1.45,  quickRatio: 0.65,
    debtToEquity: 1.60,  debtToAssets: 0.62,
    grossMargin: 0.12,   ebitdaMargin: 0.05,  netProfitMargin: 0.012,
    roa: 0.015,          roe: 0.040,
    assetTurnover: 1.80,
    receivablesDays: 25, inventoryDays: 55,   interestCoverage: 3.00,
  },

  // ── L: Gayrimenkul Faaliyetleri ───────────────────────────────────────────
  'Gayrimenkul': {
    label: 'Gayrimenkul ve Kiralama',
    currentRatio: 2.50,  quickRatio: 1.20,
    debtToEquity: 1.20,  debtToAssets: 0.55,
    grossMargin: 0.40,   ebitdaMargin: 0.35,  netProfitMargin: 0.120,
    roa: 0.020,          roe: 0.044,
    assetTurnover: 0.18,
    receivablesDays: 45, inventoryDays: 180,  interestCoverage: 4.00,
  },

  // ── Genel Ortalama (tüm NACE sektörleri) ─────────────────────────────────
  'Genel': {
    label: 'Tüm Sektörler (Ortalama)',
    currentRatio: 1.65,  quickRatio: 1.00,
    debtToEquity: 1.10,  debtToAssets: 0.52,
    grossMargin: 0.22,   ebitdaMargin: 0.10,  netProfitMargin: 0.040,
    roa: 0.025,          roe: 0.052,
    assetTurnover: 0.90,
    receivablesDays: 50, inventoryDays: 45,   interestCoverage: 4.00,
  },
}

/**
 * Şirket sektör adından en yakın benchmark'ı döndür.
 * Eşleşme bulunamazsa Genel ortalamasını kullan.
 */
export function getSectorBenchmark(sector: string | null | undefined): SectorBenchmark {
  if (!sector) return SECTOR_BENCHMARKS['Genel']
  const s = sector.toLowerCase()

  // ── Öncelikli eşleşmeler (spesifik → genel sırasıyla) ────────────────────
  // NOT: Daha spesifik sektörler mutlaka önce kontrol edilmeli.
  // "Pazarlama" → Hizmet'e düşmesin; "Otomotiv" → Ticaret'e düşmesin.

  // Gayrimenkul (en spesifik — "kiralama" genel kelimesinden önce)
  if (s.includes('gayrimenkul') || s.includes('emlak') || s.includes('kiralama') || s.includes('kira gelir'))
    return SECTOR_BENCHMARKS['Gayrimenkul']

  // Otomotiv (bayi/galeri → toptan ticaretten önce)
  if (s.includes('otomotiv') || s.includes('araç') || s.includes('bayi') || s.includes('galeri') || s.includes('motorlu'))
    return SECTOR_BENCHMARKS['Otomotiv']

  // Pazarlama / Distribütör (hizmet ve ticaretten önce)
  if (s.includes('pazarlama') || s.includes('distribütör') || s.includes('dağıtım') ||
      s.includes('ithalat') || s.includes('ihracat') || s.includes('acente'))
    return SECTOR_BENCHMARKS['Pazarlama']

  // İmalat / Üretim
  if (s.includes('imalat') || s.includes('üretim') || s.includes('sanayi') || s.includes('fabrika'))
    return SECTOR_BENCHMARKS['İmalat']

  // İnşaat / Taahhüt
  if (s.includes('inşaat') || s.includes('yapı') || s.includes('taahhüt') || s.includes('müteahhit'))
    return SECTOR_BENCHMARKS['İnşaat']

  // Perakende (toptan'dan önce — "perakende ticaret" gibi ifadeler)
  if (s.includes('perakende') || s.includes('mağaza') || s.includes('market') || s.includes('alışveriş'))
    return SECTOR_BENCHMARKS['Perakende Ticaret']

  // Toptan Ticaret
  if (s.includes('toptan') || s.includes('toptancı'))
    return SECTOR_BENCHMARKS['Toptan Ticaret']

  // Genel ticaret (pazarlama/otomotiv/perakende/toptan değilse)
  if (s.includes('ticaret'))
    return SECTOR_BENCHMARKS['Toptan Ticaret']

  // Bilişim / Teknoloji
  if (s.includes('bilişim') || s.includes('yazılım') || s.includes('teknoloji') ||
      s.includes('bilgi') || s.includes('yazılm') || s.includes('dijital') || s.includes('internet'))
    return SECTOR_BENCHMARKS['Bilişim']

  // Sağlık
  if (s.includes('sağlık') || s.includes('hastane') || s.includes('klinik') ||
      s.includes('ilaç') || s.includes('tıp') || s.includes('eczane'))
    return SECTOR_BENCHMARKS['Sağlık']

  // Gıda / İçecek
  if (s.includes('gıda') || s.includes('yiyecek') || s.includes('içecek') ||
      s.includes('tarım ürün') || s.includes('un') || s.includes('et '))
    return SECTOR_BENCHMARKS['Gıda']

  // Enerji
  if (s.includes('enerji') || s.includes('elektrik') || s.includes('gaz') ||
      s.includes('petrol') || s.includes('doğalgaz') || s.includes('yakıt'))
    return SECTOR_BENCHMARKS['Enerji']

  // Ulaştırma / Lojistik
  if (s.includes('lojistik') || s.includes('kargo') || s.includes('ulaş') ||
      s.includes('nakliye') || s.includes('taşıma') || s.includes('filo'))
    return SECTOR_BENCHMARKS['Ulaştırma']

  // Tarım
  if (s.includes('tarım') || s.includes('hayvancılık') || s.includes('ziraat') ||
      s.includes('çiftlik') || s.includes('seracılık'))
    return SECTOR_BENCHMARKS['Tarım']

  // Tekstil / Hazır Giyim
  if (s.includes('tekstil') || s.includes('konfeksiyon') || s.includes('giyim') ||
      s.includes('kumaş') || s.includes('iplik') || s.includes('deri'))
    return SECTOR_BENCHMARKS['Tekstil']

  // Turizm / Konaklama / Yiyecek-İçecek Hizmetleri
  if (s.includes('turizm') || s.includes('otel') || s.includes('konaklama') ||
      s.includes('restoran') || s.includes('kafe') || s.includes('tatil'))
    return SECTOR_BENCHMARKS['Turizm']

  // Mimarlık / Mühendislik / Danışmanlık
  if (s.includes('mimarlık') || s.includes('mühendis') || s.includes('danışman') ||
      s.includes('proje') || s.includes('tasarım') || s.includes('müşavirlik'))
    return SECTOR_BENCHMARKS['Mimarlık']

  // Genel Hizmetler (son çare — spesifik hizmet sektörlerine girmeyen)
  if (s.includes('hizmet') || s.includes('servis'))
    return SECTOR_BENCHMARKS['Hizmet']

  // Hiçbir eşleşme bulunamazsa genel ortalama
  return SECTOR_BENCHMARKS['Genel']
}

export const SECTOR_NAMES = Object.keys(SECTOR_BENCHMARKS)
