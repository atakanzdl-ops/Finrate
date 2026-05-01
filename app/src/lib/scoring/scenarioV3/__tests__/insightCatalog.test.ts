/**
 * Faz 7.3.7 — insightCatalog.ts testleri
 *
 * buildMaturityMismatchInsight:
 *   - tetiklenme koşulları (threshold, oran)
 *   - severity belirleme (low/medium/high)
 *   - recommendedActions filtreleme ve sıralama
 *   - DEKAM benzeri yüksek-risk fixture
 */

import { buildMaturityMismatchInsight } from '../insightCatalog'

// ─── Test yardımcısı ──────────────────────────────────────────────────────────

function makeBalances(overrides: Record<string, number> = {}): Record<string, number> {
  return { ...overrides }
}

// ─── Tetiklenme koşulları ─────────────────────────────────────────────────────

describe('buildMaturityMismatchInsight — tetiklenme', () => {
  test('KV < 5M threshold altı → null döner', () => {
    const balances = makeBalances({
      '320': 2_000_000,   // KV = 2M < 5M
      '400': 1_000_000,
    })
    expect(buildMaturityMismatchInsight(balances)).toBeNull()
  })

  test('KV >= 5M ama KV/UV oranı 1.3 (< 1.5) → null döner', () => {
    const balances = makeBalances({
      '320': 6_500_000,   // KV = 6.5M
      '400': 5_000_000,   // UV = 5M → oran = 1.3
    })
    expect(buildMaturityMismatchInsight(balances)).toBeNull()
  })

  test('KV/UV oranı tam 1.5 eşiğinde → low severity döner', () => {
    const balances = makeBalances({
      '320': 7_500_000,   // KV = 7.5M
      '400': 5_000_000,   // UV = 5M → oran = 1.5
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('low')
  })
})

// ─── Severity belirleme ───────────────────────────────────────────────────────

describe('buildMaturityMismatchInsight — severity', () => {
  test('KV/UV oranı 1.7 → low severity', () => {
    const balances = makeBalances({
      '320': 8_500_000,   // KV = 8.5M
      '400': 5_000_000,   // UV = 5M → oran = 1.7
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('low')
    expect(result!.ratio).toBeCloseTo(1.7, 2)
  })

  test('KV/UV oranı 2.4 → medium severity', () => {
    const balances = makeBalances({
      '320': 12_000_000,  // KV = 12M
      '400':  5_000_000,  // UV = 5M → oran = 2.4
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('medium')
    expect(result!.ratio).toBeCloseTo(2.4, 2)
  })

  test('KV/UV oranı 3.5 → high severity', () => {
    const balances = makeBalances({
      '320': 17_500_000,  // KV = 17.5M
      '400':  5_000_000,  // UV = 5M → oran = 3.5
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('high')
    expect(result!.ratio).toBeCloseTo(3.5, 2)
  })

  test('UV = 0, KV >= 5M → high severity, ratio null', () => {
    const balances = makeBalances({
      '320': 10_000_000,  // KV = 10M, UV = 0
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('high')
    expect(result!.ratio).toBeNull()
    expect(result!.uvTotal).toBe(0)
  })

  test('UV = 0, KV < 5M → null döner', () => {
    const balances = makeBalances({
      '320': 3_000_000,   // KV = 3M < 5M, UV = 0
    })
    expect(buildMaturityMismatchInsight(balances)).toBeNull()
  })
})

// ─── recommendedActions filtreleme ───────────────────────────────────────────

describe('buildMaturityMismatchInsight — recommendedActions', () => {
  // Her testte UV=0 + KV büyük → high severity (tetiklenme garantili)

  test('320 sıfırsa A02 yer almaz', () => {
    const balances = makeBalances({
      '300': 10_000_000,  // KV (A01 kaynağı)
      '320': 0,           // A02 kaynağı YOK
      '400': 0,           // UV = 0
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    const ids = result!.recommendedActions.map(a => a.actionId)
    expect(ids).not.toContain('A02_TRADE_PAYABLE_TO_LT')
    expect(ids).toContain('A01_ST_FIN_DEBT_TO_LT')
  })

  test('331 sıfırsa A15B yer almaz', () => {
    const balances = makeBalances({
      '320': 10_000_000,  // KV
      '331': 0,           // A15B kaynağı YOK
      '400': 0,           // UV = 0
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    const ids = result!.recommendedActions.map(a => a.actionId)
    expect(ids).not.toContain('A15B_SHAREHOLDER_DEBT_TO_LT')
  })

  test('Tüm kaynak bakiyeler eşik altında → null insight döner', () => {
    // KV anlamlı ama hiç aksiyon üretilemiyor
    const balances = makeBalances({
      '300':   500_000,   // A01 min = 1M → eşik altı
      '320': 2_000_000,   // A02 min = 3M → eşik altı
      '340': 1_500_000,   // A03 min = 2M → eşik altı
      '331':   500_000,   // A15B min = 1M → tam sınırda — 500K < 1M
      // KV toplam = 4.5M < 5M threshold
    })
    expect(buildMaturityMismatchInsight(balances)).toBeNull()
  })

  test('recommendedActions bakiye büyükten küçüğe sıralı', () => {
    const balances = makeBalances({
      '300':  2_000_000,  // A01: 2M
      '320':  8_000_000,  // A02: 8M
      '340':  5_000_000,  // A03: 5M
      '331':  1_500_000,  // A15B: 1.5M
      '400':  0,          // UV = 0
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    const balances2 = result!.recommendedActions.map(a => a.sourceBalance)
    for (let i = 0; i < balances2.length - 1; i++) {
      expect(balances2[i]).toBeGreaterThanOrEqual(balances2[i + 1])
    }
  })
})

// ─── DEKAM benzeri fixture ────────────────────────────────────────────────────

describe('buildMaturityMismatchInsight — DEKAM fixture', () => {
  const DEKAM_BALANCES = {
    '300':  5_400_000,   // KV banka kredisi
    '320':  6_500_000,   // KV satıcılar
    '340': 29_700_000,   // KV alınan avans
    '331':          0,   // ortak borcu yok
    '400':  5_000_000,   // UV banka kredisi
    '420':          0,
    '440':          0,
    '431':          0,
  }

  test('DEKAM: kvTotal ≈ 41.6M, uvTotal = 5M', () => {
    const result = buildMaturityMismatchInsight(DEKAM_BALANCES)
    expect(result).not.toBeNull()
    expect(result!.kvTotal).toBeCloseTo(41_600_000, -3)
    expect(result!.uvTotal).toBe(5_000_000)
  })

  test('DEKAM: ratio ≈ 8.32 → high severity', () => {
    const result = buildMaturityMismatchInsight(DEKAM_BALANCES)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('high')
    expect(result!.ratio).toBeCloseTo(8.32, 1)
  })

  test('DEKAM: insightId ve başlık doğru', () => {
    const result = buildMaturityMismatchInsight(DEKAM_BALANCES)
    expect(result!.insightId).toBe('A21_MATURITY_MISMATCH')
    expect(result!.title).toBe('Vade Uyumsuzluğu')
  })

  test('DEKAM: recommendedActions A03 > A02 > A01 (büyükten küçüğe)', () => {
    const result = buildMaturityMismatchInsight(DEKAM_BALANCES)
    expect(result).not.toBeNull()
    const ids = result!.recommendedActions.map(a => a.actionId)
    expect(ids[0]).toBe('A03_ADVANCE_TO_LT')     // 29.7M
    expect(ids[1]).toBe('A02_TRADE_PAYABLE_TO_LT') // 6.5M
    expect(ids[2]).toBe('A01_ST_FIN_DEBT_TO_LT')  // 5.4M
    // A15B 0 olduğu için yok
    expect(ids).not.toContain('A15B_SHAREHOLDER_DEBT_TO_LT')
  })

  test('DEKAM: message high severity içeriyor', () => {
    const result = buildMaturityMismatchInsight(DEKAM_BALANCES)
    expect(result!.message).toContain('kritik')
  })
})
