/**
 * R7B — criticalIssues: Mandatori Aksiyon Katmanı
 *
 * Belirli finansal eşikleri aşan firmalar için bazı aksiyonlar
 * paket seçiminden bağımsız olarak zorunlu tutulur.
 *
 * Entegrasyon: targetPackage.selectTargetPackage (engine değil — UI katmanı)
 * Gerekçe: selectTargetPackage gap'e göre subset seçer; mandatori aksiyonlar
 *          bu subset'e her zaman eklenmeli (küçük gap'te dışarıda kalmasın).
 *
 * Genişletme: CRITICAL_ISSUES dizisine yeni koşul ekle — entegrasyon otomatik.
 */

import type { FirmContext } from './contracts'
import { getBenchmarkValue } from './ratioHelpers'

export interface CriticalIssue {
  id:                 string
  /** R10: severity — mandatori kuralın kritiklik derecesi */
  severity?:          'critical' | 'high' | 'medium'
  condition:          (ctx: Pick<FirmContext,
    'sector' | 'netSales' | 'grossProfit' | 'accountBalances' | 'ratios' | 'financialData'
  >) => boolean
  mandatoryActionIds: string[]
  reason:             string
}

export const CRITICAL_ISSUES: CriticalIssue[] = [
  {
    id: 'FINANCIAL_EXPENSE_CRITICAL',
    condition: (ctx) => {
      const netSales = ctx.netSales ?? 0
      if (netSales <= 0) return false

      // Gerçek 780 varsa doğrudan kullan; yoksa KOBİ fallback (300+400 × %25)
      const fin780   = ctx.accountBalances?.['780'] ?? 0
      const totalDebt =
        (ctx.accountBalances?.['300'] ?? 0) +
        (ctx.accountBalances?.['400'] ?? 0)
      const finExpense = fin780 > 0 ? fin780 : totalDebt * 0.25

      const ratio = finExpense / netSales
      return ratio > 0.20  // %20 üstü kritik (ORGANIKA: ~%32)
    },
    mandatoryActionIds: ['A14_FINANCE_COST_REDUCTION'],
    reason: 'Finansman gideri kritik seviyede (satışların %20\'sini aşıyor) — A14 zorunlu',
  },
  {
    id: 'GROSS_LOSS',
    condition: (ctx) => {
      const netSales    = ctx.netSales    ?? 0
      const grossProfit = ctx.grossProfit ?? 0
      if (netSales <= 0) return false
      return grossProfit < 0  // Brüt zarar — yapısal müdahale şart
    },
    mandatoryActionIds: ['A20_GROSS_MARGIN_REFORM'],
    reason: 'Brüt zarar tespit edildi — A20 yapısal düzeltme zorunlu',
  },

  // ─── R10: 6 Rasyo Bazlı Mandatori Kural ─────────────────────────────────────

  // Kural 1 — QUICK_RATIO_CRITICAL
  // Asit-test oranı < 0.5: stok hariç likit varlıklar KV borçları karşılayamıyor.
  {
    id: 'QUICK_RATIO_CRITICAL',
    severity: 'high',
    condition: (ctx) => {
      const qr = ctx.ratios?.quickRatio
      return qr != null && qr < 0.5
    },
    mandatoryActionIds: ['A05_RECEIVABLE_COLLECTION', 'A06_INVENTORY_MONETIZATION'],
    reason: 'Asit-test oranı kritik seviyenin altında — likit varlıklar yetersiz.',
  },

  // Kural 2 — INVENTORY_TURNOVER_CRITICAL
  // Stok devir süresi sektör ortalamasının 2 katını aşıyor.
  // SectorBenchmark: 'inventoryDays'; RatioResult: 'inventoryTurnoverDays' — farklı isimler.
  {
    id: 'INVENTORY_TURNOVER_CRITICAL',
    severity: 'high',
    condition: (ctx) => {
      const itd = ctx.ratios?.inventoryTurnoverDays
      if (itd == null) return false
      const bm = getBenchmarkValue(ctx.sector, 'inventoryDays')
      if (!bm || !bm.value || bm.value === 0) return false
      return itd > bm.value * 2.0
    },
    mandatoryActionIds: ['A06_INVENTORY_MONETIZATION'],
    reason: 'Stok devir süresi sektör ortalamasının 2 katını aşıyor.',
  },

  // Kural 3 — ADVANCES_PRESSURE
  // 340 Alınan Avanslar / KV Borçlar > %40: proje teslim baskısı kritik.
  // KV Borçlar: accountBalances 3xx toplamından hesaplanır (financialData'ya bağımlılık yok).
  // buildAdvancesPressureInsight (insightCatalog.ts) ile aynı mantık — tutarlı.
  {
    id: 'ADVANCES_PRESSURE',
    severity: 'high',
    condition: (ctx) => {
      const balances = ctx.accountBalances ?? {}
      const advances = balances['340'] ?? 0
      // KV borç toplamı — yaygın 3xx mizan hesapları
      const cl = (
        (balances['300'] ?? 0) + (balances['301'] ?? 0) +
        (balances['303'] ?? 0) + (balances['309'] ?? 0) +
        (balances['320'] ?? 0) + (balances['321'] ?? 0) +
        (balances['331'] ?? 0) + (balances['340'] ?? 0) +
        (balances['350'] ?? 0) + (balances['360'] ?? 0) +
        (balances['361'] ?? 0) + (balances['380'] ?? 0) +
        (balances['381'] ?? 0)
      )
      if (cl === 0) return false
      return advances / cl > 0.40
    },
    mandatoryActionIds: ['A19_ADVANCE_TO_REVENUE'],
    reason: 'Alınan avanslar kısa vadeli borçların %40\'ını aşıyor.',
  },

  // Kural 4 — LIQUIDITY_CRITICAL [KRİTİK]
  // Cari oran < 1.0: dönen varlıklar KV yükümlülükleri karşılayamıyor.
  {
    id: 'LIQUIDITY_CRITICAL',
    severity: 'critical',
    condition: (ctx) => {
      const cr = ctx.ratios?.currentRatio
      return cr != null && cr < 1.0
    },
    mandatoryActionIds: ['A05_RECEIVABLE_COLLECTION', 'A01_ST_FIN_DEBT_TO_LT'],
    reason: 'Cari oran 1.0\'ın altında — kısa vadeli yükümlülükler dönen varlıkları aşıyor.',
  },

  // Kural 5 — INTEREST_COVERAGE_CRITICAL
  // Faiz karşılama oranı < 1.5: finansman giderleri operasyonel kazancı baskılıyor.
  {
    id: 'INTEREST_COVERAGE_CRITICAL',
    severity: 'high',
    condition: (ctx) => {
      const ic = ctx.ratios?.interestCoverage
      return ic != null && ic < 1.5
    },
    mandatoryActionIds: ['A14_FINANCE_COST_REDUCTION', 'A01_ST_FIN_DEBT_TO_LT'],
    reason: 'Faiz karşılama oranı yetersiz — finansman giderleri operasyonel kazancı baskılıyor.',
  },

  // Kural 6 — LEVERAGE_CRITICAL
  // Borç/Özkaynak > 3.0 VE ortak borcu var: sermaye yapısı kritik.
  {
    id: 'LEVERAGE_CRITICAL',
    severity: 'medium',
    condition: (ctx) => {
      const dte = ctx.ratios?.debtToEquity
      const ortaklarBorcu = ctx.accountBalances?.['331'] ?? 0
      return dte != null && dte > 3.0 && ortaklarBorcu > 0
    },
    mandatoryActionIds: ['A15_DEBT_TO_EQUITY_SWAP', 'A15B_SHAREHOLDER_DEBT_TO_LT'],
    reason: 'Borç/Özkaynak oranı aşırı yüksek — sermaye yapısı güçlendirme gerekiyor.',
  },
]

/**
 * Firma bağlamına göre mandatori aksiyon ID listesi döner.
 * selectTargetPackage tarafından çağrılır.
 *
 * @param ctx  Minimal firma bağlamı (netSales, grossProfit, accountBalances)
 * @returns    Mandatori aksiyon ID dizisi (boş olabilir)
 */
export function getMandatoryActionsForFirm(
  ctx: Pick<FirmContext, 'sector' | 'netSales' | 'grossProfit' | 'accountBalances' | 'ratios' | 'financialData'>
): string[] {
  const mandatory = new Set<string>()

  for (const issue of CRITICAL_ISSUES) {
    if (issue.condition(ctx)) {
      issue.mandatoryActionIds.forEach(id => mandatory.add(id))
    }
  }

  return Array.from(mandatory)
}
