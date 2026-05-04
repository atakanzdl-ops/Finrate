/**
 * EntityRatingCard — Saf fonksiyon testleri (Faz 7.3.27 + Faz 7.3.28 bug fix)
 *
 * testEnvironment: 'node' → jsdom/rendering yok.
 * Dışa aktarılan saf fonksiyonlar test edilir:
 *   miniPeriodLabel, computeTrendX, groupAnalysesByEntity, latestUpdatedAt,
 *   sortEntitiesByLatest, computeTrend, latestAnalysisPeriodLabel
 *
 * T_ERC1: groupAnalysesByEntity — aynı entity.id → tek grup
 * T_ERC2: groupAnalysesByEntity — farklı entity'ler → ayrı gruplar
 * T_ERC3: sortEntitiesByLatest — year+period bazlı sıralama (Faz 7.3.28)
 * T_ERC4: computeTrend — 2+ analiz: skor farkı döner
 * T_ERC5: computeTrend — tek analiz: null
 * T_ERC6: latestUpdatedAt — boş → null; dolu → en yeni tarih
 * T_ERC7: computeTrendX — son x koordinatı viewBox içinde (Faz 7.3.28)
 * T_ERC8: latestAnalysisPeriodLabel — en son dönem etiketi (Faz 7.3.28)
 */

import {
  miniPeriodLabel,
  computeTrendX,
  groupAnalysesByEntity,
  latestUpdatedAt,
  sortEntitiesByLatest,
  computeTrend,
  latestAnalysisPeriodLabel,
  type CardAnalysisItem,
  type EntityGroup,
} from '../EntityRatingCard'

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeItem(
  id: string,
  year: number,
  period: string,
  score: number,
  opts: { updatedAt?: string; entityId?: string; entityName?: string } = {},
): CardAnalysisItem {
  const { updatedAt, entityId, entityName } = opts
  return {
    id,
    year,
    period,
    finalScore: score,
    finalRating: 'BBB',
    updatedAt: updatedAt ?? null,
    entity: entityId ? { id: entityId, name: entityName ?? `Firma ${entityId}` } : undefined,
  }
}

// ─── miniPeriodLabel ──────────────────────────────────────────────────────────

describe('miniPeriodLabel', () => {
  test('ANNUAL → son 2 rakam yıl ("24")', () => {
    expect(miniPeriodLabel(2024, 'ANNUAL')).toBe('24')
  })

  test('Q1 → "Q1"', () => {
    expect(miniPeriodLabel(2024, 'Q1')).toBe('Q1')
  })

  test('Q4 → "Q4"', () => {
    expect(miniPeriodLabel(2025, 'Q4')).toBe('Q4')
  })

  test('Q3 2023 → "Q3"', () => {
    expect(miniPeriodLabel(2023, 'Q3')).toBe('Q3')
  })
})

// ─── T_ERC1: groupAnalysesByEntity — aynı entity.id ─────────────────────────

describe('T_ERC1 — groupAnalysesByEntity: aynı entity → tek grup', () => {
  test('aynı entity.id\'li 2 analiz 1 grupta birleşir', () => {
    const analyses: CardAnalysisItem[] = [
      makeItem('a1', 2024, 'ANNUAL', 60, { entityId: 'e1', entityName: 'Firma A' }),
      makeItem('a2', 2025, 'Q1',    65, { entityId: 'e1', entityName: 'Firma A' }),
    ]
    const groups = groupAnalysesByEntity(analyses)
    expect(groups).toHaveLength(1)
    expect(groups[0].analyses).toHaveLength(2)
    expect(groups[0].entity.id).toBe('e1')
  })

  test('entity alanı olmayan analiz atlanır', () => {
    const analyses: CardAnalysisItem[] = [
      makeItem('a1', 2024, 'ANNUAL', 60, { entityId: 'e1' }),
      makeItem('a2', 2024, 'Q4',    55),  // entity yok
    ]
    const groups = groupAnalysesByEntity(analyses)
    expect(groups).toHaveLength(1)
    expect(groups[0].analyses).toHaveLength(1)
  })

  test('boş liste → boş array', () => {
    expect(groupAnalysesByEntity([])).toHaveLength(0)
  })
})

// ─── T_ERC2: groupAnalysesByEntity — farklı entity'ler ──────────────────────

