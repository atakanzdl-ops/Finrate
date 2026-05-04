/**
 * RatingHistoryChart — Saf fonksiyon testleri (Faz 7.3.26)
 *
 * testEnvironment: 'node' → jsdom/rendering yok.
 * Sadece dışa aktarılan saf fonksiyonlar test edilir:
 *   periodLabel, sortAnalyses, filterAnalyses
 *
 * T_RH1: periodLabel — ANNUAL → sadece yıl; Qx → "yıl/Qx"
 * T_RH2: sortAnalyses — yıl artan, aynı yılda ANNUAL < Q1 < Q4
 * T_RH3: filterAnalyses 'yillik' — yalnızca ANNUAL dönemleri döndürür
 * T_RH4: filterAnalyses 'ceyreklik' — ANNUAL hariç
 * T_RH5: filterAnalyses 'tumu' — tüm analizler değişmeden döner
 */

import { periodLabel, sortAnalyses, filterAnalyses, type AnalysisItem } from '../RatingHistoryChart'

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeItem(year: number, period: string, score = 50): AnalysisItem {
  return {
    id:          `${year}-${period}`,
    year,
    period,
    finalScore:  score,
    finalRating: 'BBB',
  }
}

// ─── T_RH1: periodLabel ───────────────────────────────────────────────────────

describe('T_RH1 — periodLabel', () => {
  test('ANNUAL → sadece yıl ("2024")', () => {
    expect(periodLabel(2024, 'ANNUAL')).toBe('2024')
  })

  test('Q1 → "2024/Q1"', () => {
    expect(periodLabel(2024, 'Q1')).toBe('2024/Q1')
  })

  test('Q2 → "2024/Q2"', () => {
    expect(periodLabel(2024, 'Q2')).toBe('2024/Q2')
  })

  test('Q3 → "2025/Q3"', () => {
    expect(periodLabel(2025, 'Q3')).toBe('2025/Q3')
  })

  test('Q4 → "2025/Q4"', () => {
    expect(periodLabel(2025, 'Q4')).toBe('2025/Q4')
  })
})

// ─── T_RH2: sortAnalyses ──────────────────────────────────────────────────────

describe('T_RH2 — sortAnalyses kronolojik sıralama', () => {
  test('yıl artan sırayla döner', () => {
    const input = [
      makeItem(2025, 'ANNUAL'),
      makeItem(2023, 'ANNUAL'),
      makeItem(2024, 'ANNUAL'),
    ]
    const result = sortAnalyses(input)
    expect(result.map(r => r.year)).toEqual([2023, 2024, 2025])
  })

  test('aynı yılda ANNUAL < Q1 < Q4', () => {
    const input = [
      makeItem(2024, 'Q4'),
      makeItem(2024, 'ANNUAL'),
      makeItem(2024, 'Q1'),
    ]
    const result = sortAnalyses(input)
    expect(result.map(r => r.period)).toEqual(['ANNUAL', 'Q1', 'Q4'])
  })

  test('farklı yıl + farklı dönem karışık → yıl önce, sonra dönem', () => {
    const input = [
      makeItem(2025, 'Q1'),
      makeItem(2024, 'Q4'),
      makeItem(2024, 'ANNUAL'),
      makeItem(2023, 'Q2'),
    ]
    const result = sortAnalyses(input)
    expect(result.map(r => `${r.year}-${r.period}`)).toEqual([
      '2023-Q2',
      '2024-ANNUAL',
      '2024-Q4',
      '2025-Q1',
    ])
  })

  test('girdi dizisi mutate edilmez (spread kopya)', () => {
    const input = [makeItem(2025, 'Q1'), makeItem(2024, 'ANNUAL')]
    const original = [...input]
    sortAnalyses(input)
    expect(input[0].year).toBe(original[0].year)
    expect(input[1].year).toBe(original[1].year)
  })
})

// ─── T_RH3: filterAnalyses — 'yillik' ────────────────────────────────────────

describe('T_RH3 — filterAnalyses "yillik"', () => {
  const mixed = [
    makeItem(2023, 'ANNUAL'),
    makeItem(2024, 'Q1'),
    makeItem(2024, 'ANNUAL'),
    makeItem(2025, 'Q4'),
  ]

  test('yalnızca ANNUAL dönemleri döner', () => {
    const result = filterAnalyses(mixed, 'yillik')
    expect(result.every(r => r.period === 'ANNUAL')).toBe(true)
  })

  test('doğru sayıda kayıt (2 ANNUAL)', () => {
    expect(filterAnalyses(mixed, 'yillik')).toHaveLength(2)
  })

  test('boş listede boş döner', () => {
    expect(filterAnalyses([], 'yillik')).toHaveLength(0)
  })
})

// ─── T_RH4: filterAnalyses — 'ceyreklik' ─────────────────────────────────────

describe('T_RH4 — filterAnalyses "ceyreklik"', () => {
  const mixed = [
    makeItem(2023, 'ANNUAL'),
    makeItem(2024, 'Q1'),
    makeItem(2024, 'Q3'),
    makeItem(2025, 'ANNUAL'),
  ]

  test('ANNUAL kayıtlar hariç tutulur', () => {
    const result = filterAnalyses(mixed, 'ceyreklik')
    expect(result.every(r => r.period !== 'ANNUAL')).toBe(true)
  })

  test('doğru sayıda kayıt (2 çeyreklik)', () => {
    expect(filterAnalyses(mixed, 'ceyreklik')).toHaveLength(2)
  })

  test('Q dönemleri korunur (Q1, Q3)', () => {
    const result = filterAnalyses(mixed, 'ceyreklik')
    expect(result.map(r => r.period)).toEqual(['Q1', 'Q3'])
  })
})

// ─── T_RH5: filterAnalyses — 'tumu' ──────────────────────────────────────────

describe('T_RH5 — filterAnalyses "tumu"', () => {
  const mixed = [
    makeItem(2023, 'ANNUAL'),
    makeItem(2024, 'Q2'),
    makeItem(2025, 'Q4'),
  ]

  test('tüm analizler değişmeden döner', () => {
    const result = filterAnalyses(mixed, 'tumu')
    expect(result).toHaveLength(3)
  })

  test('sıralama ve içerik korunur', () => {
    const result = filterAnalyses(mixed, 'tumu')
    expect(result.map(r => r.id)).toEqual(['2023-ANNUAL', '2024-Q2', '2025-Q4'])
  })

  test('boş listede boş döner', () => {
    expect(filterAnalyses([], 'tumu')).toHaveLength(0)
  })
})
