import { randomInt } from 'crypto'
import { prisma } from '@/lib/db'

const TOKEN_TTL_MS  = 10 * 60 * 1000 // 10 dakika
const MAX_ATTEMPTS  = 5

/** Kriptografik olarak güvenli 6 haneli kod üretir (000000-999999). */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Kullanıcı için yeni doğrulama token'ı oluşturur.
 * Mevcut token varsa önce silinir.
 */
export async function createVerificationToken(userId: string): Promise<{ code: string }> {
  // Eski token'ı sil
  await prisma.verificationToken.deleteMany({ where: { userId } })

  const code      = generateCode()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  await prisma.verificationToken.create({
    data: { userId, code, expiresAt },
  })

  return { code }
}

/**
 * Kodu doğrular.
 * - Süre dolmuşsa → hata
 * - Yanlış kodsa attempts++, max 5'te token silinir
 * - Doğruysa → { ok: true }
 */
export async function consumeToken(
  userId:  string,
  inputCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await prisma.verificationToken.findFirst({ where: { userId } })

  if (!token) {
    return { ok: false, error: 'Doğrulama kodu bulunamadı. Lütfen yeni kod isteyin.' }
  }

  if (token.expiresAt < new Date()) {
    await prisma.verificationToken.delete({ where: { id: token.id } })
    return { ok: false, error: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin.' }
  }

  if (token.code !== inputCode.trim()) {
    const newAttempts = token.attempts + 1
    if (newAttempts >= MAX_ATTEMPTS) {
      await prisma.verificationToken.delete({ where: { id: token.id } })
      return { ok: false, error: 'Çok fazla yanlış deneme. Lütfen yeni kod isteyin.' }
    }
    await prisma.verificationToken.update({
      where: { id: token.id },
      data:  { attempts: newAttempts },
    })
    return { ok: false, error: `Kod hatalı. ${MAX_ATTEMPTS - newAttempts} deneme hakkınız kaldı.` }
  }

  // Doğru kod — token'ı tüket
  await prisma.verificationToken.delete({ where: { id: token.id } })
  return { ok: true }
}
