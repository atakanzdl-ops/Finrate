/**
 * scoreAttribution post-4b snapshot testleri
 *
 * ENABLE_SECTOR_THRESHOLD_OVERRIDES=true ile çalışır.
 * Pre-4b snapshot (scoreAttribution.test.ts.snap) korunur — bu dosya YENİ snapshot üretir.
 *
 * Codex audit stratejisi (c):
 *   - Flag=false → pre-4b snapshot değişmez (scoreAttribution.test.ts kontrolü)
 *   - Flag=true  → bu dosya yeni canonical post-4b snapshot'ı oluşturur
 *
 * jest.resetModules() + dynamic import zorunlu:
 *   featureFlags.ts module-level const, module load'da okunur.
 *   resetModules → tüm sectorStrategy modül zinciri yeniden yüklenir → flag=true
 *
 * KRİTİK: Bu dosyadaki testler flag=true davranışını kilitler.
 * Sektörel eşik değişirse bu snapshot güncellenmeli.
 *
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #11, #14)
 */

import {
  DEKAM_INPUT, DEKAM_SECTOR, DEKAM_SUBJECTIVE_TOTAL,
  TRADE_INPUT, TRADE_SECTOR, TRADE_SUBJECTIVE_TOTAL,
} from '../__fixtures__/syntheticEntities'

// ──────────────────────────────────────────────────────────────────────────────
// SETUP: flag=true ile modül zincirini yeniden yükle
// ──────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let computeScoreAttribution: (...args: any[]) => any

beforeAll(async () => {
  // 1. Flag'i true yap
  process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES = 'true'
  // 2. Module cache'i temizle — featureFlags.ts yeni process.env'i okusun
  jest.resetModules()
  // 3. Fresh dynamic import — tüm zincir yeniden değerlendirilir
  const mod = await import('../scoreAttribution')
  computeScoreAttribution = mod.computeScoreAttribution
})

afterAll(() => {
  delete process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES
  jest.resetModules()
})

// ──────────────────────────────────────────────────────────────────────────────
// YARDIMCI
// ──────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarise(r: any) {
  return {
    actionId:        r.actionId,
    applied:         r.applied,
    beforeObjective: r.beforeObjective,
    afterObjective:  r.afterObjective,
    categoryDelta:   r.categoryDelta,
    objectiveDelta:  Math.round(r.objectiveDelta * 100) / 100,
    combinedDelta:   Math.round(r.combinedDelta * 100) / 100,
    ratingChange:    r.ratingChange,
  }
}

const ACTIONS = ['A05', 'A06', 'A10', 'A12', 'A18'] as const

// ══════════════════════════════════════════════════════════════════════════════
// DEKAM (İNŞAAT) × 5 AKSİYON — flag=true
// ══════════════════════════════════════════════════════════════════════════════

describe('post-4b: DEKAM × aksiyonlar (ENABLE_SECTOR_THRESHOLD_OVERRIDES=true)', () => {
  for (const actionId of ACTIONS) {
    describe(`DEKAM × ${actionId}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any

      beforeAll(() => {
        result = computeScoreAttribution(actionId, DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR)
      })

      test('applied = true', () => {
        expect(result.applied).toBe(true)
      })

      test('objectiveDelta >= 0', () => {
        expect(result.objectiveDelta).toBeGreaterThanOrEqual(0)
      })

      test('snapshot (post-4b canonical)', () => {
        expect(summarise(result)).toMatchSnapshot()
      })
    })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// TRADE × 5 AKSİYON — flag=true
// ══════════════════════════════════════════════════════════════════════════════

describe('post-4b: Trade × aksiyonlar (ENABLE_SECTOR_THRESHOLD_OVERRIDES=true)', () => {
  for (const actionId of ACTIONS) {
    describe(`Trade × ${actionId}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any

      beforeAll(() => {
        result = computeScoreAttribution(actionId, TRADE_INPUT, TRADE_SUBJECTIVE_TOTAL, TRADE_SECTOR)
      })

      test('applied = true', () => {
        expect(result.applied).toBe(true)
      })

      test('objectiveDelta >= 0', () => {
        expect(result.objectiveDelta).toBeGreaterThanOrEqual(0)
      })

      test('snapshot (post-4b canonical)', () => {
        expect(summarise(result)).toMatchSnapshot()
      })
    })
  }
})
