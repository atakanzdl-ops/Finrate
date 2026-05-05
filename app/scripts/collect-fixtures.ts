/**
 * collect-fixtures.ts — Faz 7.3.40 Fixture Toplama Scripti (Mode A: Üretim)
 *
 * Hibrit kalibrasyon verisi için 12 senaryo × ?diagnostics=1 API çağrısı.
 *
 * Çalıştırma (Mode B — Atakan):
 *   npm run fixtures:collect
 *
 * Ön koşul: npm run dev ile server çalışıyor olmalı.
 *
 * Çıktı:
 *   src/lib/scoring/scenarioV3/__tests__/fixtures/instrumentation/*.json
 *   src/lib/scoring/scenarioV3/__tests__/fixtures/instrumentation/comparison-report.md
 *   scripts/collection-errors.log (hata varsa)
 */

import path            from 'path'
import fs              from 'fs/promises'
import { readFileSync } from 'fs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = require('pg') as { Pool: new (opts: { connectionString?: string }) => { end(): Promise<void> } }
import { PrismaClient } from '@prisma/client'
import { PrismaPg }    from '@prisma/adapter-pg'
import { signToken }   from '../src/lib/auth'

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface ScenarioConfig {
  entity: string       // Canonical key (DEKA, DEKAM, ...)
  year:   number | null
  period: string | null
  target: string       // Hedef rating (BB, BBB, ...)
}

interface DiagnosticsLike {
  decision: { notchesGained: number }
  actions:  Array<{ code: string }>
  [key: string]: unknown
}

interface SonnetRefLike {
  sonnetNotchesGained: number
  sonnetActions: Array<{ code: string }>
}

// ─── Sabitler ────────────────────────────────────────────────────────────────

/** Latest period sıralama kural (küçük = daha güncel) */
export const PERIOD_RANK: Record<string, number> = {
  ANNUAL: 0,
  Q4: 1,
  Q3: 2,
  Q2: 3,
  Q1: 4,
}

/** Türkçe karakter entity alias haritası */
export const ENTITY_ALIASES: Record<string, string[]> = {
  'DEKA':  ['DEKA',  'deka',  'Deka'],
  'DEKAM': ['DEKAM', 'dekam', 'Dekam'],
  'ENES':  ['ENES',  'enes',  'Enes'],
  'İSRA':  ['İSRA',  'ISRA',  'İsra', 'isra', 'Isra'],
  'İPOS':  ['İPOS',  'IPOS',  'İpos', 'ipos', 'Ipos'],
}

/** 12 senaryo: 5 firma × dönem × 2 hedef */
export const SCENARIOS: ScenarioConfig[] = [
  { entity: 'DEKA',  year: 2022, period: 'ANNUAL', target: 'BB'  },
  { entity: 'DEKA',  year: 2022, period: 'ANNUAL', target: 'BBB' },
  { entity: 'DEKA',  year: 2024, period: 'ANNUAL', target: 'BB'  },
  { entity: 'DEKA',  year: 2024, period: 'ANNUAL', target: 'BBB' },
  { entity: 'DEKAM', year: 2024, period: 'ANNUAL', target: 'BB'  },
  { entity: 'DEKAM', year: 2024, period: 'ANNUAL', target: 'BBB' },
  { entity: 'ENES',  year: 2024, period: 'ANNUAL', target: 'BB'  },
  { entity: 'ENES',  year: 2024, period: 'ANNUAL', target: 'BBB' },
  { entity: 'İSRA',  year: null, period: null,     target: 'BB'  },
  { entity: 'İSRA',  year: null, period: null,     target: 'BBB' },
  { entity: 'İPOS',  year: null, period: null,     target: 'BB'  },
  { entity: 'İPOS',  year: null, period: null,     target: 'BBB' },
]

// ─── Saf yardımcı fonksiyonlar (test edilebilir, export) ─────────────────────

/**
 * Entity key'i için tüm DB lookup alias'larını döndürür.
 * Prisma `name: { in: aliases }` filtresinde kullanılır.
 */
export function getEntityAliases(entityKey: string): string[] {
  return ENTITY_ALIASES[entityKey] ?? [entityKey]
}

/**
 * DB'den gelen entity name'ini canonical key'e çözer.
 * Büyük/küçük harf duyarsız eşleşme.
 */
export function resolveEntityKey(name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [key, aliases] of Object.entries(ENTITY_ALIASES)) {
    if (aliases.some(a => a.toLowerCase() === lower)) return key
  }
  return undefined
}

/**
 * Analysis listesini yenilik sırasına göre sıralar.
 * Sıralama kuralı: year DESC → PERIOD_RANK ASC → createdAt DESC
 */
export function sortAnalysesByRecency<
  T extends { year: number; period: string; createdAt: Date }