describe('T_ERC2 — groupAnalysesByEntity: farklı entity\'ler → ayrı gruplar', () => {
  const analyses: CardAnalysisItem[] = [
    makeItem('a1', 2024, 'ANNUAL', 60, { entityId: 'e1', entityName: 'Firma A' }),
    makeItem('a2', 2024, 'ANNUAL', 70, { entityId: 'e2', entityName: 'Firma B' }),
    makeItem('a3', 2025, 'Q1',    75, { entityId: 'e2', entityName: 'Firma B' }),
  ]

  test('2 farklı entity → 2 grup', () => {
    expect(groupAnalysesByEntity(analyses)).toHaveLength(2)
  })

  test('e1 grubunda 1 analiz, e2 grubunda 2 analiz', () => {
    const groups = groupAnalysesByEntity(analyses)
    const e1 = groups.find(g => g.entity.id === 'e1')
    const e2 = groups.find(g => g.entity.id === 'e2')
    expect(e1?.analyses).toHaveLength(1)
    expect(e2?.analyses).toHaveLength(2)
  })

  test('3 farklı entity → 3 grup', () => {
    const three = [
      ...analyses,
      makeItem('a4', 2024, 'ANNUAL', 50, { entityId: 'e3', entityName: 'Firma C' }),
    ]
    expect(groupAnalysesByEntity(three)).toHaveLength(3)
  })
})

// ─── T_ERC3: sortEntitiesByLatest ────────────────────────────────────────────
// Faz 7.3.28: updatedAt API Date→{} hatası nedeniyle year+period bazlı sıralamaya geçildi.
// Fixture'daki yıl sıralaması (e2=2025 > e1=2024 > e3=2023) tarih sıralamasıyla aynı → testler geçer.

describe('T_ERC3 — sortEntitiesByLatest: year+period bazlı kronolojik sıralama (Faz 7.3.28)', () => {
  const groups: EntityGroup[] = [
    {
      entity: { id: 'e1', name: 'Firma A' },
      analyses: [makeItem('a1', 2024, 'ANNUAL', 60, { updatedAt: '2024-01-15T00:00:00Z' })],
    },
    {
      entity: { id: 'e2', name: 'Firma B' },
      analyses: [makeItem('a2', 2025, 'Q1', 70, { updatedAt: '2025-04-20T00:00:00Z' })],
    },
    {
      entity: { id: 'e3', name: 'Firma C' },
      analyses: [makeItem('a3', 2023, 'Q4', 55, { updatedAt: '2023-06-01T00:00:00Z' })],
    },
  ]

  test('e2 (en yeni) başa gelir', () => {
    const sorted = sortEntitiesByLatest(groups)
    expect(sorted[0].entity.id).toBe('e2')
  })

  test('e3 (en eski) sona kalır', () => {
    const sorted = sortEntitiesByLatest(groups)
    expect(sorted[sorted.length - 1].entity.id).toBe('e3')
  })

  test('sıralama: e2 → e1 → e3', () => {
    const sorted = sortEntitiesByLatest(groups)
    expect(sorted.map(g => g.entity.id)).toEqual(['e2', 'e1', 'e3'])
  })

  test('girdi dizisi mutate edilmez', () => {
    const original = groups.map(g => g.entity.id)
    sortEntitiesByLatest(groups)
    expect(groups.map(g => g.entity.id)).toEqual(original)
  })
})

// ─── T_ERC4: computeTrend — 2+ analiz ────────────────────────────────────────

describe('T_ERC4 — computeTrend: 2+ analiz → skor farkı', () => {
  test('70 - 50 = +20 (artış)', () => {
    const analyses = [
      makeItem('a1', 2024, 'ANNUAL', 50),
      makeItem('a2', 2025, 'Q1',    70),
    ]
    expect(computeTrend(analyses)).toBeCloseTo(20, 2)
  })

  test('50 - 70 = -20 (azalış)', () => {
    const analyses = [
      makeItem('a1', 2024, 'ANNUAL', 70),
      makeItem('a2', 2025, 'Q1',    50),
    ]
    expect(computeTrend(analyses)).toBeCloseTo(-20, 2)
  })

  test('kronolojik sıraya göre hesaplanır (girdi sırası önemsiz)', () => {
    // Giriş ters sırada — yine de doğru fark hesaplanmalı
    const analyses = [
      makeItem('a2', 2025, 'Q1',    70),  // daha yeni
      makeItem('a1', 2024, 'ANNUAL', 50), // daha eski
    ]
    expect(computeTrend(analyses)).toBeCloseTo(20, 2)
  })

  test('3 analiz: son iki dönem arasındaki fark', () => {
    const analyses = [
      makeItem('a1', 2023, 'ANNUAL', 40),
      makeItem('a2', 2024, 'ANNUAL', 60),
      makeItem('a3', 2025, 'Q1',    65),
    ]
    // Son: 65 (2025/Q1), Önceki: 60 (2024), Fark: +5
    expect(computeTrend(analyses)).toBeCloseTo(5, 2)
  })
})

// ─── T_ERC5: computeTrend — tek analiz ───────────────────────────────────────

describe('T_ERC5 — computeTrend: tek analiz → null', () => {
  test('tek analizde null döner', () => {
    const analyses = [makeItem('a1', 2024, 'ANNUAL', 60)]
    expect(computeTrend(analyses)).toBeNull()
  })

  test('boş listede null döner', () => {
    expect(computeTrend([])).toBeNull()
  })
})

// ─── T_ERC6: latestUpdatedAt ──────────────────────────────────────────────────

