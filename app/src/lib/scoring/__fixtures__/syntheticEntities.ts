/**
 * Test fixture'ları — scoreAttribution testleri için.
 *
 * DEKAM_FIXTURE: DEKAM inşaat firması approximation.
 *   Bilinen değerler (production'dan): tradeReceivables ~13.9M, revenue ~24.5M
 *   Temel hedef: DSO ~208 gün (çok yüksek), objectiveScore ~17 (çok zayıf)
 *
 * SYNTHETIC_TRADE_FIXTURE: Sentetik ticaret firması.
 *   Toptan Ticaret sektörü benchmark'ından biraz altında.
 *   Hedef: objectiveScore ~45-55 (orta seviye), aksiyonlarla görünür iyileşme.
 */

import type { FinancialInput } from '../ratios'

// ─── DEKAM FİXTURE (İnşaat) ─────────────────────────────────────────────────

/**
 * DEKAM inşaat firması — production verilerine dayalı yaklaşık değerler.
 * Bilinen kesin değerler: tradeReceivables=13,909,833, revenue=24,454,088
 * Sektör: 'İnşaat' (getSectorBenchmark için Türkçe string gerekli)
 *
 * Durum: Çok zayıf firma
 *   - DSO: ~208 gün (İnşaat benchmark: 79)
 *   - DIO: ~2207 gün (153 hesabında proje maliyetleri var)
 *   - objectiveScore: ~17 (beklenen)
 */
export const DEKAM_SECTOR = 'İnşaat'
export const DEKAM_SUBJECTIVE_TOTAL = 23

export const DEKAM_INPUT: FinancialInput = {
  sector: DEKAM_SECTOR,

  // Gelir tablosu (bilinen değerler)
  revenue:           24_454_088,
  cogs:              20_000_000,
  grossProfit:        4_454_088,
  operatingExpenses:  2_454_088,
  ebit:               2_000_000,
  depreciation:       1_500_000,
  ebitda:             3_500_000,
  interestExpense:    8_000_000,  // yüksek faiz — IC < 1 yapıyor
  netProfit:         -3_000_000,  // faiz sonrası zarar

  // Alacaklar (production'dan bilinen)
  tradeReceivables:  13_909_833,

  // Stok (153 hesabı — inşaat proje maliyetleri)
  inventory:        132_600_000,

  // Nakit & likit
  cash:               3_000_000,
  shortTermInvestments: 500_000,

  // Dönen varlıklar
  totalCurrentAssets: 155_000_000,

  // Duran varlıklar
  tangibleAssets:      25_000_000,
  totalNonCurrentAssets: 30_000_000,

  // Toplam aktif
  totalAssets:        185_000_000,

  // Kısa vadeli borçlar
  shortTermFinancialDebt: 55_000_000,
  tradePayables:           8_000_000,
  totalCurrentLiabilities: 120_000_000,

  // Uzun vadeli borçlar
  longTermFinancialDebt:   20_000_000,
  totalNonCurrentLiabilities: 30_000_000,

  // Özkaynak
  paidInCapital:      20_000_000,
  retainedEarnings:   15_000_000,
  totalEquity:        35_000_000,
  totalLiabilitiesAndEquity: 185_000_000,
}

// ─── SENTETİK TİCARET FİXTURE (Toptan Ticaret) ───────────────────────────────

/**
 * Sentetik ticaret firması — TCMB Toptan Ticaret benchmark'ından biraz altında.
 * Benchmarks: receivablesDays=37, inventoryDays=60, grossMargin=0.14, currentRatio=1.56
 *
 * Mevcut durum (bilinçli olarak benchmark altında ayarlandı):
 *   - DSO: ~43 gün (benchmark 37 — %1.1 tolerans içinde DEĞİL: 43 > 37*1.1=40.7 → A05 devreye girer)
 *   - DIO: ~73 gün (benchmark 60 — 73 > 66 → A06 devreye girer)
 *   - grossMargin: 0.11 (benchmark 0.14 — A18 devreye girer)
 *   - debtToEquity: 2.2 (benchmark 1.51 — kaldıraç yüksek, A10 etkisi görünür)
 *   - objectiveScore: ~45-55 beklenen
 */
export const TRADE_SECTOR = 'ticaret'   // getSectorBenchmark 'Toptan Ticaret'e map eder
export const TRADE_SUBJECTIVE_TOTAL = 20

export const TRADE_INPUT: FinancialInput = {
  sector: TRADE_SECTOR,

  // Gelir tablosu
  revenue:           20_000_000,
  cogs:              17_800_000,      // grossMargin = 2.2M/20M = 0.11 (benchmark 0.14)
  grossProfit:        2_200_000,
  operatingExpenses:    900_000,
  ebit:               1_300_000,
  depreciation:         400_000,
  ebitda:             1_700_000,
  interestExpense:      750_000,      // IC = 1.3M/0.75M = 1.73 (düşük)
  netProfit:            412_500,      // (1300-750) * 0.75 vergi sonrası

  // Alacaklar: DSO = (2.35M/20M)*365 = 43 gün (benchmark 37)
  tradeReceivables:   2_350_000,

  // Stok: DIO = (3.55M/17.8M)*365 = 73 gün (benchmark 60)
  inventory:          3_550_000,

  // Nakit & likit
  cash:                 800_000,
  shortTermInvestments:  200_000,

  // Dönen varlıklar: CR = 8.9M/5.7M = 1.56 (benchmark eşiğinde)
  totalCurrentAssets:  8_900_000,
  totalCurrentLiabilities: 5_700_000,

  // Duran varlıklar
  tangibleAssets:      3_200_000,
  totalNonCurrentAssets: 3_500_000,

  // Toplam aktif
  totalAssets:        12_400_000,

  // Borç yapısı
  shortTermFinancialDebt: 3_000_000,  // A10 dönüşümü için
  tradePayables:          1_500_000,
  totalNonCurrentLiabilities: 2_300_000,
  longTermFinancialDebt:  1_800_000,

  // D/E = (3M+1.8M) / 2.18M = 2.2 (benchmark 1.51)
  totalEquity:         4_400_000,
  paidInCapital:       3_000_000,
  retainedEarnings:    1_000_000,
  totalLiabilitiesAndEquity: 12_400_000,
}
