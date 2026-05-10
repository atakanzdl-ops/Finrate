import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { verifyTokenWithDb } from '@/lib/auth'
import { consumeDeletionToken } from '@/lib/account-deletion'

/**
 * POST /api/account/delete-confirm
 * Body: { code: string }
 *
 * OTP doğrulayıp hesabı soft-delete yapar:
 * - User.isActive = false
 * - Subscription.status = 'CANCELLED' (opsiyonel — tutarlılık için)
 * - finrate_token cookie temizlenir
 * - { ok: true, redirect: '/' }
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('finrate_token')?.value
    if (!token) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

    const payload = await verifyTokenWithDb(token)
    if (!payload) {
      const res = jsonUtf8({ error: 'Oturum geçersiz.' }, { status: 401 })
      res.cookies.set('finrate_token', '', { maxAge: 0, path: '/' })
      return res
    }

    const userId = payload.userId

    const body = await req.json()
    const code = String(body?.code ?? '').trim()

    if (!code) {
      return jsonUtf8({ error: 'Onay kodu zorunludur.' }, { status: 400 })
    }

    const result = await consumeDeletionToken(userId, code)
    if (!result.ok) {
      return jsonUtf8({ error: result.error }, { status: 400 })
    }

    // Soft delete: isActive=false, aboneliği iptal et
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data:  { isActive: false },
      }),
      prisma.subscription.updateMany({
        where: { userId, status: { not: 'CANCELLED' } },
        data:  { status: 'CANCELLED', cancelAtPeriodEnd: false },
      }),
    ])

    // JWT cookie temizle
    const response = jsonUtf8({ ok: true, redirect: '/' })
    response.cookies.set('finrate_token', '', { maxAge: 0, path: '/' })
    return response
  } catch (err) {
    console.error('[account/delete-confirm] hata:', err)
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
