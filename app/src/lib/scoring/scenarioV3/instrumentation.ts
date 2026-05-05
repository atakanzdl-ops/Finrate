/**
 * instrumentation.ts — Engine Enstrümantasyon Yardımcıları (Faz 7.3.38)
 *
 * Engine'e dokunmadan observability sağlar.
 *
 * Kullanım:
 *   buildDiagnostics(engineResult, requestedTarget, currentCombinedScore, ...)
 *   → DiagnosticsPayload (JSON-serializable)
 *
 *   serializeDiagnostics(payload) → deterministik JSON string
 *   compareWithSonnet(actual, reference) → DiffReport
 *
 * testEnvironment: 'node' — saf fonksiyonlar, React/jsdom yok.
 * engineV3.ts/contracts.ts import edilmez — doğrudan okuma yasak olmasa da
 * bağımlılığı sıfır tutmak için any cast kullanılır.
 */

// ─── DiagnosticsPayload ───────────────────────────────────────────────────────

/**
 * Engine çıktısından toplanan gözlemlenebilirlik verisi.
 * JSON fixture olarak kaydedilir; Sonnet referansıyla karşılaştırılır.
 */
export interface DiagnosticsPayload {
  /** Deterministik ID: "COMPANY-PERIOD-target-RATING" */
  scenarioId: string
  company?: string
  period?: string
  requestedTarget: string
  current: {
    combinedScore: number | null
    rating: string
  }
  actions: Array<{
    code: string
    estimatedNotchContribution: number
    cost: number
  }>
  post: {
    combinedScore: number | null
    actualRating: string | null
    engineAchievableTarget: string
  }
  constraints: {
    bindingCeiling: string | null
    guardrails: string[]
  }
  decision: {
    notchesGained: number
    reachedTarget: boolean
    sourceMismatch: boolean
  }
}

// ─── SonnetReference ─────────────────────────────────────────────────────────

/** Sonnet'in manuel analiz referansı (fixtures/sonnet-reference/*.json şeması) */
export interface SonnetReference {
  company: string
  period: string
  requestedTarget: string
  sonnetNotchesGained: number
  sonnetActions: Array<{
    code: string
    estimatedNotchContribution: number
    cost?: number
  }>
  notes?: string
}

// ─── DiffReport ───────────────────────────────────────────────────────────────

/** Engine vs Sonnet karşılaştırma raporu */
export interface DiffReport {
  /** sonnetNotchesGained − engineNotchesGained */
  notchGap: number
  /** Sonnet'te var, engine portföyünde yok */
  missingActions: string[]
  /** Engine portföyünde var, Sonnet'te yok */
  extraActions: string[]
  reachedTargetEngine: boolean
  sonnetNotchesGained: number
  engineNotchesGained: number
}

// ─── buildDiagnostics ─────────────────────────────────────────────────────────

/**
 * EngineResult + bağlam verisinden DiagnosticsPayload üretir.
 *
 * @param engineResult        - runEngineV3 çıktısı (any — import bağımlılığı sıfır)
 * @param requestedTarget     - kullanıcı hedef rating string'i
 * @param currentCombinedScore - route.ts'te hesaplanan mevcut kombine skor
 * @param postCombinedScore   - actualRatingValidation.postCombinedScore
 * @param postActualRating    - actualRatingValidation.postActualRating
 * @param opts                - opsiyonel şirket/dönem meta verisi
 */
export function buildDiagnostics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engineResult: any,
  requestedTarget: string,
  currentCombinedScore: number | null = null,
  postCombinedScore: number | null = null,
  postActualRating: string | null = null,
  opts: { company?: string; period?: string } = {},
): DiagnosticsPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portfolio: any[] = Array.isArray(engineResult?.portfolio) ? engineResult.portfolio : []

  // Binding ceiling → "SOURCE:maxRating" formatında
  const bc = engineResult?.reasoning?.bindingCeiling as
    | { source?: string; maxRating?: string }
    | null
    | undefined
  const bindingCeiling = bc?.source
    ? `${bc.source}:${bc.maxRating ?? '?'}`
    : null

  // Guardrail listesi — layerSummaries.guardrails (array of unknown objects)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawGuardrails: any[] = Array.isArray(engineResult?.layerSummaries?.guardrails)
    ? engineResult.layerSummaries.guardrails
    : []
  const guardrails: string[] = rawGuardrails
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((g: any) => {
      if (typeof g === 'string') return g
      if (g && typeof g === 'object') return g.ruleCode ?? g.message ?? JSON.stringify(g)
      return null
    })
    .filter((s): s is string => s !== null && s !== '')

  const notchesGained: number = typeof engineResult?.notchesGained === 'number'
    ? engineResult.notchesGained
    : 0

  const finalTargetRating: string = String(engineResult?.finalTargetRating ?? '')

  const scenarioId = [
    opts.company ?? 'UNKNOWN',
    opts.period   ?? 'UNKNOWN',
    `target-${requestedTarget}`,
  ].join('-')

  return {
    scenarioId,
    ...(opts.company !== undefined ? { company: opts.company } : {}),
    ...(opts.period  !== undefined ? { period: opts.period }   : {}),
    requestedTarget,
    current: {
      combinedScore: currentCombinedScore,
      rating:        String(engineResult?.currentRating ?? ''),
    },
    actions: portfolio.map(a => ({
      code:                       String(a?.actionId ?? ''),
      estimatedNotchContribution: Number(a?.estimatedNotchContribution ?? 0),
      cost:                       Number(a?.amountTRY ?? 0),
    })),
    post: {
      combinedScore:          postCombinedScore,
      actualRating:           postActualRating,
      engineAchievableTarget: finalTargetRating,
    },
    constraints: {
      bindingCeiling,
      guardrails,
    },
    decision: {
      notchesGained,
      reachedTarget: notchesGained > 0,
      sourceMismatch: false,
    },
  }
}

// ─── serializeDiagnostics ─────────────────────────────────────────────────────

/**
 * DiagnosticsPayload → deterministik JSON string.
 *
 * Top-level key sıralaması alfabetik → fixture karşılaştırmaları için kararlı.
 * İç nesneler sıralanmaz (JSON.stringify deterministik — JS runtime'da sabit sıralı).
 */
export function serializeDiagnostics(payload: DiagnosticsPayload): string {
  const sortedKeys = Object.keys(payload).sort() as Array<keyof DiagnosticsPayload>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordered: Record<string, any> = {}
  for (const k of sortedKeys) {
    ordered[k] = payload[k]
  }
  return JSON.stringify(ordered, null, 2)
}

// ─── compareWithSonnet ────────────────────────────────────────────────────────

/**
 * Engine diagnostics payload ile Sonnet manuel referansını karşılaştırır.
 *
 * @returns DiffReport — notch gap, eksik/fazla aksiyonlar
 */
export function compareWithSonnet(
  actual: DiagnosticsPayload,
  reference: SonnetReference,
): DiffReport {
  const engineCodes = new Set(actual.actions.map(a => a.code))
  const sonnetCodes = new Set(reference.sonnetActions.map(a => a.code))

  const missingActions = reference.sonnetActions
    .map(a => a.code)
    .filter(c => !engineCodes.has(c))

  const extraActions = actual.actions
    .map(a => a.code)
    .filter(c => !sonnetCodes.has(c))

  return {
    notchGap:             reference.sonnetNotchesGained - actual.decision.notchesGained,
    missingActions,
    extraActions,
    reachedTargetEngine:  actual.decision.reachedTarget,
    sonnetNotchesGained:  reference.sonnetNotchesGained,
    engineNotchesGained:  actual.decision.notchesGained,
  }
}
