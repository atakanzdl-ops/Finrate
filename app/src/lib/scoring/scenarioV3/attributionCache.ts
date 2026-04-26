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
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}

export class AttributionCache {
  private cache = new Map<string, ScoreAttribution>()

  private buildEntityKey(entity: Partial<FinancialInput> & { id?: string; subjective?: number }): string {
    if (entity?.id) return String(entity.id)
    // Fallback: sector + stable ratios hash
    const fallback = (entity?.sector ?? '') + '::' + stableStringify(entity)
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
