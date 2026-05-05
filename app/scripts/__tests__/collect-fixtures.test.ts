/**
 * collect-fixtures.test.ts — Fixture Toplama Script Testleri (Faz 7.3.40)
 *
 * testEnvironment: 'node' — saf fonksiyonlar test edilir.
 * Prisma / fetch / signToken çağrıları yapılmaz — main() test edilmez.
 *
 * T1: PERIOD_RANK sıralama mantığı
 * T2: Entity name alias eşleşme
 * T3: Latest period seçim mantığı (sortAnalysesByRecency)
 * T4: Sonnet diff raporu (makeSonnetDiffReport)
 * T5: Path resolution — __dirname relative, cwd bağımsız
 */

// auth.ts JWT_SECRET atar — mock önce tanımlanmalı
jest.mock('../../src/lib/auth', () => ({
  signToken: jest.fn(() => 'mock-jwt-token'),
}))

// Prisma/pg modülleri: sınıf tanımları, side-effect yok — mock gerekmez
// collect-fixtures.ts: Prisma sadece main() içinde instantiate edilir

import {
  PERIOD_RANK,
  ENTITY_ALIASES,
  SCENARIOS,
  sortAnalysesByRecency,
  getEntityAliases,
  resolveEntityKey,
  makeFixtureFilename,
  makeSonnetDiffReport,
  resolvePathsFromDir,
  type ScenarioConfig,
} from '../collect-fixtures'

import path from 'path'

// ─── T1: PERIOD_RANK sıralama ─────────────────────────────────────────────────

describe('T1 — PERIOD_RANK: sıralama sabitleri', () => {

  test('ANNUAL en düşük rank (en güncel dönem)', () => {
    expect(PERIOD_RANK['ANNUAL']).toBe(0)
  })

  test('Q4 < Q3 < Q2 < Q1 sıralaması', () => {
    expect(PERIOD_RANK['Q4']).toBeLessThan(PERIOD_RANK['Q3'])
    expect(PERIOD_RANK['Q3']).toBeLessThan(PERIOD_RANK['Q2'])
    expect(PERIOD_RANK['Q2']).toBeLessThan(PERIOD_RANK['Q1'])
  })

  test('ANNUAL < Q1 (en güncel → en eski)', () => {
    expect(PERIOD_RANK['ANNUAL']).toBeLessThan(PERIOD_RANK['Q1'])
  })

  test('Bilinmeyen period undefined döner', () => {
    expect(PERIOD_RANK['QUARTERLY']).toBeUndefined()
  })

})

// ─── T2: Entity alias eşleşme ─────────────────────────────────────────────────

describe('T2 — Entity aliasing: Türkçe karakter toleransı', () => {

  test('getEntityAliases: DEKA canonical key → alias listesi', () => {
    const aliases = getEntityAliases('DEKA')
    expect(aliases).toContain('DEKA')
    expect(aliases).toContain('deka')
  })

  test('getEntityAliases: İSRA → Türkçe ve ASCII varyantları', () => {
    const aliases = getEntityAliases('İSRA')
    expect(aliases).toContain('İSRA')
    expect(aliases).toContain('ISRA')
    expect(aliases).toContain('isra')
  })

  test('getEntityAliases: İPOS → Türkçe ve ASCII varyantları', () => {
    const aliases = getEntityAliases('İPOS')
    expect(aliases).toContain('İPOS')
    expect(aliases).toContain('IPOS')
    expect(aliases).toContain('ipos')
  })

  test('resolveEntityKey: "DEKA" → canonical "DEKA"', () => {
    expect(resolveEntityKey('DEKA')).toBe('DEKA')
  })

  test('resolveEntityKey: "isra" → canonical "İSRA"', () => {
    expect(resolveEntityKey('isra')).toBe('İSRA')
  })

  test('resolveEntityKey: "ISRA" → canonical "İSRA"', () => {
    expect(resolveEntityKey('ISRA')).toBe('İSRA')
  })

  test('resolveEntityKey: "IPOS" → canonical "İPOS"', () => {
    expect(resolveEntityKey('IPOS')).toBe('İPOS')
  })

  test('resolveEntityKey: bilinmeyen → undefined', () => {
    expect(resolveEntityKey('UNKNOWN_FIRM')).toBeUndefined()
  })

  test('ENTITY_ALIASES: 5 firma tanımlı', () => {
    const keys = Object.keys(ENTITY_ALIASES)
    expect(keys).toHaveLength(5)
    expect(keys).toContain('DEKA')
    expect(keys).toContain('DEKAM')
    expect(keys).toContain('ENES')
    expect(keys).toContain('İSRA')
    expect(keys).toContain('İPOS')
  })

})

