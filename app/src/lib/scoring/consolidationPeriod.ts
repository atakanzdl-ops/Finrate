/**
 * consolidationPeriod.ts — Konsolide skor için dönem hizalama ve yıllıklandırma.
 *
 * Sorun: grup şirketlerinin "en son analizi" birbirinden farklı dönemlere ait olabilir
 * (A: 2025 yıllık, B: 2025/Q2). Bunları doğrudan toplamak elma ile armudu toplar.
 *
 * Kural:
 *   1. Skor dönemi = tüm konsolide şirketlerin ortak sahip olduğu EN SON dönem;
 *      ortak dönem yoksa genel en son dönem.
 *   2. Her şirket için o dönemin verisi alınır; yoksa o dönemden ÖNCEKİ en son
 *      verisi kullanılır ve uyarı üretilir.
 *   3. Ara dönemde (Q1/Q2/Q3) toplam akış kalemleri yıllıklandırılır
 *      (tek firma analiziyle aynı kural: buildRatioInput → annualizeFlows).
 *
 * Bu dosya saf (prisma yok) — testlenebilir.
 */

import { annualizationFactor } from './ratioInput'
import type { AggregatedFinancials } from './consolidation'

export interface PeriodRef { year: number; period: string }

/** Zaman sırası: yıl × 100 + ay indeksi. ANNUAL, aynı yılın Q4'ünden sonra gelir. */
export function periodOrderNum(year: number, period: string): number {
  const m: Record<string, number> = { Q1: 1, H1: 2, Q2: 3, Q3: 6, H2: 9, Q4: 12, ANNUAL: 13 }
  return year * 100 + (m[(period ?? '').trim().toUpperCase()] ?? 5)
}

export const periodKey = (p: PeriodRef): string => `${p.year}-${(p.period ?? 'ANNUAL').trim().toUpperCase()}`

/** Etiket: "2025" ya da "2025/Q2" */
export function periodLabel(p: PeriodRef): string {
  const per = (p.period ?? 'ANNUAL').trim().toUpperCase()
  return per === 'ANNUAL' ? String(p.year) : `${p.year}/${per}`
}

/**
 * Skor dönemi seçimi.
 * @param byEntity  entityId → o şirketin analiz dönemleri
 * @returns ortak en son dönem; ortak yoksa genel en son dönem; hiç veri yoksa null
 */
export function pickScoringPeriod(byEntity: Map<string, PeriodRef[]>): PeriodRef | null {
  const lists = [...byEntity.values()].filter(l => l.length > 0)
  if (lists.length === 0) return null

  const keySets = lists.map(l => new Set(l.map(periodKey)))
  const all = new Map<string, PeriodRef>()
  for (const l of lists) for (const p of l) all.set(periodKey(p), p)

  const sorted = [...all.values()].sort((a, b) => periodOrderNum(b.year, b.period) - periodOrderNum(a.year, a.period))
  const common = sorted.find(p => keySets.every(s => s.has(periodKey(p))))
  return common ?? sorted[0] ?? null
}

/**
 * Bir şirket için hedef döneme en uygun analizi seçer:
 * tam eşleşme → hedeften önceki en son → (hiçbiri yoksa) null.
 */
export function selectForPeriod<T extends PeriodRef>(items: T[], target: PeriodRef): { item: T; exact: boolean } | null {
  const targetKey = periodKey(target)
  const exact = items.find(i => periodKey(i) === targetKey)
  if (exact) return { item: exact, exact: true }
  const limit = periodOrderNum(target.year, target.period)
  const earlier = items
    .filter(i => periodOrderNum(i.year, i.period) < limit)
    .sort((a, b) => periodOrderNum(b.year, b.period) - periodOrderNum(a.year, a.period))[0]
  return earlier ? { item: earlier, exact: false } : null
}

/** Toplam finansallardaki akış kalemlerini ara dönem için yıllıklandırır (bilanço kalemleri değişmez). */
export function annualizeAggregated(agg: AggregatedFinancials, period: string): AggregatedFinancials {
  const k = annualizationFactor(period)
  if (k === 1) return agg
  return {
    ...agg,
    revenue:           agg.revenue           * k,
    cogs:              agg.cogs              * k,
    grossProfit:       agg.grossProfit       * k,
    operatingExpenses: agg.operatingExpenses * k,
    ebit:              agg.ebit              * k,
    ebitda:            agg.ebitda            * k,
    interestExpense:   agg.interestExpense   * k,
    ebt:               agg.ebt               * k,
    netProfit:         agg.netProfit         * k,
    depreciation:      agg.depreciation      * k,
    minorityInterest:  agg.minorityInterest  * k,
  }
}
