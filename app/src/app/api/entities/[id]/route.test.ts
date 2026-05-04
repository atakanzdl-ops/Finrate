/**
 * PATCH /api/entities/[id] — route handler testleri (Faz 7.3.18)
 *
 * Odak:
 *   N — Geçerli PATCH → 200, entity + recalculated döner
 *   O — VKN 9 haneli → 400
 *   P — Sektör allowlist dışı → 400
 *   Q — Sektör değişince analysis.update çağrılır + __subjectiveTotal korunur
 *   R — Sektör değişmeyince analysis.update çağrılmaz
 *
 * Mock stratejisi: jest.doMock + jest.resetModules() + dynamic import
 */

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const MOCK_RATIOS = { currentRatio: 1.5, netProfitMargin: 0.1 }
const MOCK_SCORE  = {
  finalScore:             72,
  finalRating:            'B+',
  liquidityScore:         70,
  profitabilityScore:     75,
  leverageScore:          68,
  activityScore:          73,
  overallCoverage:        0.9,
  insufficientCategories: [],
}
const MOCK_OPTIMIZER = { snap: 'mock' }

function makeExisting(overrides: Partial<{ id: string; name: string; sector: string | null }> = {}) {
  return {
    id:         'e-1',
    name:       'Test Şirket',
    sector:     'Ticaret',
    entityType: 'STANDALONE',
    ...overrides,
  }
}

function makeFinancialData(analysisRatios: string | null = null) {
  return [{
    id:       'fd-1',
    entityId: 'e-1',
    year:     2024,
    period:   'ANNUAL',
    revenue:  1_000_000,
    analysis: { id: 'an-1', ratios: analysisRatios },
  }]
}

function setupMocks(opts: {
  userId:            string | null
  existing?:         object | null
  updateResult?:     object
  financialData?:    object[]
  analysisUpdateSpy?: jest.Mock
}) {
  const entityUpdateMock   = jest.fn(() => Promise.resolve(
    opts.updateResult ?? { id: 'e-1', name: 'Test Şirket', sector: 'Ticaret', entityType: 'STANDALONE' }
  ))
  const analysisUpdateMock = opts.analysisUpdateSpy ?? jest.fn(() => Promise.resolve({}))

  jest.doMock('next/server', () => ({
    NextResponse: { json: jest.fn() },
    NextRequest:  jest.fn(),
  }))

  jest.doMock('@/lib/http/jsonUtf8', () => ({
    jsonUtf8: jest.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json:   async () => body,
    })),
  }))

  jest.doMock('@/lib/auth', () => ({
    getUserIdFromRequest: jest.fn(() => opts.userId),
  }))

  jest.doMock('@/lib/db', () => ({
    prisma: {
      entity: {
        findFirst: jest.fn(() => Promise.resolve(
          opts.existing !== undefined ? opts.existing : makeExisting()
        )),
        update: entityUpdateMock,
      },
      financialData: {
        findMany:  jest.fn(() => Promise.resolve(opts.financialData ?? [])),
        findFirst: jest.fn(() => Promise.resolve(null)), // prevYear → null
      },
      analysis: {
        update: analysisUpdateMock,
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

  return { entityUpdateMock, analysisUpdateMock }
}

function createMockRequest(body: unknown = {}) {
  return {
    json:    jest.fn(() => Promise.resolve(body)),
    cookies: { get: jest.fn(() => undefined) },
    headers: { get: jest.fn(() => null) },
  } as any
}

async function callPatch(req: any, entityId = 'e-1') {
  const { PATCH } = await import('./route')
  return PATCH(req, { params: Promise.resolve({ id: entityId }) })
}

// ─── SUITE ───────────────────────────────────────────────────────────────────

describe('PATCH /api/entities/[id]', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  // ── Test N: Geçerli PATCH ─────────────────────────────────────────────────

  test('N — Geçerli PATCH (name güncelle) → 200, entity + recalculated:0 döner', async () => {
    setupMocks({
      userId:       'user-1',
      existing:     makeExisting({ name: 'Eski Ad' }),
      updateResult: { id: 'e-1', name: 'Yeni Ad', sector: 'Ticaret', entityType: 'STANDALONE' },
      financialData: [],
    })

    const req = createMockRequest({ name: 'Yeni Ad' })
    const res = await callPatch(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.entity).toBeDefined()
    expect(body.recalculated).toBe(0)
  })

  // ── Test O: VKN 9 haneli → 400 ───────────────────────────────────────────

  test('O — VKN 9 haneli → 400 (validasyon)', async () => {
    setupMocks({
      userId:   'user-1',
      existing: makeExisting({ sector: null }),
    })

    const req = createMockRequest({ taxNumber: '123456789' }) // 9 hane
    const res = await callPatch(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/VKN/)
  })

  // ── Test P: Sektör allowlist dışı → 400 ──────────────────────────────────

  test('P — Sektör allowlist dışı → 400 (validasyon)', async () => {
    setupMocks({
      userId:   'user-1',
      existing: makeExisting(),
    })

    const req = createMockRequest({ sector: 'Otomotiv' }) // VALID_SECTORS'ta yok
    const res = await callPatch(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Geçersiz sektör/)
  })

  // ── Test Q: Sektör değişince recalc tetiklenir + __subjectiveTotal korunur

  test('Q — Sektör değişince analysis.update çağrılır; __subjectiveTotal korunur', async () => {
    const analysisUpdateMock = jest.fn(() => Promise.resolve({}))
    const existingRatios = JSON.stringify({ someRatio: 1.2, __subjectiveTotal: 18 })

    setupMocks({
      userId:            'user-1',
      existing:          makeExisting({ sector: 'Ticaret' }),
      updateResult:      { id: 'e-1', name: 'Test Şirket', sector: 'Üretim', entityType: 'STANDALONE' },
      financialData:     makeFinancialData(existingRatios),
      analysisUpdateSpy: analysisUpdateMock,
    })

    const req = createMockRequest({ sector: 'Üretim' }) // Ticaret → Üretim
    const res = await callPatch(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recalculated).toBe(1)

    expect(analysisUpdateMock).toHaveBeenCalledTimes(1)
    const updateCall  = analysisUpdateMock.mock.calls[0][0]
    const writtenJSON = JSON.parse(updateCall.data.ratios)
    // Subjektif puan korunmalı
    expect(writtenJSON.__subjectiveTotal).toBe(18)
    // Temel skor alanları yazılmış
    expect(updateCall.data.finalScore).toBe(MOCK_SCORE.finalScore)
    expect(updateCall.data.finalRating).toBe(MOCK_SCORE.finalRating)
  })

  // ── Test R: Sektör değişmedi → recalc yok ────────────────────────────────

  test('R — Sektör değişmedi → analysis.update çağrılmaz', async () => {
    const analysisUpdateMock = jest.fn(() => Promise.resolve({}))

    setupMocks({
      userId:            'user-1',
      existing:          makeExisting({ sector: 'Üretim' }),
      updateResult:      { id: 'e-1', name: 'Yeni Ad', sector: 'Üretim', entityType: 'STANDALONE' },
      financialData:     makeFinancialData(null),
      analysisUpdateSpy: analysisUpdateMock,
    })

    // sector: 'Üretim' (mevcut ile aynı) + name güncelle
    const req = createMockRequest({ name: 'Yeni Ad', sector: 'Üretim' })
    const res = await callPatch(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recalculated).toBe(0)
    expect(analysisUpdateMock).not.toHaveBeenCalled()
  })

})
