/**
 * POST /api/entities/[id]/upload — FinancialAccount merge mantığı (Faz 7.3.15)
 *
 * Odak: period + docType bazlı deleteMany/createMany mantığı
 *   - MIZAN: sadece 1-5xx hesaplar siliniр/yazılır (6xx korunur)
 *   - Q+BEYANNAME: sadece 6xx hesaplar silinir/yazılır (1-5xx korunur)
 *   - ANNUAL+BEYANNAME: tüm hesaplar silinip yeniden yazılır
 *   - UNKNOWN: hiçbir şey değişmez
 *
 * Mock stratejisi: jest.doMock + jest.resetModules() + dynamic import
 * Parser mock: parseExcelBuffer / parsePdfBuffer doğrudan kontrollü satır döner
 */

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const ENTITY_ID = 'entity-1'
const ANALYSIS_ID = 'analysis-1'
const FINANCIAL_DATA_ID = 'fd-1'

function makeAnalysis(id = ANALYSIS_ID) {
  return { id, entityId: ENTITY_ID, year: 2024, period: 'Q3', financialDataId: FINANCIAL_DATA_ID }
}

function setupMocks(opts: {
  userId:       string | null
  parsedRows?:  object[]
  deleteMock?:  jest.Mock
  createMock?:  jest.Mock
  isExcel?:     boolean
}) {
  const deleteMock = opts.deleteMock ?? jest.fn(() => Promise.resolve({ count: 0 }))
  const createMock = opts.createMock ?? jest.fn(() => Promise.resolve({ count: 1 }))

  jest.doMock('next/server', () => ({
    NextResponse: { json: jest.fn((body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body })) },
    NextRequest: jest.fn(),
  }))

  jest.doMock('@/lib/http/jsonUtf8', () => ({
    jsonUtf8: jest.fn((body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body })),
  }))

  jest.doMock('@/lib/auth', () => ({
    getUserIdFromRequest: jest.fn(() => opts.userId),
  }))

  jest.doMock('@/lib/db', () => ({
    prisma: {
      entity: {
        findFirst: jest.fn(() => Promise.resolve({ id: ENTITY_ID, userId: 'user-1', sector: 'Ticaret' })),
      },
      financialData: {
        findUnique: jest.fn(() => Promise.resolve(null)),
        upsert: jest.fn(() => Promise.resolve({ id: FINANCIAL_DATA_ID })),
        findFirst: jest.fn(() => Promise.resolve(null)),
      },
      analysis: {
        upsert: jest.fn(() => Promise.resolve(makeAnalysis())),
      },
      financialAccount: {
        deleteMany: deleteMock,
        createMany: createMock,
      },
      $executeRaw: jest.fn(() => Promise.resolve(1)),
    },
  }))

  jest.doMock('@/lib/scoring/ratios', () => ({
    calculateRatios:             jest.fn(() => ({})),
    calculateRatiosFromAccounts: jest.fn(() => ({})),
    TURKEY_PPI:                  { 2024: 0.5 },
  }))

  jest.doMock('@/lib/scoring/score', () => ({
    calculateScore: jest.fn(() => ({
      finalScore: 60, finalRating: 'B', liquidityScore: 60,
      profitabilityScore: 60, leverageScore: 60, activityScore: 60,
      overallCoverage: 0.8, insufficientCategories: [],
    })),
  }))

  jest.doMock('@/lib/scoring/optimizerSnapshot', () => ({
    createOptimizerSnapshot: jest.fn(() => ({})),
  }))

  // Parser mock — döndürülecek satırı dışarıdan kontrol et
  const parsedRows = opts.parsedRows ?? []
  if (opts.isExcel !== false) {
    jest.doMock('@/lib/parsers/excel', () => ({
      parseExcelBuffer: jest.fn(() => Promise.resolve(parsedRows)),
      parseCsvText:     jest.fn(() => Promise.resolve(parsedRows)),
    }))
  }

  jest.doMock('@/lib/parsers/pdf', () => ({
    parsePdfBuffer: jest.fn(() => Promise.resolve(parsedRows)),
  }))

  return { deleteMock, createMock }
}

