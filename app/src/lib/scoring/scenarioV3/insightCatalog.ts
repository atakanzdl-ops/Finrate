/**
 * INSIGHT CATALOG (Faz 7.3.7 + 7.3.7-FIX)
 *
 * Aksiyon olmayan uyarı kartı üreticileri.
 * ActionTemplateV3'ten bağımsız; engineV3 skoruna dahil değil.
 *
 * Mevcut insight'lar:
 *   - A21_MATURITY_MISMATCH: KV/UV vade uyumsuzluğu
 *
 * Severity (Faz 7.3.7-FIX): Cari oran sapması bazlı (sektör verisi varsa)
 *   sapma < 0.10   → insight üretme
 *   sapma 0.10-0.30 → low
 *   sapma 0.30-0.50 → medium
 *   sapma >= 0.50   → high
 * Fallback: sektör verisi yoksa eski KV/UV oran mantığı korunur.
 */

import type { DecisionInsight } from './contracts'
import { getBenchmarkValue } from './ratioHelpers'
import type { SectorBenchmark } from '../benchmarks'

// ─── Sabitler ─────────────────────────────────────────────────────────────────

/** KV toplamının anlamlı sayılacağı alt sınır */
const KV_TOTAL_THRESHOLD = 5_000_000

/** Cari oran sapması eşikleri (Faz 7.3.7-FIX) */
const SAPMA_LOW    = 0.10
const SAPMA_MEDIUM = 0.30
const SAPMA_HIGH   = 0.50

/** KV/UV oran eşikleri (fallback — sektör verisi yoksa) */
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

// ─── KV/UV ve cari oran yardımcıları ─────────────────────────────────────────

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

// ─── Severity belirleyiciler ──────────────────────────────────────────────────

/** Cari oran sapması bazlı severity (yeni mantık) */
function determineSeverityBySapma(sapma: number): 'low' | 'medium' | 'high' {
  if (sapma >= SAPMA_HIGH)   return 'high'
  if (sapma >= SAPMA_MEDIUM) return 'medium'
  return 'low'
}

/** KV/UV oran bazlı severity (fallback — sektör verisi yoksa) */
function determineSeverityByRatio(
  ratio: number | null,
  kvTotal: number,
  uvTotal: number,
): 'low' | 'medium' | 'high' {
  if (uvTotal === 0 && kvTotal >= KV_TOTAL_THRESHOLD) return 'high'
  if (ratio === null) return 'low'
  if (ratio >= RATIO_HIGH_THRESHOLD)   return 'high'
  if (ratio >= RATIO_MEDIUM_THRESHOLD) return 'medium'
  return 'low'
}

// ─── recommendedActions ───────────────────────────────────────────────────────

function buildRecommendedActions(
  balances: Record<string, number>,
): Array<{ actionId: string; actionName: string; sourceBalance: number }> {
  const candidates: Array<{ actionId: string; actionName: string; sourceBalance: number }> = []

  const a01Balance = (balances['300'] ?? 0) + (balances['303'] ?? 0) + (balances['304'] ?? 0)
  if (a01Balance >= ACTION_KV_MIN_SOURCE.A01_ST_FIN_DEBT_TO_LT) {
    candidates.push({ actionId: 'A01_ST_FIN_DEBT_TO_LT', actionName: 'KV Finansal Borç → UV', sourceBalance: a01Balance })
  }

  const a02Balance = (balances['320'] ?? 0) + (balances['321'] ?? 0)
  if (a02Balance >= ACTION_KV_MIN_SOURCE.A02_TRADE_PAYABLE_TO_LT) {
    candidates.push({ actionId: 'A02_TRADE_PAYABLE_TO_LT', actionName: 'Ticari Borç → UV', sourceBalance: a02Balance })
  }

  const a03Balance = balances['340'] ?? 0
  if (a03Balance >= ACTION_KV_MIN_SOURCE.A03_ADVANCE_TO_LT) {
    candidates.push({ actionId: 'A03_ADVANCE_TO_LT', actionName: 'Alınan Avans → UV', sourceBalance: a03Balance })
  }

  const a15bBalance = balances['331'] ?? 0
  if (a15bBalance >= ACTION_KV_MIN_SOURCE.A15B_SHAREHOLDER_DEBT_TO_LT) {
    candidates.push({ actionId: 'A15B_SHAREHOLDER_DEBT_TO_LT', actionName: 'Ortak Borcu → UV', sourceBalance: a15bBalance })
  }

  return candidates.sort((a, b) => b.sourceBalance - a.sourceBalance)
}

// ─── Ana üretici ──────────────────────────────────────────────────────────────

