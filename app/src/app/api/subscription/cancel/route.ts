import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

/**
 * POST /api/subscription/cancel
 * Body: { action: 'cancel' | 'resume' }
 *
 * cancel → cancelAtPeriodEnd = true  (dönem sonunda abonelik biter)
 * resume → cancelAtPeriodEnd = false (iptal geri alınır)
 */
export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req)
    if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

    const body   = await req.json()
    const action = body?.action

    if (action !== 'cancel' && action !== 'resume') {
      return jsonUtf8({ error: "action 'cancel' veya 'resume' olmalıdır." }, { status: 400 })
    }

    const subscription = await prisma.subscription.findUnique({ where: { userId } })
    if (!subscription) {
      return jsonUtf8({ error: 'Abonelik bulunamadı.' }, { status: 404 })
    }

    if (subscription.status === 'CANCELLED') {
      return jsonUtf8({ error: 'Abonelik zaten iptal edilmiş.' }, { status: 400 })
    }

    const updated = await prisma.subscription.update({
      where: { userId },
      data:  { cancelAtPeriodEnd: action === 'cancel' },
    })

    return jsonUtf8({
      ok:                true,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      cancelAt:          updated.currentPeriodEnd,
    })
  } catch (err) {
    console.error('[subscription/cancel] hata:', err)
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