>(analyses: T[]): T[] {
  return [...analyses].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    const rA = PERIOD_RANK[a.period] ?? 99
    const rB = PERIOD_RANK[b.period] ?? 99
    if (rA !== rB) return rA - rB
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

/** Fixture dosya adı üretir: ENTITY-YEAR-PERIOD-target-TARGET.json */
export function makeFixtureFilename(
  entityKey: string,
  year:      number | string,
  period:    string,
  target:    string,
): string {
  return `${entityKey}-${year}-${period}-target-${target}.json`
}

/**
 * Path resolution — cwd bağımsız.
 * scriptsDir: app/scripts/ dizini (test için mock edilebilir).
 */
export function resolvePathsFromDir(scriptsDir: string) {
  const appDir = path.resolve(scriptsDir, '..')  // → app/
  const fixturesBase = path.join(
    appDir,
    'src/lib/scoring/scenarioV3/__tests__/fixtures',
  )
  return {
    FIXTURES_DIR:       path.join(fixturesBase, 'instrumentation'),
    SONNET_REF_PATH:    path.join(fixturesBase, 'sonnet-reference', 'DEKA-2022.json'),
    ERRORS_LOG:         path.join(scriptsDir, 'collection-errors.log'),
    COMPARISON_REPORT:  path.join(fixturesBase, 'instrumentation', 'comparison-report.md'),
  }
}

/**
 * Engine vs Sonnet diff markdown raporu üretir.
 * DEKA-2022-BBB senaryosu için çağrılır.
 */
export function makeSonnetDiffReport(
  diagnostics: DiagnosticsLike,
  sonnetRef:   SonnetRefLike,
): string {
  const engineCodes = new Set(diagnostics.actions.map(a => a.code))
  const sonnetCodes = new Set(sonnetRef.sonnetActions.map(a => a.code))

  const missing = sonnetRef.sonnetActions.map(a => a.code).filter(c => !engineCodes.has(c))
  const extra   = diagnostics.actions.map(a => a.code).filter(c => !sonnetCodes.has(c))
  const gap     = sonnetRef.sonnetNotchesGained - diagnostics.decision.notchesGained

  return [
    '# DEKA 2022 — Engine vs Sonnet Karşılaştırma',
    '',
    '## Notch Farkı',
    `- Sonnet: **${sonnetRef.sonnetNotchesGained}** notch`,
    `- Engine: **${diagnostics.decision.notchesGained}** notch`,
    `- Gap: **${gap > 0 ? '+' : ''}${gap}** (Sonnet − Engine)`,
    '',
    "## Eksik Aksiyonlar (Sonnet'te var, Engine'de yok)",
    missing.length > 0 ? missing.map(c => `- \`${c}\``).join('\n') : '- *(yok)*',
    '',
    "## Fazla Aksiyonlar (Engine'de var, Sonnet'te yok)",
    extra.length > 0   ? extra.map(c => `- \`${c}\``).join('\n')   : '- *(yok)*',
    '',
    `_Oluşturuldu: ${new Date().toISOString()}_`,
  ].join('\n')
}

// ─── .env yükleme ─────────────────────────────────────────────────────────────

function loadDotenv(appDir: string): void {
  try {
    const envPath = path.join(appDir, '.env')
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
      if (!match) continue
      const k = match[1].trim()
      const v = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch { /* .env yoksa ortam değişkenlerini kullan */ }
}

// ─── Pre-flight: server health check ──────────────────────────────────────────

async function checkServerRunning(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Path resolution: tsx __dirname shimini destekler; ts-jest CJS'de native
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scriptsDir: string = typeof (globalThis as any).__dirname === 'string'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (globalThis as any).__dirname as string
    : path.dirname(path.resolve(process.argv[1] ?? process.cwd()))

  const paths  = resolvePathsFromDir(scriptsDir)
  const appDir = path.resolve(scriptsDir, '..')

  loadDotenv(appDir)

  console.log('═══ Finrate Fixture Collector — Faz 7.3.40 ═══\n')

  // Pre-flight
  const serverUp = await checkServerRunning('http://localhost:3000/', 2000)
  if (!serverUp) {
    console.error('✗ Server kapalı! `npm run dev` ile başlatın, sonra tekrar deneyin.')
    process.exit(1)
  }
  console.log('✓ Server aktif\n')

  // Prisma
  const pool    = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter })

  const ENDPOINT = 'http://localhost:3000/api/scenarios/v3?diagnostics=1'
  const errors: string[]  = []
  let successCount = 0
  let skipCount    = 0

  // Sonnet referans
  let sonnetRef: SonnetRefLike | null = null
  try {
    const raw = await fs.readFile(paths.SONNET_REF_PATH, 'utf8')
    sonnetRef  = JSON.parse(raw) as SonnetRefLike
  } catch {
    console.warn('⚠  DEKA-2022.json okunamadı — diff raporu atlanacak\n')
  }

  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc    = SCENARIOS[i]
    const label = `Senaryo ${i + 1}/${SCENARIOS.length}: ${sc.entity} ${sc.year ?? 'latest'} ${sc.period ?? ''} → ${sc.target}`
    process.stdout.write(`${label} ... `)

    // 1. Entity bul
    const aliases = getEntityAliases(sc.entity)
    const entity  = await prisma.entity.findFirst({
      where:  { name: { in: aliases } },
      select: { id: true, userId: true },
    }).catch(() => null)

    if (!entity) {
      console.log('SKIP (entity bulunamadı)')
      errors.push(`[${sc.entity}] Entity bulunamadı (aliases: ${aliases.join(', ')})`)
      skipCount++
      continue
    }

    // 2. Analysis bul
    let analysis: { id: string; year: number; period: string; userId: string } | null = null

    if (sc.year !== null && sc.period !== null) {
      analysis = await prisma.analysis.findFirst({
        where:  { entityId: entity.id, year: sc.year, period: sc.period },
        select: { id: true, year: true, period: true, userId: true },
      }).catch(() => null)
    } else {
      const all = await prisma.analysis.findMany({
        where:  { entityId: entity.id },
        select: { id: true, year: true, period: true, userId: true, createdAt: true },
      }).catch(() => [] as Array<{ id: string; year: number; period: string; userId: string; createdAt: Date }>)
      const sorted = sortAnalysesByRecency(all)
      analysis = sorted[0] ?? null
    }

    if (!analysis) {
      console.log('SKIP (analiz bulunamadı)')
      errors.push(`[${sc.entity}/${sc.year ?? 'latest'}] Analysis bulunamadı`)
      skipCount++
      continue
    }

    // 3. Token üret
    const user = await prisma.user.findUnique({
      where:  { id: analysis.userId },
      select: { id: true, email: true, role: true },
    }).catch(() => null)

    if (!user?.email) {
      console.log('SKIP (user bulunamadı)')
      errors.push(`[${sc.entity}] User bulunamadı (userId: ${analysis.userId})`)
      skipCount++
      continue
    }

    const token = signToken({
      userId: user.id,
      email:  user.email,
      role:   user.role ?? 'admin',
    })

    // 4. API çağrısı
    let diagnostics: DiagnosticsLike | null = null
    try {
      const ctrl  = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      const res   = await fetch(ENDPOINT, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body:   JSON.stringify({ analysisId: analysis.id, targetGrade: sc.target }),
        signal: ctrl.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      }

      // route.ts: diagnostics spread ile top-level → response.diagnostics
      const data = await res.json() as Record<string, unknown>
      diagnostics = (data.diagnostics as DiagnosticsLike | undefined) ?? null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`SKIP (API hatası: ${msg.slice(0, 80)})`)
      errors.push(`[${sc.entity}/${analysis.year}/${analysis.period}/${sc.target}] ${msg}`)
      skipCount++
      continue
    }

    if (!diagnostics) {
      console.log('SKIP (diagnostics boş)')
      errors.push(`[${sc.entity}/${analysis.year}/${analysis.period}/${sc.target}] diagnostics null`)
      skipCount++
      continue
    }

    // 5. Fixture yaz
    const filename = makeFixtureFilename(sc.entity, analysis.year, analysis.period, sc.target)
    const filePath = path.join(paths.FIXTURES_DIR, filename)
    await fs.mkdir(paths.FIXTURES_DIR, { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(diagnostics, null, 2), 'utf8')
    console.log('✓')
    successCount++

    // 6. DEKA 2022 BBB → Sonnet diff raporu
    if (sc.entity === 'DEKA' && sc.year === 2022 && sc.target === 'BBB' && sonnetRef) {
      const report = makeSonnetDiffReport(diagnostics, sonnetRef)
      await fs.writeFile(paths.COMPARISON_REPORT, report, 'utf8')
      console.log(`  → Sonnet diff raporu: ${path.basename(paths.COMPARISON_REPORT)}`)
    }
  }

  // Hata logu
  if (errors.length > 0) {
    await fs.writeFile(paths.ERRORS_LOG, errors.join('\n'), 'utf8')
  }

  console.log(`\n═══ Özet: ${successCount} başarılı, ${skipCount} SKIP ═══`)
  if (errors.length > 0) {
    console.log(`  ⚠  Hatalar: ${paths.ERRORS_LOG}`)
    console.log('\n' + errors.map(e => `  • ${e}`).join('\n'))
  }

  await prisma.$disconnect().catch(() => {})
  await pool.end().catch(() => {})

  process.exit(errors.length > 0 ? 1 : 0)
}

// Jest ortamında çalıştırılmaz (JEST_WORKER_ID set olur)
if (!process.env.JEST_WORKER_ID) {
  main().catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
}