function createMockRequest(opts: {
  fileName:   string
  year?:      number | null
  period?:    string | null
}) {
  const file = {
    name:        opts.fileName,
    arrayBuffer: jest.fn(() => Promise.resolve(Buffer.alloc(0))),
  }
  const formData = {
    get: jest.fn((key: string) => {
      if (key === 'file')   return file
      if (key === 'year')   return opts.year   != null ? String(opts.year)  : null
      if (key === 'period') return opts.period != null ? opts.period          : null
      return null
    }),
  }
  return {
    formData: jest.fn(() => Promise.resolve(formData)),
    cookies:  { get: jest.fn(() => undefined) },
    headers:  { get: jest.fn(() => null) },
  } as any
}

async function callPost(req: any, entityId = ENTITY_ID) {
  const { POST } = await import('./route')
  return POST(req, { params: Promise.resolve({ id: entityId }) })
}

// ─── SUITE ───────────────────────────────────────────────────────────────────

describe('POST /api/entities/[id]/upload — FinancialAccount merge mantığı', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  // ── Senaryo 1: MIZAN yüklemesi — sadece 1-5xx silinir/yazılır ────────────

  test('Senaryo 1 — MIZAN: deleteMany sadece 1-5xx prefix, createMany sadece 1-5xx hesaplar', async () => {
    const { deleteMock, createMock } = setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'Q3',
        fields: { otherNonCurrentLiabilities: 5_000_000 },
        unmapped: [],
        docType: 'MIZAN',
        rawAccounts: [
          { code: '431', amount: 5_000_000 },
          { code: '600', amount: 9_000_000 }, // 6xx, mizan'da nadiren olur ama filtrelenebilmeli
        ],
      }],
      isExcel: true,
    })

    const req = createMockRequest({ fileName: 'mizan.xlsx', year: 2024, period: 'Q3' })
    await callPost(req)

    // deleteMany: OR ile 1-5xx prefix olmalı (6 silinmez)
    expect(deleteMock).toHaveBeenCalledTimes(1)
    const deleteWhere = deleteMock.mock.calls[0][0].where
    expect(deleteWhere.OR).toBeDefined()
    expect(deleteWhere.OR.length).toBe(5)
    // '6' prefix OLMAMALI
    const prefixes: string[] = deleteWhere.OR.map((o: any) => o.accountCode.startsWith)
    expect(prefixes).toContain('1')
    expect(prefixes).toContain('5')
    expect(prefixes).not.toContain('6')

    // createMany: sadece 1-5xx olan 431 yazılmalı, 600 yazılmamalı
    expect(createMock).toHaveBeenCalledTimes(1)
    const createData: Array<{ accountCode: string }> = createMock.mock.calls[0][0].data
    const codes = createData.map(d => d.accountCode)
    expect(codes).toContain('431')
    expect(codes).not.toContain('600')
  })

  // ── Senaryo 2: Q+BEYANNAME — sadece 6xx silinir/yazılır ──────────────────

  test('Senaryo 2 — Q+BEYANNAME: deleteMany sadece 6xx, createMany sadece 6xx hesaplar', async () => {
    const { deleteMock, createMock } = setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'Q3',
        fields: { revenue: 10_000_000 },
        unmapped: [],
        docType: 'BEYANNAME',
        rawAccounts: [
          { code: '600', amount: 10_000_000 },
          { code: '431', amount: 5_000_000 }, // 4xx, beyanname'de olmamalı ama güvenlik için filtre
        ],
      }],
      isExcel: false,
    })

    const req = createMockRequest({ fileName: 'beyanname.pdf', year: 2024, period: 'Q3' })
    await callPost(req)

    // deleteMany: sadece startsWith '6'
    expect(deleteMock).toHaveBeenCalledTimes(1)
    const deleteWhere = deleteMock.mock.calls[0][0].where
    expect(deleteWhere.accountCode?.startsWith).toBe('6')
    expect(deleteWhere.OR).toBeUndefined()

    // createMany: sadece 6xx olan 600 yazılmalı, 431 yazılmamalı
    expect(createMock).toHaveBeenCalledTimes(1)
    const createData: Array<{ accountCode: string }> = createMock.mock.calls[0][0].data
    const codes = createData.map(d => d.accountCode)
    expect(codes).toContain('600')
    expect(codes).not.toContain('431')
  })

  // ── Senaryo 3: ANNUAL+BEYANNAME — tüm hesaplar silinip yazılır ───────────

  test('Senaryo 3 — ANNUAL+BEYANNAME: deleteMany tüm hesaplar (prefix yok), createMany tüm rawAccounts', async () => {
    const { deleteMock, createMock } = setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'ANNUAL',
        fields: { revenue: 15_000_000, cash: 2_000_000 },
        unmapped: [],
        docType: 'BEYANNAME',
        rawAccounts: [
          { code: '100', amount: 2_000_000 },
          { code: '600', amount: 15_000_000 },
        ],
      }],
      isExcel: false,
    })

    const req = createMockRequest({ fileName: 'kvb.pdf', year: 2024, period: 'ANNUAL' })
    await callPost(req)

    // deleteMany: analiz tüm kayıtları silinmeli (OR veya startsWith yok)
    expect(deleteMock).toHaveBeenCalledTimes(1)
    const deleteWhere = deleteMock.mock.calls[0][0].where
    expect(deleteWhere.OR).toBeUndefined()
    expect(deleteWhere.accountCode).toBeUndefined()
    expect(deleteWhere.analysisId).toBe(ANALYSIS_ID)

    // createMany: hem 100 hem 600 yazılmalı
    expect(createMock).toHaveBeenCalledTimes(1)
    const createData: Array<{ accountCode: string }> = createMock.mock.calls[0][0].data
    const codes = createData.map(d => d.accountCode)
    expect(codes).toContain('100')
    expect(codes).toContain('600')
  })

  // ── Senaryo 4: UNKNOWN docType — hiçbir şey değişmez ─────────────────────

  test('Senaryo 4 — UNKNOWN docType: deleteMany ve createMany çağrılmaz', async () => {
    const { deleteMock, createMock } = setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'Q3',
        fields: { revenue: 5_000_000 },
        unmapped: [],
        docType: 'UNKNOWN',
        rawAccounts: [{ code: '600', amount: 5_000_000 }],
      }],
      isExcel: false,
    })

    const req = createMockRequest({ fileName: 'bilinmeyen.pdf', year: 2024, period: 'Q3' })
    await callPost(req)

    expect(deleteMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  // ── Senaryo 5: İki mizan üst üste — 1-5xx silip yeniden yazar ────────────

  test('Senaryo 5 — İki MIZAN üst üste: her seferinde 1-5xx silinir (duplicate yok)', async () => {
    const { deleteMock, createMock } = setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'Q3',
        fields: { otherNonCurrentLiabilities: 7_000_000 },
        unmapped: [],
        docType: 'MIZAN',
        rawAccounts: [{ code: '431', amount: 7_000_000 }],
      }],
      isExcel: true,
    })

    const req = createMockRequest({ fileName: 'mizan2.xlsx', year: 2024, period: 'Q3' })
    await callPost(req)

    // deleteMany çağrıldı, createMany skipDuplicates:true ile çağrıldı
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock.mock.calls[0][0].skipDuplicates).toBe(true)
  })

  // ── Senaryo 6: docType yoksa (undefined) → UNKNOWN davranışı ─────────────

  test('Senaryo 6 — docType undefined → UNKNOWN: deleteMany çağrılmaz (defansif)', async () => {
    const { deleteMock, createMock } = setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'Q3',
        fields: { revenue: 3_000_000 },
        unmapped: [],
        // docType: undefined (yok)
        rawAccounts: [{ code: '600', amount: 3_000_000 }],
      }],
      isExcel: false,
    })

    const req = createMockRequest({ fileName: 'bilinmeyen2.pdf', year: 2024, period: 'Q3' })
    await callPost(req)

    // undefined docType → ?? 'UNKNOWN' → deleteMany ve createMany çağrılmaz
    expect(deleteMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })
})

