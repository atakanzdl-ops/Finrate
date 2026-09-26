import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { PACKAGES, isPackageKey } from '@/lib/entitlements'
import {
  getIyzicoConfig, initializeCheckoutForm, splitFullName, IYZICO_NOT_CONFIGURED_MESSAGE,
} from '@/lib/payments/iyzico'

/**
 * POST /api/payments/checkout
 * Body: { package: 'BASLANGIC' | 'SMMM' | 'PROFESYONEL' }
 *
 * 1. PENDING ödeme kaydı açar (conversationId = payment.id)
 * 2. iyzico Checkout Form başlatır
 * 3. { paymentPageUrl, checkoutFormContent, token } döner → tarayıcı iyzico sayfasına gider
 *
 * Anahtarlar tanımlı değilse 503 + okunur mesaj (UI e-posta ile satın almaya yönlendirir).
 */
export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const cfg = getIyzicoConfig()
  if (!cfg) return jsonUtf8({ error: 'PAYMENTS_DISABLED', message: IYZICO_NOT_CONFIGURED_MESSAGE }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const key = body?.package
  if (!isPackageKey(key)) return jsonUtf8({ error: 'Geçersiz paket.' }, { status: 400 })
  const pkg = PACKAGES[key]

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, taxNumber: true, isActive: true, subscription: { select: { id: true } } },
  })
  if (!user || !user.isActive) return jsonUtf8({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })

  const now = new Date()
  const subscription = user.subscription ?? await prisma.subscription.create({
    data: { userId, plan: 'DEMO', billingCycle: 'MONTHLY', status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: now },
    select: { id: true },
  })

  const payment = await prisma.payment.create({
    data: {
      subscriptionId: subscription.id,
      amount:   pkg.priceTRY,
      currency: 'TRY',
      status:   'PENDING',
      packageKey: key,
      credits:  pkg.credits,
    },
  })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || '127.0.0.1'
  const { name, surname } = splitFullName(user.fullName)
  const callbackUrl = `${req.nextUrl.origin}/api/payments/callback`

  try {
    const result = await initializeCheckoutForm(cfg, {
      conversationId: payment.id,
      basketId:       key,
      price:          pkg.priceTRY,
      itemName:       `Finrate ${pkg.label} Paketi (${pkg.credits} analiz hakkı)`,
      callbackUrl,
      // identityNumber: kullanıcı VKN/TCKN girdiyse o, yoksa iyzico'nun kabul ettiği yer tutucu
      buyer: { id: user.id, name, surname, email: user.email, ip, identityNumber: user.taxNumber ?? undefined },
    })

    if (result.status !== 'success' || !result.token) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', errorMessage: result.errorMessage ?? result.errorCode ?? 'initialize failed' },
      })
      console.error('[payments/checkout] iyzico initialize failed:', { paymentId: payment.id, code: result.errorCode, msg: result.errorMessage })
      return jsonUtf8({ error: 'Ödeme sayfası açılamadı. Lütfen tekrar deneyin veya info@finrate.com.tr adresine yazın.' }, { status: 502 })
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { iyzicoToken: result.token, conversationId: payment.id },
    })

    return jsonUtf8({
      ok: true,
      paymentId:           payment.id,
      token:               result.token,
      paymentPageUrl:      result.paymentPageUrl ?? null,
      checkoutFormContent: result.checkoutFormContent ?? null,
    })
  } catch (err) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', errorMessage: String(err instanceof Error ? err.message : err).slice(0, 500) } }).catch(() => {})
    console.error('[payments/checkout] hata:', err)
    return jsonUtf8({ error: 'Ödeme servisine ulaşılamadı. Lütfen tekrar deneyin.' }, { status: 502 })
  }
}
