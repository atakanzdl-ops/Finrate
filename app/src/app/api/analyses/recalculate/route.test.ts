/**
 * POST /api/analyses/recalculate — route handler testleri (Faz 7.3.14)
 *
 * Odak: ratios JSON yeniden yazılırken __subjectiveTotal ve __financialScore
 * korunuyor mu? + null ratios → crash yok mu?
 *
 * Mock stratejisi: jest.doMock + jest.resetModules() + dynamic import
 */

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const MOCK_RATIOS    = { currentRatio: 1.5, netProfitMargin: 0.1 }
const MOCK_SCORE     = {
  finalScore:            72,
  finalRating:           'B+',
  liquidityScore:        70,
  profitabilityScore:    75,
  leverageScore:         68,
  activityScore:         73,
  overallCoverage:       0.9,
  insufficientCategories: [],
}
const MOCK_OPTIMIZER = { snap: 'mock' }

function makeFinancialData(opts: {
  analysisRatios?: string | null
} = {}) {
  return [
    {
      id:       'fd-1',
      entityId: 'e-1',
      year:     2024,
      period:   'ANNUAL',
      entity:   { sector: 'Ticaret' },
      analysis: {
        id:     'an-1',
        ratios: opts.analysisRatios ?? null,
      },
      // FinancialData alanları (calculateRatios'a geçilir — mock edilmiş)
      revenue: 1000000,
    },
  ]
}

function setupMocks(opts: {
  userId:       string | null
  financialData?: ReturnType<typeof makeFinancialData>
  updateSpy?:   jest.Mock
}) {
  const updateMock = opts.updateSpy ?? jest.fn(() => Promise.resolve({}))

  jest.doMock('next/server', () => ({
    NextResponse: { json: jest.fn() },
    NextRequest:  jest.fn(),
  }))

  jest.doMock('@/lib/http/jsonUtf8', () => ({
    jsonUtf8: jest.fn((body: unknown) => ({ status: 200, json: async () => body })),
  }))

  jest.doMock('@/lib/auth', () => ({
    getUserIdFromRequest: jest.fn(() => opts.userId),
  }))

  jest.doMock('@/lib/db', () => ({
    prisma: {
      financialData: {
        findMany: jest.fn(() => Promise.resolve(opts.financialData ?? makeFinancialData())),
      },
      financialData_findFirst_mock: jest.fn(() => Promise.resolve(null)),
      analysis: {
        update: updateMock,
      },
    },
  }))

  // prevYear lookup → null (her zaman)
  jest.doMock('@/lib/db', () => ({
    prisma: {
      financialData: {
        findMany:  jest.fn(() => Promise.resolve(opts.financialData ?? makeFinancialData())),
        findFirst: jest.fn(() => Promise.resolve(null)),
      },
      analysis: {
        update: updateMock,
      },
    },
  }))

  jest.doMock('@/lib/scoring/ratios', () => ({
    calculateRatios: jest.fn(() => MOCK_RATIOS),
    TURKEY_PPI:      { 2024: 0.5 },
  }))

  jest.doMock('@/lib/scoring/score', () => ({
    calculateScore: jest.fn(() => MOCK_SCORE),
  }))

  jest.doMock('@/lib/scoring/optimizerSnapshot', () => ({
    createOptimizerSnapshot: jest.fn(() => MOCK_OPTIMIZER),
  }))

  return { updateMock }
}

function createMockRequest(body: unknown = {}) {
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

describe('POST /api/analyses/recalculate', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  // ── Test K: __subjectiveTotal korunur ─────────────────────────────────────

  test('K — Mevcut ratios JSON\'da __subjectiveTotal var → yeniden yazıda korunur', async () => {
    const existingRatios = JSON.stringify({
      someRatio: 1.2,
      __subjectiveTotal: 18,
    })
    const { updateMock } = setupMocks({
      userId:       'user-1',
      financialData: makeFinancialData({ analysisRatios: existingRatios }),
    })

    const req = createMockRequest()
    await callPost(req)

    expect(updateMock).toHaveBeenCalledTimes(1)
    const updateCall  = updateMock.mock.calls[0][0]
    const writtenJSON = JSON.parse(updateCall.data.ratios)
    expect(writtenJSON.__subjectiveTotal).toBe(18)
  })

  // ── Test L: __financialScore korunur ──────────────────────────────────────

  test('L — Mevcut ratios JSON\'da __financialScore var → yeniden yazıda korunur', async () => {
    const existingRatios = JSON.stringify({
      someRatio: 0.8,
      __financialScore: 65,
    })
    const { updateMock } = setupMocks({
      userId:        'user-1',
      financialData: makeFinancialData({ analysisRatios: existingRatios }),
    })

    const req = createMockRequest()
    await callPost(req)

    expect(updateMock).toHaveBeenCalledTimes(1)
    const updateCall  = updateMock.mock.calls[0][0]
    const writtenJSON = JSON.parse(updateCall.data.ratios)
    expect(writtenJSON.__financialScore).toBe(65)
  })

  // ── Test M: null ratios → crash yok, update başarılı ─────────────────────

  test('M — Mevcut ratios null → meta alanı yoksa da update başarılı, crash yok', async () => {
    const { updateMock } = setupMocks({
      userId:        'user-1',
      financialData: makeFinancialData({ analysisRatios: null }),
    })

    const req = createMockRequest()
    await expect(callPost(req)).resolves.not.toThrow()

    expect(updateMock).toHaveBeenCalledTimes(1)
    const updateCall  = updateMock.mock.calls[0][0]
    const writtenJSON = JSON.parse(updateCall.data.ratios)
    // meta alanlar yoksa yazılmaz
    expect(writtenJSON.__subjectiveTotal).toBeUndefined()
    expect(writtenJSON.__financialScore).toBeUndefined()
    // temel alanlar var
    expect(writtenJSON.__overallCoverage).toBeDefined()
  })

})
