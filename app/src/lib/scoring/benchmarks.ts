/**
 * Finrate — Sektör Kıyaslama Veritabanı
 *
 * Kaynak: TCMB Sektörel Bilanço İstatistikleri (2022-2023 yayını)
 *         TÜİK Yıllık İş İstatistikleri
 *
 * Rasyo tanımları:
 *   currentRatio     : Cari Oran
 *   quickRatio       : Asit-Test Oranı
 *   debtToEquity     : Borç / Özkaynak
 *   debtToAssets     : Borç / Aktif
 *   grossMargin      : Brüt Kar Marjı
 *   ebitdaMargin     : FAVÖK Marjı
 *   netProfitMargin  : Net Kar Marjı
 *   roa              : Aktif Karlılığı (ROA)
 *   roe              : Özkaynak Karlılığı (ROE)
 *   assetTurnover    : Aktif Devir Hızı
 *   receivablesDays  : Alacak Tahsil Süresi (gün)
 *   inventoryDays    : Stok Tutma Süresi (gün)
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

// TCMB Sektörel Bilanço ve TÜİK kaynaklı sektör ortalamaları
export const SECTOR_BENCHMARKS: Record<string, SectorBenchmark> = {
  'İmalat': {
    label: 'İmalat Sanayi',
    currentRatio: 1.35, quickRatio: 0.83, debtToEquity: 1.60, debtToAssets: 0.61,
    grossMargin: 0.22, ebitdaMargin: 0.11, netProfitMargin: 0.05,
    roa: 0.06, roe: 0.14, assetTurnover: 1.10,
    receivablesDays: 72, inventoryDays: 55, interestCoverage: 3.2,
  },
  'İnşaat': {
    label: 'İnşaat',
    currentRatio: 1.52, quickRatio: 0.65, debtToEquity: 2.20, debtToAssets: 0.69,
    grossMargin: 0.18, ebitdaMargin: 0.08, netProfitMargin: 0.04,
    roa: 0.04, roe: 0.13, assetTurnover: 0.75,
    receivablesDays: 95, inventoryDays: 180, interestCoverage: 2.1,
  },
  'Toptan Ticaret': {
    label: 'Toptan Ticaret',
    currentRatio: 1.28, quickRatio: 0.86, debtToEquity: 1.55, debtToAssets: 0.61,
    grossMargin: 0.12, ebitdaMargin: 0.06, netProfitMargin: 0.03,
    roa: 0.05, roe: 0.13, assetTurnover: 1.85,
    receivablesDays: 55, inventoryDays: 35, interestCoverage: 2.8,
  },
  'Perakende Ticaret': {
    label: 'Perakende Ticaret',
    currentRatio: 1.15, quickRatio: 0.72, debtToEquity: 1.45, debtToAssets: 0.59,
    grossMargin: 0.28, ebitdaMargin: 0.08, netProfitMargin: 0.03,
    roa: 0.06, roe: 0.15, assetTurnover: 1.95,
    receivablesDays: 25, inventoryDays: 45, interestCoverage: 2.4,
  },
  'Hizmet': {
    label: 'Hizmetler',
    currentRatio: 1.25, quickRatio: 0.95, debtToEquity: 1.20, debtToAssets: 0.55,
    grossMargin: 0.45, ebitdaMargin: 0.15, netProfitMargin: 0.07,
    roa: 0.08, roe: 0.18, assetTurnover: 0.95,
    receivablesDays: 65, inventoryDays: 15, interestCoverage: 3.8,
  },
  'Bilişim': {
    label: 'Bilişim ve Teknoloji',
    currentRatio: 1.55, quickRatio: 1.38, debtToEquity: 0.80, debtToAssets: 0.44,
    grossMargin: 0.55, ebitdaMargin: 0.22, netProfitMargin: 0.12,
    roa: 0.12, roe: 0.22, assetTurnover: 0.85,
    receivablesDays: 75, inventoryDays: 8, interestCoverage: 6.5,
  },
  'Sağlık': {
    label: 'Sağlık Hizmetleri',
    currentRatio: 1.65, quickRatio: 1.22, debtToEquity: 1.05, debtToAssets: 0.51,
    grossMargin: 0.35, ebitdaMargin: 0.18, netProfitMargin: 0.09,
    roa: 0.09, roe: 0.19, assetTurnover: 0.90,
    receivablesDays: 55, inventoryDays: 20, interestCoverage: 4.2,
  },
  'Gıda': {
    label: 'Gıda ve İçecek',
    currentRatio: 1.30, quickRatio: 0.75, debtToEquity: 1.65, debtToAssets: 0.62,
    grossMargin: 0.20, ebitdaMargin: 0.10, netProfitMargin: 0.04,
    roa: 0.05, roe: 0.13, assetTurnover: 1.35,
    receivablesDays: 45, inventoryDays: 35, interestCoverage: 2.9,
  },
  'Enerji': {
    label: 'Enerji ve Elektrik',
    currentRatio: 1.35, quickRatio: 0.95, debtToEquity: 2.10, debtToAssets: 0.68,
    grossMargin: 0.30, ebitdaMargin: 0.28, netProfitMargin: 0.10,
    roa: 0.06, roe: 0.18, assetTurnover: 0.45,
    receivablesDays: 80, inventoryDays: 10, interestCoverage: 2.5,
  },
  'Ulaştırma': {
    label: 'Ulaştırma ve Lojistik',
    currentRatio: 1.15, quickRatio: 0.90, debtToEquity: 1.90, debtToAssets: 0.65,
    grossMargin: 0.25, ebitdaMargin: 0.14, netProfitMargin: 0.06,
    roa: 0.05, roe: 0.15, assetTurnover: 0.75,
    receivablesDays: 70, inventoryDays: 5, interestCoverage: 2.8,
  },
  'Tarım': {
    label: 'Tarım ve Hayvancılık',
    currentRatio: 1.55, quickRatio: 0.72, debtToEquity: 1.20, debtToAssets: 0.55,
    grossMargin: 0.18, ebitdaMargin: 0.12, netProfitMargin: 0.06,
    roa: 0.06, roe: 0.14, assetTurnover: 0.90,
    receivablesDays: 50, inventoryDays: 90, interestCoverage: 3.0,
  },
  'Tekstil': {
    label: 'Tekstil ve Hazır Giyim',
    currentRatio: 1.40, quickRatio: 0.72, debtToEquity: 1.75, debtToAssets: 0.64,
    grossMargin: 0.25, ebitdaMargin: 0.10, netProfitMargin: 0.04,
    roa: 0.05, roe: 0.14, assetTurnover: 1.15,
    receivablesDays: 85, inventoryDays: 65, interestCoverage: 2.6,
  },
  'Turizm': {
    label: 'Turizm ve Konaklama',
    currentRatio: 1.20, quickRatio: 0.98, debtToEquity: 1.80, debtToAssets: 0.64,
    grossMargin: 0.55, ebitdaMargin: 0.25, netProfitMargin: 0.08,
    roa: 0.05, roe: 0.14, assetTurnover: 0.50,
    receivablesDays: 35, inventoryDays: 10, interestCoverage: 2.2,
  },
  'Mimarlık': {
    label: 'Mimarlık ve Mühendislik',
    currentRatio: 1.45, quickRatio: 1.20, debtToEquity: 0.85, debtToAssets: 0.46,
    grossMargin: 0.40, ebitdaMargin: 0.18, netProfitMargin: 0.09,
    roa: 0.10, roe: 0.20, assetTurnover: 0.95,
    receivablesDays: 85, inventoryDays: 10, interestCoverage: 4.5,
  },
  'Genel': {
    label: 'Tüm Sektörler (Ortalama)',
    currentRatio: 1.35, quickRatio: 0.88, debtToEquity: 1.55, debtToAssets: 0.61,
    grossMargin: 0.28, ebitdaMargin: 0.12, netProfitMargin: 0.05,
    roa: 0.06, roe: 0.15, assetTurnover: 1.00,
    receivablesDays: 68, inventoryDays: 45, interestCoverage: 3.0,
  },
}

/**
 * Şirket sektör adından en yakın benchmark'ı döndür.
 * Eşleşme bulunamazsa Genel ortalamasını kullan.
 */
