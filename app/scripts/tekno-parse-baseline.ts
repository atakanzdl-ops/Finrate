import fs from 'fs'
import path from 'path'
import { parseExcelBuffer } from '../src/lib/parsers/excel'
import { parsePdfBuffer } from '../src/lib/parsers/pdf'

const DIR = path.join(__dirname, '../src/lib/parsers/__fixtures__/tekno')
const OUT = path.join(DIR, 'parse-baseline.json')

async function main() {
  const files = fs.readdirSync(DIR).filter(f => /\.(xlsx|pdf)$/i.test(f)).sort()
  const out: Record<string, unknown> = {}
  for (const f of files) {
    const buf = fs.readFileSync(path.join(DIR, f))
    const rows = f.endsWith('.pdf') ? await parsePdfBuffer(buf) : await parseExcelBuffer(buf, f)
    out[f] = rows.map(r => ({
      year: r.year, period: r.period,
      fields: r.fields,
      rawAccounts: (r as { rawAccounts?: unknown }).rawAccounts ?? (r.meta as { rawAccounts?: unknown } | undefined)?.rawAccounts ?? null,
      metaPath: r.meta?.path ?? null,
      confidence: r.meta?.confidence ?? null,
      identity: (r as { identity?: unknown }).identity ?? null,
    }))
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
  for (const [f, rows] of Object.entries(out)) {
    for (const r of rows as Array<{ year: unknown; period: unknown; fields: Record<string, number> }>) {
      console.log(`${f} → ${r.year} ${r.period} · ${Object.keys(r.fields).length} alan`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
