/**
 * Uçtan uca test — ücretsiz plan akışı (giriş → firma → yükleme → subjektif → senaryo → kilitler)
 *
 *   E2E_BASE=http://localhost:3005 E2E_EMAIL=... E2E_PASSWORD=... npx tsx scripts/e2e-free-plan.ts
 *
 * Tekno fixture dosyalarını kullanır (src/lib/parsers/__fixtures__/tekno). Hesap doğrulanmış olmalı.
 * Beklenen: 14 günlük deneme süresinde her şey serbest (firma, dönem, senaryo, PDF).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE  = process.env.E2E_BASE ?? 'http://localhost:3005'
const EMAIL = process.env.E2E_EMAIL ?? ''
const PASS  = process.env.E2E_PASSWORD ?? ''
const FIX   = join(process.cwd(), 'src', 'lib', 'parsers', '__fixtures__', 'tekno')

let cookie = ''
const results: Array<{ step: string; ok: boolean; info: string }> = []
const log = (step: string, ok: boolean, info = '') => { results.push({ step, ok, info }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${step} ${info}`) }

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { ...(init.headers ?? {}), cookie } })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  let body: unknown = null
  try { body = await res.json() } catch { /* pdf vb. */ }
  return { status: res.status, body: body as Record<string, unknown> }
}

function fileForm(name: string, year: number, period: string, extra: Record<string, string> = {}) {
  const fd = new FormData()
  const buf = readFileSync(join(FIX, name))
  const type = name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  fd.append('file', new Blob([buf], { type }), name)
  fd.append('year', String(year)); fd.append('period', period)
  for (const [k, v] of Object.entries(extra)) fd.append(k, v)
  return fd
}

