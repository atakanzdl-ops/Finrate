/**
 * scoreImpactProfile unit testleri — Faz 3
 *
 * Test grupları:
 *   1. Tip ve değer doğrulaması  — profil değerleri 0-5 skalasında, tüm kategoriler mevcut
 *   2. impactedCategories()       — eşik filtresi, sıralama, edge case'ler
 *   3. rankActionsForCategoryGap() — kategori bazlı sıralama, minStrength filtresi
 *   4. Profil-snapshot tutarlılığı — Faz 2 snapshot deltaları ile dominant kategori uyumu
 *
 * Faz 2 snapshot özeti (dominant kategori cross-check için):
 *   A05 DEKAM: liquidity+1.70 / activity+1.27  → her ikisi co-primary   → profil: liq:4 / act:4
 *   A05 Trade: liquidity+2.30 / activity+1.95  → her ikisi co-primary   → profil: liq:4 / act:4
 *   A06 DEKAM: liquidity+15.77 / activity=0    → liquidity baskın       → profil: liq:5 / act:3
 *   A06 Trade: liquidity+7.33  / activity+2.58 → liquidity baskın       → profil: liq:5 / act:3
 *   A10 DEKAM: liquidity+5.56  / leverage+2.48 → liquidity baskın       → profil: liq:5 / lev:3
 *   A10 Trade: liquidity+10.98 / leverage+1.97 → liquidity baskın       → profil: liq:5 / lev:3
 *   A12 DEKAM: liquidity+6.33  / leverage+4.73 → liquidity > leverage   → profil: liq:5 / lev:4
 *   A12 Trade: liquidity+9.99  / leverage+5.57 → liquidity > leverage   → profil: liq:5 / lev:4
 *   A18 DEKAM: profitability+7.26 / leverage+1.17 → profitability baskın → profil: pro:5 / lev:3
 *   A18 Trade: profitability+10.06/ leverage+5.58 → profitability baskın → profil: pro:5 / lev:3
 */

import {
  SCORE_IMPACT_PROFILES,
  impactedCategories,
  rankActionsForCategoryGap,
  type ImpactStrength,
  type ScoreCategory,
} from '../scoreImpactProfile'
import type { ActionId } from '../scoreImpactProfile'

// ──────────────────────────────────────────────────────────────────────────────
// 1. TİP VE DEĞER DOĞRULAMASI
// ──────────────────────────────────────────────────────────────────────────────

