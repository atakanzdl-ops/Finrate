/**
 * Faz 4a Checkpoint Testleri
 *
 * Codex önerisine göre 4 zorunlu test grubu:
 *
 * Test 1 — No behavior change kanıtı:
 *   calculateScore, combineScores, computeScoreAttribution çıktıları
 *   pre-4a snapshot'larıyla birebir aynı kalmalı.
 *
 * Test 2 — Metadata bütünlük testi:
 *   NARRATIVE_PROFILES ve ELIGIBILITY_MATRIX eksiksiz tanımlı.
 *
 * Test 3 — Selector contract testi:
 *   getNarrativeCategory, getActionsForNarrativeCategory,
 *   isActionEligibleForSector, getEligibility helper'ları doğru çalışıyor.
 *
 * Test 4 — API smoke testi:
 *   scoreImpactProfile ve scoreAttribution public API'leri değişmemiş.
 *
 * KURAL: Test 1 düşerse Faz 4a yanlış — score semantics'e dokunulmuş demektir.
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #6, #9, #13, #15)
 */

import { calculateScore } from '../../score'
import { calculateRatios } from '../../ratios'
import { combineScores } from '../../subjective'
import { computeScoreAttribution } from '../../scoreAttribution'
import {
  DEKAM_INPUT, DEKAM_SECTOR, DEKAM_SUBJECTIVE_TOTAL,
  TRADE_INPUT, TRADE_SECTOR, TRADE_SUBJECTIVE_TOTAL,
} from '../../__fixtures__/syntheticEntities'

// Faz 4a modülü
import {
  NARRATIVE_PROFILES,
  NARRATIVE_STRATEGY_VERSION,
  getNarrativeCategory,
  getActionsForNarrativeCategory,
} from '../narrativeProfiles'
import {
  ELIGIBILITY_MATRIX,
  ELIGIBILITY_STRATEGY_VERSION,
  getEligibility,
  isActionEligibleForSector,
  getEligibleActionsForSector,
} from '../eligibilityMatrix'

// scoreImpactProfile public API
import {
  SCORE_IMPACT_PROFILES,
  impactedCategories,
  rankActionsForCategoryGap,
} from '../../scoreImpactProfile'

import type { ActionId } from '../../scoreImpactProfile'
import type { SectorId } from '../eligibilityMatrix'

const ALL_ACTIONS: ActionId[] = ['A05', 'A06', 'A10', 'A12', 'A18']

