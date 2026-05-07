/**
 * whyCapitalAloneNotEnough.test.ts — "Atıl Varlık" UI Metin Bug Fix (Faz 7.3.43X)
 *
 * HATA: buildWhyCapitalAloneNotEnough fonksiyonu
 *   trappedAssetsShare > 0.60 olduğunda "%X atıl durumda" yazıyordu.
 *   Sorunlar:
 *   1. trappedAssetsShare "çalışma sermayesi kilitlenmesi" anlamında,
 *      "atıl varlık" değil — mali müşavir gözüyle yanlış.
 *   2. Clamp yok → DEKAM'da %97, %103 gibi değerler üretiyordu.
 *   3. 350/358 LIABILITY hesapları input'a girince formül daha da bozuyor.
 *
 * DÜZELTME:
 *   "Varlıkların %X'i atıl durumda" cümlesi kaldırıldı.
 *   Yerine: aktif devir hızı + sektör beklentisi bazlı profesyonel metin.
 *
 * T1: "atıl" stringi metin içinde geçmez (trapped=0.97)
 * T2: "%100+" hiçbir koşulda yazılmaz (trapped=1.03)
 * T3: Yeni metin — "Aktif devir hızı %X (sektör beklentisi %Y)"
 * T4: DEKAM-benzeri senaryo (salesToAssets=0.045, sectorExpected=0.35)
 * T5: Sektör beklentisi yoksa alternatif metin (sadece devir hızı)
 * T6: salesToAssets undefined ise bu cümle hiç eklenmez
 */

import { buildDecisionAnswer } from '../decisionLayer'

// ─── Stub Helper ─────────────────────────────────────────────────────────────

function makeStubEngineResult(productivity: {
  productivityScore: number
  metrics: { trappedAssetsShare: number; salesToAssets?: number }
  inefficiencyFlags?: Array<{ type: string; severity: string; description: string }>
  sectorExpectations?: { salesToAssets?: { expected: number } }
}) {
  const emptyNotchScenario = {
    targetRating: null, achievable: false,
    requiredActions: [], totalAmount: 0, narrative: '',
  }
  return {
    version:            'v3',
    sector:             'MANUFACTURING',
    currentRating:      'B',
    rawTargetRating:    'BB',
    finalTargetRating:  'BB',
    notchesGained:      0,
    confidence:         'LOW',
    confidenceModifier: 1,
    horizons: {
      short:  { actions: [], totalAmount: 0 },
      medium: { actions: [], totalAmount: 0 },
      long:   { actions: [], totalAmount: 0 },
    },
    portfolio: [],
    reasoning: {
      bindingCeiling:      null,
      supportingCeilings:  [],
      drivers:             null,
      missedOpportunities: [],
      oneNotchScenario:    emptyNotchScenario,
      twoNotchScenario:    emptyNotchScenario,
      sensitivityAnalysis: null,
      bankerSummary:       '',
      transition:          null,
    },
    layerSummaries: {
      productivity: {
        productivityScore: productivity.productivityScore,
        metrics:           productivity.metrics,
        inefficiencyFlags: productivity.inefficiencyFlags ?? [],
        sectorExpectations: productivity.sectorExpectations,
      },
      sustainability: null,
      sector:         null,
      guardrails:     [],
    },
    decisionTrace: [],
    debug: {
      iterations:         0,
      rejectedCandidates: [],
      ledgerChangeLog:    [],
      algorithmTrace:     [],
    },
  }
}

// ─── T1: "atıl" kelimesi artık çıkmaz ────────────────────────────────────────

describe('T1 — "atıl" stringi metin içinde geçmez (Faz 7.3.43X)', () => {

  test('T1: trapped=0.97 → "atıl" kelimesi yok', () => {
    const stub = makeStubEngineResult({
      productivityScore:  0.20,
      metrics:            { trappedAssetsShare: 0.97, salesToAssets: 0.045 },
      sectorExpectations: { salesToAssets: { expected: 0.35 } },
    })
    const da   = buildDecisionAnswer(stub as any, 'B')
    const text = da.whyCapitalAloneIsNotEnough
    expect(text).not.toMatch(/atıl/i)
  })

})

// ─── T2: "%100+" hiçbir koşulda yazılmaz ─────────────────────────────────────

describe('T2 — trappedAssetsShare > 1.0 olsa bile %100+ yazılmaz (Faz 7.3.43X)', () => {

  test('T2: trapped=1.03 (eski %103 senaryosu) → üç haneli % yok', () => {
    const stub = makeStubEngineResult({
      productivityScore:  0.10,
      metrics:            { trappedAssetsShare: 1.03, salesToAssets: 0.045 },
      sectorExpectations: { salesToAssets: { expected: 0.35 } },
    })
    const da   = buildDecisionAnswer(stub as any, 'B')
    const text = da.whyCapitalAloneIsNotEnough
    // İki veya üç haneli % değeri olmamalı
    expect(text).not.toMatch(/%1\d{2}/)   // %100–%199
    expect(text).not.toMatch(/%\d{3,}/)  // %1000+
  })

})