describe('T_ERC6 — latestUpdatedAt', () => {
  test('boş liste → null', () => {
    expect(latestUpdatedAt([])).toBeNull()
  })

  test('tek analiz → o analizin tarihi', () => {
    const analyses = [makeItem('a1', 2024, 'ANNUAL', 60, { updatedAt: '2024-03-01T00:00:00Z' })]
    expect(latestUpdatedAt(analyses)).toBe('2024-03-01T00:00:00Z')
  })

  test('3 analiz → en yeni tarih döner', () => {
    const analyses = [
      makeItem('a1', 2024, 'ANNUAL', 60, { updatedAt: '2024-01-01T00:00:00Z' }),
      makeItem('a2', 2025, 'Q1',    70, { updatedAt: '2025-04-20T00:00:00Z' }),
      makeItem('a3', 2023, 'Q4',    55, { updatedAt: '2023-06-15T00:00:00Z' }),
    ]
    expect(latestUpdatedAt(analyses)).toBe('2025-04-20T00:00:00Z')
  })

  test('updatedAt null olan analizler atlanır', () => {
    const analyses = [
      makeItem('a1', 2024, 'ANNUAL', 60, { updatedAt: '2024-06-01T00:00:00Z' }),
      makeItem('a2', 2025, 'Q1',    70),  // updatedAt: null
    ]
    expect(latestUpdatedAt(analyses)).toBe('2024-06-01T00:00:00Z')
  })

  test('tüm updatedAt null → null', () => {
    const analyses = [
      makeItem('a1', 2024, 'ANNUAL', 60),
      makeItem('a2', 2025, 'Q1',    70),
    ]
    expect(latestUpdatedAt(analyses)).toBeNull()
  })
})

// ─── T_ERC7: computeTrendX ────────────────────────────────────────────────────
// Faz 7.3.28: x koordinatı bar merkezi = (i + 0.5) / n * 400

describe('T_ERC7 — computeTrendX: x koordinatı viewBox 0-400 içinde, bar merkezinde', () => {
  test('n=1: tek çubuk merkezi = 200', () => {
    expect(computeTrendX(0, 1)).toBeCloseTo(200, 1)
  })

  test('n=3, i=0: ilk çubuk merkezi ≈ 66.7', () => {
    expect(computeTrendX(0, 3)).toBeCloseTo(66.7, 0)
    expect(computeTrendX(0, 3)).toBeGreaterThan(0)
  })

  test('n=3, i=2: son çubuk merkezi ≈ 333.3 (eski formül 350 veriyordu)', () => {
    expect(computeTrendX(2, 3)).toBeCloseTo(333.3, 0)
    expect(computeTrendX(2, 3)).toBeLessThan(400)
  })

  test('n=3, i=1: orta çubuk = 200 (simetrik)', () => {
    expect(computeTrendX(1, 3)).toBeCloseTo(200, 1)
  })

  test('her i için 0 < x < 400 (n=5, ipos benzeri kart)', () => {
    for (let i = 0; i < 5; i++) {
      const x = computeTrendX(i, 5)
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(400)
    }
  })

  test('son çubuk her zaman viewBox sağ kenarı içinde (n=1..6)', () => {
    for (let n = 1; n <= 6; n++) {
      const x = computeTrendX(n - 1, n)
      expect(x).toBeLessThan(400)
      expect(x).toBeGreaterThan(0)
    }
  })
})

// ─── T_ERC8: latestAnalysisPeriodLabel ───────────────────────────────────────
// Faz 7.3.28: updatedAt yerine year+period bazlı dönem etiketi

describe('T_ERC8 — latestAnalysisPeriodLabel: en son dönem etiketi', () => {
  test('boş liste → null', () => {
    expect(latestAnalysisPeriodLabel([])).toBeNull()
  })

  test('tek analiz ANNUAL → sadece yıl ("2024")', () => {
    const analyses = [makeItem('a1', 2024, 'ANNUAL', 60)]
    expect(latestAnalysisPeriodLabel(analyses)).toBe('2024')
  })

  test('tek analiz Q4 → "2024/Q4"', () => {
    const analyses = [makeItem('a1', 2024, 'Q4', 60)]
    expect(latestAnalysisPeriodLabel(analyses)).toBe('2024/Q4')
  })

  test('3 karışık analiz → en son dönem (2025/Q4)', () => {
    const analyses = [
      makeItem('a1', 2024, 'Q1',    60),
      makeItem('a2', 2025, 'Q4',    70),
      makeItem('a3', 2023, 'ANNUAL', 55),
    ]
    expect(latestAnalysisPeriodLabel(analyses)).toBe('2025/Q4')
  })

  test('aynı yılda ANNUAL < Q1 < Q4 → Q4 döner', () => {
    const analyses = [
      makeItem('a1', 2024, 'ANNUAL', 60),
      makeItem('a2', 2024, 'Q4',    70),
      makeItem('a3', 2024, 'Q1',    65),
    ]
    expect(latestAnalysisPeriodLabel(analyses)).toBe('2024/Q4')
  })
})
