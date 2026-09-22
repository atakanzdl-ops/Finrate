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
import type { RatioResult } from '../ratios'

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

// ─── R10: Yeni Risk Insight Builder'ları ─────────────────────────────────────
//
// Her builder:
//   - Koşul sağlanmıyorsa null döner
//   - DecisionInsight veya null döner
//   - kvTotal/uvTotal/ratio: bu insight tipi için anlamsız → 0/null
//   - sourceBalance: aksiyon için kaynaklanacak hesap bakiyesi yok → 0

type PartialRatios = Partial<RatioResult>

/**
 * R10: Likidite Krizi — currentRatio < 1.0
 * Dönen varlıklar KV yükümlülükleri karşılayamıyor.
 */
export function buildLiquidityInsight(
  sector: string | undefined,
  ratios:  PartialRatios | undefined | null,
): DecisionInsight | null {
  const cr = ratios?.currentRatio
  if (cr == null || cr >= 1.0) return null

  let sectorCR = 'bilinmiyor'
  if (sector) {
    const bm = getBenchmarkValue(sector, 'currentRatio' as keyof SectorBenchmark)
    if (bm?.value) sectorCR = bm.value.toFixed(2)
  }

  return {
    insightId: 'LIQUIDITY_CRITICAL',
    title:     'Likidite Krizi',
    message:   `Cari oranınız ${cr.toFixed(2)}, sektör ortalaması ${sectorCR}. KV yükümlülükler dönen varlıkları aşıyor.`,
    severity:  'critical',
    ratio:     cr,
    kvTotal:   0,
    uvTotal:   0,
    recommendedActions: [
      { actionId: 'A05_RECEIVABLE_COLLECTION', actionName: 'Alacak Tahsilat Hızlandırma', sourceBalance: 0 },
      { actionId: 'A01_ST_FIN_DEBT_TO_LT',     actionName: 'Finansal Borç Vade Uzatma',    sourceBalance: 0 },
    ],
  }
}

/**
 * R10: Asit-Test Riski — quickRatio < 0.5
 * Stok hariç likit varlıklar yetersiz.
 */
export function buildQuickRatioInsight(
  ratios: PartialRatios | undefined | null,
): DecisionInsight | null {
  const qr = ratios?.quickRatio
  if (qr == null || qr >= 0.5) return null

  return {
    insightId: 'QUICK_RATIO_CRITICAL',
    title:     'Asit-Test Riski',
    message:   `Asit-test oranınız ${qr.toFixed(2)}. Stok hariç likit varlıklar yetersiz.`,
    severity:  'high',
    ratio:     qr,
    kvTotal:   0,
    uvTotal:   0,
    recommendedActions: [
      { actionId: 'A05_RECEIVABLE_COLLECTION',    actionName: 'Alacak Tahsilat Hızlandırma', sourceBalance: 0 },
      { actionId: 'A06_INVENTORY_MONETIZATION',   actionName: 'Stok Optimizasyonu',           sourceBalance: 0 },
    ],
  }
}

/**
 * R10: Stok Devir Yavaşlığı — inventoryTurnoverDays > sektör × 2.0
 * Stok devir süresi sektör ortalamasının 2 katını aşıyor.
 */
export function buildInventoryTurnoverInsight(
  sector: string | undefined,
  ratios:  PartialRatios | undefined | null,
): DecisionInsight | null {
  const itd = ratios?.inventoryTurnoverDays
  if (itd == null) return null

  const bm = sector ? getBenchmarkValue(sector, 'inventoryDays' as keyof SectorBenchmark) : null
  if (!bm?.value || bm.value === 0) return null
  if (itd <= bm.value * 2.0) return null

  return {
    insightId: 'INVENTORY_TURNOVER_CRITICAL',
    title:     'Stok Devir Yavaşlığı',
    message:   `Stok devir süreniz ${Math.round(itd)} gün, sektör ortalaması ${Math.round(bm.value)} gün.`,
    severity:  'high',
    ratio:     itd / bm.value,
    kvTotal:   0,
    uvTotal:   0,
    recommendedActions: [
      { actionId: 'A06_INVENTORY_MONETIZATION', actionName: 'Stok Optimizasyonu', sourceBalance: 0 },
    ],
  }
}

