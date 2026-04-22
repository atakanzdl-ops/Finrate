import type { ActionId } from './contracts'

/**
 * Aksiyon aileleri — minimal impact kontrolünde hangi rasyoların kullanılacağını belirler.
 *
 * WC_COMPOSITION  — Dönen varlık kompozisyonu değiştirir (A04-A07)
 *                   Etki ölçütü: Quick Ratio, Cash Ratio, DSO, CCC
 *
 * DEBT_STRUCTURE  — Kısa/uzun vade borç yapısını değiştirir (A01-A03, A08-A09)
 *                   Etki ölçütü: Current Ratio, Equity Ratio, Interest Coverage
 *
 * EQUITY_PNL      — Özkaynak ve kârlılık aksiyonları (A10-A14)
 *                   Etki ölçütü: Equity Ratio, Interest Coverage, Current Ratio
 */
export type ActionFamily = 'WC_COMPOSITION' | 'DEBT_STRUCTURE' | 'EQUITY_PNL'

const FAMILY_MAP: Record<ActionId, ActionFamily> = {
  // Dönen varlık kompozisyonu
  A04_CASH_PAYDOWN_ST:           'WC_COMPOSITION',
  A05_RECEIVABLE_COLLECTION:     'WC_COMPOSITION',
  A06_INVENTORY_OPTIMIZATION:    'WC_COMPOSITION',
  A07_PREPAID_EXPENSE_RELEASE:   'WC_COMPOSITION',
  // Borç yapısı
  A01_ST_FIN_DEBT_TO_LT:         'DEBT_STRUCTURE',
  A02_TRADE_PAYABLE_TO_LT:       'DEBT_STRUCTURE',
  A03_ADVANCE_TO_LT:             'DEBT_STRUCTURE',
  A08_FIXED_ASSET_DISPOSAL:      'DEBT_STRUCTURE',
  A09_SALE_LEASEBACK:            'DEBT_STRUCTURE',
  // Özkaynak ve kârlılık
  A10_EQUITY_INJECTION:          'EQUITY_PNL',
  A11_EARNINGS_RETENTION:        'EQUITY_PNL',
  A12_GROSS_MARGIN_IMPROVEMENT:  'EQUITY_PNL',
  A13_OPEX_OPTIMIZATION:         'EQUITY_PNL',
  A14_FINANCE_COST_OPTIMIZATION: 'EQUITY_PNL',
}

export function getActionFamily(actionId: ActionId): ActionFamily {
  return FAMILY_MAP[actionId] ?? 'DEBT_STRUCTURE'
}