describe('SCORE_IMPACT_PROFILES — tip ve değer doğrulaması', () => {
  const ALL_ACTIONS: ActionId[] = ['A05', 'A06', 'A10', 'A12', 'A18']
  const ALL_CATEGORIES: ScoreCategory[] = ['liquidity', 'profitability', 'leverage', 'activity']
  const VALID_STRENGTHS: ImpactStrength[] = [0, 1, 2, 3, 4, 5]

  test('tüm pilot aksiyonlar tanımlı', () => {
    for (const actionId of ALL_ACTIONS) {
      expect(SCORE_IMPACT_PROFILES[actionId]).toBeDefined()
    }
  })

  test('her profil 4 kategori içeriyor', () => {
    for (const actionId of ALL_ACTIONS) {
      const profile = SCORE_IMPACT_PROFILES[actionId]
      for (const cat of ALL_CATEGORIES) {
        expect(profile).toHaveProperty(cat)
      }
    }
  })

  test('tüm değerler 0-5 skalasında (geçerli ImpactStrength)', () => {
    for (const actionId of ALL_ACTIONS) {
      const profile = SCORE_IMPACT_PROFILES[actionId]
      for (const cat of ALL_CATEGORIES) {
        expect(VALID_STRENGTHS).toContain(profile[cat])
      }
    }
  })

  test('her aksiyonun en az bir birincil kategorisi var (strength ≥ 4)', () => {
    for (const actionId of ALL_ACTIONS) {
      const profile = SCORE_IMPACT_PROFILES[actionId]
      const hasPrimary = ALL_CATEGORIES.some(cat => profile[cat] >= 4)
      expect(hasPrimary).toBe(true)
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 2. impactedCategories()
// ──────────────────────────────────────────────────────────────────────────────

describe('impactedCategories() — eşik filtresi ve sıralama', () => {

  describe('A05 — varsayılan eşik (3)', () => {
    test('activity ve liquidity döndürülür (her ikisi 4)', () => {
      const result = impactedCategories('A05')
      expect(result).toHaveLength(2)
      expect(result).toContain('activity')
      expect(result).toContain('liquidity')
    })

    test('sıralama: güçten zayıfa (4=4 → her ikisi de başta)', () => {
      const result = impactedCategories('A05')
      // Her ikisi de strength=4, sıralama kararlı olmalı ama ikisi de önde
      expect(result.slice(0, 2).sort()).toEqual(['activity', 'liquidity'])
    })

    test('leverage (1) ve profitability (0) dahil edilmez', () => {
      const result = impactedCategories('A05')
      expect(result).not.toContain('profitability')
      expect(result).not.toContain('leverage')
    })
  })

  describe('A06 — varsayılan eşik (3)', () => {
    test('liquidity ve activity döndürülür', () => {
      const result = impactedCategories('A06')
      expect(result).toHaveLength(2)
      expect(result).toContain('liquidity')
      expect(result).toContain('activity')
    })

    test('liquidity (5) activity\'den (3) önce gelir', () => {
      const result = impactedCategories('A06')
      expect(result[0]).toBe('liquidity')
      expect(result[1]).toBe('activity')
    })
  })

  describe('A10 — varsayılan eşik (3)', () => {
    test('liquidity ve leverage döndürülür', () => {
      const result = impactedCategories('A10')
      expect(result).toHaveLength(2)
      expect(result).toContain('liquidity')
      expect(result).toContain('leverage')
    })

    test('liquidity (5) leverage\'dan (3) önce gelir', () => {
      const result = impactedCategories('A10')
      expect(result[0]).toBe('liquidity')
    })
  })

  describe('A12 — varsayılan eşik (3)', () => {
    test('liquidity ve leverage döndürülür', () => {
      const result = impactedCategories('A12')
      expect(result).toHaveLength(2)
      expect(result).toContain('liquidity')
      expect(result).toContain('leverage')
    })

    test('liquidity (5) leverage\'dan (4) önce gelir', () => {
      const result = impactedCategories('A12')
      expect(result[0]).toBe('liquidity')
      expect(result[1]).toBe('leverage')
    })
  })

  describe('A18 — varsayılan eşik (3)', () => {
    test('profitability ve leverage döndürülür', () => {
      const result = impactedCategories('A18')
      expect(result).toHaveLength(2)
      expect(result).toContain('profitability')
      expect(result).toContain('leverage')
    })

    test('profitability (5) leverage\'dan (3) önce gelir', () => {
      const result = impactedCategories('A18')
      expect(result[0]).toBe('profitability')
      expect(result[1]).toBe('leverage')
    })
  })

  describe('eşik edge case\'leri', () => {
    test('threshold=5 → sadece liquidity (A06 için)', () => {
      const result = impactedCategories('A06', 5)
      expect(result).toEqual(['liquidity'])
    })

    test('threshold=5 → sadece liquidity (A12 için)', () => {
      const result = impactedCategories('A12', 5)
      expect(result).toEqual(['liquidity'])
    })

    test('threshold=1 → A05 için leverage de dahil (strength=1)', () => {
      const result = impactedCategories('A05', 1)
      expect(result).toContain('leverage')
      // profitability=0 hâlâ dışarıda
      expect(result).not.toContain('profitability')
    })

    test('threshold=0 → tüm kategoriler dahil (A05)', () => {
      const result = impactedCategories('A05', 0)
      expect(result).toHaveLength(4)
    })

    test('A18 threshold=4 → sadece profitability (5≥4 geçer, leverage=3 geçemez)', () => {
      const result = impactedCategories('A18', 4)
      expect(result).toEqual(['profitability'])
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 3. rankActionsForCategoryGap()
// ──────────────────────────────────────────────────────────────────────────────

describe('rankActionsForCategoryGap() — kategori bazlı aksiyon sıralaması', () => {

  describe('liquidity gap', () => {
    test('liquidity açığında A06/A10/A12 strength=5, ilk 3\'te yer alır', () => {
      const result = rankActionsForCategoryGap('liquidity')
      expect(result.slice(0, 3).sort()).toEqual(['A06', 'A10', 'A12'].sort())
    })

    test('A05 (liq:4) listenin 4. sırasında', () => {
      const result = rankActionsForCategoryGap('liquidity')
      expect(result[3]).toBe('A05')
    })

    test('A18 (liq:0) varsayılan eşik=1 ile listede YOK', () => {
      const result = rankActionsForCategoryGap('liquidity')
      expect(result).not.toContain('A18')
    })
  })

  describe('profitability gap', () => {
    test('sadece A18 döndürülür', () => {
      const result = rankActionsForCategoryGap('profitability')
      expect(result).toEqual(['A18'])
    })
  })

  describe('leverage gap', () => {
    test('A12 (lev:4) A10\'dan (lev:3) önce gelir', () => {
      const result = rankActionsForCategoryGap('leverage')
      expect(result[0]).toBe('A12')
    })

    test('leverage açığında A12, A10, A18 listelenir (A05=1, A06=0 → A06 dışarıda)', () => {
      const result = rankActionsForCategoryGap('leverage')
      expect(result).toContain('A12')
      expect(result).toContain('A10')
      expect(result).toContain('A18')
      expect(result).toContain('A05')  // strength=1 ≥ minStrength default 1
      expect(result).not.toContain('A06')  // leverage=0
    })
  })

  describe('activity gap', () => {
    test('A05 (act:4) A06\'dan (act:3) önce gelir', () => {
      const result = rankActionsForCategoryGap('activity')
      expect(result[0]).toBe('A05')
      expect(result[1]).toBe('A06')
    })

    test('activity açığında sadece A05 ve A06 var (diğerleri 0)', () => {
      const result = rankActionsForCategoryGap('activity')
      expect(result).toHaveLength(2)
      expect(result).toContain('A05')
      expect(result).toContain('A06')
    })
  })

  describe('minStrength filtresi', () => {
    test('minStrength=3 → leverage gap: A05 (lev:1) dışarıda kalır', () => {
      const result = rankActionsForCategoryGap('leverage', { minStrength: 3 })
      expect(result).not.toContain('A05')
    })

    test('minStrength=3 → leverage gap: A12 (4) ve A10 (3) ve A18 (3) içeride', () => {
      const result = rankActionsForCategoryGap('leverage', { minStrength: 3 })
      expect(result).toContain('A12')
      expect(result).toContain('A10')
      expect(result).toContain('A18')
    })

    test('minStrength=5 → liquidity: sadece 5 güçlüler (A06, A10, A12)', () => {
      const result = rankActionsForCategoryGap('liquidity', { minStrength: 5 })
      expect(result.sort()).toEqual(['A06', 'A10', 'A12'].sort())
    })

    test('minStrength=0 → tüm aksiyonlar dahil (sıfır strength\'ler de)', () => {
      const result = rankActionsForCategoryGap('profitability', { minStrength: 0 })
      expect(result).toHaveLength(5)
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 4. PROFİL-SNAPSHOT TUTARLILIĞI (Faz 2 cross-check)
// ──────────────────────────────────────────────────────────────────────────────

describe('Profil-snapshot tutarlılığı — Faz 2 dominant kategori uyumu', () => {
  /**
   * Bu testler profilin snapshot ile tutarlı olduğunu doğrular.
   * Kural: "dominant kategori" (snapshot'ta en yüksek delta) profilde strength ≥ ikinci kategoriden olmalı.
   * Kesin skor delta değildir — sadece yönsel güç sıralaması doğrulanır.
   */

  test('A05: liquidity ve activity co-primary (her ikisi profilde 4)', () => {
    const profile = SCORE_IMPACT_PROFILES['A05']
    // Snapshot: DEKAM liq+1.70/act+1.27, Trade liq+2.30/act+1.95 → her ikisi yakın
    expect(profile.liquidity).toBe(4)
    expect(profile.activity).toBe(4)
    // Her ikisi eşit — "co-primary" tasarımı
    expect(profile.liquidity).toBe(profile.activity)
  })

  test('A05: liquidity, profitability ve leverage\'dan (0) güçlü', () => {
    const profile = SCORE_IMPACT_PROFILES['A05']
    expect(profile.liquidity).toBeGreaterThan(profile.profitability)
    expect(profile.liquidity).toBeGreaterThan(profile.leverage)
  })

  test('A06: liquidity (5) activity\'den (3) dominant — DEKAM liq+15.77 vs act=0', () => {
    const profile = SCORE_IMPACT_PROFILES['A06']
    // Snapshot DEKAM: liquidity+15.77 >> activity=0 (büyük fark)
    expect(profile.liquidity).toBeGreaterThan(profile.activity)
    expect(profile.liquidity).toBe(5)
  })

  test('A06: profitability ve leverage 0 (snapshot\'ta anlamsız delta)', () => {
    const profile = SCORE_IMPACT_PROFILES['A06']
    expect(profile.profitability).toBe(0)
    expect(profile.leverage).toBe(0)
  })

  test('A10: liquidity (5) leverage\'dan (3) dominant — her iki entity\'de tutarlı', () => {
    const profile = SCORE_IMPACT_PROFILES['A10']
    // Snapshot: DEKAM liq+5.56/lev+2.48, Trade liq+10.98/lev+1.97
    expect(profile.liquidity).toBeGreaterThan(profile.leverage)
    expect(profile.liquidity).toBe(5)
  })

  test('A10: activity ve profitability 0 (mekanizma ile uyumlu)', () => {
    const profile = SCORE_IMPACT_PROFILES['A10']
    expect(profile.activity).toBe(0)
    expect(profile.profitability).toBe(0)
  })

  test('A12: liquidity (5) leverage\'dan (4) dominant — spec\'in ters sıralaması düzeltildi', () => {
    const profile = SCORE_IMPACT_PROFILES['A12']
    // Snapshot: DEKAM liq+6.33/lev+4.73, Trade liq+9.99/lev+5.57
    // Her iki entity'de liquidity > leverage → spec sıralaması ters → düzeltildi
    expect(profile.liquidity).toBeGreaterThan(profile.leverage)
    expect(profile.liquidity).toBe(5)
    expect(profile.leverage).toBe(4)
  })

  test('A18: profitability (5) baskın — her iki entity\'de net dominant', () => {
    const profile = SCORE_IMPACT_PROFILES['A18']
    // Snapshot: DEKAM pro+7.26/lev+1.17, Trade pro+10.06/lev+5.58
    expect(profile.profitability).toBe(5)
    expect(profile.profitability).toBeGreaterThan(profile.leverage)
  })

  test('A18: leverage (3) — spec\'in 1\'den artırıldı (Trade lev+5.58 güçlü)', () => {
    const profile = SCORE_IMPACT_PROFILES['A18']
    // Trade snapshot'ta leverage+5.58 → spec'teki 1 değeri düşük kalıyordu
    expect(profile.leverage).toBe(3)
    expect(profile.leverage).toBeGreaterThan(1)  // spec değerinden yüksek
  })

  test('A18: liquidity 0 — her iki entity\'de negatif veya sıfır', () => {
    const profile = SCORE_IMPACT_PROFILES['A18']
    // Snapshot: DEKAM liq-0.05, Trade liq-0.23 → negatif → profil 0
    expect(profile.liquidity).toBe(0)
  })

  test('Profil dominansı: impactedCategories(action)[0] snapshot dominant\'ı ile uyumlu', () => {
    // Her aksiyonun en güçlü profil kategorisi, snapshot dominant kategorisi ile uyumlu olmalı
    const expectedDominant: Record<ActionId, ScoreCategory> = {
      A05: 'liquidity',    // liquidity=4, activity=4 → her ikisi eşit; liquidity alfabetik önce değil ama eşit
      A06: 'liquidity',   // liquidity=5
      A10: 'liquidity',   // liquidity=5
      A12: 'liquidity',   // liquidity=5
      A18: 'profitability', // profitability=5
    }

    for (const [actionId, expectedCat] of Object.entries(expectedDominant) as [ActionId, ScoreCategory][]) {
      const top = impactedCategories(actionId)[0]
      // A05 için top liquidity veya activity olabilir (eşit güç) — sadece ikisi de dahil mı diye kontrol et
      if (actionId === 'A05') {
        expect(['liquidity', 'activity']).toContain(top)
      } else {
        expect(top).toBe(expectedCat)
      }
    }
  })
})