// ─── T3: Yeni metin — aktif devir hızı + sektör beklentisi ───────────────────

describe('T3 — Yeni metin: "Aktif devir hızı %X (sektör beklentisi %Y)" (Faz 7.3.43X)', () => {

  test('T3: salesToAssets=0.045, sectorExpected=0.35 → tam metin çıkar', () => {
    const stub = makeStubEngineResult({
      productivityScore:  0.20,
      metrics:            { trappedAssetsShare: 0.97, salesToAssets: 0.045 },
      sectorExpectations: { salesToAssets: { expected: 0.35 } },
    })
    const da   = buildDecisionAnswer(stub as any, 'B')
    const text = da.whyCapitalAloneIsNotEnough

    expect(text).toMatch(/aktif devir hızı/i)
    expect(text).toMatch(/sektör beklentisi/i)
    // 0.045 × 100 = 4.5 → "%4.5"
    expect(text).toMatch(/%4\.5/)
    // 0.35 × 100 = 35 → "%35"
    expect(text).toMatch(/%35/)
  })

})

// ─── T4: DEKAM-benzeri senaryo ───────────────────────────────────────────────

describe('T4 — DEKAM-benzeri senaryo (düşük aktif devir hızı)', () => {

  test('T4: DEKAM profili — aktif devir hızı düşük, sektör beklentisi ile karşılaştırma', () => {
    // DEKAM: ~357M aktif, ~200M satış → salesToAssets ≈ 0.56
    // Gerçek DEKAM salesToAssets ~0.56 olabilir ama beklenti 0.87 (İmalat)
    const stub = makeStubEngineResult({
      productivityScore:  0.25,
      metrics:            { trappedAssetsShare: 0.80, salesToAssets: 0.56 },
      sectorExpectations: { salesToAssets: { expected: 0.87 } },
    })
    const da   = buildDecisionAnswer(stub as any, 'B')
    const text = da.whyCapitalAloneIsNotEnough

    expect(text).not.toMatch(/atıl/i)
    expect(text).toMatch(/aktif devir hızı/i)
    // 0.56 × 100 = 56.0 → "%56.0"
    expect(text).toMatch(/%56\.0/)
    // 0.87 × 100 = 87 → "%87"
    expect(text).toMatch(/%87/)
  })

})

// ─── T5: Sektör beklentisi yoksa alternatif metin ────────────────────────────

describe('T5 — Sektör beklentisi undefined → alternatif metin (sadece devir hızı)', () => {

  test('T5a: sectorExpectations undefined → sadece firma değeri yazar', () => {
    const stub = makeStubEngineResult({
      productivityScore: 0.20,
      metrics:           { trappedAssetsShare: 0.70, salesToAssets: 0.12 },
      // sectorExpectations verilmedi
    })
    const da   = buildDecisionAnswer(stub as any, 'B')
    const text = da.whyCapitalAloneIsNotEnough

    expect(text).not.toMatch(/atıl/i)
    expect(text).toMatch(/aktif devir hızı/i)
    expect(text).not.toMatch(/sektör beklentisi/i)  // alternatif kol
    // 0.12 × 100 = 12.0 → "%12.0"
    expect(text).toMatch(/%12\.0/)
    // Crash yok
    expect(() => buildDecisionAnswer(stub as any, 'B')).not.toThrow()
  })

  test('T5b: sectorExpectations.salesToAssets.expected = 0 → alternatif kol', () => {
    const stub = makeStubEngineResult({
      productivityScore:  0.20,
      metrics:            { trappedAssetsShare: 0.70, salesToAssets: 0.12 },
      sectorExpectations: { salesToAssets: { expected: 0 } },  // sıfır → alternatif
    })
    const da   = buildDecisionAnswer(stub as any, 'B')
    const text = da.whyCapitalAloneIsNotEnough

    expect(text).not.toMatch(/sektör beklentisi/i)
    expect(text).toMatch(/aktif devir hızı/i)
  })

})

// ─── T6: salesToAssets undefined → cümle hiç eklenmez ───────────────────────

describe('T6 — salesToAssets undefined → aktif devir hızı cümlesi hiç eklenmez', () => {

  test('T6: metrics.salesToAssets yok → sadece productivityScore cümlesi', () => {
    const stub = makeStubEngineResult({
      productivityScore: 0.20,
      metrics:           { trappedAssetsShare: 0.90 },  // salesToAssets yok
      sectorExpectations: { salesToAssets: { expected: 0.35 } },
    })
    const da   = buildDecisionAnswer(stub as any, 'B')
    const text = da.whyCapitalAloneIsNotEnough

    expect(text).not.toMatch(/atıl/i)
    expect(text).not.toMatch(/aktif devir hızı/i)  // cümle eklenmedi
    // Ama productivityScore cümlesi hâlâ var
    expect(text).toMatch(/varlık verimliliği/i)
    expect(text.length).toBeGreaterThan(10)
    // Crash yok
    expect(() => buildDecisionAnswer(stub as any, 'B')).not.toThrow()
  })

})
