/**
 * Finrate — Hesap Kodu Bazlı Simülasyon Motoru
 *
 * AccountBalanceSheet : Map<hesap kodu, bakiye> temsili
 * applyAccountMutation: TDHP hesap kodu delta'larını uygular,
 *   calculateRatiosFromAccounts() ile rasyo ve skor üretir.
 *
 * Kullanım:
 *   const sheet = accountsToBalanceSheet(prismaAccounts)
 *   const result = applyAccountMutation(sheet, mutation, sector)
 */

import { calculateRatiosFromAccounts, getAccountTotals } from './ratios'
import { calculateScore, scoreToRating, type ScoringResult } from './score'
import type { RatioResult } from './ratios'

// ─── TİPLER ──────────────────────────────────────────────────────────────────

/** Hesap kodu → bakiye haritası */
export interface AccountBalanceSheet {
  accounts: Map<string, number>
}

/** Hesap kodu bazlı bilanço mutasyonu (DELTA değerleri) */
export interface AccountMutation {
  actionId:   string
  operations: Array<{ code: string; delta: number }>
}

/** applyAccountMutation dönüş değeri */
export interface AccountMutationResult {
  before:       AccountBalanceSheet
  after:        AccountBalanceSheet
  /** totalAssets − (totalLiabilities + totalEquity) ≈ 0 olmalı */
  balanceCheck: number
  ratiosBefore: RatioResult
  ratiosAfter:  RatioResult
  scoreBefore:  ScoringResult
  scoreAfter:   ScoringResult
  scoreDelta:   number
  gradeBefore:  string
  gradeAfter:   string
}

// ─── DÖNÜŞÜM YARDIMCILARI ────────────────────────────────────────────────────

/**
 * Prisma FinancialAccount dizisini AccountBalanceSheet'e dönüştürür.
 * Aynı hesap koduna birden fazla kayıt varsa toplanır.
 */
export function accountsToBalanceSheet(
  accounts: { accountCode: string; amount: number }[],
): AccountBalanceSheet {
  const map = new Map<string, number>()
  for (const a of accounts) {
    map.set(a.accountCode, (map.get(a.accountCode) ?? 0) + Number(a.amount))
  }
  return { accounts: map }
}

/**
 * AccountBalanceSheet'i düz dizi formatına çevirir.
 * Sıfır bakiyeli hesaplar filtrelenir.
 */
export function balanceSheetToAccounts(
  sheet: AccountBalanceSheet,
): { accountCode: string; amount: number }[] {
  return Array.from(sheet.accounts.entries())
    .filter(([, amount]) => amount !== 0)
    .map(([accountCode, amount]) => ({ accountCode, amount }))
}

// ─── MUTASYON UYGULAICI ───────────────────────────────────────────────────────

/**
 * mutation.operations içindeki her delta'yı sheet üzerine uygular.
 * Sonra calculateRatiosFromAccounts + calculateScore ile rasyo/skor hesaplar.
 *
 * @param sheet    Mevcut hesap bakiyeleri
 * @param mutation TDHP delta operasyonları (artış = pozitif, azalış = negatif)
 * @param sector   Sektör adı (skor hesabı için)
 */
export function applyAccountMutation(
  sheet:    AccountBalanceSheet,
  mutation: AccountMutation,
  sector:   string,
): AccountMutationResult {
  const before: AccountBalanceSheet = { accounts: new Map(sheet.accounts) }
  const after:  AccountBalanceSheet = { accounts: new Map(sheet.accounts) }

  // Her operasyonu uygula
  for (const op of mutation.operations) {
    const current = after.accounts.get(op.code) ?? 0
    const next    = current + op.delta
    if (next === 0) {
      after.accounts.delete(op.code)
    } else {
      after.accounts.set(op.code, next)
    }
  }

  const beforeAccounts = balanceSheetToAccounts(before)
  const afterAccounts  = balanceSheetToAccounts(after)

  // Rasyo hesabı
  const ratiosBefore = calculateRatiosFromAccounts(beforeAccounts)
  const ratiosAfter  = calculateRatiosFromAccounts(afterAccounts)

  // Skor hesabı
  const scoreBefore = calculateScore(ratiosBefore, sector)
  const scoreAfter  = calculateScore(ratiosAfter,  sector)

  // Bilanço dengesi: Aktif − Pasif − Özkaynak ≈ 0
  const totals      = getAccountTotals(afterAccounts)
  const balanceCheck = totals.totalAssets - totals.totalLiabilities - totals.totalEquity

  return {
    before,
    after,
    balanceCheck:  Math.round(balanceCheck * 100) / 100,
    ratiosBefore,
    ratiosAfter,
    scoreBefore,
    scoreAfter,
    scoreDelta:    Math.round((scoreAfter.finalScore - scoreBefore.finalScore) * 100) / 100,
    gradeBefore:   scoreToRating(scoreBefore.finalScore),
    gradeAfter:    scoreToRating(scoreAfter.finalScore),
  }
}
