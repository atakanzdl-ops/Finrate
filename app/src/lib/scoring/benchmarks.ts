/**
 * Finrate — Sektör Kıyaslama Veritabanı
 *
 * Kaynak: TCMB Sektör Bilançoları İstatistikleri 2025 Yayını
 *         (2023-2024 verileri, Yayın: 24 Kasım 2025)
 *         GİB'e beyanname veren tüm kurumlar vergisi mükellefleri (~180.000 firma)
 *         NACE Rev.2 sınıflandırması
 *
 * Değerler: Q (aktif büyüklüğüne göre ağırlıklı ortalama), 2024 yılı
 *
 * Notlar:
 *   - debtToEquity = kaldıraç / (1 - kaldıraç) formülüyle türetilmiştir
 *   - ebitdaMargin TCMB'de doğrudan yayınlanmıyor — faaliyet karı marjına
 *     ortalama amortisman payı eklenerek tahmin edilmiştir
 *   - ebitMargin, roic, revenueGrowth, cashRatio, netWorkingCapitalRatio,
 *     cashConversionCycle, shortTermDebtRatio, debtToEbitda,
 *     payablesTurnoverDays, fixedAssetTurnover, operatingExpenseRatio:
 *     TCMB mikro veri seti + GİB KKDF beyanname ortalamaları esas alınarak
 *     sektörel kıyaslama değerleri türetilmiştir (Finrate tahmin, 2024)
 */

// ─── BENCHMARK ARAYÜZÜ ───────────────────────────────────────────────────────

export interface SectorBenchmark {
  label: string

  // ── Likidite ──────────────────────────────────────────────────────────────
  currentRatio:            number  // Cari oran
  quickRatio:              number  // Asit-test oranı
  cashRatio:               number  // Nakit oranı
  netWorkingCapitalRatio:  number  // NÇS / Toplam Aktif
  cashConversionCycle:     number  // CCC = DSO + DIO − DPO (gün)

  // ── Kârlılık ─────────────────────────────────────────────────────────────
  grossMargin:             number  // Brüt kâr marjı
  ebitdaMargin:            number  // FAVÖK marjı
  ebitMargin:              number  // FVÖK marjı
  netProfitMargin:         number  // Net kâr marjı
  roa:                     number  // Aktif kârlılığı
  roe:                     number  // Özkaynak kârlılığı
  roic:                    number  // Yatırım getirisi
  revenueGrowth:           number  // Nominal yıllık büyüme

  // ── Kaldıraç ─────────────────────────────────────────────────────────────
  debtToEquity:            number  // Borç / Özkaynak
  debtToAssets:            number  // Borç / Aktif
  shortTermDebtRatio:      number  // KV Borç / Toplam Borç
  debtToEbitda:            number  // Net Borç / FAVÖK
  interestCoverage:        number  // Faiz karşılama oranı

  // ── Faaliyet ─────────────────────────────────────────────────────────────
  assetTurnover:           number  // Aktif devir hızı
  receivablesDays:         number  // DSO (gün)
  inventoryDays:           number  // DIO (gün)
  payablesTurnoverDays:    number  // DPO (gün)
  fixedAssetTurnover:      number  // Sabit varlık devir hızı
  operatingExpenseRatio:   number  // Faaliyet gideri / Satışlar
}

// ─── SEKTÖR AĞIRLIK PROFİLİ ARAYÜZÜ ─────────────────────────────────────────

export interface SectorWeights {
  liquidity:     number  // toplam = 1.00
  profitability: number
  leverage:      number
  activity:      number
}

// ─── SEKTÖR AĞIRLIK PROFİLLERİ ───────────────────────────────────────────────

/**
 * Her sektör grubu için özelleştirilmiş kategori ağırlıkları.
 * Toplam daima 1.00 (= %100).
 *
 * Mantık:
 *   Üretim/Stok ağırlıklı sektörler   → Likidite yüksek, Faaliyet kritik
 *   Ticaret/Döngü ağırlıklı sektörler → Eşit dağılım
 *   Hizmet/Bilgi sektörleri            → Kârlılık yüksek
 *   Sermaye yoğun (Enerji/GYO)         → Kaldıraç yüksek
 *   Lojistik/Turizm                    → Likidite + Faaliyet
 */
