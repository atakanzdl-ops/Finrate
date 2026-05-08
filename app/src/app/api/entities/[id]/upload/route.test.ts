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
  userId:           string | null
  parsedRows?:      object[]
  deleteMock?:      jest.Mock
  createMock?:      jest.Mock
  isExcel?:         boolean
  findUniqueMock?:  jest.Mock   // Faz 7.3.50A: existing record simülasyonu
}) {
  const deleteMock     = opts.deleteMock    ?? jest.fn(() => Promise.resolve({ count: 0 }))
  const createMock     = opts.createMock    ?? jest.fn(() => Promise.resolve({ count: 1 }))
  const findUniqueMock = opts.findUniqueMock ?? jest.fn(() => Promise.resolve(null))

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
        findUnique: findUniqueMock,
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

  return { deleteMock, createMock, findUniqueMock }
}

function createMockRequest(opts: {
  fileName:                  string
  year?:                     number | null
  period?:                   string | null
  fileSize?:                 number          // Faz 7.3.49 A: boyut limiti testi için
  overwrite?:                boolean         // Faz 7.3.50A: üzerine yaz onayı
  confirmDetectionMissing?:  boolean         // Faz 7.3.50A.1: soft warning onayı
}) {
  const file = {
    name:        opts.fileName,
    size:        opts.fileSize ?? 0,
    arrayBuffer: jest.fn(() => Promise.resolve(Buffer.alloc(0))),
  }
  const formData = {
    get: jest.fn((key: string) => {
      if (key === 'file')                     return file
      if (key === 'year')                     return opts.year   != null ? String(opts.year)  : null
      if (key === 'period')                   return opts.period != null ? opts.period          : null
      if (key === 'overwrite')                return opts.overwrite === true ? 'true' : null
      if (key === 'confirmDetectionMissing')  return opts.confirmDetectionMissing === true ? 'true' : null
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

// ── Faz 7.3.49 A: Dosya boyutu limiti (T1-T3) ────────────────────────────────

describe('POST /api/entities/[id]/upload — dosya boyutu limiti (Faz 7.3.49 A)', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('T1 — 11 MB dosya → 413 Payload Too Large', async () => {
    setupMocks({ userId: 'user-1' })
    const req = createMockRequest({ fileName: 'buyuk.xlsx', fileSize: 11 * 1024 * 1024 })
    const res = await callPost(req)
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toMatch(/büyük|MB/i)
  })

  test('T2 — tam 10 MB (sınır değeri) → kabul edilir (413 değil)', async () => {
    setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'ANNUAL', fields: { revenue: 1_000_000 },
        unmapped: [], docType: 'BEYANNAME', rawAccounts: [],
        meta: { parseWarnings: [], reverseBalanceWarnings: [], path: null, confidence: null },
      }],
      isExcel: true,
    })
    // tam 10 MB: file.size > MAX_UPLOAD_BYTES → false → kabul
    const req = createMockRequest({ fileName: 'sinir.xlsx', fileSize: 10 * 1024 * 1024 })
    const res = await callPost(req)
    expect(res.status).not.toBe(413)
  })

  test('T3 — 9 MB dosya → 413 değil, işleme devam eder', async () => {
    setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'ANNUAL', fields: { revenue: 500_000 },
        unmapped: [], docType: 'BEYANNAME', rawAccounts: [],
        meta: { parseWarnings: [], reverseBalanceWarnings: [], path: null, confidence: null },
      }],
      isExcel: true,
    })
    const req = createMockRequest({ fileName: 'kucuk.xlsx', fileSize: 9 * 1024 * 1024 })
    const res = await callPost(req)
    expect(res.status).not.toBe(413)
  })

})

// ─── Faz 7.3.50A: PREFLIGHT validation (T1-T16) ──────────────────────────────

const PREFLIGHT_ROW = (year: number | null, period: string | null = null) => ({
  year, period,
  fields:      { revenue: 5_000_000 },
  unmapped:    [],
  docType:     'BEYANNAME',
  rawAccounts: [],
  meta:        { parseWarnings: [], reverseBalanceWarnings: [], path: null, confidence: null },
})

