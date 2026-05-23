/**
 * R8.1 Smoke Test — Firma Fixture'ları
 *
 * 5 gerçek/temsili firma profili:
 *   DEKAM    — CONSTRUCTION, BB, brüt zarar (-22.5M)
 *   ORGANIKA — MANUFACTURING, B, KOBİ finansman yükü (%32 > %20)
 *   ENES     — MANUFACTURING, B, neredeyse sıfır nakit (102=222 TL)
 *   iPOS     — IT, B, 255=13.4M bina=0 (A09 prefix bug guard)
 *   ISRA     — TRADE, B, tipik ticaret profili
 *
 * Kaynaklar:
 *   DEKAM    — r6Hotfix2BaselineGuard.test.ts + dekamGrossMarginIntegration.test.ts
 *   ORGANIKA — r7aGuardrailFallback.test.ts (17.7M versiyonu — A14 mandatory)
 *   ENES     — r6Hotfix2BaselineGuard.test.ts
 *   iPOS     — a09SaleLeasebackGuard.test.ts (README: 255=13.4M, 252=0)
 *   ISRA     — sentetik TRADE profili (R8.1 baseline)
 */

import type { EngineInput } from '../../../engineV3'

// ─── DEKAM — İnşaat, BB, brüt zarar ──────────────────────────────────────────
// grossProfit=-22.5M → A20 mandatory (criticalIssues: grossProfit < 0)
// 780=5.37M → finExp/netSales=1.64% < CONSTRUCTION %5 benchmark → A14 null
// 340=15M avans mevcut ama baselineGrossProfit<0 → A19 portfolio dışı (baseline guard)

export const DEKAM_INPUT: EngineInput = {
  sector:        'CONSTRUCTION',
  currentRating: 'BB',
  accountBalances: {
    '102': 93_000,              // Bankalar (çok düşük)
    '120': 50_000_000,          // Ticari Alacaklar
    '320': 71_900_000,          // KV Ticari Borç (tedarikçi)
    '340': 15_000_000,          // Alınan Sipariş Avansları
    '400': 40_000_000,          // UV Mali Borç
    '500': 80_000_000,          // Ödenmiş Sermaye
    '621': 350_500_000,         // Satılan Hizmet Maliyeti
    '780': 5_375_060,           // Finansman Giderleri (sektör altı: 1.64%)
  },
  incomeStatement: {
    netSales:         328_000_000,
    costOfGoodsSold:  350_500_000,
    grossProfit:      -22_500_000,  // BRÜT ZARAR
    operatingProfit:  -30_000_000,
    netIncome:        -40_000_000,
    interestExpense:    5_375_060,
  },
}

// ─── ORGANIKA — İmalat, B, KOBİ finansman yükü ───────────────────────────────
// 780 YOK, 300=22.8M → KOBİ finExp = 22.8M × %25 = 5.7M
// finExp/netSales = 5.7M/17.7M = 32.2% > %20 → A14 MANDATORY (criticalIssues)
// 102=960K, 300=22.8M → nakit oranı %4.2 < %15 → A04 portfolio dışı (baseline guard)

export const ORGANIKA_INPUT: EngineInput = {
  sector:        'MANUFACTURING',
  currentRating: 'B',
  accountBalances: {
    '102': 960_000,             // Bankalar (%4.2 guard)
    '120': 10_000_000,          // Ticari Alacaklar
    '153': 15_000_000,          // Ticari Mal Stok
    '300': 22_800_000,          // KV Mali Borç (780 yok → KOBİ fallback)
    '400': 30_000_000,          // UV Mali Borç
    '500': 10_000_000,          // Ödenmiş Sermaye
    // '780' YOK — getFinancialExpenses KOBİ fallback tetikler
  },
  incomeStatement: {
    netSales:        17_700_000,
    costOfGoodsSold: 13_830_000,
    grossProfit:      3_870_000,
    operatingProfit:    191_000,
    netIncome:          100_000,
    interestExpense:  2_000_000,
  },
}

// ─── ENES — İmalat, B, neredeyse sıfır nakit ─────────────────────────────────
// 102=222 TL → A04 computeAmount null (nakitCap=177 TL < eşik → portfolio dışı)

export const ENES_INPUT: EngineInput = {
  sector:        'MANUFACTURING',
  currentRating: 'B',
  accountBalances: {
    '102': 222,                 // 222 TL — neredeyse sıfır nakit
    '120': 5_000_000,           // Ticari Alacaklar
    '153': 8_000_000,           // Stok
    '252': 15_000_000,          // Binalar
    '300': 12_000_000,          // KV Borç
    '500': 5_000_000,           // Sermaye
  },
  incomeStatement: {
    netSales:        25_000_000,
    costOfGoodsSold: 18_000_000,
    grossProfit:      7_000_000,
    operatingProfit:  3_000_000,
    netIncome:        1_000_000,
    interestExpense:    800_000,
  },
}

// ─── iPOS — BT/Yazılım, B, 255 demirbaş (A09 prefix bug guard) ───────────────
// 255=13.4M (demirbaşlar), 252=0 (bina yok) → A09 havuzu sıfır → null → portfolio dışı
// R6 öncesi bug: '25' prefix eşleşmesi 255'i yakalıyordu → sahte 13.4M öneri
// R6 sonrası: sadece 250+252 → arsa=0, bina=0 → A09 null (guard çalışıyor)

export const IPOS_INPUT: EngineInput = {
  sector:        'IT',
  currentRating: 'B',
  accountBalances: {
    '102': 2_000_000,           // Bankalar
    '120': 8_000_000,           // Ticari Alacaklar
    '255': 13_400_000,          // Demirbaşlar (A09'u tetiklememeli)
    '252': 0,                   // Binalar = 0
    '300': 15_000_000,          // KV Mali Borç
    '500': 5_000_000,           // Sermaye
  },
  incomeStatement: {
    netSales:        20_000_000,
    costOfGoodsSold: 12_000_000,
    grossProfit:      8_000_000,
    operatingProfit:  3_000_000,
    netIncome:        1_500_000,
    interestExpense:  1_000_000,
  },
}

// ─── İSRA — Ticaret, B, tipik KOBİ profili ───────────────────────────────────
// Sentetik TRADE sektörü baseline (R8.1 — ticaret KOBİ referans profili)

export const ISRA_INPUT: EngineInput = {
  sector:        'TRADE',
  currentRating: 'B',
  accountBalances: {
    '102': 3_000_000,           // Bankalar
    '120': 12_000_000,          // Ticari Alacaklar
    '153': 8_000_000,           // Ticaret Malı
    '300': 18_000_000,          // KV Mali Borç
    '400': 10_000_000,          // UV Mali Borç
    '500': 5_000_000,           // Sermaye
  },
  incomeStatement: {
    netSales:        45_000_000,
    costOfGoodsSold: 32_000_000,
    grossProfit:     13_000_000,
    operatingProfit:  6_000_000,
    netIncome:        2_500_000,
    interestExpense:  1_500_000,
  },
}