/**
 * Vade uyumsuzluğu insight'ını üretir.
 *
 * Severity (Faz 7.3.7-FIX2):
 *   Sektör benchmark mevcutsa VE ratios.currentRatio sağlandıysa → sapma bazlı
 *   Sektör benchmark yoksa veya ratios.currentRatio null ise → KV/UV oran fallback
 *
 * @param accountBalances - FirmContext.accountBalances
 * @param sector          - SectorCode (opsiyonel; yoksa fallback)
 * @param ratios          - calculateRatiosFromAccounts çıktısı (opsiyonel; yoksa fallback)
 */
export function buildMaturityMismatchInsight(
  accountBalances: Record<string, number>,
  sector?: string,
  ratios?: { currentRatio?: number | null },
): DecisionInsight | null {
  const balances = accountBalances ?? {}

  // KV anlamlı tutarda değilse tetikleme yok
  const kvTotal = getKvTotal(balances)
  const uvTotal = getUvTotal(balances)
  if (kvTotal < KV_TOTAL_THRESHOLD) return null

  let severity: 'low' | 'medium' | 'high'
  let firmCurrentRatio: number | null = null
  let sectorCurrentRatio: number | null = null
  let sapma: number | null = null
  let usedCurrentRatioLogic = false

  // ── Yeni mantık: cari oran sapması (sektör + ratios.currentRatio varsa) ───
  if (sector) {
    const bm = getBenchmarkValue(sector, 'currentRatio' as keyof SectorBenchmark)
    if (bm) {
      sectorCurrentRatio = bm.value
      const cr = ratios?.currentRatio
      if (cr != null) {
        firmCurrentRatio = cr
        sapma = sectorCurrentRatio - firmCurrentRatio

        // Sapma < 0.10 → insight üretme
        if (sapma < SAPMA_LOW) return null

        severity = determineSeverityBySapma(sapma)
        usedCurrentRatioLogic = true
      }
    }
  }

  // ── Fallback: KV/UV oran mantığı (sektör yoksa veya benchmark bulunamadıysa) ─
  if (!usedCurrentRatioLogic) {
    let ratio: number | null = null
    if (uvTotal > 0) {
      ratio = kvTotal / uvTotal
      if (ratio < RATIO_LOW_THRESHOLD) return null
    }
    // uvTotal === 0 → null kalır, high severity
    severity = determineSeverityByRatio(ratio, kvTotal, uvTotal)
  }

  const recommendedActions = buildRecommendedActions(balances)
  if (recommendedActions.length === 0) return null

  // ── Mesaj ────────────────────────────────────────────────────────────────
  let message: string
  if (usedCurrentRatioLogic && firmCurrentRatio !== null && sectorCurrentRatio !== null && sapma !== null) {
    const firmStr   = firmCurrentRatio.toFixed(2)
    const sectorStr = sectorCurrentRatio.toFixed(2)
    const sapmaStr  = sapma.toFixed(2)
    if (severity! === 'high') {
      message = `Cari oranınız ${firmStr}, sektör ortalaması ${sectorStr}. Sektörden ${sapmaStr} puan altta; kısa vadeli yükümlülükler sektör normuna göre belirgin baskı yaratıyor.`
    } else if (severity! === 'medium') {
      message = `Cari oranınız ${firmStr}, sektör ortalaması ${sectorStr}. Sektörden ${sapmaStr} puan altta; kısa vadeli yükümlülükler ortalamadan ağır.`
    } else {
      message = `Cari oranınız ${firmStr}, sektör ortalaması ${sectorStr}. Sektörden ${sapmaStr} puan altta; vade dağılımında hafif sapma var.`
    }
  } else {
    // Fallback mesajları (eski format)
    const fallbackMessages: Record<'low' | 'medium' | 'high', string> = {
      low:    'Kısa vadeli yükümlülükler uzun vadeli kaynaklara göre yüksek seyrediyor.',
      medium: 'Vade uyumsuzluğu belirgin: kısa vadeli yükümlülükler uzun vadeli kaynakları aşıyor.',
      high:   'Vade uyumsuzluğu kritik: kısa vadeli yükümlülükler uzun vadeli kaynaklara göre çok ağır basıyor.',
    }
    message = fallbackMessages[severity!]
  }

  // ratio: bilgi amaçlı (KV/UV oranı korunur)
  const kvUvRatio = uvTotal > 0 ? kvTotal / uvTotal : null

  return {
    insightId: 'A21_MATURITY_MISMATCH',
    title:     'Vade Uyumsuzluğu',
    message,
    severity:  severity!,
    ratio:     kvUvRatio,
    kvTotal,
    uvTotal,
    recommendedActions,
  }
}
