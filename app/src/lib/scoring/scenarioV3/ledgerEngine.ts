/**
 * SCENARIO ENGINE V3 — Layer 1: Ledger Engine
 *
 * Çok ayaklı muhasebe hareketlerini atomic olarak uygular.
 * Nihai hakem: CHART_OF_ACCOUNTS içindeki Account.side değeri.
 *
 * Yön Mantığı (TDHP):
 *   ASSET    — DEBIT artar,  CREDIT azalır
 *   EXPENSE  — DEBIT artar,  CREDIT azalır
 *   LIABILITY— DEBIT azalır, CREDIT artar
 *   EQUITY   — DEBIT azalır, CREDIT artar
 *   INCOME   — DEBIT azalır, CREDIT artar
 *   Contra hesap (contra=true): yön tamamen ters döner
 */

import type { AccountingTransaction } from './contracts'
import { CHART_OF_ACCOUNTS } from '../chartOfAccounts'

// ─── Options ──────────────────────────────────────────────────────────────────

export interface LedgerOptions {
  /** Bilinmeyen hesap kodu görürse hata fırlat (default: false) */
  strictMode?: boolean
  /** Negative balance oluşursa ne yapılsın (default: 'warn') */
  negativeBalancePolicy?: 'warn' | 'error' | 'ignore'
  /** Negative balance izlenecek hesap prefix'leri */
  negativeBalanceWatchlist?: string[]
}

const DEFAULT_OPTIONS: Required<LedgerOptions> = {
  strictMode: false,
  negativeBalancePolicy: 'warn',
  negativeBalanceWatchlist: [
    '100', '101', '102', '108',            // Nakit / Banka
    '120', '121',                           // Ticari alacak
    '150', '151', '152', '153', '157',      // Stoklar
    '180', '181',                           // Peşin giderler
    '252', '253', '254',                    // Maddi duran varlıklar
  ],
}

// ─── Account Direction ────────────────────────────────────────────────────────

export type AccountSide = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'

export interface AccountDirectionRule {
  side: AccountSide
  isContra: boolean
  debitEffect: 'increase' | 'decrease'
  creditEffect: 'increase' | 'decrease'
  /** Chart of Accounts'ta tanımlı mı? false ise strict modda hata fırlatılır */
  isKnown: boolean
}

/**
 * Hesap kodundan debit/credit yön kuralını çıkarır.
 * Bilinmeyen hesaplar ASSET gibi davranır (isKnown=false ile işaretlenir).
 */
