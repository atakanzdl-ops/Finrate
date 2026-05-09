/**
 * GET /api/analyses — missingQuarterlySourceWarning integration testleri
 * (Faz 7.3.50A.10)
 *
 * Odak:
 *   T_API1: Q4 + sadece 1xx-5xx → BEYANNAME_MISSING + financialAccounts sızıntı yok
 *   T_API2: Q4 + sadece 6xx    → MIZAN_MISSING
 *   T_API3: Q4 + her ikisi     → null
 *   T_API4: ANNUAL + sadece 1xx-5xx → null
 *
 * Mock stratejisi: jest.doMock + jest.resetModules() + dynamic import
 */

function makeRawRow(opts: {
  period: string
  financialAccounts: Array<{ accountCode: string }>
}) {
  return {
    id:                   'a-1',
    year:                 2025,
    period:               opts.period,
    updatedAt:            new Date(),
    finalScore:           72,
    finalRating:          'B',
    liquidityScore:       70,
    profitabilityScore:   70,
    leverageScore:        70,
    activityScore:        70,
    ratios:               JSON.stringify({ __overallCoverage: 0.9, __insufficientCategories: [] }),
    entity:               { id: 'e-1', name: 'Test Firması', sector: 'Ticaret', taxNumber: null },
    financialAccounts:    opts.financialAccounts,
    financialData:        { revenue: 1_000_000, cogs: null, grossProfit: null, operatingExpenses: null, ebit: null, ebitda: null, interestExpense: null, ebt: null, netProfit: null, depreciation: null, cash: null, tradeReceivables: null, inventory: null, totalCurrentAssets: null, tangibleAssets: null, totalNonCurrentAssets: null, totalAssets: null, shortTermFinancialDebt: null, tradePayables: null, totalCurrentLiabilities: null, longTermFinancialDebt: null, totalNonCurrentLiabilities: null, totalEquity: null, totalLiabilitiesAndEquity: null },
  }
}

function setupMocks(rawRows: object[]) {
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
    getUserIdFromRequest: jest.fn(() => 'user-1'),
  }))

  jest.doMock('@/lib/db', () => ({
    prisma: {
      analysis: {
        findMany: jest.fn(() => Promise.resolve(rawRows)),
      },
    },
  }))
}

async function callGet() {
  const { GET } = await import('./route')
  const req = {
    cookies: { get: jest.fn(() => undefined) },
    headers: { get: jest.fn(() => null) },
  } as any
  return GET(req)
}

describe('GET /api/analyses — missingQuarterlySourceWarning (Faz 7.3.50A.10)', () => {

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  // T_API1: Q4 + sadece bilanço → BEYANNAME_MISSING, financialAccounts sızıntı yok
  test('T_API1 — Q4 + sadece 1xx-5xx → BEYANNAME_MISSING, financialAccounts yok', async () => {
    setupMocks([
      makeRawRow({
        period: 'Q4',
        financialAccounts: [
          { accountCode: '100' },
          { accountCode: '153' },
          { accountCode: '321' },
        ],
      }),
    ])
    const res = await callGet()
    const body = await res.json()
    expect(res.status).toBe(200)
    const a = body.analyses[0]
    expect(a.missingQuarterlySourceWarning).toBe('BEYANNAME_MISSING')
    expect(a.hasBalanceAccounts).toBe(true)
    expect(a.hasIncomeAccounts).toBe(false)
    // financialAccounts sızıntı yok
    expect(a).not.toHaveProperty('financialAccounts')
  })

  // T_API2: Q4 + sadece 6xx → MIZAN_MISSING
  test('T_API2 — Q4 + sadece 6xx → MIZAN_MISSING', async () => {
    setupMocks([
      makeRawRow({
        period: 'Q4',
        financialAccounts: [
          { accountCode: '600' },
          { accountCode: '621' },
        ],
      }),
    ])
    const res = await callGet()
    const body = await res.json()
    const a = body.analyses[0]
    expect(a.missingQuarterlySourceWarning).toBe('MIZAN_MISSING')
    expect(a.hasBalanceAccounts).toBe(false)
    expect(a.hasIncomeAccounts).toBe(true)
  })

  // T_API3: Q4 + her iki grup → null
  test('T_API3 — Q4 + 1xx + 6xx → null (tam veri)', async () => {
    setupMocks([
      makeRawRow({
        period: 'Q4',
        financialAccounts: [
          { accountCode: '100' },
          { accountCode: '600' },
        ],
      }),
    ])
    const res = await callGet()
    const body = await res.json()
    const a = body.analyses[0]
    expect(a.missingQuarterlySourceWarning).toBeNull()
    expect(a.hasBalanceAccounts).toBe(true)
    expect(a.hasIncomeAccounts).toBe(true)
  })

  // T_API4: ANNUAL + sadece bilanço → null (ANNUAL uyarı dışı)
  test('T_API4 — ANNUAL + sadece 1xx-5xx → null (ANNUAL dışında uyarı yok)', async () => {
    setupMocks([
      makeRawRow({
        period: 'ANNUAL',
        financialAccounts: [
          { accountCode: '100' },
          { accountCode: '321' },
        ],
      }),
    ])
    const res = await callGet()
    const body = await res.json()
    const a = body.analyses[0]
    expect(a.missingQuarterlySourceWarning).toBeNull()
  })

})
