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
  subjectiveRow?: Record<string, unknown> | null
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

  // prevYear lookup → null (her zaman); subjectiveInput → opts.subjectiveRow (varsayılan: yok)
  jest.doMock('@/lib/db', () => ({
    prisma: {
      financialData: {
        findMany:  jest.fn(() => Promise.resolve(opts.financialData ?? makeFinancialData())),
        findFirst: jest.fn(() => Promise.resolve(null)),
      },
      analysis: {
        update:     updateMock,
        // Faz 7.3.60.1: roadmapSnapshot invalidation
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
      subjectiveInput: {
        findUnique: jest.fn(() => Promise.resolve(opts.subjectiveRow ?? null)),
      },
      financialAccount: {
        findMany: jest.fn(() => Promise.resolve([])),
      },
    },
  }))

  jest.doMock('@/lib/scoring/ratios', () => ({
    calculateRatios: jest.fn(() => MOCK_RATIOS),
    TURKEY_PPI:      { 2024: 0.5 },
  }))

  jest.doMock('@/lib/scoring/score', () => ({
    calculateScore: jest.fn(() => MOCK_SCORE),
    scoreToRating:  jest.fn(() => 'B'),
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

  // ── Test K: subjektif kayıt varsa birleşik skor + __subjectiveTotal yazılır ─

  test('K — SubjectiveInput kaydı var → finalScore birleşik, __subjectiveTotal dolu', async () => {
    const { updateMock } = setupMocks({
      userId:        'user-1',
      financialData: makeFinancialData({ analysisRatios: JSON.stringify({ someRatio: 1.2 }) }),
      subjectiveRow: {
        kkbCategory: 'iyi', activeDelayDays: 0, checkProtest: false, enforcementFile: false,
        creditLimitUtilPct: 20, hasMultipleBanks: true, avgMaturityMonths: 36, companyAgeYears: 12,
        auditLevel: 'bagimsiz', ownershipClarity: true, hasTaxDebt: false, hasSgkDebt: false, activeLawsuitCount: 0,
      },
    })

    const req = createMockRequest()
    await callPost(req)

    expect(updateMock).toHaveBeenCalledTimes(1)
    const updateCall  = updateMock.mock.calls[0][0]
    const writtenJSON = JSON.parse(updateCall.data.ratios)
    expect(writtenJSON.__subjectiveTotal).toBe(30)        // tüm cevaplar en iyi → 30/30
    expect(writtenJSON.__financialScore).toBe(72)
    expect(updateCall.data.finalScore).not.toBe(72)       // birleşik skor finansaldan farklı
  })

  // ── Test L: __financialScore her zaman yeni hesaplanan finansal skordur ───

  test('L — Eski ratios JSON\'daki __financialScore korunmaz, yeni skor yazılır', async () => {
    const { updateMock } = setupMocks({
      userId:        'user-1',
      financialData: makeFinancialData({ analysisRatios: JSON.stringify({ someRatio: 0.8, __financialScore: 65 }) }),
    })

    const req = createMockRequest()
    await callPost(req)

    expect(updateMock).toHaveBeenCalledTimes(1)
    const updateCall  = updateMock.mock.calls[0][0]
    const writtenJSON = JSON.parse(updateCall.data.ratios)
    expect(writtenJSON.__financialScore).toBe(72)
    expect(updateCall.data.finalScore).toBe(72)           // subjektif yok → finalScore = finansal
  })

  // ── Test M: null ratios → crash yok, update başarılı ─────────────────────

  test('M — Mevcut ratios null → update başarılı, subjektif yoksa __subjectiveTotal null', async () => {
    const { updateMock } = setupMocks({
      userId:        'user-1',
      financialData: makeFinancialData({ analysisRatios: null }),
    })

    const req = createMockRequest()
    await expect(callPost(req)).resolves.not.toThrow()

    expect(updateMock).toHaveBeenCalledTimes(1)
    const updateCall  = updateMock.mock.calls[0][0]
    const writtenJSON = JSON.parse(updateCall.data.ratios)
    expect(writtenJSON.__subjectiveTotal).toBeNull()
    expect(writtenJSON.__financialScore).toBe(72)
    expect(writtenJSON.__overallCoverage).toBeDefined()
  })

})