export const SECTOR_WEIGHTS: Record<string, SectorWeights> = {
  // Üretim & Stok ağırlıklı — nakit akışı ve likidite kritik
  'İmalat':    { liquidity: 0.35, profitability: 0.20, leverage: 0.30, activity: 0.15 },
  'İnşaat':    { liquidity: 0.35, profitability: 0.20, leverage: 0.30, activity: 0.15 },
  'Tarım':     { liquidity: 0.35, profitability: 0.20, leverage: 0.30, activity: 0.15 },
  'Gıda':      { liquidity: 0.35, profitability: 0.20, leverage: 0.30, activity: 0.15 },
  'Tekstil':   { liquidity: 0.35, profitability: 0.20, leverage: 0.30, activity: 0.15 },

  // Ticaret & Döngü ağırlıklı — stok devri ve ticari döngü kritik
  'Toptan Ticaret':   { liquidity: 0.25, profitability: 0.25, leverage: 0.25, activity: 0.25 },
  'Perakende Ticaret':{ liquidity: 0.25, profitability: 0.25, leverage: 0.25, activity: 0.25 },
  'Otomotiv':         { liquidity: 0.25, profitability: 0.25, leverage: 0.25, activity: 0.25 },
  'Pazarlama':        { liquidity: 0.25, profitability: 0.25, leverage: 0.25, activity: 0.25 },

  // Hizmet & Bilgi — kârlılık ve alacak tahsil kritik, stok minimal
  'Bilişim':    { liquidity: 0.20, profitability: 0.35, leverage: 0.30, activity: 0.15 },
  'Sağlık':     { liquidity: 0.20, profitability: 0.35, leverage: 0.30, activity: 0.15 },
  'Mimarlık':   { liquidity: 0.20, profitability: 0.35, leverage: 0.30, activity: 0.15 },
  'Hizmet':     { liquidity: 0.20, profitability: 0.35, leverage: 0.30, activity: 0.15 },

  // Sermaye yoğun — borç yapısı ve kaldıraç kritik
  'Enerji':        { liquidity: 0.20, profitability: 0.20, leverage: 0.40, activity: 0.20 },
  'Gayrimenkul':   { liquidity: 0.20, profitability: 0.20, leverage: 0.40, activity: 0.20 },

  // Lojistik & Turizm — likidite ve faaliyet verimliliği kritik
  'Ulaştırma': { liquidity: 0.30, profitability: 0.20, leverage: 0.30, activity: 0.20 },
  'Turizm':    { liquidity: 0.30, profitability: 0.20, leverage: 0.30, activity: 0.20 },

  // Genel fallback
  'Genel':     { liquidity: 0.25, profitability: 0.30, leverage: 0.30, activity: 0.15 },
}

// ─── BENCHMARK VERİTABANI ─────────────────────────────────────────────────────

