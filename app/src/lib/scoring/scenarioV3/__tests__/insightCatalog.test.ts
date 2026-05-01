/**
 * Faz 7.3.7 + 7.3.7-FIX — insightCatalog.ts testleri
 *
 * buildMaturityMismatchInsight:
 *   - tetiklenme koşulları (threshold, oran)
 *   - severity (fallback: KV/UV oran, yeni: cari oran sapması)
 *   - recommendedActions filtreleme ve sıralama
 *   - DEKAM benzeri fixture (fallback + cari oran)
 */

import { buildMaturityMismatchInsight } from '../insightCatalog'

// ─── Test yardımcısı ──────────────────────────────────────────────────────────

function makeBalances(overrides: Record<string, number> = {}): Record<string, number> {
  return { ...overrides }
}

// ─── Tetiklenme koşulları (fallback mod — sector yok) ─────────────────────────

describe('buildMaturityMismatchInsight — tetiklenme (fallback)', () => {
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

  test('KV/UV oranı tam 1.5 eşiğinde (fallback) → low severity döner', () => {
    const balances = makeBalances({
      '320': 7_500_000,   // KV = 7.5M
      '400': 5_000_000,   // UV = 5M → oran = 1.5
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('low')
  })
})

// ─── Severity — fallback mod (KV/UV oran) ────────────────────────────────────

describe('buildMaturityMismatchInsight — severity fallback (KV/UV)', () => {
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

// ─── Severity — cari oran sapması (yeni mod, sector ile) ─────────────────────

describe('buildMaturityMismatchInsight — severity cari oran (sector)', () => {
  // Ortak fixture helper: CONSTRUCTION → sectorCurrentRatio = 1.50
  // '320' (KV ticari borç) + '102' (dönen varlık) ile ratio manipüle edilir
  // stLiabilities = getStLiabilities(balances) — KV pasif hesaplar

  test('Sapma 0.05 (< 0.10) → null döner (insight yok)', () => {
    // stLiabilities = 10M, currentAssets = 14.5M → firmCR = 1.45, sapma = 0.05
    const balances = makeBalances({
      '320': 10_000_000,  // KV (stLiabilities)
      '102': 14_500_000,  // dönen varlık
    })
    expect(buildMaturityMismatchInsight(balances, 'CONSTRUCTION')).toBeNull()
  })

  test('Sapma 0.20 → low severity', () => {
    // stLiabilities = 10M, currentAssets = 13M → firmCR = 1.30, sapma = 0.20
    const balances = makeBalances({
      '320': 10_000_000,  // KV
      '102': 13_000_000,  // dönen varlık
    })
    const result = buildMaturityMismatchInsight(balances, 'CONSTRUCTION')
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('low')
  })

  test('Sapma 0.40 → medium severity', () => {
    // stLiabilities = 10M, currentAssets = 11M → firmCR = 1.10, sapma = 0.40
    const balances = makeBalances({
      '320': 10_000_000,  // KV
      '102': 11_000_000,  // dönen varlık
    })
    const result = buildMaturityMismatchInsight(balances, 'CONSTRUCTION')
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('medium')
  })

  test('Sapma 0.53 (DEKAM) → high severity', () => {
    // stLiabilities = 41.6M, currentAssets = 40.352M → firmCR ≈ 0.97, sapma ≈ 0.53
    const balances = makeBalances({
      '300':  5_400_000,   // KV banka
      '320':  6_500_000,   // KV satıcılar
      '340': 29_700_000,   // KV avans (stLiabilities = 41.6M)
      '102': 40_352_000,   // dönen varlık → firmCR ≈ 0.97
    })
    const result = buildMaturityMismatchInsight(balances, 'CONSTRUCTION')
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('high')
  })

  test('Sapma 1.00 → high severity', () => {
    // stLiabilities = 10M, currentAssets = 5M → firmCR = 0.50, sapma = 1.00
    const balances = makeBalances({
      '320': 10_000_000,
      '102':  5_000_000,
    })
    const result = buildMaturityMismatchInsight(balances, 'CONSTRUCTION')
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('high')
  })

  test('Cari oran sektör üzerinde (negatif sapma) → null döner', () => {
    // stLiabilities = 10M, currentAssets = 20M → firmCR = 2.00 > 1.50
    const balances = makeBalances({
      '320': 10_000_000,
      '102': 20_000_000,
    })
    expect(buildMaturityMismatchInsight(balances, 'CONSTRUCTION')).toBeNull()
  })

  test('Sector parametresi yok → fallback KV/UV mantığı', () => {
    // UV=0 → fallback devreye girer → high
    const balances = makeBalances({
      '320': 10_000_000,  // KV = 10M, UV = 0
    })
    const result = buildMaturityMismatchInsight(balances)   // sector yok
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('high')
  })
})

// ─── Mesaj formatı (cari oran modu) ──────────────────────────────────────────

describe('buildMaturityMismatchInsight — mesaj formatı (sector)', () => {
  // CONSTRUCTION → sectorCurrentRatio = 1.50

  test('high severity mesajı "belirgin baskı yaratıyor" içerir', () => {
    const balances = makeBalances({
      '320': 10_000_000,
      '102':  5_000_000,  // firmCR = 0.50, sapma = 1.00 → high
    })
    const result = buildMaturityMismatchInsight(balances, 'CONSTRUCTION')
    expect(result!.message).toContain('belirgin baskı yaratıyor')
  })

  test('medium severity mesajı "ortalamadan ağır" içerir', () => {
    const balances = makeBalances({
      '320': 10_000_000,
      '102': 11_000_000,  // firmCR = 1.10, sapma = 0.40 → medium
    })
    const result = buildMaturityMismatchInsight(balances, 'CONSTRUCTION')
    expect(result!.message).toContain('ortalamadan ağır')
  })

  test('low severity mesajı "hafif sapma" içerir', () => {
    const balances = makeBalances({
      '320': 10_000_000,
      '102': 13_000_000,  // firmCR = 1.30, sapma = 0.20 → low
    })
    const result = buildMaturityMismatchInsight(balances, 'CONSTRUCTION')
    expect(result!.message).toContain('hafif sapma')
  })

  test('Mesaj cari oran değerini "0.50" formatında içerir (high, 2 ondalık)', () => {
    const balances = makeBalances({
      '320': 10_000_000,
      '102':  5_000_000,  // firmCR = 0.50
    })
    const result = buildMaturityMismatchInsight(balances, 'CONSTRUCTION')
    expect(result!.message).toContain('0.50')
    expect(result!.message).toContain('1.50')  // sektör oranı
  })
})

// ─── recommendedActions filtreleme ───────────────────────────────────────────

describe('buildMaturityMismatchInsight — recommendedActions', () => {
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
      '320': 10_000_000,
      '331': 0,
      '400': 0,
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    const ids = result!.recommendedActions.map(a => a.actionId)
    expect(ids).not.toContain('A15B_SHAREHOLDER_DEBT_TO_LT')
  })

  test('Tüm kaynak bakiyeler eşik altında → null insight döner', () => {
    const balances = makeBalances({
      '300':   500_000,   // A01 min = 1M → eşik altı
      '320': 2_000_000,   // A02 min = 3M → eşik altı
      '340': 1_500_000,   // A03 min = 2M → eşik altı
      '331':   500_000,   // A15B min = 1M → eşik altı
      // KV toplam = 4.5M < 5M threshold → zaten null
    })
    expect(buildMaturityMismatchInsight(balances)).toBeNull()
  })

  test('recommendedActions bakiye büyükten küçüğe sıralı', () => {
    const balances = makeBalances({
      '300':  2_000_000,
      '320':  8_000_000,
      '340':  5_000_000,
      '331':  1_500_000,
      '400':  0,
    })
    const result = buildMaturityMismatchInsight(balances)
    expect(result).not.toBeNull()
    const bals = result!.recommendedActions.map(a => a.sourceBalance)
    for (let i = 0; i < bals.length - 1; i++) {
      expect(bals[i]).toBeGreaterThanOrEqual(bals[i + 1])
    }
  })
})

// ─── DEKAM fixture (fallback mod) ────────────────────────────────────────────

describe('buildMaturityMismatchInsight — DEKAM fixture (fallback)', () => {
  const DEKAM_BALANCES = {
    '300':  5_400_000,
    '320':  6_500_000,
    '340': 29_700_000,
    '331':          0,
    '400':  5_000_000,
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

  test('DEKAM fallback: ratio ≈ 8.32 → high severity', () => {
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
    expect(ids[0]).toBe('A03_ADVANCE_TO_LT')
    expect(ids[1]).toBe('A02_TRADE_PAYABLE_TO_LT')
    expect(ids[2]).toBe('A01_ST_FIN_DEBT_TO_LT')
    expect(ids).not.toContain('A15B_SHAREHOLDER_DEBT_TO_LT')
  })

  test('DEKAM fallback: message high severity ("kritik") içeriyor', () => {
    const result = buildMaturityMismatchInsight(DEKAM_BALANCES)
    expect(result!.message).toContain('kritik')
  })
})

// ─── DEKAM cari oran modu ────────────────────────────────────────────────────

describe('buildMaturityMismatchInsight — DEKAM cari oran modu (CONSTRUCTION)', () => {
  // stLiabilities = 41.6M (KV pasif)
  // currentAssets = 40.352M → firmCR ≈ 0.97
  // sectorCurrentRatio (CONSTRUCTION/inşaat) = 1.50
  // sapma = 1.50 - 0.97 = 0.53 → high
  const DEKAM_WITH_ASSETS = {
    '300':  5_400_000,
    '320':  6_500_000,
    '340': 29_700_000,
    '331':          0,
    '400':  5_000_000,
    '420':          0,
    '440':          0,
    '431':          0,
    '102': 40_352_000,   // dönen varlık → firmCR ≈ 0.97
  }

  test('DEKAM cari oran: firmCR ≈ 0.97, sektör 1.50, sapma 0.53 → high', () => {
    const result = buildMaturityMismatchInsight(DEKAM_WITH_ASSETS, 'CONSTRUCTION')
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('high')
  })

  test('DEKAM cari oran: mesaj "1.50" ve "0.97" içerir', () => {
    const result = buildMaturityMismatchInsight(DEKAM_WITH_ASSETS, 'CONSTRUCTION')
    expect(result!.message).toContain('1.50')
    // firmCR = 40352000 / 41600000 ≈ 0.97
    expect(result!.message).toMatch(/0\.9[0-9]/)  // 0.97 ± floating
  })

  test('DEKAM cari oran: mesaj "belirgin baskı yaratıyor" içerir', () => {
    const result = buildMaturityMismatchInsight(DEKAM_WITH_ASSETS, 'CONSTRUCTION')
    expect(result!.message).toContain('belirgin baskı yaratıyor')
  })

  test('DEKAM cari oran: recommendedActions korunuyor (A03 > A02 > A01)', () => {
    const result = buildMaturityMismatchInsight(DEKAM_WITH_ASSETS, 'CONSTRUCTION')
    const ids = result!.recommendedActions.map(a => a.actionId)
    expect(ids[0]).toBe('A03_ADVANCE_TO_LT')
    expect(ids[1]).toBe('A02_TRADE_PAYABLE_TO_LT')
    expect(ids[2]).toBe('A01_ST_FIN_DEBT_TO_LT')
  })
})