async function main() {
  if (!EMAIL || !PASS) { console.error('E2E_EMAIL / E2E_PASSWORD gerekli'); process.exit(1) }

  // 1. Giriş
  const login = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS }) })
  log('giriş', login.status === 200 && !!cookie, `status=${login.status}`)
  if (!cookie) process.exit(1)

  const me = await api('/api/auth/me')
  const sub = (me.body.user as { subscription?: { plan: string; currentPeriodEnd: string } })?.subscription
  log('plan DEMO', sub?.plan === 'DEMO', `plan=${sub?.plan} ücretsiz bitiş=${sub?.currentPeriodEnd?.slice(0, 10)}`)

  // 2. Firma (Tekno VKN → kimlik kontrolü VKN eşleşmesiyle geçer)
  const ent = await api('/api/entities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'E2E Tekno Test', taxNumber: '8360845044', sector: 'Ticaret', naceCode: '464305' }) })
  const entityId = (ent.body.entity as { id: string } | undefined)?.id
  log('firma oluştur', ent.status === 201 && !!entityId, `status=${ent.status}`)
  if (!entityId) { console.log(ent.body); process.exit(1) }

  // 3. Yükleme: 2026 Q2 mizan + geçici beyanname (aynı dönem → 1 hak)
  const up1 = await api(`/api/entities/${entityId}/upload`, { method: 'POST', body: fileForm('2026-q2-mizan.xlsx', 2026, 'Q2', { confirmDetectionMissing: 'true', confirmEntityUnverified: 'true' }) })
  log('2026 Q2 mizan yükle', up1.status === 200, `status=${up1.status} ${up1.status !== 200 ? JSON.stringify(up1.body).slice(0, 200) : ''}`)
  const up2 = await api(`/api/entities/${entityId}/upload`, { method: 'POST', body: fileForm('2026-q2-gecici-beyanname.pdf', 2026, 'Q2', { confirmDetectionMissing: 'true', confirmEntityUnverified: 'true', overwrite: 'true' }) })
  const r2 = (up2.body.results as Array<{ score: number; rating: string }> | undefined)?.[0]
  log('2026 Q2 beyanname yükle', up2.status === 200, `status=${up2.status} skor=${r2?.score} ${r2?.rating ?? ''} ${up2.status !== 200 ? JSON.stringify(up2.body).slice(0, 200) : ''}`)

  const list = await api('/api/analyses')
  const analysis = (list.body.analyses as Array<{ id: string; entity?: { id: string }; finalScore: number; finalRating: string; subjectiveMissing: boolean }> | undefined)?.find(a => a.entity?.id === entityId)
  log('analiz listede', !!analysis, `skor=${analysis?.finalScore} ${analysis?.finalRating} subjektifEksik=${analysis?.subjectiveMissing}`)

  // 4. PDF: deneme süresinde açık; yol haritası/subjektif yokken 409 döner (402 değil)
  if (analysis) {
    const pdf0 = await api(`/api/analyses/${analysis.id}/pdf`)
    log('PDF deneme süresinde hak engeli yok', pdf0.status === 409, `status=${pdf0.status} ${String(pdf0.body?.error ?? '').slice(0, 80)}`)
  }

  // 5. Subjektif
  const subj = await api(`/api/entities/${entityId}/subjective`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kkbCategory: 'iyi', activeDelayDays: 0, checkProtest: false, enforcementFile: false, creditLimitUtilPct: 30, hasMultipleBanks: true, avgMaturityMonths: 12, companyAgeYears: 4, auditLevel: 'smmm', ownershipClarity: true, hasTaxDebt: false, hasSgkDebt: false, activeLawsuitCount: 0 }) })
  log('subjektif kaydet', subj.status === 200, `status=${subj.status} toplam=${(subj.body.score as { total?: number } | undefined)?.total}`)

  // 6. Senaryo (ücretsiz planda açık)
  const list2 = await api('/api/analyses')
  const a2 = (list2.body.analyses as Array<{ id: string; entity?: { id: string }; finalScore: number; finalRating: string; hasRoadmapSnapshot: boolean }> | undefined)?.find(a => a.entity?.id === entityId)
  const nextGrade: Record<string, string> = { D: 'C', C: 'CC', CC: 'CCC', CCC: 'B', B: 'BB', BB: 'BBB', BBB: 'A', A: 'AA', AA: 'AAA', AAA: 'AAA' }
  const sc = a2 ? await api('/api/scenarios/v3', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysisId: a2.id, targetGrade: nextGrade[a2.finalRating] ?? 'A', currentGrade: a2.finalRating }) }) : { status: 0, body: {} }
  log('senaryo ücretsiz planda çalışır', sc.status === 200, `status=${sc.status} nihai=${a2?.finalScore} ${a2?.finalRating} ${sc.status !== 200 ? JSON.stringify(sc.body).slice(0, 160) : ''}`)

  const list3 = await api('/api/analyses')
  const a3 = (list3.body.analyses as Array<{ id: string; entity?: { id: string }; hasRoadmapSnapshot: boolean }> | undefined)?.find(a => a.entity?.id === entityId)
  log('yol haritası kaydedildi (rapor açılabilir)', !!a3?.hasRoadmapSnapshot)

  // 7. Deneme süresinde sınır yok: 2. dönem ve 2. firma serbest
  const up3 = await api(`/api/entities/${entityId}/upload`, { method: 'POST', body: fileForm('2025-aralik-mizan.xlsx', 2025, 'ANNUAL', { confirmDetectionMissing: 'true', confirmEntityUnverified: 'true' }) })
  log('2. dönem deneme süresinde serbest', up3.status === 200, `status=${up3.status} ${String(up3.body?.error ?? '')}`)
  const ent2 = await api('/api/entities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'E2E İkinci Firma' }) })
  log('2. firma deneme süresinde serbest', ent2.status === 201, `status=${ent2.status} ${String(ent2.body?.code ?? '')}`)

  console.log(`\n${results.filter(r => r.ok).length}/${results.length} adım geçti`)
  process.exit(results.every(r => r.ok) ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
