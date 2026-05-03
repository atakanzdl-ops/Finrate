/**
 * Faz 7.3.13 — inefficiencyNarratives.ts testleri
 *
 * 8 InefficiencyType için title/description/ifNotAddressed exhaustive kontrolü
 * + SEVERITY_LABELS, SEVERITY_ORDER, VISIBLE_SEVERITIES doğrulaması.
 */

import {
  INEFFICIENCY_NARRATIVES,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  VISIBLE_SEVERITIES,
} from '../inefficiencyNarratives'
import type { InefficiencyType } from '../assetProductivity'

// ─── Tüm 8 tip listesi ───────────────────────────────────────────────────────

const ALL_TYPES: InefficiencyType[] = [
  'SALES_ASSET_MISMATCH',
  'INVENTORY_LOCK',
  'WIP_LOCK',
  'ADVANCES_LOCK',
  'RECEIVABLE_SLOWDOWN',
  'FIXED_ASSET_UNDERUTILIZATION',
  'OPERATING_YIELD_GAP',
  'CASH_GENERATION_GAP',
]

// ─── INEFFICIENCY_NARRATIVES — exhaustive ────────────────────────────────────

describe('INEFFICIENCY_NARRATIVES — 8 tip exhaustive', () => {

  test.each(ALL_TYPES)(
    '%s: title/description/ifNotAddressed tanımlı ve dolu',
    (type) => {
      const entry = INEFFICIENCY_NARRATIVES[type]
      expect(entry).toBeDefined()
      expect(entry.title.length).toBeGreaterThan(3)
      expect(entry.description.length).toBeGreaterThan(10)
      expect(entry.ifNotAddressed.length).toBeGreaterThan(10)
    }
  )

  test('Tüm 8 tip kayıtlı — dışarıda kalan tip yok', () => {
    const definedKeys = Object.keys(INEFFICIENCY_NARRATIVES)
    expect(definedKeys.sort()).toEqual([...ALL_TYPES].sort())
  })

  test('Hiçbir başlık boş string değil', () => {
    for (const type of ALL_TYPES) {
      expect(INEFFICIENCY_NARRATIVES[type].title.trim()).not.toBe('')
    }
  })

})

// ─── SEVERITY_LABELS ─────────────────────────────────────────────────────────

describe('SEVERITY_LABELS', () => {

  test('CRITICAL → KRİTİK', () => {
    expect(SEVERITY_LABELS.CRITICAL).toBe('KRİTİK')
  })

  test('SEVERE → CİDDİ', () => {
    expect(SEVERITY_LABELS.SEVERE).toBe('CİDDİ')
  })

  test('MODERATE → ORTA', () => {
    expect(SEVERITY_LABELS.MODERATE).toBe('ORTA')
  })

  test('MILD → HAFİF', () => {
    expect(SEVERITY_LABELS.MILD).toBe('HAFİF')
  })

  test('4 seviye tanımlı', () => {
    expect(Object.keys(SEVERITY_LABELS)).toHaveLength(4)
  })

})

// ─── SEVERITY_ORDER ───────────────────────────────────────────────────────────

describe('SEVERITY_ORDER', () => {

  test('CRITICAL en yüksek öncelik (index 0)', () => {
    expect(SEVERITY_ORDER[0]).toBe('CRITICAL')
  })

  test('MILD en düşük öncelik (son eleman)', () => {
    expect(SEVERITY_ORDER[SEVERITY_ORDER.length - 1]).toBe('MILD')
  })

  test('SEVERE, MODERATE\'den önce gelir', () => {
    expect(SEVERITY_ORDER.indexOf('SEVERE')).toBeLessThan(
      SEVERITY_ORDER.indexOf('MODERATE')
    )
  })

  test('4 eleman içerir', () => {
    expect(SEVERITY_ORDER).toHaveLength(4)
  })

})

// ─── VISIBLE_SEVERITIES ───────────────────────────────────────────────────────

describe('VISIBLE_SEVERITIES', () => {

  test('MILD içermiyor (gizli)', () => {
    expect(VISIBLE_SEVERITIES).not.toContain('MILD')
  })

  test('CRITICAL içeriyor', () => {
    expect(VISIBLE_SEVERITIES).toContain('CRITICAL')
  })

  test('SEVERE içeriyor', () => {
    expect(VISIBLE_SEVERITIES).toContain('SEVERE')
  })

  test('MODERATE içeriyor', () => {
    expect(VISIBLE_SEVERITIES).toContain('MODERATE')
  })

  test('Tam olarak 3 seviye görünür', () => {
    expect(VISIBLE_SEVERITIES).toHaveLength(3)
  })

})
