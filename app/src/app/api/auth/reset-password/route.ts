import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { consumeToken } from '@/lib/verification'

/**
 * POST /api/auth/reset-password — { email, code, password }
 * E-postaya gönderilen 6 haneli kod doğruysa yeni şifreyi yazar.
 * passwordChangedAt güncellenir → eski oturum token'ları geçersiz olur.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email    = typeof body?.email === 'string' ? body.email.trim() : ''
    const code     = typeof body?.code === 'string' || typeof body?.code === 'number' ? String(body.code) : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !code || !password) {
      return jsonUtf8({ error: 'E-posta, kod ve yeni şifre zorunludur.' }, { status: 400 })
    }
    if (password.length < 8) {
      return jsonUtf8({ error: 'Şifre en az 8 karakter olmalıdır.' }, { status: 400 })
    }

    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
    if (!user || !user.isActive) {
      return jsonUtf8({ error: 'Kod hatalı veya süresi dolmuş.' }, { status: 400 })
    }

    const result = await consumeToken(user.id, code)
    if (!result.ok) return jsonUtf8({ error: result.error }, { status: 400 })

    const passwordHash = await hashPassword(password)
    await prisma.user.update({
      where: { id: user.id },
      // Kod e-posta sahipliğini kanıtladı → doğrulanmamış hesap da doğrulanmış sayılır
      data:  { passwordHash, passwordChangedAt: new Date(), isVerified: true },
    })

    return jsonUtf8({ ok: true })
  } catch (err) {
    console.error('[reset-password] hata:', err)
    return jsonUtf8({ error: 'Sunucu hatası. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
