import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { verifyTokenWithDb } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    // DB-bound doğrulama: isActive + passwordChangedAt kontrolü (Faz 7.3.50D)
    const token = req.cookies.get('finrate_token')?.value
    if (!token) {
      return jsonUtf8({ error: 'Oturum açılmamış.' }, { status: 401 })
    }

    const payload = await verifyTokenWithDb(token)
    if (!payload) {
      // Geçersiz token (soft-deleted veya şifre değişmiş) → 401 + cookie temizle
      const res = jsonUtf8({ error: 'Oturum geçersiz.' }, { status: 401 })
      res.cookies.set('finrate_token', '', { maxAge: 0, path: '/' })
      return res
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id:          true,
        email:       true,
        fullName:    true,
        companyName: true,
        role:        true,
        isVerified:  true,
        subscription: {
          select: {
            plan:               true,
            status:             true,
            currentPeriodEnd:   true,
            billingCycle:       true,
            cancelAtPeriodEnd:  true, // Faz 7.3.50D
          },
        },
      },
    })

    if (!user) {
      return jsonUtf8({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })
    }

    return jsonUtf8({ user })
  } catch {
    return jsonUtf8({ error: 'Oturum geçersiz.' }, { status: 401 })
  }
}