/**
 * R10: Avans Baskısı — 340 / KV Borçlar > %40
 * Alınan avanslar KV borçların önemli bir kısmını oluşturuyor.
 * KV borçlar: 3xx hesapları toplamı (accountBalances'tan hesaplanır).
 */
export function buildAdvancesPressureInsight(
  accountBalances: Record<string, number> | undefined | null,
): DecisionInsight | null {
  if (!accountBalances) return null

  const advances = accountBalances['340'] ?? 0
  // KV borç toplamı — 3xx hesapları (mizan'da yaygın KV pasifler)
  const cl = (
    (accountBalances['300'] ?? 0) + (accountBalances['301'] ?? 0) +
    (accountBalances['303'] ?? 0) + (accountBalances['309'] ?? 0) +
    (accountBalances['320'] ?? 0) + (accountBalances['321'] ?? 0) +
    (accountBalances['331'] ?? 0) + (accountBalances['340'] ?? 0) +
    (accountBalances['350'] ?? 0) + (accountBalances['360'] ?? 0) +
    (accountBalances['361'] ?? 0) + (accountBalances['380'] ?? 0) +
    (accountBalances['381'] ?? 0)
  )
  if (cl === 0) return null

  const oran = advances / cl
  if (oran <= 0.40) return null

  return {
    insightId: 'ADVANCES_PRESSURE',
    title:     'Avans Baskısı',
    message:   `Alınan avanslar KV borçların %${Math.round(oran * 100)}'i. Proje teslim hızı kritik.`,
    severity:  'high',
    ratio:     oran,
    kvTotal:   cl,
    uvTotal:   0,
    recommendedActions: [
      { actionId: 'A19_ADVANCE_TO_REVENUE', actionName: 'Alınan Avansların Teslimi', sourceBalance: advances },
    ],
  }
}

/**
 * R10: Faiz Karşılama Riski — interestCoverage < 1.5
 * Finansman giderleri operasyonel kazancı baskılıyor.
 */
export function buildInterestCoverageInsight(
  ratios: PartialRatios | undefined | null,
): DecisionInsight | null {
  const ic = ratios?.interestCoverage
  if (ic == null || ic >= 1.5) return null

  return {
    insightId: 'INTEREST_COVERAGE_CRITICAL',
    title:     'Faiz Karşılama Riski',
    message:   `Faiz karşılama oranınız ${ic.toFixed(2)}. Finansman giderleri operasyonel kazancı baskılıyor.`,
    severity:  'high',
    ratio:     ic,
    kvTotal:   0,
    uvTotal:   0,
    recommendedActions: [
      { actionId: 'A14_FINANCE_COST_REDUCTION', actionName: 'Finansman Gideri Azaltma', sourceBalance: 0 },
      { actionId: 'A01_ST_FIN_DEBT_TO_LT',      actionName: 'Finansal Borç Vade Uzatma', sourceBalance: 0 },
    ],
  }
}

/**
 * R10: Aşırı Kaldıraç — debtToEquity > 3.0 VE ortak borcu var
 * Sermaye yapısı güçlendirme ihtiyacı.
 */
export function buildLeverageInsight(
  ratios:          PartialRatios | undefined | null,
  accountBalances: Record<string, number> | undefined | null,
): DecisionInsight | null {
  const dte = ratios?.debtToEquity
  const ortaklarBorcu = accountBalances?.['331'] ?? 0
  if (dte == null || dte <= 3.0 || ortaklarBorcu <= 0) return null

  return {
    insightId: 'LEVERAGE_CRITICAL',
    title:     'Aşırı Kaldıraç',
    message:   `Borç/Özkaynak oranınız ${dte.toFixed(2)}. Sermaye yapısı güçlendirme ihtiyacı var.`,
    severity:  'medium',
    ratio:     dte,
    kvTotal:   0,
    uvTotal:   0,
    recommendedActions: [
      { actionId: 'A15_DEBT_TO_EQUITY_SWAP',        actionName: 'Ortaklara Borç → Sermaye', sourceBalance: ortaklarBorcu },
      { actionId: 'A15B_SHAREHOLDER_DEBT_TO_LT',    actionName: 'Ortaklara Borç → UV',      sourceBalance: ortaklarBorcu },
    ],
  }
}
