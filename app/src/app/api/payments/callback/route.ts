import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { grantPackage, isPackageKey } from '@/lib/entitlements'
import { getIyzicoConfig, retrieveCheckoutForm } from '@/lib/payments/iyzico'

/**
 * POST /api/payments/callback — iyzico, ödeme sonrası tarayıcıyı buraya form-post ile yönlendirir (body: token).
 *
 * Güvenlik: token'a güvenilmez; sonuç iyzico'dan retrieve ile doğrulanır, tutar ve
 * conversationId bizim PENDING kaydımızla karşılaştırılır. Çift tıklama/yeniden gönderimde
 * hak ikinci kez yüklenmez (status PAID kontrolü).
 *
 * Not: cross-site POST'ta oturum çerezi gelmez; kullanıcı token → payment kaydından bulunur.
 * Sonuç ayarlar sayfasına ?odeme=basarili|basarisiz|hata ile yansıtılır.
 */
export async function POST(req: NextRequest) {
  const redirect = (state: string) =>
    NextResponse.redirect(new URL(`/dashboard/ayarlar?odeme=${state}`, req.nextUrl.origin), 303)

  const cfg = getIyzicoConfig()
  if (!cfg) return redirect('hata')

  let token = ''
  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      const j = await req.json(); token = String(j?.token ?? '')
    } else {
      const fd = await req.formData(); token = String(fd.get('token') ?? '')
    }
  } catch { /* boş token → aşağıda hata */ }
  if (!token) return redirect('hata')

  const payment = await prisma.payment.findFirst({
    where: { iyzicoToken: token },
    include: { subscription: { select: { userId: true } } },
  })
  if (!payment) return redirect('hata')
  if (payment.status === 'PAID') return redirect('basarili')   // idempotent

  let result
  try {
    result = await retrieveCheckoutForm(cfg, token, payment.id)
  } catch (err) {
    console.error('[payments/callback] retrieve hatası:', err)
    return redirect('hata')
  }

  const paid = Number(result.paidPrice ?? result.price ?? 0)
  const amountOk = Math.abs(paid - payment.amount) < 0.01
  const convOk   = !result.conversationId || result.conversationId === payment.id
  const success  = result.status === 'success' && result.paymentStatus === 'SUCCESS' && amountOk && convOk

  if (!success) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        iyzicoPaymentId: result.paymentId ?? null,
        errorMessage: (result.errorMessage ?? result.paymentStatus ?? (!amountOk ? 'Tutar uyuşmuyor' : 'Bilinmeyen')).slice(0, 500),
      },
    })
    console.warn('[payments/callback] başarısız ödeme:', { paymentId: payment.id, code: result.errorCode, status: result.paymentStatus, amountOk, convOk })
    return redirect('basarisiz')
  }

  // Yarış koruması: yalnızca PENDING → PAID geçişini yapan istek hak yükler
  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'PENDING' },
    data: { status: 'PAID', iyzicoPaymentId: result.paymentId ?? null, paidAt: new Date() },
  })
  if (claimed.count === 0) return redirect('basarili')

  if (isPackageKey(payment.packageKey)) {
    await grantPackage(payment.subscription.userId, payment.packageKey, `iyzico ödeme ${result.paymentId ?? payment.id}`)
  } else {
    console.error('[payments/callback] paket anahtarı geçersiz:', payment.id, payment.packageKey)
  }
  return redirect('basarili')
}

/** Kullanıcı callback adresine GET ile gelirse (geri tuşu vb.) ayarlara döndür. */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/dashboard/ayarlar', req.nextUrl.origin), 303)
}
