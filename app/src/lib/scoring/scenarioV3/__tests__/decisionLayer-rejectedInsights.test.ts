/**
 * Faz 7.3.6A7 — buildRejectedInsights dedupe + toFriendlyRejectReason testleri.
 *
 * buildRejectedInsights doğrudan export edilmediği için
 * toFriendlyRejectReason helper'ı ayrıca test edilir;
 * dedupe mantığı EngineResult mock'u üzerinden doğrulanır.
 *
 * Faz 7.3.19 — enginePortfolioCount / rejectedInsightCount meta alanları (T_EP1, T_EP2).
 */

import { toFriendlyRejectReason, buildDecisionAnswer } from '../decisionLayer'

// ─── toFriendlyRejectReason ───────────────────────────────────────────────────

describe('toFriendlyRejectReason — raw → friendly eşleme', () => {
  it('Horizon short desteklenmiyor → Bu vade için uygun değil.', () => {
    expect(toFriendlyRejectReason('Horizon short desteklenmiyor'))
      .toBe('Bu vade için uygun değil.')
  })

  it('Kaynak hesap 331 bakiyesi yok → Gerekli kaynak hesap bakiyesi bulunmuyor.', () => {
    expect(toFriendlyRejectReason('Kaynak hesap 331 bakiyesi yok'))
      .toBe('Gerekli kaynak hesap bakiyesi bulunmuyor.')
  })

  it('Kaynak bakiye yetersiz → Kaynak hesap bakiyesi yetersiz.', () => {
    expect(toFriendlyRejectReason('Kaynak bakiye yetersiz — min 1.000.000 TL'))
      .toBe('Kaynak hesap bakiyesi yetersiz.')
  })

  it('sektoru icin uygulanamaz → Sektör koşulu sağlanmadı.', () => {
    expect(toFriendlyRejectReason('MANUFACTURING sektoru icin uygulanamaz'))
      .toBe('Sektör koşulu sağlanmadı.')
  })

  it('customCheck basarisiz: özel gerekçe → gerekçeyi döner', () => {
    expect(toFriendlyRejectReason('customCheck basarisiz: Net nakit bakiyesi 500K altında'))
      .toBe('Net nakit bakiyesi 500K altında')
  })

  it('customCheck basarisiz ama gerekçe yok → fallback mesaj', () => {
    expect(toFriendlyRejectReason('customCheck basarisiz'))
      .toBe('Aksiyon koşulu sağlanmadı.')
  })

  it('no valid amount candidates → Uygulanabilir tutar üretilemedi.', () => {
    expect(toFriendlyRejectReason('no valid amount candidates for A05'))
      .toBe('Uygulanabilir tutar üretilemedi.')
  })

  it('Aggregate guardrail → Toplu kural nedeniyle uygun değil.', () => {
    expect(toFriendlyRejectReason('Aggregate guardrail: PORTFOLIO_EQUITY_INFLATION'))
      .toBe('Toplu kural nedeniyle uygun değil.')
  })

  it('bilinmeyen gerekçe → fallback döner', () => {
    expect(toFriendlyRejectReason('tamamen bilinmeyen bir gerekçe'))
      .toBe('Bu aksiyon mevcut veriyle uygun görülmedi.')
  })
})

// ─── Faz 7.3.19: enginePortfolioCount / rejectedInsightCount ──────────────────

/**
 * Minimal SelectedAction-like stub (typed as any to avoid import complexity).
 * transactions: [] → buildAccountingImpactTable hiçbir satır üretmez.
 */
function makeStubAction(actionId: string, amountTRY: number): any {
  return {
    actionId,
    actionName:                 actionId,
    horizon:                    'short',
    amountTRY,
    transactions:               [],
    qualityScore:               1,
    productivityRepairStrength: 'STRONG',
    sustainability:             'RECURRING',
    sectorCompatibility:        1,
    guardrailSeverity:          'NONE',
    estimatedNotchContribution: 1,
    repeatDecayApplied:         1,
    diversityPenaltyApplied:    1,
    narrative:                  '',
  }
}

/**
 * Minimal EngineResult stub — tüm sub-builder'ların null-safe olduğu varsayılır.
 * - reasoning.oneNotchScenario / twoNotchScenario: requiredActions=[] ile sağlanır
 * - layerSummaries.productivity: null → buildWhyCapitalAloneNotEnough fallback döner
 */
