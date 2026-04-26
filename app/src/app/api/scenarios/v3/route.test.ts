/**
 * POST /api/scenarios/v3 — Route handler integration test (Bulgu #31)
 *
 * Mock stratejisi:
 *   jest.doMock + jest.resetModules() + dynamic import
 *   selectScenarioEngine MOCK EDİLMEZ (gerçek try/catch çalışsın)
 *   DB bağlantısı YASAK (prisma mock)
 *
 * Codex audit (4 tur) kararları:
 *   - body.engine HER DURUMDA 'v3' (success + error path)
 *   - Flag ayrımı mock call-count ile test edilir
 *   - ENGINE_FN_NAME = 'runEngineV3' (engineV3.ts:1454'ten doğrulandı)
 *   - DOUBLE FAIL: generateScenarios + runEngineV3 ikisi throw → 500
 *   - prisma.analysis.findFirst (NOT findUnique)
 *   - VALID_BODY: targetGrade zorunlu dahil
 *   - VALID_ANALYSIS: entity + financialAccounts dolu
 */

const VALID_BODY = {
  analysisId: 'a1',
  targetGrade: 'A',
}

const VALID_ANALYSIS = {
  id:                 'a1',
  entity:             { id: 'e1', userId: 'user-1', sector: 'Ticaret' },
  financialAccounts:  [{ accountCode: '600', amount: '1000000' }],
  finalRating:        null,
  scoreFinal:         null,
}

const MOCK_ENGINE_RESULT  = { engine_result: 'mock' }
const MOCK_ADAPTED_RESULT = { engine_result: 'mock_adapted' }
const MOCK_DECISION       = { decision: 'mock' }

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function setupMocks(opts: {
  userId:                     string | null
  analysis?:                  object | null
  runEngineV3Behavior?:       'success' | 'throw'
  generateScenariosBehavior?: 'success' | 'throw'
}) {
  // next/server — NextResponse.json global yok (testEnvironment: 'node')
  jest.doMock('next/server', () => ({
    NextResponse: {
      json: (data: unknown, init?: { status?: number }) => ({
        status: init?.status ?? 200,
        json:   async () => data,
      }),
    },
    NextRequest: jest.fn(),
  }))

  jest.doMock('@/lib/auth', () => ({
    getUserIdFromRequest: jest.fn(() => opts.userId),
  }))

  jest.doMock('@/lib/db', () => ({
    prisma: {
      analysis: {
        findFirst: jest.fn(() => Promise.resolve(opts.analysis ?? null)),
      },
    },
  }))

  jest.doMock('@/lib/scoring/scenarioV3/engineV3', () => ({
    runEngineV3: jest.fn(() => {
      if (opts.runEngineV3Behavior === 'throw') throw new Error('runEngineV3 fail')
      return MOCK_ENGINE_RESULT
    }),
  }))

  jest.doMock('@/lib/scoring/scenarioV3/scenarioGenerator', () => ({
    generateScenarios: jest.fn(async () => {
      if (opts.generateScenariosBehavior === 'throw') throw new Error('generateScenarios fail')
      return []
    }),
  }))

  jest.doMock('@/lib/scoring/scenarioV3/adaptToEngineResult', () => ({
    adaptScenariosV3ToEngineResult: jest.fn(() => MOCK_ADAPTED_RESULT),
    isEngineResultLike:             jest.fn(() => true),
  }))

  jest.doMock('@/lib/scoring/scenarioV3/decisionLayer', () => ({
    buildDecisionAnswer: jest.fn(() => MOCK_DECISION),
  }))
}

function createMockRequest(body: unknown) {
  return {
    json:    jest.fn(() => Promise.resolve(body)),
    cookies: { get: jest.fn(() => undefined) },
    headers: { get: jest.fn(() => null) },
  } as any
}

async function callPost(req: any) {
  const { POST } = await import('./route')
  return POST(req)
}

// ─── SUITE ───────────────────────────────────────────────────────────────────

describe('POST /api/scenarios/v3', () => {
  let originalFlag: string | undefined

  beforeEach(() => {
    originalFlag = process.env.ENABLE_MULTI_SCENARIO_V3
    jest.resetModules()
    jest.clearAllMocks()
  })

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.ENABLE_MULTI_SCENARIO_V3
    } else {
      process.env.ENABLE_MULTI_SCENARIO_V3 = originalFlag
    }
  })

  // ── Test A: 401 ────────────────────────────────────────────────────────────

  test('A — Auth fail → 401', async () => {
    setupMocks({ userId: null })
    const req = createMockRequest(VALID_BODY)
    const res = await callPost(req)
    expect(res.status).toBe(401)
  })

  // ── Test B: 400 ────────────────────────────────────────────────────────────

  test('B — Invalid input (body boş) → 400', async () => {
    setupMocks({ userId: 'user-1' })
    const req = createMockRequest({})
    const res = await callPost(req)
    expect(res.status).toBe(400)
  })

  // ── Test C: Flag false → engineV3 path ────────────────────────────────────

  test('C — Flag false → 200, runEngineV3 çağrıldı, generateScenarios çağrılmadı', async () => {
    process.env.ENABLE_MULTI_SCENARIO_V3 = 'false'
    setupMocks({
      userId:                     'user-1',
      analysis:                   VALID_ANALYSIS,
      runEngineV3Behavior:        'success',
      generateScenariosBehavior:  'success',
    })

    const req = createMockRequest(VALID_BODY)
    const res = await callPost(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.engine).toBe('v3')

    const engineV3Mod    = await import('@/lib/scoring/scenarioV3/engineV3') as any
    const generatorMod   = await import('@/lib/scoring/scenarioV3/scenarioGenerator') as any
    expect(engineV3Mod.runEngineV3).toHaveBeenCalled()
    expect(generatorMod.generateScenarios).not.toHaveBeenCalled()
  })

  // ── Test D: Flag true → generateScenarios path ────────────────────────────

  test('D — Flag true → 200, generateScenarios çağrıldı, runEngineV3 çağrılmadı', async () => {
    process.env.ENABLE_MULTI_SCENARIO_V3 = 'true'
    setupMocks({
      userId:                     'user-1',
      analysis:                   VALID_ANALYSIS,
      runEngineV3Behavior:        'success',
      generateScenariosBehavior:  'success',
    })

    const req = createMockRequest(VALID_BODY)
    const res = await callPost(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.engine).toBe('v3')

    const engineV3Mod    = await import('@/lib/scoring/scenarioV3/engineV3') as any
    const generatorMod   = await import('@/lib/scoring/scenarioV3/scenarioGenerator') as any
    expect(generatorMod.generateScenarios).toHaveBeenCalled()
    expect(engineV3Mod.runEngineV3).not.toHaveBeenCalled()
  })

  // ── Test E: DOUBLE FAIL → 500 ──────────────────────────────────────────────

  test('E — DOUBLE FAIL → 500 (generateScenarios + runEngineV3 ikisi throw)', async () => {
    process.env.ENABLE_MULTI_SCENARIO_V3 = 'true'
    setupMocks({
      userId:                     'user-1',
      analysis:                   VALID_ANALYSIS,
      runEngineV3Behavior:        'throw',
      generateScenariosBehavior:  'throw',
    })

    const req = createMockRequest(VALID_BODY)
    const res = await callPost(req)

    expect(res.status).toBe(500)
  })
})