export function getSectorBenchmark(sector: string | null | undefined): SectorBenchmark {
  if (!sector) return SECTOR_BENCHMARKS['Genel']
  const s = sector.toLowerCase()
  for (const [key, val] of Object.entries(SECTOR_BENCHMARKS)) {
    if (s.includes(key.toLowerCase()) || key.toLowerCase().includes(s)) {
      return val
    }
  }
  // Keyword fallback
  if (s.includes('imalat') || s.includes('üretim') || s.includes('sanayi')) return SECTOR_BENCHMARKS['İmalat']
  if (s.includes('inşaat') || s.includes('yapı')) return SECTOR_BENCHMARKS['İnşaat']
  if (s.includes('toptan') || s.includes('ticaret')) return SECTOR_BENCHMARKS['Toptan Ticaret']
  if (s.includes('perakende') || s.includes('mağaza')) return SECTOR_BENCHMARKS['Perakende Ticaret']
  if (s.includes('bilişim') || s.includes('yazılım') || s.includes('teknoloji')) return SECTOR_BENCHMARKS['Bilişim']
  if (s.includes('sağlık') || s.includes('hastane') || s.includes('ilaç')) return SECTOR_BENCHMARKS['Sağlık']
  if (s.includes('gıda') || s.includes('yiyecek')) return SECTOR_BENCHMARKS['Gıda']
  if (s.includes('enerji') || s.includes('elektrik')) return SECTOR_BENCHMARKS['Enerji']
  if (s.includes('lojistik') || s.includes('kargo') || s.includes('ulaş')) return SECTOR_BENCHMARKS['Ulaştırma']
  if (s.includes('tarım') || s.includes('hayvancılık')) return SECTOR_BENCHMARKS['Tarım']
  if (s.includes('tekstil') || s.includes('konfeksiyon')) return SECTOR_BENCHMARKS['Tekstil']
  if (s.includes('turizm') || s.includes('otel')) return SECTOR_BENCHMARKS['Turizm']
  if (s.includes('mimarlık') || s.includes('mühendis')) return SECTOR_BENCHMARKS['Mimarlık']
  if (s.includes('hizmet')) return SECTOR_BENCHMARKS['Hizmet']
  return SECTOR_BENCHMARKS['Genel']
}

export const SECTOR_NAMES = Object.keys(SECTOR_BENCHMARKS)