export const SECTOR_BENCHMARKS: Record<string, SectorBenchmark> = {

  // ── A: Tarım, Ormancılık, Balıkçılık ────────────────────────────────────────
  'Tarım': {
    label: 'Tarım ve Hayvancılık',
    // Likidite
    currentRatio: 1.93,  quickRatio: 0.75,
    cashRatio: 0.15,     netWorkingCapitalRatio: 0.22,  cashConversionCycle: 86,
    // Kârlılık
    grossMargin: 0.20,   ebitdaMargin: 0.10,  ebitMargin: 0.068,
    netProfitMargin: 0.016, roa: 0.013,        roe: 0.023,
    roic: 0.045,         revenueGrowth: 0.38,
    // Kaldıraç
    debtToEquity: 0.79,  debtToAssets: 0.44,
    shortTermDebtRatio: 0.60, debtToEbitda: 4.5, interestCoverage: 2.46,
    // Faaliyet
    assetTurnover: 0.68, receivablesDays: 34,  inventoryDays: 82,
    payablesTurnoverDays: 30, fixedAssetTurnover: 0.85, operatingExpenseRatio: 0.132,
  },

  // ── C: İmalat ────────────────────────────────────────────────────────────────
  'İmalat': {
    label: 'İmalat Sanayi',
    // Likidite
    currentRatio: 1.73,  quickRatio: 1.00,
    cashRatio: 0.18,     netWorkingCapitalRatio: 0.18,  cashConversionCycle: 78,
    // Kârlılık
    grossMargin: 0.20,   ebitdaMargin: 0.09,  ebitMargin: 0.065,
    netProfitMargin: 0.025, roa: 0.023,        roe: 0.044,
    roic: 0.065,         revenueGrowth: 0.42,
    // Kaldıraç
    debtToEquity: 0.93,  debtToAssets: 0.48,
    shortTermDebtRatio: 0.55, debtToEbitda: 3.8, interestCoverage: 3.91,
    // Faaliyet
    assetTurnover: 0.87, receivablesDays: 53,  inventoryDays: 70,
    payablesTurnoverDays: 45, fixedAssetTurnover: 1.50, operatingExpenseRatio: 0.135,
  },

  // ── D: Elektrik, Gaz, Buhar ──────────────────────────────────────────────────
  'Enerji': {
    label: 'Enerji ve Elektrik',
    // Likidite
    currentRatio: 2.29,  quickRatio: 1.42,
    cashRatio: 0.22,     netWorkingCapitalRatio: 0.25,  cashConversionCycle: 15,
    // Kârlılık
    grossMargin: 0.19,   ebitdaMargin: 0.22,  ebitMargin: 0.180,
    netProfitMargin: 0.086, roa: 0.015,        roe: 0.026,
    roic: 0.040,         revenueGrowth: 0.35,
    // Kaldıraç
    debtToEquity: 0.76,  debtToAssets: 0.43,
    shortTermDebtRatio: 0.35, debtToEbitda: 5.5, interestCoverage: 3.50,
    // Faaliyet
    assetTurnover: 0.32, receivablesDays: 35,  inventoryDays: 10,
    payablesTurnoverDays: 30, fixedAssetTurnover: 0.45, operatingExpenseRatio: 0.105,
  },

  // ── F: İnşaat ────────────────────────────────────────────────────────────────
  'İnşaat': {
    label: 'İnşaat',
    // Likidite
    currentRatio: 1.50,  quickRatio: 0.94,
    cashRatio: 0.12,     netWorkingCapitalRatio: 0.12,  cashConversionCycle: 102,
    // Kârlılık
    grossMargin: 0.24,   ebitdaMargin: 0.09,  ebitMargin: 0.070,
    netProfitMargin: 0.050, roa: 0.010,        roe: 0.029,
    roic: 0.055,         revenueGrowth: 0.48,
    // Kaldıraç
    debtToEquity: 1.90,  debtToAssets: 0.66,
    shortTermDebtRatio: 0.58, debtToEbitda: 5.2, interestCoverage: 6.87,
    // Faaliyet
    assetTurnover: 0.32, receivablesDays: 79,  inventoryDays: 78,
    payablesTurnoverDays: 55, fixedAssetTurnover: 0.60, operatingExpenseRatio: 0.170,
  },

  // ── G: Toptan Ticaret ─────────────────────────────────────────────────────────
  'Toptan Ticaret': {
    label: 'Toptan Ticaret',
    // Likidite
    currentRatio: 1.56,  quickRatio: 0.88,
    cashRatio: 0.14,     netWorkingCapitalRatio: 0.14,  cashConversionCycle: 57,
    // Kârlılık
    grossMargin: 0.14,   ebitdaMargin: 0.05,  ebitMargin: 0.038,
    netProfitMargin: 0.014, roa: 0.019,        roe: 0.048,
    roic: 0.075,         revenueGrowth: 0.40,
    // Kaldıraç
    debtToEquity: 1.51,  debtToAssets: 0.60,
    shortTermDebtRatio: 0.65, debtToEbitda: 3.2, interestCoverage: 4.72,
    // Faaliyet
    assetTurnover: 1.66, receivablesDays: 37,  inventoryDays: 60,
    payablesTurnoverDays: 40, fixedAssetTurnover: 5.50, operatingExpenseRatio: 0.105,
  },

  // ── G: Perakende Ticaret ──────────────────────────────────────────────────────
  'Perakende Ticaret': {
    label: 'Perakende Ticaret',
    // Likidite
    currentRatio: 1.50,  quickRatio: 0.80,
    cashRatio: 0.18,     netWorkingCapitalRatio: 0.14,  cashConversionCycle: 30,
    // Kârlılık
    grossMargin: 0.25,   ebitdaMargin: 0.07,  ebitMargin: 0.055,
    netProfitMargin: 0.020, roa: 0.019,        roe: 0.048,
    roic: 0.080,         revenueGrowth: 0.38,
    // Kaldıraç
    debtToEquity: 1.51,  debtToAssets: 0.60,
    shortTermDebtRatio: 0.62, debtToEbitda: 2.8, interestCoverage: 4.72,
    // Faaliyet
    assetTurnover: 1.80, receivablesDays: 20,  inventoryDays: 40,
    payablesTurnoverDays: 30, fixedAssetTurnover: 4.80, operatingExpenseRatio: 0.180,
  },

  // ── H: Ulaştırma ve Depolama ──────────────────────────────────────────────────
  'Ulaştırma': {
    label: 'Ulaştırma ve Lojistik',
    // Likidite
    currentRatio: 1.73,  quickRatio: 1.38,
    cashRatio: 0.20,     netWorkingCapitalRatio: 0.18,  cashConversionCycle: 12,
    // Kârlılık
    grossMargin: 0.14,   ebitdaMargin: 0.13,  ebitMargin: 0.100,
    netProfitMargin: 0.081, roa: 0.029,        roe: 0.053,
    roic: 0.070,         revenueGrowth: 0.38,
    // Kaldıraç
    debtToEquity: 0.83,  debtToAssets: 0.45,
    shortTermDebtRatio: 0.45, debtToEbitda: 3.8, interestCoverage: 3.54,
    // Faaliyet
    assetTurnover: 0.61, receivablesDays: 31,  inventoryDays: 6,
    payablesTurnoverDays: 25, fixedAssetTurnover: 0.90, operatingExpenseRatio: 0.130,
  },

  // ── I: Konaklama ve Yiyecek-İçecek ───────────────────────────────────────────
  'Turizm': {
    label: 'Turizm ve Konaklama',
    // Likidite
    currentRatio: 1.50,  quickRatio: 0.98,
    cashRatio: 0.18,     netWorkingCapitalRatio: 0.15,  cashConversionCycle: 15,
    // Kârlılık
    grossMargin: 0.32,   ebitdaMargin: 0.22,  ebitMargin: 0.170,
    netProfitMargin: 0.105, roa: 0.035,        roe: 0.059,
    roic: 0.065,         revenueGrowth: 0.55,
    // Kaldıraç
    debtToEquity: 0.70,  debtToAssets: 0.41,
    shortTermDebtRatio: 0.42, debtToEbitda: 4.2, interestCoverage: 5.10,
    // Faaliyet
    assetTurnover: 0.61, receivablesDays: 11,  inventoryDays: 24,
    payablesTurnoverDays: 20, fixedAssetTurnover: 0.75, operatingExpenseRatio: 0.145,
  },

  // ── J: Bilgi ve İletişim ──────────────────────────────────────────────────────
  'Bilişim': {
    label: 'Bilişim ve Teknoloji',
    // Likidite
    currentRatio: 1.91,  quickRatio: 1.62,
    cashRatio: 0.35,     netWorkingCapitalRatio: 0.25,  cashConversionCycle: 54,
    // Kârlılık
    grossMargin: 0.36,   ebitdaMargin: 0.18,  ebitMargin: 0.150,
    netProfitMargin: 0.027, roa: 0.053,        roe: 0.081,
    roic: 0.130,         revenueGrowth: 0.45,
    // Kaldıraç
    debtToEquity: 0.54,  debtToAssets: 0.35,
    shortTermDebtRatio: 0.45, debtToEbitda: 1.8, interestCoverage: 14.59,
    // Faaliyet
    assetTurnover: 0.55, receivablesDays: 65,  inventoryDays: 19,
    payablesTurnoverDays: 30, fixedAssetTurnover: 3.20, operatingExpenseRatio: 0.210,
  },

  // ── Q: Sağlık ve Sosyal Hizmetler ────────────────────────────────────────────
  'Sağlık': {
    label: 'Sağlık Hizmetleri',
    // Likidite
    currentRatio: 2.03,  quickRatio: 1.36,
    cashRatio: 0.28,     netWorkingCapitalRatio: 0.22,  cashConversionCycle: 39,
    // Kârlılık
    grossMargin: 0.27,   ebitdaMargin: 0.16,  ebitMargin: 0.130,
    netProfitMargin: 0.071, roa: 0.056,        roe: 0.090,
    roic: 0.120,         revenueGrowth: 0.40,
    // Kaldıraç
    debtToEquity: 0.61,  debtToAssets: 0.38,
    shortTermDebtRatio: 0.48, debtToEbitda: 2.2, interestCoverage: 13.26,
    // Faaliyet
    assetTurnover: 0.79, receivablesDays: 42,  inventoryDays: 22,
    payablesTurnoverDays: 25, fixedAssetTurnover: 1.80, operatingExpenseRatio: 0.185,
  },

  // ── C (alt): Gıda ve İçecek İmalatı ──────────────────────────────────────────
  'Gıda': {
    label: 'Gıda ve İçecek',
    // Likidite
    currentRatio: 1.65,  quickRatio: 0.82,
    cashRatio: 0.16,     netWorkingCapitalRatio: 0.16,  cashConversionCycle: 50,
    // Kârlılık
    grossMargin: 0.22,   ebitdaMargin: 0.10,  ebitMargin: 0.075,
    netProfitMargin: 0.030, roa: 0.025,        roe: 0.052,
    roic: 0.070,         revenueGrowth: 0.45,
    // Kaldıraç
    debtToEquity: 1.10,  debtToAssets: 0.52,
    shortTermDebtRatio: 0.58, debtToEbitda: 3.5, interestCoverage: 3.20,
    // Faaliyet
    assetTurnover: 1.20, receivablesDays: 40,  inventoryDays: 45,
    payablesTurnoverDays: 35, fixedAssetTurnover: 1.80, operatingExpenseRatio: 0.145,
  },

  // ── C (alt): Tekstil ve Hazır Giyim ──────────────────────────────────────────
  'Tekstil': {
    label: 'Tekstil ve Hazır Giyim',
    // Likidite
    currentRatio: 1.55,  quickRatio: 0.78,
    cashRatio: 0.14,     netWorkingCapitalRatio: 0.15,  cashConversionCycle: 100,
    // Kârlılık
    grossMargin: 0.22,   ebitdaMargin: 0.09,  ebitMargin: 0.065,
    netProfitMargin: 0.030, roa: 0.025,        roe: 0.056,
    roic: 0.060,         revenueGrowth: 0.35,
    // Kaldıraç
    debtToEquity: 1.20,  debtToAssets: 0.55,
    shortTermDebtRatio: 0.62, debtToEbitda: 4.2, interestCoverage: 3.00,
    // Faaliyet
    assetTurnover: 1.10, receivablesDays: 75,  inventoryDays: 65,
    payablesTurnoverDays: 40, fixedAssetTurnover: 1.40, operatingExpenseRatio: 0.155,
  },

  // ── M (alt): Mimarlık ve Mühendislik ─────────────────────────────────────────
  'Mimarlık': {
    label: 'Mimarlık ve Mühendislik',
    // Likidite
    currentRatio: 1.80,  quickRatio: 1.55,
    cashRatio: 0.32,     netWorkingCapitalRatio: 0.24,  cashConversionCycle: 55,
    // Kârlılık
    grossMargin: 0.38,   ebitdaMargin: 0.16,  ebitMargin: 0.130,
    netProfitMargin: 0.080, roa: 0.075,        roe: 0.123,
    roic: 0.150,         revenueGrowth: 0.42,
    // Kaldıraç
    debtToEquity: 0.65,  debtToAssets: 0.39,
    shortTermDebtRatio: 0.50, debtToEbitda: 1.5, interestCoverage: 5.50,
    // Faaliyet
    assetTurnover: 0.90, receivablesDays: 80,  inventoryDays: 10,
    payablesTurnoverDays: 35, fixedAssetTurnover: 3.50, operatingExpenseRatio: 0.220,
  },

  // ── Genel Hizmetler (M/N) ─────────────────────────────────────────────────────
  'Hizmet': {
    label: 'Hizmetler',
    // Likidite
    currentRatio: 1.70,  quickRatio: 1.35,
    cashRatio: 0.25,     netWorkingCapitalRatio: 0.18,  cashConversionCycle: 37,
    // Kârlılık
    grossMargin: 0.35,   ebitdaMargin: 0.13,  ebitMargin: 0.100,
    netProfitMargin: 0.060, roa: 0.050,        roe: 0.093,
    roic: 0.110,         revenueGrowth: 0.38,
    // Kaldıraç
    debtToEquity: 0.85,  debtToAssets: 0.46,
    shortTermDebtRatio: 0.52, debtToEbitda: 2.5, interestCoverage: 4.50,
    // Faaliyet
    assetTurnover: 0.85, receivablesDays: 55,  inventoryDays: 12,
    payablesTurnoverDays: 30, fixedAssetTurnover: 2.80, operatingExpenseRatio: 0.190,
  },

  // ── G (alt): Pazarlama / Dağıtım / Distribütörlük ────────────────────────────
  'Pazarlama': {
    label: 'Pazarlama ve Dağıtım',
    // Likidite
    currentRatio: 1.50,  quickRatio: 0.75,
    cashRatio: 0.13,     netWorkingCapitalRatio: 0.12,  cashConversionCycle: 50,
    // Kârlılık
    grossMargin: 0.28,   ebitdaMargin: 0.06,  ebitMargin: 0.042,
    netProfitMargin: 0.015, roa: 0.018,        roe: 0.043,
    roic: 0.065,         revenueGrowth: 0.38,
    // Kaldıraç
    debtToEquity: 1.40,  debtToAssets: 0.58,
    shortTermDebtRatio: 0.65, debtToEbitda: 3.5, interestCoverage: 3.50,
    // Faaliyet
    assetTurnover: 1.50, receivablesDays: 30,  inventoryDays: 60,
    payablesTurnoverDays: 40, fixedAssetTurnover: 4.50, operatingExpenseRatio: 0.115,
  },

  // ── G (alt): Otomotiv Bayi ve Servis ─────────────────────────────────────────
  'Otomotiv': {
    label: 'Otomotiv ve Bayi',
    // Likidite
    currentRatio: 1.45,  quickRatio: 0.65,
    cashRatio: 0.12,     netWorkingCapitalRatio: 0.10,  cashConversionCycle: 35,
    // Kârlılık
    grossMargin: 0.12,   ebitdaMargin: 0.05,  ebitMargin: 0.035,
    netProfitMargin: 0.012, roa: 0.015,        roe: 0.040,
    roic: 0.060,         revenueGrowth: 0.50,
    // Kaldıraç
    debtToEquity: 1.60,  debtToAssets: 0.62,
    shortTermDebtRatio: 0.68, debtToEbitda: 4.0, interestCoverage: 3.00,
    // Faaliyet
    assetTurnover: 1.80, receivablesDays: 25,  inventoryDays: 55,
    payablesTurnoverDays: 45, fixedAssetTurnover: 5.20, operatingExpenseRatio: 0.095,
  },

  // ── L: Gayrimenkul Faaliyetleri ───────────────────────────────────────────────
  'Gayrimenkul': {
    label: 'Gayrimenkul ve Kiralama',
    // Likidite
    currentRatio: 2.50,  quickRatio: 1.20,
    cashRatio: 0.15,     netWorkingCapitalRatio: 0.35,  cashConversionCycle: 165,
    // Kârlılık
    grossMargin: 0.40,   ebitdaMargin: 0.35,  ebitMargin: 0.290,
    netProfitMargin: 0.120, roa: 0.020,        roe: 0.044,
    roic: 0.035,         revenueGrowth: 0.55,
    // Kaldıraç
    debtToEquity: 1.20,  debtToAssets: 0.55,
    shortTermDebtRatio: 0.38, debtToEbitda: 6.0, interestCoverage: 4.00,
    // Faaliyet
    assetTurnover: 0.18, receivablesDays: 45,  inventoryDays: 180,
    payablesTurnoverDays: 60, fixedAssetTurnover: 0.25, operatingExpenseRatio: 0.085,
  },

  // ── Genel Ortalama (tüm NACE sektörleri) ─────────────────────────────────────
  'Genel': {
    label: 'Tüm Sektörler (Ortalama)',
    // Likidite
    currentRatio: 1.65,  quickRatio: 1.00,
    cashRatio: 0.20,     netWorkingCapitalRatio: 0.18,  cashConversionCycle: 60,
    // Kârlılık
    grossMargin: 0.22,   ebitdaMargin: 0.10,  ebitMargin: 0.075,
    netProfitMargin: 0.040, roa: 0.025,        roe: 0.052,
    roic: 0.075,         revenueGrowth: 0.42,
    // Kaldıraç
    debtToEquity: 1.10,  debtToAssets: 0.52,
    shortTermDebtRatio: 0.55, debtToEbitda: 4.0, interestCoverage: 4.00,
    // Faaliyet
    assetTurnover: 0.90, receivablesDays: 50,  inventoryDays: 45,
    payablesTurnoverDays: 35, fixedAssetTurnover: 1.80, operatingExpenseRatio: 0.140,
  },
}

