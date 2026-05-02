/**
 * ACTION RATIO GROUP PROFILE (Faz 7.3.8d-FIX2)
 *
 * V3 aksiyon kataloğundaki her aksiyon için rasyo grubu çeşitlilik profili.
 * selectTargetPackage'da "dengeli paket" seçimi için kullanılır.
 *
 * 4 rasyo grubu:
 *   LIQUIDITY      — cari oran, nakit oranı, likidite rasyoları
 *   PROFITABILITY  — brüt marj, net kâr marjı, FAVÖK marjı
 *   LEVERAGE       — borç/özkaynak, özkaynak oranı, kaldıraç
 *   ACTIVITY       — DSO, DIO, aktif devir hızı
 *
 * Kural: Sadece V3 actionCatalogV3.ts'de tanımlı aksiyonlar profilde yer alır (18 adet).
 * Profile olmayan aksiyon ID'leri → getCoveredGroups → 0 katkı (sessiz fallback).
 *
 * Projeksiyon aksiyonlar (A13, A14) da dahildir — engineResult.portfolio'da
 * yer alabilirler ve diversity hesabı yapılır.
 *
 * ID formatı: tam catalog ID'si ('A05_RECEIVABLE_COLLECTION'), kısa değil ('A05').
 * Gerçek sistemde SelectedAction.actionId = tam catalog ID'sidir.
 */

export type RatioGroup = 'LIQUIDITY' | 'PROFITABILITY' | 'LEVERAGE' | 'ACTIVITY'

export interface ActionRatioGroupProfile {
  primary:    RatioGroup
  secondary?: RatioGroup
}

/**
 * V3 Catalog × Rasyo Grubu haritası (18 aksiyon, tam ID ile).
 *
 * Atama mantığı:
 *   primary   — aksiyonun birincil bilanço/gelir tablosu etkisi
 *   secondary — ikincil dolaylı etki (opsiyonel)
 */
