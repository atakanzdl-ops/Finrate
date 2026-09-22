/**
 * PORTFOLIO RESOURCE GUARD (R8.4)
 *
 * Alt küme aramasında, birleşik işlem setinin bilançoda
 * negatif bakiye oluşturmasını engeller.
 *
 * Tasarım kararları:
 *   - applyTransactions 'error' politikasıyla çalıştırılır.
 *   - Global ledgerEngine DEFAULT_OPTIONS değişmez ('warn' kalır).
 *   - Sadece targetPackage.ts alt küme aramasında çağrılır.
 *
 * R8.4 — İSRA A18+A19 stok çakışması düzeltmesi.
 */

import { applyTransactions } from './ledgerEngine'
import type { AccountBalance } from './ledgerEngine'
import type { AccountingTransaction } from './contracts'

// ─── Arayüz ───────────────────────────────────────────────────────────────────

export interface ResourceGuardResult {
  /** true: kombinasyon güvenli; false: negatif bakiye oluşur */
  feasible: boolean
  /** İlk hata mesajı (debug / log için) */
  reason?: string
}

// ─── validatePortfolioResources ───────────────────────────────────────────────

/**
 * Verilen transaction setinin mevcut bakiyelerle birlikte
 * negatif bakiye oluşturup oluşturmadığını doğrular.
 *
 * applyTransactions'ı 'error' politikasıyla çalıştırır;
 * DEFAULT_OPTIONS.negativeBalanceWatchlist ile birleştirilir (spread).
 *
 * @param transactions    Kontrol edilecek muhasebe hareketleri
 * @param accountBalances Firma mevcut bakiyeleri (Record<string, number>)
 * @returns { feasible: true }              — kombinasyon güvenli
 * @returns { feasible: false, reason }     — negatif bakiye riski
 */
export function validatePortfolioResources(
  transactions: AccountingTransaction[],
  accountBalances: Record<string, number>
): ResourceGuardResult {
  // Boş transaction seti her zaman geçerlidir
  if (transactions.length === 0) return { feasible: true }

  // Yalnızca gerçek muhasebe hareketi olan transaction'ları kontrol et.
  // Boş legs içerenler (test mock'ları, placeholder'lar) atlanır —
  // ledgerEngine bunları "validation error" olarak reddeder, bu guard
  // negatif bakiye tespiti için tasarlanmıştır, validation hatası için değil.
  const effectiveTransactions = transactions.filter(
    tx => tx.legs && tx.legs.length > 0
  )
  if (effectiveTransactions.length === 0) return { feasible: true }

  // Record<string, number> → AccountBalance[] (applyTransactions API gerektirir)
  const initialBalances: AccountBalance[] = Object.entries(accountBalances)
    .filter(([, amount]) => amount != null && Number.isFinite(amount as number))
    .map(([accountCode, amount]) => ({ accountCode, amount: amount as number }))

  // negativeBalanceWatchlist: applyTransaction içinde DEFAULT_OPTIONS ile birleştirilir
  const result = applyTransactions(effectiveTransactions, initialBalances, {
    negativeBalancePolicy: 'error',
  })

  if (!result.allApplied || result.totalErrors.length > 0) {
    return {
      feasible: false,
      reason: result.totalErrors[0],
    }
  }

  return { feasible: true }
}