// ─── Faz 7.3.16 — BUG 3: parserProvidedKeys docType filtresi ─────────────────

/**
 * financialData.upsert merge mantığı: hangi docType hangi alanları ezebilir?
 * Mock: findUnique → null (yeni kayıt) — sadece parserProvidedKeys filtresi test edilir.
 * upsert.create çağrısının ikinci argümanını kontrol ediyoruz.
 */

describe('POST /api/entities/[id]/upload — parserProvidedKeys docType filtresi (Faz 7.3.16)', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  // ── Senaryo A: MIZAN → sadece bilanço alanları finansal veriye yazılır ──────

  test('Senaryo A — MIZAN: upsert.create bilanço alanı (cash) içerir, gelir tablosu alanı (revenue) içermez', async () => {
    const upsertMock = jest.fn(() => Promise.resolve({ id: FINANCIAL_DATA_ID }))
    setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'Q3',
        fields: { cash: 5_000_000, revenue: 10_000_000 },
        unmapped: [],
        docType: 'MIZAN',
        rawAccounts: [{ code: '100', amount: 5_000_000 }],
      }],
      isExcel: true,
    })
    // upsert mock'u override et
    jest.doMock('@/lib/db', () => ({
      prisma: {
        entity:          { findFirst: jest.fn(() => Promise.resolve({ id: ENTITY_ID, userId: 'user-1', sector: 'Ticaret' })) },
        financialData:   { findUnique: jest.fn(() => Promise.resolve(null)), upsert: upsertMock, findFirst: jest.fn(() => Promise.resolve(null)) },
        analysis:        { upsert: jest.fn(() => Promise.resolve(makeAnalysis())) },
        financialAccount:{ deleteMany: jest.fn(() => Promise.resolve({ count: 0 })), createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
        $executeRaw:     jest.fn(() => Promise.resolve(1)),
      },
    }))

    const req = createMockRequest({ fileName: 'mizan.xlsx', year: 2024, period: 'Q3' })
    await callPost(req)

    expect(upsertMock).toHaveBeenCalled()
    const createArg = upsertMock.mock.calls[0][0].create as Record<string, unknown>
    // cash (bilanço) yazılmış olmalı
    expect(createArg.cash).toBe(5_000_000)
    // revenue (gelir tablosu) MIZAN'da yazılmamalı — parserProvidedKeys filtresi dışında
    // Not: auto-calc olmadığından null veya undefined gelir
    expect(createArg.revenue == null).toBe(true)
  })

  // ── Senaryo B: Q+BEYANNAME → sadece gelir tablosu alanları yazılır ──────────

  test('Senaryo B — Q+BEYANNAME: upsert.create gelir tablosu alanı (revenue) içerir, bilanço alanı (cash) içermez', async () => {
    const upsertMock = jest.fn(() => Promise.resolve({ id: FINANCIAL_DATA_ID }))
    setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'Q3',
        fields: { revenue: 10_000_000, cash: 5_000_000 },
        unmapped: [],
        docType: 'BEYANNAME',
        rawAccounts: [{ code: '600', amount: 10_000_000 }],
      }],
      isExcel: false,
    })
    jest.doMock('@/lib/db', () => ({
      prisma: {
        entity:          { findFirst: jest.fn(() => Promise.resolve({ id: ENTITY_ID, userId: 'user-1', sector: 'Ticaret' })) },
        financialData:   { findUnique: jest.fn(() => Promise.resolve(null)), upsert: upsertMock, findFirst: jest.fn(() => Promise.resolve(null)) },
        analysis:        { upsert: jest.fn(() => Promise.resolve(makeAnalysis())) },
        financialAccount:{ deleteMany: jest.fn(() => Promise.resolve({ count: 0 })), createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
        $executeRaw:     jest.fn(() => Promise.resolve(1)),
      },
    }))

    const req = createMockRequest({ fileName: 'beyanname.pdf', year: 2024, period: 'Q3' })
    await callPost(req)

    expect(upsertMock).toHaveBeenCalled()
    const createArg = upsertMock.mock.calls[0][0].create as Record<string, unknown>
    // revenue (gelir tablosu) yazılmış olmalı
    expect(createArg.revenue).toBe(10_000_000)
    // cash (bilanço) Q+BEYANNAME'de yazılmamalı
    expect(createArg.cash == null).toBe(true)
  })
})