// ─── T3: Latest period seçim ──────────────────────────────────────────────────

describe('T3 — sortAnalysesByRecency: latest period kuralı', () => {

  function makeAnalysis(year: number, period: string, createdAt: Date) {
    return { id: `${year}-${period}`, year, period, userId: 'u1', createdAt }
  }

  const d = (dateStr: string) => new Date(dateStr)

  test('year DESC: 2024 > 2022', () => {
    const analyses = [
      makeAnalysis(2022, 'ANNUAL', d('2023-01-01')),
      makeAnalysis(2024, 'ANNUAL', d('2025-01-01')),
    ]
    const sorted = sortAnalysesByRecency(analyses)
    expect(sorted[0].year).toBe(2024)
  })

  test('PERIOD_RANK: ANNUAL > Q1 (aynı yıl)', () => {
    const analyses = [
      makeAnalysis(2024, 'Q1',     d('2024-05-01')),
      makeAnalysis(2024, 'ANNUAL', d('2024-12-01')),
    ]
    const sorted = sortAnalysesByRecency(analyses)
    expect(sorted[0].period).toBe('ANNUAL')
  })

  test('createdAt DESC: aynı year+period → daha yeni önce', () => {
    const analyses = [
      makeAnalysis(2024, 'ANNUAL', d('2025-01-01')),
      makeAnalysis(2024, 'ANNUAL', d('2025-06-01')),
    ]
    const sorted = sortAnalysesByRecency(analyses)
    expect(sorted[0].createdAt).toEqual(d('2025-06-01'))
  })

  test('karışık liste → doğru sıralama', () => {
    const analyses = [
      makeAnalysis(2022, 'Q1',     d('2022-06-01')),
      makeAnalysis(2024, 'Q3',     d('2024-10-01')),
      makeAnalysis(2024, 'ANNUAL', d('2025-01-01')),
      makeAnalysis(2023, 'ANNUAL', d('2024-01-01')),
    ]
    const sorted = sortAnalysesByRecency(analyses)
    expect(sorted[0]).toMatchObject({ year: 2024, period: 'ANNUAL' })
    expect(sorted[1]).toMatchObject({ year: 2024, period: 'Q3' })
    expect(sorted[2]).toMatchObject({ year: 2023, period: 'ANNUAL' })
    expect(sorted[3]).toMatchObject({ year: 2022, period: 'Q1' })
  })

  test('tek elemanlı liste → aynı döner', () => {
    const analyses = [makeAnalysis(2024, 'ANNUAL', d('2025-01-01'))]
    expect(sortAnalysesByRecency(analyses)).toHaveLength(1)
  })

  test('boş liste → boş döner', () => {
    expect(sortAnalysesByRecency([])).toHaveLength(0)
  })

  test('orijinal listeyi mutate etmez (immutable)', () => {
    const analyses = [
      makeAnalysis(2022, 'ANNUAL', d('2023-01-01')),
      makeAnalysis(2024, 'ANNUAL', d('2025-01-01')),
    ]
    const originalFirst = analyses[0]
    sortAnalysesByRecency(analyses)
    expect(analyses[0]).toBe(originalFirst)  // mutate edilmemiş
  })

})

// ─── T4: Sonnet diff raporu ───────────────────────────────────────────────────

describe('T4 — makeSonnetDiffReport: diff hesabı', () => {

  const sonnetRef = {
    sonnetNotchesGained: 2,
    sonnetActions: [
      { code: 'A10_CASH_EQUITY_INJECTION' },
      { code: 'A05_RECEIVABLES_FACTORING' },
      { code: 'A12_COGS_REDUCTION' },
      { code: 'A07_INVENTORY_TURNOVER' },
    ],
  }

  test('engine 0 notch, sonnet 2 → gap +2 raporda', () => {
    const diag = { decision: { notchesGained: 0 }, actions: [] }
    const report = makeSonnetDiffReport(diag, sonnetRef)
    expect(report).toContain('Gap: **+2**')
  })

  test('engine portföyü boş → tüm sonnet aksiyonları eksik', () => {
    const diag = { decision: { notchesGained: 0 }, actions: [] }
    const report = makeSonnetDiffReport(diag, sonnetRef)
    expect(report).toContain('A10_CASH_EQUITY_INJECTION')
    expect(report).toContain('A05_RECEIVABLES_FACTORING')
  })

  test('engine fazla aksiyon → extraActions raporda', () => {
    const diag = {
      decision: { notchesGained: 1 },
      actions: [
        { code: 'A10_CASH_EQUITY_INJECTION' },
        { code: 'A99_UNKNOWN' },
      ],
    }
    const report = makeSonnetDiffReport(diag, sonnetRef)
    expect(report).toContain('A99_UNKNOWN')
    // A10 artık eksik değil
    expect(report.split('## Eksik Aksiyonlar')[1]).not.toContain('A10_CASH_EQUITY_INJECTION')
  })

  test('engine sonnet ile eşleşiyor → gap 0, eksik/fazla yok', () => {
    const diag = {
      decision: { notchesGained: 2 },
      actions: [
        { code: 'A10_CASH_EQUITY_INJECTION' },
        { code: 'A05_RECEIVABLES_FACTORING' },
        { code: 'A12_COGS_REDUCTION' },
        { code: 'A07_INVENTORY_TURNOVER' },
      ],
    }
    const report = makeSonnetDiffReport(diag, sonnetRef)
    expect(report).toContain('Gap: **0**')
    expect(report).toContain('*(yok)*')  // hem eksik hem fazla yok
  })

  test('rapor başlık içerir', () => {
    const diag   = { decision: { notchesGained: 0 }, actions: [] }
    const report = makeSonnetDiffReport(diag, sonnetRef)
    expect(report).toContain('# DEKA 2022 — Engine vs Sonnet')
    expect(report).toContain('Notch Farkı')
  })

})

