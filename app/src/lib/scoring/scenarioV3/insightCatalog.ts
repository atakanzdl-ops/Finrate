/**
 * INSIGHT CATALOG (Faz 7.3.7)
 *
 * Aksiyon olmayan uyarı kartı üreticileri.
 * ActionTemplateV3'ten bağımsız; engineV3 skoruna dahil değil.
 *
 * Mevcut insight'lar:
 *   - A21_MATURITY_MISMATCH: KV/UV vade uyumsuzluğu
 */

import type { DecisionInsight } from './contracts'

// ─── Sabitler ─────────────────────────────────────────────────────────────────

/** KV toplamının anlamlı sayılacağı alt sınır */
const KV_TOTAL_THRESHOLD = 5_000_000

/** KV/UV oran eşikleri */
const RATIO_LOW_THRESHOLD    = 1.5
const RATIO_MEDIUM_THRESHOLD = 2.0
const RATIO_HIGH_THRESHOLD   = 3.0

/** Her aksiyon için kaynak hesap minimum bakiye */
const ACTION_KV_MIN_SOURCE: Record<string, number> = {
  A01_ST_FIN_DEBT_TO_LT:       1_000_000,   // 300/303/304
  A02_TRADE_PAYABLE_TO_LT:     3_000_000,   // 320/321
  A03_ADVANCE_TO_LT:           2_000_000,   // 340
  A15B_SHAREHOLDER_DEBT_TO_LT: 1_000_000,   // 331
}

// ─── İç yardımcılar ───────────────────────────────────────────────────────────

function getKvTotal(balances: Record<string, number>): number {
  return (
    (balances['300'] ?? 0) +
    (balances['303'] ?? 0) +
    (balances['304'] ?? 0) +
    (balances['320'] ?? 0) +
    (balances['321'] ?? 0) +
    (balances['340'] ?? 0) +
    (balances['331'] ?? 0)
  )
}

function getUvTotal(balances: Record<string, number>): number {
  return (
    (balances['400'] ?? 0) +
    (balances['420'] ?? 0) +
    (balances['421'] ?? 0) +
    (balances['440'] ?? 0) +
    (balances['431'] ?? 0)
  )
}

function determineSeverity(
  ratio: number | null,
  kvTotal: number,
  uvTotal: number,
): 'low' | 'medium' | 'high' {
  // UV sıfır ve KV anlamlıysa → doğrudan high
  if (uvTotal === 0 && kvTotal >= KV_TOTAL_THRESHOLD) return 'high'
  if (ratio === null) return 'low'
  if (ratio >= RATIO_HIGH_THRESHOLD)   return 'high'
  if (ratio >= RATIO_MEDIUM_THRESHOLD) return 'medium'
  return 'low'
}

function buildRecommendedActions(
  balances: Record<string, number>,
): Array<{ actionId: string; actionName: string; sourceBalance: number }> {
  const candidates: Array<{ actionId: string; actionName: string; sourceBalance: number }> = []

  // A01 — KV Finansal Borç → UV
  const a01Balance = (balances['300'] ?? 0) + (balances['303'] ?? 0) + (balances['304'] ?? 0)
  if (a01Balance >= ACTION_KV_MIN_SOURCE.A01_ST_FIN_DEBT_TO_LT) {
    candidates.push({
      actionId:      'A01_ST_FIN_DEBT_TO_LT',
      actionName:    'KV Finansal Borç → UV',
      sourceBalance: a01Balance,
    })
  }

  // A02 — KV Ticari Borç → UV
  const a02Balance = (balances['320'] ?? 0) + (balances['321'] ?? 0)
  if (a02Balance >= ACTION_KV_MIN_SOURCE.A02_TRADE_PAYABLE_TO_LT) {
    candidates.push({
      actionId:      'A02_TRADE_PAYABLE_TO_LT',
      actionName:    'Ticari Borç → UV',
      sourceBalance: a02Balance,
    })
  }

  // A03 — KV Alınan Avans → UV
  const a03Balance = balances['340'] ?? 0
  if (a03Balance >= ACTION_KV_MIN_SOURCE.A03_ADVANCE_TO_LT) {
    candidates.push({
      actionId:      'A03_ADVANCE_TO_LT',
      actionName:    'Alınan Avans → UV',
      sourceBalance: a03Balance,
    })
  }

  // A15B — Ortak Borcu UV
  const a15bBalance = balances['331'] ?? 0
  if (a15bBalance >= ACTION_KV_MIN_SOURCE.A15B_SHAREHOLDER_DEBT_TO_LT) {
    candidates.push({
      actionId:      'A15B_SHAREHOLDER_DEBT_TO_LT',
      actionName:    'Ortak Borcu → UV',
      sourceBalance: a15bBalance,
    })
  }

  // Bakiye büyükten küçüğe
  return candidates.sort((a, b) => b.sourceBalance - a.sourceBalance)
}

// ─── Ana üretici ──────────────────────────────────────────────────────────────

/**
 * Vade uyumsuzluğu insight'ını üretir.
 *
 * Tetiklenme koşulları:
 *   1. kvTotal >= KV_TOTAL_THRESHOLD (5 Mn)
 *   2. uvTotal = 0  VEYA  kvTotal/uvTotal >= 1.5
 *   3. En az bir önerilebilir aksiyon mevcut
 *
 * @param accountBalances - FirmContext.accountBalances
 */
export function buildMaturityMismatchInsight(
  accountBalances: Record<string, number>,
): DecisionInsight | null {
  const kvTotal = getKvTotal(accountBalances)
  const uvTotal = getUvTotal(accountBalances)

  // KV anlamlı tutarda değilse tetikleme yok
  if (kvTotal < KV_TOTAL_THRESHOLD) return null

  // Oran hesabı
  let ratio: number | null = null
  if (uvTotal > 0) {
    ratio = kvTotal / uvTotal
    if (ratio < RATIO_LOW_THRESHOLD) return null
  }
  // uvTotal === 0 → null kalır, high severity verilir

  const severity           = determineSeverity(ratio, kvTotal, uvTotal)
  const recommendedActions = buildRecommendedActions(accountBalances)

  // Hiç önerilebilir aksiyon yoksa insight üretme
  if (recommendedActions.length === 0) return null

  const messages: Record<'low' | 'medium' | 'high', string> = {
    low:    'Kısa vadeli yükümlülükler uzun vadeli kaynaklara göre yüksek seyrediyor.',
    medium: 'Vade uyumsuzluğu belirgin: kısa vadeli yükümlülükler uzun vadeli kaynakları aşıyor.',
    high:   'Vade uyumsuzluğu kritik: kısa vadeli yükümlülükler uzun vadeli kaynaklara göre çok ağır basıyor.',
  }

  return {
    insightId: 'A21_MATURITY_MISMATCH',
    title:     'Vade Uyumsuzluğu',
    message:   messages[severity],
    severity,
    ratio,
    kvTotal,
    uvTotal,
    recommendedActions,
  }
}