// ─── LOOKUP FONKSİYONLARI ─────────────────────────────────────────────────────

/**
 * Şirket sektör adından en yakın benchmark'ı döndür.
 * Eşleşme bulunamazsa Genel ortalamasını kullan.
 */
export function getSectorBenchmark(sector: string | null | undefined): SectorBenchmark {
  if (!sector) return SECTOR_BENCHMARKS['Genel']
  // toLocaleLowerCase('tr') → "İ"→"i", "I"→"ı" (Türkçe büyük-küçük dönüşümü doğru)
  const s = sector.toLocaleLowerCase('tr')

  if (s.includes('gayrimenkul') || s.includes('emlak') || s.includes('kiralama') || s.includes('kira gelir'))
    return SECTOR_BENCHMARKS['Gayrimenkul']
  if (s.includes('otomotiv') || s.includes('araç') || s.includes('bayi') || s.includes('galeri') || s.includes('motorlu'))
    return SECTOR_BENCHMARKS['Otomotiv']
  if (s.includes('pazarlama') || s.includes('distribütör') || s.includes('dağıtım') ||
      s.includes('ithalat') || s.includes('ihracat') || s.includes('acente'))
    return SECTOR_BENCHMARKS['Pazarlama']
  if (s.includes('imalat') || s.includes('üretim') || s.includes('sanayi') || s.includes('fabrika'))
    return SECTOR_BENCHMARKS['İmalat']
  if (s.includes('inşaat') || s.includes('yapı') || s.includes('taahhüt') || s.includes('müteahhit'))
    return SECTOR_BENCHMARKS['İnşaat']
  if (s.includes('perakende') || s.includes('mağaza') || s.includes('market') || s.includes('alışveriş'))
    return SECTOR_BENCHMARKS['Perakende Ticaret']
  if (s.includes('toptan') || s.includes('toptancı'))
    return SECTOR_BENCHMARKS['Toptan Ticaret']
  if (s.includes('ticaret'))
    return SECTOR_BENCHMARKS['Toptan Ticaret']
  if (s.includes('bilişim') || s.includes('yazılım') || s.includes('teknoloji') ||
      s.includes('bilgi') || s.includes('dijital') || s.includes('internet'))
    return SECTOR_BENCHMARKS['Bilişim']
  if (s.includes('sağlık') || s.includes('hastane') || s.includes('klinik') ||
      s.includes('ilaç') || s.includes('tıp') || s.includes('eczane'))
    return SECTOR_BENCHMARKS['Sağlık']
  if (s.includes('gıda') || s.includes('yiyecek') || s.includes('içecek') ||
      s.includes('tarım ürün') || s.includes('un') || s.includes('et '))
    return SECTOR_BENCHMARKS['Gıda']
  if (s.includes('enerji') || s.includes('elektrik') || s.includes('gaz') ||
      s.includes('petrol') || s.includes('doğalgaz') || s.includes('yakıt'))
    return SECTOR_BENCHMARKS['Enerji']
  if (s.includes('lojistik') || s.includes('kargo') || s.includes('ulaş') ||
      s.includes('nakliye') || s.includes('taşıma') || s.includes('filo'))
    return SECTOR_BENCHMARKS['Ulaştırma']
  if (s.includes('tarım') || s.includes('hayvancılık') || s.includes('ziraat') ||
      s.includes('çiftlik') || s.includes('seracılık'))
    return SECTOR_BENCHMARKS['Tarım']
  if (s.includes('tekstil') || s.includes('konfeksiyon') || s.includes('giyim') ||
      s.includes('kumaş') || s.includes('iplik') || s.includes('deri'))
    return SECTOR_BENCHMARKS['Tekstil']
  if (s.includes('turizm') || s.includes('otel') || s.includes('konaklama') ||
      s.includes('restoran') || s.includes('kafe') || s.includes('tatil'))
    return SECTOR_BENCHMARKS['Turizm']
  if (s.includes('mimarlık') || s.includes('mühendis') || s.includes('danışman') ||
      s.includes('proje') || s.includes('tasarım') || s.includes('müşavirlik'))
    return SECTOR_BENCHMARKS['Mimarlık']
  if (s.includes('hizmet') || s.includes('servis'))
    return SECTOR_BENCHMARKS['Hizmet']

  return SECTOR_BENCHMARKS['Genel']
}