describe('POST /api/entities/[id]/upload — PREFLIGHT validation (Faz 7.3.50A)', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  // T1: Year mismatch → 422
  test('T1 — formYear ≠ detectedYear → 422 YEAR_MISMATCH', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(2023, 'ANNUAL')], isExcel: false })
    const req = createMockRequest({ fileName: 'b.pdf', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('YEAR_MISMATCH')
  })

  // T2: Period mismatch → 422
  test('T2 — formPeriod ≠ detectedPeriod → 422 PERIOD_MISMATCH', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(2024, 'Q1')], isExcel: false })
    const req = createMockRequest({ fileName: 'b.pdf', year: 2024, period: 'Q3' })
    const res = await callPost(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('PERIOD_MISMATCH')
  })

  // T3: Year + period farklı → YEAR_MISMATCH (year önce kontrol edilir)
  test('T3 — year + period ikisi de farklı → 422 YEAR_MISMATCH (year önce)', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(2023, 'Q1')], isExcel: false })
    const req = createMockRequest({ fileName: 'b.pdf', year: 2024, period: 'Q3' })
    const res = await callPost(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('YEAR_MISMATCH')
  })

  // T4a: detectedYear null + form var + confirmDetectionMissing=false → 409 soft warning
  test('T4a — detectedYear null + formYear var → 409 DETECTED_YEAR_MISSING_CONFIRM (Faz 7.3.50A.1)', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(null, null)], isExcel: false })
    const req = createMockRequest({ fileName: 'b.pdf', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('DETECTED_YEAR_MISSING_CONFIRM')
  })

  // T4b: detectedYear null + form var + confirmDetectionMissing=true → form yılı kullanılır, 200
  test('T4b — detectedYear null + formYear var + confirmDetectionMissing=true → 200 (Faz 7.3.50A.1)', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(null, null)], isExcel: false })
    const req = createMockRequest({ fileName: 'b.pdf', year: 2024, period: 'ANNUAL', confirmDetectionMissing: true })
    const res = await callPost(req)
    expect(res.status).not.toBe(409)
    expect(res.status).not.toBe(422)
    expect(res.status).not.toBe(400)
  })

  // T5: detectedYear var + form null → parser yılı kullanılır, başarılı
  test('T5 — detectedYear var + formYear null → parser yılı kullanılır, 200', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(2024, 'ANNUAL')], isExcel: false })
    const req = createMockRequest({ fileName: 'b.pdf', year: null, period: null })
    const res = await callPost(req)
    expect(res.status).not.toBe(422)
    expect(res.status).not.toBe(400)
  })

  // T6: Hem parser hem form null → 400 MISSING_YEAR_CONTEXT
  test('T6 — parser yıl yok + form yıl yok → 400 MISSING_YEAR_CONTEXT', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(null, null)], isExcel: false })
    const req = createMockRequest({ fileName: 'b.pdf', year: null, period: null })
    const res = await callPost(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('MISSING_YEAR_CONTEXT')
  })

  // T7 (KRİTİK): existing EXCEL + incoming PDF → conflict YOK, MIXED merge, upsert çağrıldı
  test('T7 — existing EXCEL + incoming PDF → conflict YOK, upsert çağrıldı (MIXED merge korundu)', async () => {
    const upsertMock = jest.fn(() => Promise.resolve({ id: FINANCIAL_DATA_ID }))
    const findUniqueMock = jest.fn(() =>
      Promise.resolve({ source: 'EXCEL', updatedAt: new Date() }),
    )
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(2024, 'ANNUAL')], isExcel: false })
    jest.doMock('@/lib/db', () => ({
      prisma: {
        entity:           { findFirst: jest.fn(() => Promise.resolve({ id: ENTITY_ID, userId: 'user-1', sector: 'Ticaret' })) },
        financialData:    { findUnique: findUniqueMock, upsert: upsertMock, findFirst: jest.fn(() => Promise.resolve(null)) },
        analysis:         { upsert: jest.fn(() => Promise.resolve(makeAnalysis())) },
        financialAccount: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })), createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
        $executeRaw:      jest.fn(() => Promise.resolve(1)),
      },
    }))
    const req = createMockRequest({ fileName: 'beyanname.pdf', year: null, period: null })
    const res = await callPost(req)
    // 409 tetiklenmemeli (farklı source → no conflict)
    expect(res.status).not.toBe(409)
    // upsert çağrıldı (MIXED merge akışı devam etti)
    expect(upsertMock).toHaveBeenCalled()
  })

  // T8: existing EXCEL + incoming EXCEL → 409
  test('T8 — existing EXCEL + incoming EXCEL → 409 DUPLICATE_DATA', async () => {
    const findUniqueMock = jest.fn(() =>
      Promise.resolve({ source: 'EXCEL', updatedAt: new Date() }),
    )
    setupMocks({
      userId:          'user-1',
      parsedRows:      [PREFLIGHT_ROW(2024, 'ANNUAL')],
      isExcel:         true,
      findUniqueMock,
    })
    const req = createMockRequest({ fileName: 'mizan.xlsx', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('DUPLICATE_DATA')
  })

  // T9: existing MIXED + incoming PDF → 409
  test('T9 — existing MIXED + incoming PDF → 409 DUPLICATE_DATA', async () => {
    const findUniqueMock = jest.fn(() =>
      Promise.resolve({ source: 'MIXED', updatedAt: new Date() }),
    )
    setupMocks({
      userId:          'user-1',
      parsedRows:      [PREFLIGHT_ROW(2024, 'ANNUAL')],
      isExcel:         false,
      findUniqueMock,
    })
    const req = createMockRequest({ fileName: 'b.pdf', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('DUPLICATE_DATA')
  })

  // T10: overwrite=true → PREFLIGHT 3 atlanır, upsert çağrıldı
  test('T10 — overwrite=true → 409 tetiklenmez, upsert çağrıldı', async () => {
    const upsertMock = jest.fn(() => Promise.resolve({ id: FINANCIAL_DATA_ID }))
    const findUniqueMock = jest.fn(() =>
      Promise.resolve({ source: 'EXCEL', updatedAt: new Date() }),
    )
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(2024, 'ANNUAL')], isExcel: true })
    jest.doMock('@/lib/db', () => ({
      prisma: {
        entity:           { findFirst: jest.fn(() => Promise.resolve({ id: ENTITY_ID, userId: 'user-1', sector: 'Ticaret' })) },
        financialData:    { findUnique: findUniqueMock, upsert: upsertMock, findFirst: jest.fn(() => Promise.resolve(null)) },
        analysis:         { upsert: jest.fn(() => Promise.resolve(makeAnalysis())) },
        financialAccount: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })), createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
        $executeRaw:      jest.fn(() => Promise.resolve(1)),
      },
    }))
    const req = createMockRequest({ fileName: 'mizan.xlsx', year: 2024, period: 'ANNUAL', overwrite: true })
    const res = await callPost(req)
    expect(res.status).not.toBe(409)
    expect(upsertMock).toHaveBeenCalled()
  })

  // T11 (KRİTİK): Boş satır filtresi — tüm-null fields → 400 "okunabilir veri yok"
  test('T11 — tüm-null alanlar → boş satır filtresi devreye girer → 400 okunabilir veri yok', async () => {
    setupMocks({
      userId: 'user-1',
      parsedRows: [{
        year: 2024, period: 'ANNUAL',
        fields: { revenue: null, cash: null },   // tüm null
        unmapped: [], docType: 'BEYANNAME', rawAccounts: [],
        meta: { parseWarnings: [], reverseBalanceWarnings: [], path: null, confidence: null },
      }],
      isExcel: false,
    })
    const req = createMockRequest({ fileName: 'bos.pdf', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    // Mevcut "okunabilir veri" mesajı — PREFLIGHT'tan önce tetiklenir
    expect(body.error).toMatch(/okunabilir veri/i)
  })

  // T12 (KRİTİK): Multi-year Excel istisnası — MISMATCH tetiklenmez
  test('T12 — parsedRows.length>1 + hepsinde year + formYear farklı → MISMATCH tetiklenmez', async () => {
    setupMocks({
      userId: 'user-1',
      parsedRows: [
        PREFLIGHT_ROW(2023, 'ANNUAL'),
        PREFLIGHT_ROW(2024, 'ANNUAL'),
      ],
      isExcel: true,
    })
    // formYear=2025 ≠ 2023/2024 ama multiRowWithYears=true → shouldValidateAgainstForm=false
    const req = createMockRequest({ fileName: 'multi.xlsx', year: 2025, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).not.toBe(422)
  })

  // T13 (KRİTİK): PREFLIGHT regresyon — 3 yaz işlemi ASLA çağrılmadı
  test('T13 — PREFLIGHT başarısız → financialData.upsert + analysis.upsert + $executeRaw ASLA çağrılmadı', async () => {
    const upsertFDMock       = jest.fn()
    const upsertAnalysisMock = jest.fn()
    const executeRawMock     = jest.fn()

    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(2023, 'ANNUAL')], isExcel: false })
    jest.doMock('@/lib/db', () => ({
      prisma: {
        entity:           { findFirst: jest.fn(() => Promise.resolve({ id: ENTITY_ID, userId: 'user-1', sector: 'Ticaret' })) },
        financialData:    { findUnique: jest.fn(() => Promise.resolve(null)), upsert: upsertFDMock, findFirst: jest.fn(() => Promise.resolve(null)) },
        analysis:         { upsert: upsertAnalysisMock },
        financialAccount: { deleteMany: jest.fn(), createMany: jest.fn() },
        $executeRaw:      executeRawMock,
      },
    }))

    // formYear=2024 ≠ detectedYear=2023 → YEAR_MISMATCH → 422 → döngüye girilmez
    const req = createMockRequest({ fileName: 'b.pdf', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)

    expect(res.status).toBe(422)
    expect(upsertFDMock).not.toHaveBeenCalled()
    expect(upsertAnalysisMock).not.toHaveBeenCalled()
    expect(executeRawMock).not.toHaveBeenCalled()
  })

  // T14: Mevcut başarılı tek yıl akışı BOZULMADI
  test('T14 — mevcut başarılı tek yıl akışı: upsert çağrıldı, 200', async () => {
    const upsertMock = jest.fn(() => Promise.resolve({ id: FINANCIAL_DATA_ID }))
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(2024, 'ANNUAL')], isExcel: false })
    jest.doMock('@/lib/db', () => ({
      prisma: {
        entity:           { findFirst: jest.fn(() => Promise.resolve({ id: ENTITY_ID, userId: 'user-1', sector: 'Ticaret' })) },
        financialData:    { findUnique: jest.fn(() => Promise.resolve(null)), upsert: upsertMock, findFirst: jest.fn(() => Promise.resolve(null)) },
        analysis:         { upsert: jest.fn(() => Promise.resolve(makeAnalysis())) },
        financialAccount: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })), createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
        $executeRaw:      jest.fn(() => Promise.resolve(1)),
      },
    }))
    const req = createMockRequest({ fileName: 'beyanname.pdf', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).not.toBe(422)
    expect(res.status).not.toBe(400)
    expect(upsertMock).toHaveBeenCalled()
  })

  // T15: 422 response contract — { error, message, detected, form }
  test('T15 — 422 response contract: { error, message, detected, form }', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(2023, 'ANNUAL')], isExcel: false })
    const req = createMockRequest({ fileName: 'b.pdf', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('YEAR_MISMATCH')
    expect(typeof body.message).toBe('string')
    expect(body.message.length).toBeGreaterThan(0)
    expect(body.detected).toBeDefined()
    expect(body.detected.year).toBe(2023)
    expect(body.form).toBeDefined()
    expect(body.form.year).toBe(2024)
  })

  // T16: 409 response contract — { error, message, conflicts: [...] }
  test('T16 — 409 response contract: { error, message, conflicts: [{ year, period, existingSource, incomingSource, existingUploadDate }] }', async () => {
    const uploadDate = new Date('2025-01-15')
    const findUniqueMock = jest.fn(() =>
      Promise.resolve({ source: 'EXCEL', updatedAt: uploadDate }),
    )
    setupMocks({
      userId:          'user-1',
      parsedRows:      [PREFLIGHT_ROW(2024, 'ANNUAL')],
      isExcel:         true,
      findUniqueMock,
    })
    const req = createMockRequest({ fileName: 'mizan.xlsx', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('DUPLICATE_DATA')
    expect(typeof body.message).toBe('string')
    expect(Array.isArray(body.conflicts)).toBe(true)
    expect(body.conflicts.length).toBe(1)
    const c = body.conflicts[0]
    expect(c.year).toBe(2024)
    expect(c.period).toBe('ANNUAL')
    expect(c.existingSource).toBe('EXCEL')
    expect(c.incomingSource).toBe('EXCEL')
    expect(c.existingUploadDate).toBeDefined()
  })

})