function makeStubEngineResult(overrides: {
  portfolio?:           any[]
  rejectedCandidates?:  Array<{ actionId: string; reason: string }>
} = {}): any {
  const emptyNotchScenario = {
    requiredActions: [],
    isAchievable:    false,
    blockedBy:       null,
    narrative:       '',
  }
  return {
    version:            'v3',
    sector:             'MANUFACTURING',
    currentRating:      'CCC',
    rawTargetRating:    'B',
    finalTargetRating:  'B',
    notchesGained:      0,
    confidence:         'LOW',
    confidenceModifier: 1,
    horizons: {
      short:  { actions: [], totalAmount: 0 },
      medium: { actions: [], totalAmount: 0 },
      long:   { actions: [], totalAmount: 0 },
    },
    portfolio: overrides.portfolio ?? [],
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
      productivity:   null,
      sustainability: null,
      sector:         null,
      guardrails:     [],
    },
    decisionTrace: [],
    debug: {
      iterations:         0,
      rejectedCandidates: overrides.rejectedCandidates ?? [],
      ledgerChangeLog:    [],
      algorithmTrace:     [],
    },
  }
}

describe('buildDecisionAnswer — enginePortfolioCount / rejectedInsightCount (Faz 7.3.19)', () => {

  // T_EP1: enginePortfolioCount = deduped portfolio uzunluğu (targetPackage öncesi)
  test('T_EP1 — enginePortfolioCount = deduped engine portfolio aksiyon sayısı', () => {
    const engineResult = makeStubEngineResult({
      portfolio: [
        makeStubAction('A10', 1_000_000),
        makeStubAction('A11', 2_000_000),
        makeStubAction('A10', 1_000_000),  // tam eşleşme → dedupeActions kaldırır
      ],
    })
    const da = buildDecisionAnswer(engineResult as any, 'B')
    // dedupeActions(portfolio).length: A10 (1M dup kaldırıldı) + A11 = 2
    expect(da.enginePortfolioCount).toBe(2)
  })

  // T_EP2: rejectedInsightCount = rejectedInsights.length (grouplanmış unique actionId sayısı)
  test('T_EP2 — rejectedInsightCount = benzersiz reddedilen aksiyon sayısı', () => {
    const engineResult = makeStubEngineResult({
      portfolio: [],
      rejectedCandidates: [
        { actionId: 'A01_ST_FIN_DEBT_TO_LT', reason: 'Kaynak bakiye yetersiz — min 1.000.000 TL' },
        { actionId: 'A01_ST_FIN_DEBT_TO_LT', reason: 'Horizon short desteklenmiyor' },  // aynı actionId → gruplanır
        { actionId: 'A05_RECEIVABLE_COLLECTION', reason: 'sektoru icin uygulanamaz' },   // farklı actionId → ayrı insight
      ],
    })
    const da = buildDecisionAnswer(engineResult as any, 'B')
    // A01 (2 giriş → 1 insight) + A05 (1 giriş → 1 insight) = 2
    expect(da.rejectedInsightCount).toBe(2)
    expect(da.rejectedInsights).toHaveLength(2)
    // Convenience alias ile doğrudan length eşleşmeli
    expect(da.rejectedInsightCount).toBe(da.rejectedInsights.length)
  })
})

// ─── Faz 7.3.20: buildWhyCapitalAloneNotEnough — ham flag.type sızıntısı ─────

describe('buildDecisionAnswer — whyCapitalAloneIsNotEnough INEFFICIENCY_NARRATIVES (Faz 7.3.20)', () => {

  // T_F1: CRITICAL flag var → whyCapitalAloneIsNotEnough ham flag.type içermez
  test('T_F1 — CRITICAL flag.type UI\'ye sızmaz; INEFFICIENCY_NARRATIVES description kullanılır', () => {
    const engineResult = makeStubEngineResult({
      portfolio: [],
    })
    // layerSummaries.productivity stub: OPERATING_YIELD_GAP CRITICAL flag
    engineResult.layerSummaries.productivity = {
      productivityScore: 0.20,            // < 0.30 → ilk parts.push tetiklenir
      metrics:           { trappedAssetsShare: 0.30 },
      inefficiencyFlags: [
        {
          type:        'OPERATING_YIELD_GAP',
          severity:    'CRITICAL',
          description: 'Faaliyet kârı / aktif oranı sektör ortalamasının altında',
        },
      ],
    }

    const da = buildDecisionAnswer(engineResult as any, 'B')
    const text = da.whyCapitalAloneIsNotEnough

    // Ham flag.type kesinlikle olmamalı
    expect(text).not.toContain('OPERATING_YIELD_GAP')
    // "type: description" pattern olmamalı
    expect(text).not.toMatch(/OPERATING_YIELD_GAP\s*:/)
    // INEFFICIENCY_NARRATIVES description'ından bir parça olmalı
    // OPERATING_YIELD_GAP.description başlangıcı: "Operasyonel kârın aktif büyüklüğüne..."
    expect(text).toContain('Operasyonel kârın')
  })
})
