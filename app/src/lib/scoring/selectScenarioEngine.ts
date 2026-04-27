/**
 * selectScenarioEngine — Faz 6b / Faz 7.1B
 *
 * ENABLE_MULTI_SCENARIO_V3=true → generateScenarios (v3) + fallback to runEngineV3 (v2)
 * ENABLE_MULTI_SCENARIO_V3=false → runEngineV3 (v2, production default)
 *
 * Rollback: Vercel env flag kaldır → instant fallback
 * Production aktivasyonu: Faz 8
 */

import type { EngineInput, EngineResult } from './scenarioV3/engineV3'
import type { ScenarioV3 }               from './scenarioV3/contracts'

import { isMultiScenarioV3Enabled }                              from './sectorStrategy/featureFlags'
import { generateScenarios }                                     from './scenarioV3/scenarioGenerator'
import { runEngineV3 }                                           from './scenarioV3/engineV3'
import { adaptScenariosV3ToEngineResult, isEngineResultLike }    from './scenarioV3/adaptToEngineResult'
import { logEvent, generateCorrelationId }                       from '../logger'

// ─── PRIVATE HELPER ───────────────────────────────────────────────────────────

async function runScenarioEngineSelection(
  input: EngineInput,
): Promise<{ engineResult: EngineResult; scenarios: ScenarioV3[] }> {
  if (isMultiScenarioV3Enabled()) {
    const correlationId = generateCorrelationId()
    const startTime = Date.now()
    let v3Error: Error | undefined

    try {
      const scenarios = await generateScenarios(input)
      const result = adaptScenariosV3ToEngineResult(scenarios, input)
      if (!isEngineResultLike(result)) {
        throw new Error('Scenario adapter output is not compatible with EngineResult contract')
      }
      logEvent('engine_selected', { engine: 'v3', correlationId, latency_ms: Date.now() - startTime })
      return { engineResult: result, scenarios }
    } catch (err) {
      v3Error = err as Error
      logEvent('engine_error', { engine: 'v3', error: v3Error.message, correlationId })
      logEvent('fallback', { from: 'v3', to: 'v2', reason: v3Error.message, correlationId })

      try {
        const result = await runEngineV3(input)
        logEvent('engine_selected', { engine: 'v2-fallback', correlationId, latency_ms: Date.now() - startTime })
        return { engineResult: result, scenarios: [] }
      } catch (v2Err) {
        logEvent('engine_error', { engine: 'v2', error: (v2Err as Error).message, correlationId, after_fallback: true })
        logEvent('engine_double_fail', {
          correlationId,
          v3_error: v3Error.message,
          v2_error: (v2Err as Error).message,
        })
        throw v3Error  // ORIGINAL v3 error
      }
    }
  } else {
    const startTime = Date.now()
    const result = await runEngineV3(input)
    logEvent('engine_selected', { engine: 'v2', latency_ms: Date.now() - startTime })
    return { engineResult: result, scenarios: [] }
  }
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/** Eski public kontrat — sadece engineResult döner (geriye uyumlu). */
export async function selectScenarioEngine(input: any): Promise<any> {
  const { engineResult } = await runScenarioEngineSelection(input)
  return engineResult
}

/** Yeni public wrapper — { engineResult, scenarios } döner (Faz 7.1B). */
export async function selectScenarioEngineWithScenarios(
  input: EngineInput,
): Promise<{ engineResult: EngineResult; scenarios: ScenarioV3[] }> {
  return runScenarioEngineSelection(input)
}
