/**
 * SCENARIO ENGINE V3 — Ratio Helpers
 *
 * computeAmount altyapısı için yardımcı fonksiyonlar.
 * Hiçbir aksiyonda henüz kullanılmıyor — Parça 4'te A05 pilotunda devreye girer.
 */

import type { FirmContext } from './contracts'
import { getSectorBenchmark } from '../benchmarks'
import type { SectorBenchmark } from '../benchmarks'

// ─── getCogs ────────────────────────────────────────────────────────────────

/**
 * FirmContext'ten satılan mal maliyeti türetir.
 * cogs alanı varsa kullanır, yoksa netSales - grossProfit.
 */
export function getCogs(ctx: FirmContext): number | null {
  if ('cogs' in ctx && typeof (ctx as any).cogs === 'number' && (ctx as any).cogs > 0) {
    return (ctx as any).cogs
  }
  if (ctx.netSales > 0 && typeof ctx.grossProfit === 'number') {
    const derived = ctx.netSales - ctx.grossProfit
    return derived > 0 ? derived : null
  }
  return null
}

// ─── getPeriodDays ───────────────────────────────────────────────────────────

/**
 * FinancialData'dan dönem gün sayısını döner.
 * FinancialData.period alanı: 'ANNUAL' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | string
 * periodStart + periodEnd varsa hesapla.
 * Period source unknown ise 365 + console.warn.
 * Sessiz varsayım yapılmaz.
 */
export function getPeriodDays(fd: any): { days: number; source: 'explicit' | 'derived' | 'unknown' } {
  // periodStart + periodEnd mevcutsa hesapla
  if (fd && fd.periodStart && fd.periodEnd) {
    const start = new Date(fd.periodStart)
    const end   = new Date(fd.periodEnd)
    const ms    = end.getTime() - start.getTime()
    if (!isNaN(ms) && ms > 0) {
      const days = Math.round(ms / (1000 * 60 * 60 * 24))
      return { days, source: 'explicit' }
    }
  }

  // FinancialData.period string alanından türet
  if (fd && typeof fd.period === 'string') {
    const p = fd.period.toUpperCase()
    if (p === 'ANNUAL' || p === 'FULL_YEAR') {
      return { days: 365, source: 'derived' }
    }
    if (p === 'Q1' || p === 'Q2' || p === 'Q3' || p === 'Q4') {
      return { days: 90, source: 'derived' }
    }
    if (p === 'H1' || p === 'H2') {
      return { days: 182, source: 'derived' }
    }
    if (p === '9M') {
      return { days: 273, source: 'derived' }
    }
  }

  // Fallback: 365 + warn
  console.warn(
    '[ratioHelpers] getPeriodDays: period belirlenemedi, 365 gün varsayıldı.',
    { period: fd?.period, periodStart: fd?.periodStart, periodEnd: fd?.periodEnd }
  )
  return { days: 365, source: 'unknown' }
}

// ─── getBenchmarkValue ───────────────────────────────────────────────────────

/**
 * TCMB_DIRECT olarak doğrudan yayınlanan SectorBenchmark alanları.
 * Diğerleri FINRATE_ESTIMATE (model tahmini).
 */
const TCMB_DIRECT_FIELDS: ReadonlySet<keyof SectorBenchmark> = new Set([
  'currentRatio',
  'quickRatio',
  'grossMargin',
  'netProfitMargin',
  'roa',
  'roe',
  'debtToEquity',
  'debtToAssets',
  'interestCoverage',
  'assetTurnover',
  'receivablesDays',
  'inventoryDays',
])

/**
 * Sektör + alan için TCMB benchmark değerini döner.
 * Bulunamazsa null — caller targetRatio.fallback kullanır.
 * sector: SectorCode veya herhangi bir sektör string'i (getSectorBenchmark string alır)
 */
export function getBenchmarkValue(
  sector: string,
  field: keyof SectorBenchmark
): { value: number; reliability: 'TCMB_DIRECT' | 'FINRATE_ESTIMATE' } | null {
  const bm = getSectorBenchmark(sector)
  if (!bm) return null
  const value = bm[field]
  if (typeof value !== 'number') return null
  const reliability = TCMB_DIRECT_FIELDS.has(field) ? 'TCMB_DIRECT' : 'FINRATE_ESTIMATE'
  return { value, reliability }
}

// ─── applyFeasibilityCap ─────────────────────────────────────────────────────

/**
 * Feasibility cap uygular. Negatif dönmez.
 * Sonuç 0 olabilir — caller bunu null'a çevirip fallback'e geçer.
 *
 * @param currentBalance  Mevcut bakiye (TL)
 * @param targetBalance   Hedef bakiye (TL)
 * @param capPercent      Maksimum hareket oranı (varsayılan: %25)
 */
export function applyFeasibilityCap(
  currentBalance: number,
  targetBalance:  number,
  capPercent:     number = 0.25
): number {
  const maxMovement    = currentBalance * capPercent
  const desiredMovement = Math.max(currentBalance - targetBalance, 0)
  return Math.min(desiredMovement, maxMovement)
}

// ─── detectExtremeDeviation ──────────────────────────────────────────────────

/**
 * Firma değerinin sektör benchmark'ından sapma şiddetini tespit eder.
 * Divide-by-zero ve negatif koruması zorunlu.
 *
 * isExtreme: ratio > 5× veya < 0.2× (yani 5x sapma her iki yönde)
 * severity:  max(ratio, 1/ratio) — 1 = tam eşit, yüksek = daha aşırı sapma
 */
export function detectExtremeDeviation(
  currentValue:   number,
  benchmarkValue: number
): { isExtreme: boolean; severity: number } {
  if (benchmarkValue <= 0) return { isExtreme: false, severity: 0 }
  if (currentValue  <= 0) return { isExtreme: false, severity: 0 }
  const ratio    = currentValue / benchmarkValue
  const severity = Math.max(ratio, 1 / ratio)
  return {
    isExtreme: ratio > 5 || ratio < 0.2,
    severity,
  }
}