// ─── T5: Path resolution ──────────────────────────────────────────────────────

describe('T5 — resolvePathsFromDir: cwd bağımsız path hesabı', () => {

  const mockScriptsDir = path.join('/mock', 'app', 'scripts')

  test('FIXTURES_DIR instrumentation klasörüne işaret eder', () => {
    const paths = resolvePathsFromDir(mockScriptsDir)
    const normalized = paths.FIXTURES_DIR.replace(/\\/g, '/')
    expect(normalized).toContain('fixtures/instrumentation')
    expect(normalized).toContain('scenarioV3')
  })

  test('SONNET_REF_PATH DEKA-2022.json dosyasına işaret eder', () => {
    const paths = resolvePathsFromDir(mockScriptsDir)
    expect(path.basename(paths.SONNET_REF_PATH)).toBe('DEKA-2022.json')
    expect(paths.SONNET_REF_PATH).toContain('sonnet-reference')
  })

  test('ERRORS_LOG scripts/ altında (scriptsDir içinde)', () => {
    const paths = resolvePathsFromDir(mockScriptsDir)
    const normalized = paths.ERRORS_LOG.replace(/\\/g, '/')
    expect(normalized).toContain('/app/scripts/')
    expect(path.basename(paths.ERRORS_LOG)).toBe('collection-errors.log')
  })

  test('COMPARISON_REPORT instrumentation/ altında', () => {
    const paths = resolvePathsFromDir(mockScriptsDir)
    expect(path.basename(paths.COMPARISON_REPORT)).toBe('comparison-report.md')
    expect(paths.COMPARISON_REPORT).toContain('instrumentation')
  })

  test('farklı scriptsDir → farklı path (cwd bağımsız)', () => {
    const paths1 = resolvePathsFromDir('/project-a/scripts')
    const paths2 = resolvePathsFromDir('/project-b/scripts')
    expect(paths1.FIXTURES_DIR).not.toBe(paths2.FIXTURES_DIR)
    expect(paths1.FIXTURES_DIR).toContain('project-a')
    expect(paths2.FIXTURES_DIR).toContain('project-b')
  })

})

// ─── BONUS: SCENARIOS yapısı ──────────────────────────────────────────────────

describe('SCENARIOS: 12 senaryo tanımlı', () => {

  test('tam 12 senaryo', () => {
    expect(SCENARIOS).toHaveLength(12)
  })

  test('her senaryo entity, target alanına sahip', () => {
    for (const sc of SCENARIOS as ScenarioConfig[]) {
      expect(typeof sc.entity).toBe('string')
      expect(typeof sc.target).toBe('string')
    }
  })

  test('İSRA ve İPOS year=null, period=null (latest policy)', () => {
    const isra = SCENARIOS.filter(s => s.entity === 'İSRA')
    const ipos = SCENARIOS.filter(s => s.entity === 'İPOS')
    expect(isra.every(s => s.year === null)).toBe(true)
    expect(ipos.every(s => s.period === null)).toBe(true)
  })

  test('BB ve BBB hedefleri her firmada var', () => {
    const entities = [...new Set(SCENARIOS.map(s => s.entity))]
    for (const e of entities) {
      const targets = SCENARIOS.filter(s => s.entity === e).map(s => s.target)
      expect(targets).toContain('BB')
      expect(targets).toContain('BBB')
    }
  })

  test('makeFixtureFilename: deterministik format', () => {
    const name = makeFixtureFilename('DEKA', 2022, 'ANNUAL', 'BB')
    expect(name).toBe('DEKA-2022-ANNUAL-target-BB.json')
  })

})