export function getAccountDirection(accountCode: string): AccountDirectionRule {
  const meta = CHART_OF_ACCOUNTS[accountCode]

  if (!meta) {
    // Bilinmeyen hesap — varsayılan ASSET kuralı, ama isKnown=false
    return {
      side: 'ASSET',
      isContra: false,
      debitEffect: 'increase',
      creditEffect: 'decrease',
      isKnown: false,
    }
  }

  const side = meta.side as AccountSide
  const isContra = meta.contra === true

  if (!isContra) {
    // Normal hesap
    if (side === 'ASSET' || side === 'EXPENSE') {
      return { side, isContra, debitEffect: 'increase', creditEffect: 'decrease', isKnown: true }
    }
    // LIABILITY, EQUITY, INCOME
    return { side, isContra, debitEffect: 'decrease', creditEffect: 'increase', isKnown: true }
  }

  // Contra hesap — yön tamamen ters
  if (side === 'ASSET' || side === 'EXPENSE') {
    return { side, isContra, debitEffect: 'decrease', creditEffect: 'increase', isKnown: true }
  }
  return { side, isContra, debitEffect: 'increase', creditEffect: 'decrease', isKnown: true }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface TransactionValidationResult {
  valid: boolean
  debitTotal: number
  creditTotal: number
  /** |debitTotal - creditTotal| */
  difference: number
  errors: string[]
  warnings: string[]
}

/** Kayıt dengesi ve hesap geçerliliği kontrolü. Atomic uygulama öncesinde çağrılır. */
export function validateTransaction(
  transaction: AccountingTransaction,
  options: LedgerOptions = DEFAULT_OPTIONS
): TransactionValidationResult {
  const opts: Required<LedgerOptions> = { ...DEFAULT_OPTIONS, ...options }
  const errors: string[] = []
  const warnings: string[] = []
  let debitTotal = 0
  let creditTotal = 0

  if (!transaction.legs || transaction.legs.length === 0) {
    errors.push(`[${transaction.transactionId}] Transaction legs boş`)
    return { valid: false, debitTotal: 0, creditTotal: 0, difference: 0, errors, warnings }
  }

  for (const leg of transaction.legs) {
    if (!leg.accountCode) {
      errors.push(`[${transaction.transactionId}] Leg accountCode eksik`)
      continue
    }
    if (typeof leg.amount !== 'number' || leg.amount <= 0) {
      errors.push(
        `[${transaction.transactionId}] Leg ${leg.accountCode}: amount pozitif sayı olmalı (${leg.amount})`
      )
      continue
    }

    // Bilinmeyen hesap kontrolü
    const direction = getAccountDirection(leg.accountCode)
    if (!direction.isKnown) {
      const msg = `[${transaction.transactionId}] Bilinmeyen hesap: ${leg.accountCode} — ASSET gibi işlenecek`
      if (opts.strictMode) {
        errors.push(msg)
      } else {
        warnings.push(msg)
      }
    }

    if (leg.side === 'DEBIT') {
      debitTotal += leg.amount
    } else if (leg.side === 'CREDIT') {
      creditTotal += leg.amount
    } else {
      errors.push(
        `[${transaction.transactionId}] Leg ${leg.accountCode}: side DEBIT veya CREDIT olmalı`
      )
    }
  }

  const difference = Math.abs(debitTotal - creditTotal)
  const TOLERANCE = 0.01 // 1 kuruş

  if (difference > TOLERANCE) {
    errors.push(
      `[${transaction.transactionId}] Transaction dengesiz: ` +
      `DEBIT=${debitTotal.toFixed(2)} vs CREDIT=${creditTotal.toFixed(2)}, ` +
      `fark=${difference.toFixed(2)} TL`
    )
  }

  return {
    valid: errors.length === 0,
    debitTotal,
    creditTotal,
    difference,
    errors,
    warnings,
  }
}

// ─── Negative Balance Check ───────────────────────────────────────────────────

function checkNegativeBalance(
  accountCode: string,
  balanceAfter: number,
  opts: Required<LedgerOptions>
): { ok: boolean; message?: string } {
  if (balanceAfter >= 0) return { ok: true }
  if (opts.negativeBalancePolicy === 'ignore') return { ok: true }

  const inWatchlist = opts.negativeBalanceWatchlist.some(prefix =>
    accountCode.startsWith(prefix)
  )
  if (!inWatchlist) return { ok: true }

  const msg =
    `Hesap ${accountCode} negatif bakiyeye düştü: ${balanceAfter.toFixed(2)} TL`
  return { ok: false, message: msg }
}

// ─── Balance Types ────────────────────────────────────────────────────────────

export interface AccountBalance {
  accountCode: string
  amount: number
}

export interface LegMovement {
  accountCode: string
  accountName?: string
  side: 'DEBIT' | 'CREDIT'
  amount: number
  effect: 'increase' | 'decrease'
  balanceBefore: number
  balanceAfter: number
}

export interface TransactionResult {
  transactionId: string
  description: string
  applied: boolean
  validation: TransactionValidationResult
  movements: LegMovement[]
  errors: string[]
  warnings: string[]
}

// ─── Atomic Transaction Apply ─────────────────────────────────────────────────

/**
 * Tek bir muhasebe işlemini atomic olarak uygular.
 *
 * Strateji:
 *   1. validate → hata varsa applied=false döner, map dokunulmaz
 *   2. temp map üzerinde hesapla
 *   3. negative balance / strict check → hata varsa rollback (applied=false)
 *   4. Temiz geçerse temp map → gerçek map'e aktar
 */
export function applyTransaction(
  transaction: AccountingTransaction,
  currentBalances: Map<string, number>,
  options: LedgerOptions = DEFAULT_OPTIONS
): TransactionResult {
  const opts: Required<LedgerOptions> = { ...DEFAULT_OPTIONS, ...options }
  const validation = validateTransaction(transaction, opts)
  const errors: string[] = [...validation.errors]
  const warnings: string[] = [...validation.warnings]

  if (!validation.valid) {
    return {
      transactionId: transaction.transactionId,
      description:   transaction.description,
      applied:        false,
      validation,
      movements:      [],
      errors,
      warnings,
    }
  }

  // ── ATOMIC — önce temp map'te simüle et ────────────────────────────────────
  const tempBalances = new Map(currentBalances)
  const tempMovements: LegMovement[] = []

  for (const leg of transaction.legs) {
    const balanceBefore = tempBalances.get(leg.accountCode) ?? 0
    const direction = getAccountDirection(leg.accountCode)
    const effect = leg.side === 'DEBIT' ? direction.debitEffect : direction.creditEffect

    const balanceAfter =
      effect === 'increase'
        ? balanceBefore + leg.amount
        : balanceBefore - leg.amount

    // Negative balance kontrolü
    const negCheck = checkNegativeBalance(leg.accountCode, balanceAfter, opts)
    if (!negCheck.ok && negCheck.message) {
      if (opts.negativeBalancePolicy === 'error') {
        errors.push(negCheck.message)
      } else {
        warnings.push(negCheck.message)
      }
    }

    tempBalances.set(leg.accountCode, balanceAfter)
    tempMovements.push({
      accountCode: leg.accountCode,
      accountName: leg.accountName ?? CHART_OF_ACCOUNTS[leg.accountCode]?.name,
      side:         leg.side,
      amount:       leg.amount,
      effect,
      balanceBefore,
      balanceAfter,
    })
  }

  // Eğer negative balance 'error' politikası yeni hata ürettiyse → rollback
  if (errors.length > validation.errors.length) {
    return {
      transactionId: transaction.transactionId,
      description:   transaction.description,
      applied:        false,
      validation,
      movements:      [],
      errors,
      warnings,
    }
  }

  // ── Başarılı — temp map'i gerçek map'e commit ──────────────────────────────
  for (const [code, amount] of tempBalances.entries()) {
    currentBalances.set(code, amount)
  }

  return {
    transactionId: transaction.transactionId,
    description:   transaction.description,
    applied:        true,
    validation,
    movements:      tempMovements,
    errors,
    warnings,
  }
}

// ─── Multi-Transaction Apply ──────────────────────────────────────────────────

export interface LedgerResult {
  initialBalances:  AccountBalance[]
  finalBalances:    AccountBalance[]
  transactions:     TransactionResult[]
  /** Tüm transaction'lar başarıyla uygulandı mı? */
  allApplied:       boolean
  totalErrors:      string[]
  totalWarnings:    string[]
}

/**
 * Bir aksiyon setini sırayla uygular.
 * Her transaction atomic: başarısız olanlar map'i kirletmez.
 * Başarısız transaction sonraki transaction'ları engellemez.
 */
export function applyTransactions(
  transactions: AccountingTransaction[],
  initialBalances: AccountBalance[],
  options: LedgerOptions = DEFAULT_OPTIONS
): LedgerResult {
  // Başlangıç bakiyelerini map'e yükle
  const balanceMap = new Map<string, number>()
  for (const b of initialBalances) {
    balanceMap.set(b.accountCode, b.amount)
  }

  // Snapshot al (initialBalances değişmemeli)
  const initialSnapshot: AccountBalance[] = initialBalances.map(b => ({ ...b }))

  const results: TransactionResult[] = []
  const totalErrors: string[] = []
  const totalWarnings: string[] = []

  for (const tx of transactions) {
    const result = applyTransaction(tx, balanceMap, options)
    results.push(result)

    if (!result.applied) {
      totalErrors.push(...result.errors.map(e => `[${tx.transactionId}] ${e}`))
    }
    totalWarnings.push(...result.warnings.map(w => `[${tx.transactionId}] ${w}`))
  }

  // Son bakiye snapshot'ı
  const finalBalances: AccountBalance[] = Array.from(balanceMap.entries())
    .map(([accountCode, amount]) => ({ accountCode, amount }))

  return {
    initialBalances: initialSnapshot,
    finalBalances,
    transactions:    results,
    allApplied:      results.every(r => r.applied),
    totalErrors,
    totalWarnings,
  }
}

// ─── Balance Change Summary ───────────────────────────────────────────────────

export interface BalanceChange {
  accountCode:   string
  accountName?:  string
  balanceBefore: number
  balanceAfter:  number
  delta:         number
  /** (delta / |balanceBefore|) × 100 — balanceBefore=0 ise 0 */
  deltaPct:      number
}

/**
 * LedgerResult'tan anlamlı bakiye değişimlerini özet olarak çıkarır.
 * Değişim büyüklüğüne göre azalan sıraya dizilir.
 * 1 kuruştan küçük değişimler göz ardı edilir.
 */
export function summarizeBalanceChanges(result: LedgerResult): BalanceChange[] {
  const finalMap   = new Map(result.finalBalances.map(b => [b.accountCode, b.amount]))
  const initialMap = new Map(result.initialBalances.map(b => [b.accountCode, b.amount]))

  const allCodes = new Set([...initialMap.keys(), ...finalMap.keys()])
  const changes: BalanceChange[] = []

  for (const code of allCodes) {
    const before = initialMap.get(code) ?? 0
    const after  = finalMap.get(code)   ?? 0
    const delta  = after - before

    if (Math.abs(delta) < 0.01) continue  // 1 kuruş eşiği

    const meta     = CHART_OF_ACCOUNTS[code]
    const deltaPct = before !== 0 ? (delta / Math.abs(before)) * 100 : 0

    changes.push({
      accountCode:  code,
      accountName:  meta?.name,
      balanceBefore: before,
      balanceAfter:  after,
      delta,
      deltaPct,
    })
  }

  // En büyük mutlak değişim önce
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return changes
}

// ─── Convenience: AccountBalance[] ↔ Map<string, number> ─────────────────────

/** AccountBalance[] → Map dönüşümü (engine iç kullanımı) */
export function balancesToMap(balances: AccountBalance[]): Map<string, number> {
  return new Map(balances.map(b => [b.accountCode, b.amount]))
}

/** Map → AccountBalance[] dönüşümü (engine iç kullanımı) */
export function mapToBalances(map: Map<string, number>): AccountBalance[] {
  return Array.from(map.entries()).map(([accountCode, amount]) => ({ accountCode, amount }))
}
