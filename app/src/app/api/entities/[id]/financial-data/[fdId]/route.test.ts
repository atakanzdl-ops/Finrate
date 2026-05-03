/**
 * PATCH /api/entities/[id]/financial-data/[fdId] — ManualAdjustment.upsert (Faz 7.3.17)
 *
 * Odak: financialData.update başarılıysa ManualAdjustment.upsert çağrılır.
 * Mock stratejisi: jest.doMock + jest.resetModules() + dynamic import
 */

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const ENTITY_ID = 'entity-1'
const FD_ID     = 'fd-1'

function setupMocks(opts: {
  userId:          string | null
  upsertAdj?:      jest.Mock
  updateFd?:       jest.Mock
}) {
  const upsertAdj = opts.upsertAdj ?? jest.fn(() => Promise.resolve({ id: 'adj-1' }))
  const updateFd  = opts.updateFd  ?? jest.fn(() => Promise.resolve({
    id: FD_ID, entityId: ENTITY_ID, year: 2024, period: 'Q3',
    cash: 5_000_000,
  }))

  jest.doMock('next/server', () => ({
    NextResponse: {
      json: jest.fn((body: unknown, init?: { status?: number }) => ({
        status: init?.status ?? 200, json: async () => body,
      })),
    },
    NextRequest: jest.fn(),
  }))

  jest.doMock('@/lib/http/jsonUtf8', () => ({
    jsonUtf8: jest.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200, json: async () => body,
    })),
  }))

  jest.doMock('@/lib/auth', () => ({
    getUserIdFromRequest: jest.fn(() => opts.userId),
  }))

  jest.doMock('@/lib/db', () => ({
    prisma: {
      financialData: {
        findFirst: jest.fn(() => Promise.resolve({
          id: FD_ID, entityId: ENTITY_ID, year: 2024, period: 'Q3',
        })),
        update: updateFd,
      },
      manualAdjustment: {
        upsert: upsertAdj,
      },
      analysis: {
        findUnique: jest.fn(() => Promise.resolve(null)),
      },
    },
  }))

  jest.doMock('@/lib/scoring/ratios', () => ({
    calculateRatios: jest.fn(() => ({})),
  }))

  jest.doMock('@/lib/scoring/score', () => ({
    calculateScore: jest.fn(() => ({
      finalScore: 60, finalRating: 'B',
      liquidityScore: 60, profitabilityScore: 60,
      leverageScore: 60, activityScore: 60,
    })),
  }))

  return { upsertAdj, updateFd }
}

function createMockRequest(body: Record<string, number | null>) {
  return {
    json:    jest.fn(() => Promise.resolve(body)),
    cookies: { get: jest.fn(() => undefined) },
    headers: { get: jest.fn(() => null) },
  } as any
}

async function callPatch(req: any, entityId = ENTITY_ID, fdId = FD_ID) {
  const { PATCH } = await import('./route')
  return PATCH(req, { params: Promise.resolve({ id: entityId, fdId }) })
}

// ─── SUITE ───────────────────────────────────────────────────────────────────

describe('PATCH /api/entities/[id]/financial-data/[fdId] — ManualAdjustment.upsert (Faz 7.3.17)', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  // ── Senaryo 1: PATCH → upsert çağrılır ─────────────────────────────────────

  test('Senaryo 1 — PATCH cash → manualAdjustment.upsert çağrılır', async () => {
    const { upsertAdj } = setupMocks({ userId: 'user-1' })

    const req = createMockRequest({ cash: 5_000_000 })
    await callPatch(req)

    expect(upsertAdj).toHaveBeenCalledTimes(1)
    const upsertCall = upsertAdj.mock.calls[0][0]
    expect(upsertCall.where.financialDataId_fieldName_scenarioName).toEqual({
      financialDataId: FD_ID,
      fieldName:       'cash',
      scenarioName:    'manual',
    })
    expect(upsertCall.create.adjustedValue).toBe(5_000_000)
    expect(upsertCall.create.scenarioName).toBe('manual')
    expect(upsertCall.update.adjustedValue).toBe(5_000_000)
  })

  // ── Senaryo 2: null değer → upsert atlanır ──────────────────────────────────

  test('Senaryo 2 — null değer → manualAdjustment.upsert çağrılmaz', async () => {
    const { upsertAdj } = setupMocks({ userId: 'user-1' })

    const req = createMockRequest({ cash: null })
    await callPatch(req)

    expect(upsertAdj).not.toHaveBeenCalled()
  })

  // ── Senaryo 3: birden fazla alan → her biri için upsert ─────────────────────

  test('Senaryo 3 — iki alan birden PATCH → iki kez upsert', async () => {
    const { upsertAdj } = setupMocks({ userId: 'user-1' })

    const req = createMockRequest({ cash: 3_000_000, revenue: 10_000_000 })
    await callPatch(req)

    expect(upsertAdj).toHaveBeenCalledTimes(2)
    const fieldNames = upsertAdj.mock.calls.map(
      (c: any[]) => c[0].create.fieldName
    )
    expect(fieldNames).toContain('cash')
    expect(fieldNames).toContain('revenue')
  })

  // ── Senaryo 4: yetkisiz → upsert çağrılmaz ─────────────────────────────────

  test('Senaryo 4 — yetkisiz kullanıcı → 401, upsert çağrılmaz', async () => {
    const { upsertAdj } = setupMocks({ userId: null })

    const req = createMockRequest({ cash: 5_000_000 })
    const res = await callPatch(req)

    expect(res.status).toBe(401)
    expect(upsertAdj).not.toHaveBeenCalled()
  })
})