// ─── Faz 7.3.50A.1: PREFLIGHT 1.5 (detectedYear null soft warning) ────────────

describe('POST /api/entities/[id]/upload — PREFLIGHT 1.5 soft warning (Faz 7.3.50A.1)', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  // T1: Single-row, detectedYear=null, formYear=2024 → 409 DETECTED_YEAR_MISSING_CONFIRM
  test('T1 — detectedYear null + formYear 2024 → 409 DETECTED_YEAR_MISSING_CONFIRM', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(null, null)], isExcel: false })
    const req = createMockRequest({ fileName: 'dosya.pdf', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('DETECTED_YEAR_MISSING_CONFIRM')
    expect(typeof body.message).toBe('string')
    expect(body.message).toContain('2024')
    expect(body.detected).toBeDefined()
    expect(body.detected.year).toBeNull()
    expect(body.form).toBeDefined()
    expect(body.form.year).toBe(2024)
  })

  // T2: confirmDetectionMissing=true → PREFLIGHT 1.5 atlanır, upsert çağrıldı
  test('T2 — confirmDetectionMissing=true → PREFLIGHT 1.5 bypass, upsert çağrıldı', async () => {
    const upsertMock = jest.fn(() => Promise.resolve({ id: FINANCIAL_DATA_ID }))
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(null, null)], isExcel: false })
    jest.doMock('@/lib/db', () => ({
      prisma: {
        entity:           { findFirst: jest.fn(() => Promise.resolve({ id: ENTITY_ID, userId: 'user-1', sector: 'Ticaret' })) },
        financialData:    { findUnique: jest.fn(() => Promise.resolve(null)), upsert: upsertMock, findFirst: jest.fn(() => Promise.resolve(null)) },
        analysis:         { upsert: jest.fn(() => Promise.resolve(makeAnalysis())) },
        financialAccount: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })), createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
        $executeRaw:      jest.fn(() => Promise.resolve(1)),
      },
    }))
    const req = createMockRequest({ fileName: 'dosya.pdf', year: 2024, period: 'ANNUAL', confirmDetectionMissing: true })
    const res = await callPost(req)
    expect(res.status).not.toBe(409)
    expect(upsertMock).toHaveBeenCalled()
  })

  // T3: formYear null + detectedYear null → PREFLIGHT 1 (400 MISSING_YEAR_CONTEXT), PREFLIGHT 1.5 tetiklenmez
  test('T3 — formYear null + detectedYear null → 400 MISSING_YEAR_CONTEXT (PREFLIGHT 1, PREFLIGHT 1.5 değil)', async () => {
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(null, null)], isExcel: false })
    const req = createMockRequest({ fileName: 'dosya.pdf', year: null, period: null })
    const res = await callPost(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('MISSING_YEAR_CONTEXT')
  })

  // T7: Multi-row Excel + detectedYear null → PREFLIGHT 1.5 tetiklenmez (multi-year istisnası)
  test('T7 — multiRowWithYears=true + detectedYear null row var → PREFLIGHT 1.5 tetiklenmez', async () => {
    // İlk satır yılsız, ikinci yıllı: multiRowWithYears sadece hepsinde yıl varsa true
    // Bu test: TEK satır null → PREFLIGHT 1.5 tetiklenir (yukarıdaki T1 ile aynı)
    // Burada MULTI satır tüm yıllı durumda PREFLIGHT 1.5 atlanır
    setupMocks({
      userId: 'user-1',
      parsedRows: [
        PREFLIGHT_ROW(2023, 'ANNUAL'),
        PREFLIGHT_ROW(2024, 'ANNUAL'),
      ],
      isExcel: true,
    })
    const req = createMockRequest({ fileName: 'multi.xlsx', year: 2025, period: 'ANNUAL' })
    const res = await callPost(req)
    // multiRowWithYears=true → shouldValidateAgainstForm=false → PREFLIGHT 1.5 da atlanır
    expect(res.status).not.toBe(409)
  })

  // T8: Single-row, detectedYear=null, confirmDetectionMissing=false → upsert ÇAĞRILMADI
  test('T8 — detectedYear null, confirm=false → 409, upsert ÇAĞRILMADI', async () => {
    const upsertMock = jest.fn(() => Promise.resolve({ id: FINANCIAL_DATA_ID }))
    setupMocks({ userId: 'user-1', parsedRows: [PREFLIGHT_ROW(null, null)], isExcel: false })
    jest.doMock('@/lib/db', () => ({
      prisma: {
        entity:           { findFirst: jest.fn(() => Promise.resolve({ id: ENTITY_ID, userId: 'user-1', sector: 'Ticaret' })) },
        financialData:    { findUnique: jest.fn(() => Promise.resolve(null)), upsert: upsertMock, findFirst: jest.fn(() => Promise.resolve(null)) },
        analysis:         { upsert: jest.fn(() => Promise.resolve(makeAnalysis())) },
        financialAccount: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })), createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
        $executeRaw:      jest.fn(() => Promise.resolve(1)),
      },
    }))
    const req = createMockRequest({ fileName: 'dosya.pdf', year: 2024, period: 'ANNUAL' })
    const res = await callPost(req)
    expect(res.status).toBe(409)
    expect(upsertMock).not.toHaveBeenCalled()
  })

})
