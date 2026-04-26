/**
 * Attribution memoization — Faz 5.1
 *
 * Kural 6: in-memory cache, TEK generateScenarios çağrısı scope'unda
 * Stable stringify: object key sırası farklı olsa aynı entity → aynı key
 *
 * expectedSpillover IMPORT YASAK (Kural 5)
 */

import { computeScoreAttribution } from '../scoreAttribution'
import type { SupportedActionId } from '../actionEffects'
import type { FinancialInput } from '../ratios'
import type { ScoreAttribution } from '../scoreAttribution'
import { createHash } from 'crypto'

// Kural 6 — deterministic serialization, key order independent
// WeakSet circular guard: shared-ref nesneler __circular__ olarak işaretlenir (kabul edilen trade-off)
export function stableStringify(obj: unknown, seen = new WeakSet()): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (seen.has(obj as object)) return '"__circular__"'
  seen.add(obj as object)
  if (Array.isArray(obj)) {
    return '[' + obj.map(x => stableStringify(x, seen)).join(',') + ']'
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k], seen)).join(',') + '}'
}

// FinancialInput'tan gerçek alanlar — entity.ratios alanı YOK (flat yapı)
// Adım 0'da ratios.ts doğrulandı: tüm bu alanlar FinancialInput interface'inde mevcut
const SCORING_RELEVANT_FIELDS: (keyof FinancialInput)[] = [
  'sector',
  'prevRevenue',
  'ppiRate',
  'prevInventory',
  'prevTradeReceivables',
  'prevTradePayables',
  'prevAdvancesReceived',
  'cash',
  'shortTermInvestments',
  'tradeReceivables',
  'inventory',
  'prepaidSuppliers',
  'otherCurrentAssets',
  'totalCurrentAssets',
  'tangibleAssets',
  'intangibleAssets',
  'longTermInvestments',
  'otherNonCurrentAssets',
  'totalNonCurrentAssets',
  'totalAssets',
  'shortTermFinancialDebt',
  'tradePayables',
  'advancesReceived',
  'otherCurrentLiabilities',
  'totalCurrentLiabilities',
  'longTermFinancialDebt',
  'otherNonCurrentLiabilities',
  'totalNonCurrentLiabilities',
  'paidInCapital',
  'retainedEarnings',
  'netProfitCurrentYear',
  'totalEquity',
  'totalLiabilitiesAndEquity',
  'revenue',
  'cogs',
  'grossProfit',
  'operatingExpenses',
  'ebit',
  'depreciation',
  'ebitda',
  'interestExpense',
  'otherIncome',
  'otherExpense',
  'ebt',
  'taxExpense',
  'netProfit',
  'purchases',
]

// JSON-safe normalize: bigint/Date/function/symbol türleri için güvenli çevirme
function pickScoringRelevant(entity: any): Record<string, unknown> {
  if (!entity || typeof entity !== 'object') return {}
  const picked: Record<string, unknown> = {}
  for (const field of SCORING_RELEVANT_FIELDS) {
    const val = (entity as any)[field]
    if (val === undefined) continue
    if (typeof val === 'function' || typeof val === 'symbol') continue
    if (typeof val === 'bigint') { picked[field as string] = val.toString(); continue }
    if (val instanceof Date) { picked[field as string] = val.toISOString(); continue }
    picked[field as string] = val
  }
  return picked
}

export class AttributionCache {
  private cache = new Map<string, ScoreAttribution>()

  private buildEntityKey(entity: Partial<FinancialInput> & { id?: string; subjective?: number }): string {
    if (entity?.id) return String(entity.id)

    // entity.ratios alanı YOKSA (FinancialInput flat) direkt pickScoringRelevant kullan
    const corePayload = (entity as any)?.ratios &&
      typeof (entity as any).ratios === 'object' &&
      !Array.isArray((entity as any).ratios)
        ? (entity as any).ratios
        : pickScoringRelevant(entity)

    let payloadKey: string
    if (corePayload && typeof corePayload === 'object' && !Array.isArray(corePayload)) {
      payloadKey = stableStringify(corePayload)
    } else {
      payloadKey = `__non_object::${typeof corePayload}::${String(corePayload).slice(0, 50)}`
    }

    const sectorPart = (entity as any)?.sector ?? '__no_sector__'
    const namePart   = (entity as any)?.companyName ?? '__no_name__'
    const fallback   = `${sectorPart}::${namePart}::${payloadKey}`
    return createHash('sha1').update(fallback).digest('hex').slice(0, 16)
  }

  private buildKey(entityKey: string, actionId: SupportedActionId, flagSnapshot: string): string {
    return entityKey + '::' + actionId + '::' + flagSnapshot
  }

  getOrCompute(
    entity: Partial<FinancialInput> & { id?: string; subjective?: number },
    actionId: SupportedActionId,
    flagSnapshot: string,
  ): ScoreAttribution {
    const entityKey = this.buildEntityKey(entity)
    const key = this.buildKey(entityKey, actionId, flagSnapshot)
    if (this.cache.has(key)) return this.cache.get(key)!
    // computeScoreAttribution imzası: (actionId, beforeInput, subjectiveTotal, sector)
    const subjectiveTotal = typeof entity.subjective === 'number' ? entity.subjective : 0
    const sector = typeof entity.sector === 'string' ? entity.sector : ''
    const result = computeScoreAttribution(
      actionId,
      entity as FinancialInput,
      subjectiveTotal,
      sector,
    )
    this.cache.set(key, result)
    return result
  }

  size(): number { return this.cache.size }
  clear(): void { this.cache.clear() }
}