/**
 * Sektöre ait kategori ağırlık profilini döndür.
 * Eşleşme bulunamazsa Genel profilini kullan.
 */
export function getSectorWeights(sector: string | null | undefined): SectorWeights {
  if (!sector) return SECTOR_WEIGHTS['Genel']
  const bm = getSectorBenchmark(sector)
  // benchmark label → weights key eşleştirmesi
  const labelToKey: Record<string, string> = {
    'Tarım ve Hayvancılık':     'Tarım',
    'İmalat Sanayi':            'İmalat',
    'Enerji ve Elektrik':       'Enerji',
    'İnşaat':                   'İnşaat',
    'Toptan Ticaret':           'Toptan Ticaret',
    'Perakende Ticaret':        'Perakende Ticaret',
    'Ulaştırma ve Lojistik':    'Ulaştırma',
    'Turizm ve Konaklama':      'Turizm',
    'Bilişim ve Teknoloji':     'Bilişim',
    'Sağlık Hizmetleri':        'Sağlık',
    'Gıda ve İçecek':           'Gıda',
    'Tekstil ve Hazır Giyim':   'Tekstil',
    'Mimarlık ve Mühendislik':  'Mimarlık',
    'Hizmetler':                'Hizmet',
    'Pazarlama ve Dağıtım':     'Pazarlama',
    'Otomotiv ve Bayi':         'Otomotiv',
    'Gayrimenkul ve Kiralama':  'Gayrimenkul',
    'Tüm Sektörler (Ortalama)': 'Genel',
  }
  const key = labelToKey[bm.label] ?? 'Genel'
  return SECTOR_WEIGHTS[key] ?? SECTOR_WEIGHTS['Genel']
}

export const SECTOR_NAMES = Object.keys(SECTOR_BENCHMARKS)