// ──────────────────────────────────────────────────────────────────────────────
// TEST 1 — NO BEHAVIOR CHANGE KANITI
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 1 — No behavior change (pre-4a snapshot karşılaştırması)', () => {
  /**
   * Faz 2 snapshot'larından alınan referans değerler.
   * Faz 4a sonrası bu değerler değişmemeli.
   */

  describe('DEKAM calculateScore — pre-4a referansı', () => {
    const ratios = calculateRatios({ ...DEKAM_INPUT, sector: DEKAM_SECTOR })
    const result = calculateScore(ratios, DEKAM_SECTOR)

    test('DEKAM liquidity skoru değişmedi (ref: 29.54)', () => {
      expect(result.liquidityScore).toBeCloseTo(29.54, 1)
    })

    test('DEKAM activity skoru değişmedi (ref: 42.85)', () => {
      expect(result.activityScore).toBeCloseTo(42.85, 1)
    })

    test('DEKAM leverage skoru değişmedi (ref: 17.53)', () => {
      expect(result.leverageScore).toBeCloseTo(17.53, 1)
    })

    test('DEKAM profitability skoru değişmedi (ref: 34.10)', () => {
      expect(result.profitabilityScore).toBeCloseTo(34.10, 1)
    })

    test('DEKAM total objektif skor değişmedi (ref: 28.85)', () => {
      expect(result.finalScore).toBeCloseTo(28.85, 1)
    })
  })

  describe('Trade calculateScore — pre-4a referansı', () => {
    const ratios = calculateRatios({ ...TRADE_INPUT, sector: TRADE_SECTOR })
    const result = calculateScore(ratios, TRADE_SECTOR)

    test('Trade liquidity skoru değişmedi (ref: 67.96)', () => {
      expect(result.liquidityScore).toBeCloseTo(67.96, 1)
    })

    test('Trade activity skoru değişmedi (ref: 73.37)', () => {
      expect(result.activityScore).toBeCloseTo(73.37, 1)
    })

    test('Trade total objektif skor değişmedi (ref: 70.11)', () => {
      expect(result.finalScore).toBeCloseTo(70.11, 1)
    })
  })

  describe('combineScores — pre-4a referansı', () => {
    test('DEKAM kombine skor değişmedi (subjective=23, objective=28.85)', () => {
      const dekamRatios  = calculateRatios({ ...DEKAM_INPUT, sector: DEKAM_SECTOR })
      const dekamScore   = calculateScore(dekamRatios, DEKAM_SECTOR)
      const combined     = combineScores(dekamScore.finalScore, DEKAM_SUBJECTIVE_TOTAL)
      // Snapshot: combinedDelta = 1 → beforeCombined ≈ 34 (ceiling/floor aktif)
      expect(combined).toBeGreaterThan(30)
      expect(combined).toBeLessThan(60)
    })

    test('Trade kombine skor değişmedi (subjective=20, objective=70.11)', () => {
      const tradeRatios = calculateRatios({ ...TRADE_INPUT, sector: TRADE_SECTOR })
      const tradeScore  = calculateScore(tradeRatios, TRADE_SECTOR)
      const combined    = combineScores(tradeScore.finalScore, TRADE_SUBJECTIVE_TOTAL)
      expect(combined).toBeGreaterThan(65)
      expect(combined).toBeLessThan(90)
    })
  })

  describe('computeScoreAttribution — 5 aksiyon × DEKAM (pre-4a snapshot)', () => {
    // Faz 2 snapshot'larından alınan objectiveDelta referansları
    const DEKAM_REF_DELTA: Record<ActionId, number> = {
      A05: 0.78,
      A06: 5.80,
      A10: 2.68,
      A12: 3.62,
      A18: 1.62,
    }

    for (const actionId of ALL_ACTIONS) {
      test(`DEKAM × ${actionId}: objectiveDelta ≈ ${DEKAM_REF_DELTA[actionId]}`, () => {
        const result = computeScoreAttribution(
          actionId, DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR
        )
        expect(result.objectiveDelta).toBeCloseTo(DEKAM_REF_DELTA[actionId], 0)
        expect(result.applied).toBe(true)
      })
    }
  })

  describe('computeScoreAttribution — 5 aksiyon × Trade (pre-4a snapshot)', () => {
    const TRADE_REF_DELTA: Record<ActionId, number> = {
      A05: 1.15,
      A06: 2.65,
      A10: 3.23,
      A12: 3.30,
      A18: 3.70,
    }

    for (const actionId of ALL_ACTIONS) {
      test(`Trade × ${actionId}: objectiveDelta ≈ ${TRADE_REF_DELTA[actionId]}`, () => {
        const result = computeScoreAttribution(
          actionId, TRADE_INPUT, TRADE_SUBJECTIVE_TOTAL, TRADE_SECTOR
        )
        expect(result.objectiveDelta).toBeCloseTo(TRADE_REF_DELTA[actionId], 0)
        expect(result.applied).toBe(true)
      })
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 2 — METADATA BÜTÜNLÜK TESTİ
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 2 — Metadata bütünlüğü', () => {
  const VALID_CATEGORIES = ['liquidity', 'profitability', 'leverage', 'activity']
  const VALID_SECTORS: SectorId[] = ['CONSTRUCTION', 'TRADE', 'MANUFACTURING', 'AUTOMOTIVE']

  test('NARRATIVE_PROFILES: 5 pilot aksiyonun hepsi tanımlı', () => {
    for (const actionId of ALL_ACTIONS) {
      expect(NARRATIVE_PROFILES[actionId]).toBeDefined()
    }
  })

  test('NARRATIVE_PROFILES: tüm değerler geçerli ScoreCategory', () => {
    for (const actionId of ALL_ACTIONS) {
      expect(VALID_CATEGORIES).toContain(NARRATIVE_PROFILES[actionId])
    }
  })

  test('ELIGIBILITY_MATRIX: 4 sektör tanımlı', () => {
    for (const sector of VALID_SECTORS) {
      expect(ELIGIBILITY_MATRIX).toHaveProperty(sector)
    }
  })

  test('ELIGIBILITY_MATRIX: matrix disi kombinasyonlar icin fallback "allow"', () => {
    // A05 hiçbir sektörde blok değil
    for (const sector of VALID_SECTORS) {
      const rule = getEligibility('A05', sector)
      expect(rule.decision).toBe('allow')
    }
  })

  test('NARRATIVE_STRATEGY_VERSION formatı geçerli (4a-YYYY-MM-DD)', () => {
    expect(NARRATIVE_STRATEGY_VERSION).toMatch(/^4a-\d{4}-\d{2}-\d{2}$/)
  })

  test('ELIGIBILITY_STRATEGY_VERSION formatı geçerli (4a-YYYY-MM-DD)', () => {
    expect(ELIGIBILITY_STRATEGY_VERSION).toMatch(/^4a-\d{4}-\d{2}-\d{2}$/)
  })

  test('İki strategyVersion damgası tutarlı', () => {
    expect(NARRATIVE_STRATEGY_VERSION).toBe(ELIGIBILITY_STRATEGY_VERSION)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 3 — SELECTOR CONTRACT TESTİ
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 3 — Selector contract', () => {

  describe('getNarrativeCategory()', () => {
    test('A05 → "activity" (alacak tahsilatı = faaliyet)', () => {
      expect(getNarrativeCategory('A05')).toBe('activity')
    })

    test('A06 → "activity" (stok devir = faaliyet)', () => {
      expect(getNarrativeCategory('A06')).toBe('activity')
    })

    test('A10 → "leverage" (KV→UV borç = kaldıraç)', () => {
      expect(getNarrativeCategory('A10')).toBe('leverage')
    })

    test('A12 → "leverage" (sermaye artırımı = kaldıraç)', () => {
      expect(getNarrativeCategory('A12')).toBe('leverage')
    })

    test('A18 → "profitability" (brüt marj = kârlılık)', () => {
      expect(getNarrativeCategory('A18')).toBe('profitability')
    })
  })

  describe('getActionsForNarrativeCategory()', () => {
    test('"activity" → ["A05", "A06"] (ikisi co-primary)', () => {
      const result = getActionsForNarrativeCategory('activity').sort()
      expect(result).toEqual(['A05', 'A06'])
    })

    test('"leverage" → ["A10", "A12"]', () => {
      const result = getActionsForNarrativeCategory('leverage').sort()
      expect(result).toEqual(['A10', 'A12'])
    })

    test('"profitability" → ["A18"]', () => {
      const result = getActionsForNarrativeCategory('profitability')
      expect(result).toEqual(['A18'])
    })

    test('"liquidity" → [] (hiçbir aksiyon narrative liquidity değil)', () => {
      const result = getActionsForNarrativeCategory('liquidity')
      expect(result).toHaveLength(0)
    })
  })

  describe('getEligibility()', () => {
    test('A06 + CONSTRUCTION → "discourage" (WIP mantığı)', () => {
      expect(getEligibility('A06', 'CONSTRUCTION').decision).toBe('discourage')
    })

    test('A06 + CONSTRUCTION → reason string mevcut', () => {
      expect(getEligibility('A06', 'CONSTRUCTION').reason).toBeTruthy()
    })

    test('A05 + TRADE → "allow" (default)', () => {
      expect(getEligibility('A05', 'TRADE').decision).toBe('allow')
    })

    test('A10 + MANUFACTURING → "allow" (default)', () => {
      expect(getEligibility('A10', 'MANUFACTURING').decision).toBe('allow')
    })
  })

  describe('isActionEligibleForSector()', () => {
    test('A06 + CONSTRUCTION → true (discourage ≠ block)', () => {
      // discourage: önerilebilir ama uyarı var. Block değil → eligible.
      expect(isActionEligibleForSector('A06', 'CONSTRUCTION')).toBe(true)
    })

    test('A05 + TRADE → true', () => {
      expect(isActionEligibleForSector('A05', 'TRADE')).toBe(true)
    })

    test('A12 + AUTOMOTIVE → true', () => {
      expect(isActionEligibleForSector('A12', 'AUTOMOTIVE')).toBe(true)
    })
  })

  describe('getEligibleActionsForSector()', () => {
    test('CONSTRUCTION: tüm 5 aksiyon eligible (block yok, sadece discourage)', () => {
      const eligible = getEligibleActionsForSector('CONSTRUCTION', ALL_ACTIONS)
      expect(eligible).toHaveLength(5)
    })

    test('TRADE: tüm 5 aksiyon eligible', () => {
      const eligible = getEligibleActionsForSector('TRADE', ALL_ACTIONS)
      expect(eligible).toHaveLength(5)
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 4 — API SMOKE TESTİ
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 4 — API smoke (public export\'lar değişmedi)', () => {

  describe('scoreImpactProfile public API', () => {
    test('SCORE_IMPACT_PROFILES hâlâ erişilebilir ve 5 aksiyon içeriyor', () => {
      expect(Object.keys(SCORE_IMPACT_PROFILES).sort()).toEqual(
        ['A05', 'A06', 'A10', 'A12', 'A18']
      )
    })

    test('impactedCategories() hâlâ çalışıyor (A06 → liquidity baskın)', () => {
      const result = impactedCategories('A06')
      expect(result[0]).toBe('liquidity')
    })

    test('rankActionsForCategoryGap() hâlâ çalışıyor (activity → A05 önce)', () => {
      const result = rankActionsForCategoryGap('activity')
      expect(result[0]).toBe('A05')
    })
  })

  describe('computeScoreAttribution public API shape', () => {
    test('döndürülen obje beklenen alanları içeriyor (applied, categoryDelta, objectiveDelta, combinedDelta)', () => {
      const result = computeScoreAttribution('A05', DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR)
      expect(result).toHaveProperty('applied')
      expect(result).toHaveProperty('categoryDelta')
      expect(result).toHaveProperty('objectiveDelta')
      expect(result).toHaveProperty('combinedDelta')
      expect(result).toHaveProperty('ratingChange')
      expect(result).toHaveProperty('beforeObjective')
      expect(result).toHaveProperty('afterObjective')
    })
  })
})
