import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { isAdminUser, isPackageKey, grantPackage, CREDIT_VALIDITY_MONTHS } from '@/lib/entitlements'

/**
 * PATCH /api/admin/users/[id] — yönetici işlemleri
 *  { action: 'GRANT_PACKAGE', package: 'BASLANGIC'|'SMMM'|'PROFESYONEL', note? }  → kredi ekler, plan atar, 12 ay geçerlilik
 *  { action: 'ADD_CREDITS', credits: number, note? }                              → mevcut plana kredi ekler
 *  { action: 'EXTEND_FREE', days: number }                                         → ücretsiz süreyi uzatır (DEMO)
 *  { action: 'SET_PLAN', plan: 'DEMO'|'STANDART'|'PRO' }                           → planı değiştirir
 *  { action: 'SET_ACTIVE', isActive: boolean }                                     → hesabı kapat/aç
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = getUserIdFromRequest(req)
  if (!adminId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })
  if (!(await isAdminUser(adminId))) return jsonUtf8({ error: 'Yalnızca yönetici.' }, { status: 403 })

  const { id } = await params
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, subscription: { select: { id: true, analysisCredits: true, creditsExpireAt: true, currentPeriodEnd: true, notes: true } } } })
  if (!target) return jsonUtf8({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const now = new Date()
  const stamp = now.toLocaleDateString('tr-TR')
  const appendNote = (prev: string | null | undefined, line: string) => [prev, `${stamp}: ${line}`].filter(Boolean).join('\n')

  // Abonelik kaydı yoksa oluştur
  const sub = target.subscription ?? await prisma.subscription.create({
    data: { userId: id, plan: 'DEMO', billingCycle: 'MONTHLY', status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: now },
    select: { id: true, analysisCredits: true, creditsExpireAt: true, currentPeriodEnd: true, notes: true },
  })

  const plusMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x }

  if (action === 'GRANT_PACKAGE') {
    const key = body?.package
    if (!isPackageKey(key)) return jsonUtf8({ error: 'Geçersiz paket.' }, { status: 400 })
    // Tek yol: iyzico callback ile aynı fonksiyon (entitlements.grantPackage)
    const updated = await grantPackage(id, key, body?.note ? String(body.note) : undefined)
    return jsonUtf8({ ok: true, subscription: updated })
  }

  if (action === 'ADD_CREDITS') {
    const credits = Number(body?.credits)
    if (!Number.isFinite(credits) || credits === 0) return jsonUtf8({ error: 'Geçersiz hak sayısı.' }, { status: 400 })
    const base = sub.creditsExpireAt && sub.creditsExpireAt > now ? sub.creditsExpireAt : plusMonths(now, CREDIT_VALIDITY_MONTHS)
    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        analysisCredits: Math.max(0, sub.analysisCredits + credits),
        creditsExpireAt: base,
        ...(credits > 0 ? { plan: 'STANDART', status: 'ACTIVE' } : {}),
        notes: appendNote(sub.notes, `${credits > 0 ? '+' : ''}${credits} hak${body?.note ? ' — ' + String(body.note) : ''}`),
      },
    })
    return jsonUtf8({ ok: true, subscription: updated })
  }

  if (action === 'EXTEND_FREE') {
    const days = Number(body?.days)
    if (!Number.isFinite(days) || days <= 0) return jsonUtf8({ error: 'Geçersiz gün.' }, { status: 400 })
    const base = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now
    const end = new Date(base); end.setDate(end.getDate() + days)
    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: { plan: 'DEMO', status: 'ACTIVE', currentPeriodEnd: end, notes: appendNote(sub.notes, `ücretsiz süre +${days} gün`) },
    })
    return jsonUtf8({ ok: true, subscription: updated })
  }

  if (action === 'SET_PLAN') {
    const plan = String(body?.plan ?? '')
    if (!['DEMO', 'STANDART', 'PRO'].includes(plan)) return jsonUtf8({ error: 'Geçersiz plan.' }, { status: 400 })
    const updated = await prisma.subscription.update({ where: { id: sub.id }, data: { plan, notes: appendNote(sub.notes, `plan → ${plan}`) } })
    return jsonUtf8({ ok: true, subscription: updated })
  }

  if (action === 'SET_ACTIVE') {
    if (id === adminId) return jsonUtf8({ error: 'Kendi hesabınızı kapatamazsınız.' }, { status: 400 })
    const isActive = !!body?.isActive
    await prisma.user.update({ where: { id }, data: { isActive } })
    return jsonUtf8({ ok: true, isActive })
  }

  return jsonUtf8({ error: 'Geçersiz işlem.' }, { status: 400 })
}
