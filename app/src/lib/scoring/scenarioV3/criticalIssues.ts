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

export interface CriticalIssue {
  id:                 string
  condition:          (ctx: Pick<FirmContext,
    'sector' | 'netSales' | 'grossProfit' | 'accountBalances'
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
]

/**
 * Firma bağlamına göre mandatori aksiyon ID listesi döner.
 * selectTargetPackage tarafından çağrılır.
 *
 * @param ctx  Minimal firma bağlamı (netSales, grossProfit, accountBalances)
 * @returns    Mandatori aksiyon ID dizisi (boş olabilir)
 */
export function getMandatoryActionsForFirm(
  ctx: Pick<FirmContext, 'sector' | 'netSales' | 'grossProfit' | 'accountBalances'>
): string[] {
  const mandatory = new Set<string>()

  for (const issue of CRITICAL_ISSUES) {
    if (issue.condition(ctx)) {
      issue.mandatoryActionIds.forEach(id => mandatory.add(id))
    }
  }

  return Array.from(mandatory)
}
