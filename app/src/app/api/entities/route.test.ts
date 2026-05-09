/**
 * POST /api/entities — route handler testleri (Faz 7.3.50A.3.3)
 *
 * T_API_POST1 — Geçerli POST (VKN 10 hane) → 201, entity döner
 * T_API_POST2 — Geçerli POST (TCKN 11 hane) → 201
 * T_API_POST3 — taxNumber 9 haneli → 400, VKN/TCKN mesajı
 * T_API_POST4 — taxNumber boş string → normalize → null ile create
 * T_API_POST5 — taxNumber undefined → null ile create
 *
 * Mock stratejisi: jest.doMock + jest.resetModules() + dynamic import
 */

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function setupMocks(opts: {
  userId:       string | null
  createResult?: object
}) {
  const createMock = jest.fn(() => Promise.resolve(
    opts.createResult ?? { id: 'e-new', name: 'Test Şirket', taxNumber: null, sector: null }
  ))

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
        create: createMock,
      },
    },
  }))

  return { createMock }
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

describe('POST /api/entities', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  // ── T_API_POST1: Geçerli POST — VKN 10 hane ─────────────────────────────

  test('T_API_POST1 — Geçerli POST (VKN 10 hane) → 201, entity döner', async () => {
    const { createMock } = setupMocks({
      userId:       'user-1',
      createResult: { id: 'e-new', name: 'ABC Ltd', taxNumber: '1234567890', sector: null },
    })

    const req = createMockRequest({ name: 'ABC Ltd', taxNumber: '1234567890' })
    const res = await callPost(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.entity).toBeDefined()
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock.mock.calls[0][0].data.taxNumber).toBe('1234567890')
  })

  // ── T_API_POST2: Geçerli POST — TCKN 11 hane ────────────────────────────

  test('T_API_POST2 — Geçerli POST (TCKN 11 hane) → 201', async () => {
    const { createMock } = setupMocks({
      userId:       'user-1',
      createResult: { id: 'e-new', name: 'ATLI ENES', taxNumber: '35356829180', sector: null },
    })

    const req = createMockRequest({ name: 'ATLI ENES', taxNumber: '35356829180' })
    const res = await callPost(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.entity).toBeDefined()
    expect(createMock.mock.calls[0][0].data.taxNumber).toBe('35356829180')
  })

  // ── T_API_POST3: taxNumber 9 haneli → 400 ───────────────────────────────

  test('T_API_POST3 — taxNumber 9 haneli → 400, VKN/TCKN hata mesajı', async () => {
    setupMocks({ userId: 'user-1' })

    const req = createMockRequest({ name: 'ABC Ltd', taxNumber: '123456789' }) // 9 hane
    const res = await callPost(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/VKN\/TCKN/)
    expect(body.error).toMatch(/10 veya 11/)
  })

  // ── T_API_POST4: taxNumber boş string → normalize → null ────────────────

  test('T_API_POST4 — taxNumber boş string → normalizeTaxNumber → null ile create', async () => {
    const { createMock } = setupMocks({
      userId:       'user-1',
      createResult: { id: 'e-new', name: 'ABC Ltd', taxNumber: null, sector: null },
    })

    const req = createMockRequest({ name: 'ABC Ltd', taxNumber: '' })
    const res = await callPost(req)

    expect(res.status).toBe(201)
    expect(createMock.mock.calls[0][0].data.taxNumber).toBeNull()
  })

  // ── T_API_POST5: taxNumber undefined → null ile create ──────────────────

  test('T_API_POST5 — taxNumber undefined → normalizeTaxNumber → null ile create', async () => {
    const { createMock } = setupMocks({
      userId:       'user-1',
      createResult: { id: 'e-new', name: 'ABC Ltd', taxNumber: null, sector: null },
    })

    const req = createMockRequest({ name: 'ABC Ltd' }) // taxNumber yok
    const res = await callPost(req)

    expect(res.status).toBe(201)
    expect(createMock.mock.calls[0][0].data.taxNumber).toBeNull()
  })

})