export const ACTION_RATIO_GROUP_PROFILE: Record<string, ActionRatioGroupProfile> = {
  // ── Vade Dönüşümleri ───────────────────────────────────────────────────────
  // KV→UV çevrim: cari oran ↑ (LIQUIDITY), toplam borç aynı ama vade yapısı ↓ (LEVERAGE)
  'A01_ST_FIN_DEBT_TO_LT':                 { primary: 'LEVERAGE', secondary: 'LIQUIDITY' },
  'A02_TRADE_PAYABLE_TO_LT':               { primary: 'LEVERAGE', secondary: 'LIQUIDITY' },
  'A03_ADVANCE_TO_LT':                     { primary: 'LIQUIDITY' },
  // Ortak borcu KV→UV: cari oran ↑ (LIQUIDITY), pasif vade profili ↓ (LEVERAGE)
  'A15B_SHAREHOLDER_DEBT_TO_LT':           { primary: 'LEVERAGE', secondary: 'LIQUIDITY' },

  // ── Nakit ile Borç Kapatma ─────────────────────────────────────────────────
  // Borç ↓ + nakit ↓: borçluluk ↓ (LEVERAGE), cari oran dolaylı (LIQUIDITY secondary)
  'A04_CASH_PAYDOWN_ST':                   { primary: 'LEVERAGE', secondary: 'LIQUIDITY' },

  // ── Dönen Varlık Optimizasyonu ─────────────────────────────────────────────
  // Alacak → nakit: DSO ↓ (ACTIVITY), cari oran ↑ (LIQUIDITY)
  'A05_RECEIVABLE_COLLECTION':             { primary: 'LIQUIDITY', secondary: 'ACTIVITY' },
  // Stok → nakit: DIO ↓ (ACTIVITY), cari oran ↑↑ (LIQUIDITY dominant — Faz 2 snapshot)
  'A06_INVENTORY_MONETIZATION':            { primary: 'ACTIVITY', secondary: 'LIQUIDITY' },

  // ── Duran Varlık Satışı ────────────────────────────────────────────────────
  // Varlık sat, nakit kazan: borçluluk ↓ (LEVERAGE), nakit ↑ (LIQUIDITY)
  'A08_FIXED_ASSET_DISPOSAL':              { primary: 'LEVERAGE', secondary: 'LIQUIDITY' },
  // Sat-geri kirala: nakit ↑ (LIQUIDITY), bilanço küçülür (LEVERAGE) — kira yükü var
  'A09_SALE_LEASEBACK':                    { primary: 'LEVERAGE', secondary: 'LIQUIDITY' },

  // ── Özkaynak / Kâr ────────────────────────────────────────────────────────
  // Nakit sermaye: nakit ↑ + özkaynak ↑ → en güçlü çift etki (LEVERAGE+LIQUIDITY)
  'A10_CASH_EQUITY_INJECTION':             { primary: 'LEVERAGE', secondary: 'LIQUIDITY' },
  // Senetli sermaye: özkaynak ↑ (LEVERAGE), 121 likit alacak ↑ (LIQUIDITY secondary)
  'A10B_PROMISSORY_NOTE_EQUITY_INJECTION': { primary: 'LEVERAGE', secondary: 'LIQUIDITY' },
  // Kâr tut: özkaynak ↑ (LEVERAGE) — nakit yaratmaz, saf kaldıraç iyileşmesi
  'A11_RETAIN_EARNINGS':                   { primary: 'LEVERAGE' },
  // Ortak borcu → sermaye: borç ↓ + özkaynak ↑ (LEVERAGE) — nakit yok
  'A15_DEBT_TO_EQUITY_SWAP':               { primary: 'LEVERAGE' },

  // ── Kârlılık ──────────────────────────────────────────────────────────────
  // Brüt marj ↑ → kârlılık ↑ (PROFITABILITY); tedarikçi iskonto → marj güçlenir
  'A12_GROSS_MARGIN_IMPROVEMENT':          { primary: 'PROFITABILITY' },
  // Gider ↓ → net kâr ↑ (PROFITABILITY) — projeksiyon aksiyonu
  'A13_OPEX_OPTIMIZATION':                 { primary: 'PROFITABILITY' },
  // Faiz gideri ↓ → kârlılık ↑ (PROFITABILITY), borç yükü ↓ (LEVERAGE) — projeksiyon
  'A14_FINANCE_COST_REDUCTION':            { primary: 'PROFITABILITY', secondary: 'LEVERAGE' },

  // ── Hasılat / Büyüme ──────────────────────────────────────────────────────
  // Satış ↑ → kârlılık ↑ (PROFITABILITY), aktif devir hızı ↑ (ACTIVITY)
  'A18_NET_SALES_GROWTH':                  { primary: 'PROFITABILITY', secondary: 'ACTIVITY' },
  // Avans → hasılat: kârlılık ↑ (PROFITABILITY), likit pasif ↓ (LIQUIDITY secondary)
  'A19_ADVANCE_TO_REVENUE':                { primary: 'PROFITABILITY', secondary: 'LIQUIDITY' },
}

/**
 * Verilen aksiyon ID listesinin kapsadığı rasyo gruplarını döndürür.
 * Primary ve secondary her ikisi de sayılır.
 * Profile'da olmayan ID → katkısı sıfır (sessiz fallback — gelecekteki ID'ler için güvenli).
 *
 * @example
 *   getCoveredGroups(['A10_CASH_EQUITY_INJECTION'])
 *   // → Set { 'LEVERAGE', 'LIQUIDITY' }  (size=2)
 *
 *   getCoveredGroups(['A10_CASH_EQUITY_INJECTION', 'A18_NET_SALES_GROWTH'])
 *   // → Set { 'LEVERAGE', 'LIQUIDITY', 'PROFITABILITY', 'ACTIVITY' }  (size=4)
 *
 *   getCoveredGroups(['UNKNOWN_ID'])
 *   // → Set {}  (size=0, sessiz fallback)
 */
export function getCoveredGroups(actionIds: string[]): Set<RatioGroup> {
  const covered = new Set<RatioGroup>()
  for (const id of actionIds) {
    const profile = ACTION_RATIO_GROUP_PROFILE[id]
    if (!profile) continue
    covered.add(profile.primary)
    if (profile.secondary) covered.add(profile.secondary)
  }
  return covered
}
