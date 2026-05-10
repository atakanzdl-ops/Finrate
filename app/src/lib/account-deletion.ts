import { randomInt } from 'crypto'
import { prisma } from '@/lib/db'

const TOKEN_TTL_MS = 10 * 60 * 1000 // 10 dakika
const MAX_ATTEMPTS = 5

/** Kriptografik olarak güvenli 6 haneli hesap silme kodu üretir. */
export function generateDeletionCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Kullanıcı için yeni hesap silme token'ı oluşturur.
 * Mevcut token varsa önce silinir (her seferinde tek token).
 */
export async function createDeletionToken(userId: string): Promise<{ code: string }> {
  await prisma.accountDeletionToken.deleteMany({ where: { userId } })

  const code      = generateDeletionCode()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  await prisma.accountDeletionToken.create({
    data: { userId, code, expiresAt },
  })

  return { code }
}

/**
 * Hesap silme kodunu doğrular.
 * - Süre dolmuşsa → hata
 * - Yanlış kodsa attempts++, max 5'te token silinir
 * - Doğruysa → { ok: true } (hesap silme işlemi caller'da yapılır)
 */
export async function consumeDeletionToken(
  userId:    string,
  inputCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await prisma.accountDeletionToken.findUnique({ where: { userId } })

  if (!token) {
    return { ok: false, error: 'Silme kodu bulunamadı. Lütfen yeni kod isteyin.' }
  }

  if (token.expiresAt < new Date()) {
    await prisma.accountDeletionToken.delete({ where: { id: token.id } })
    return { ok: false, error: 'Silme kodunun süresi dolmuş. Lütfen yeni kod isteyin.' }
  }

  if (token.code !== inputCode.trim()) {
    const newAttempts = token.attempts + 1
    if (newAttempts >= MAX_ATTEMPTS) {
      await prisma.accountDeletionToken.delete({ where: { id: token.id } })
      return { ok: false, error: 'Çok fazla yanlış deneme. Lütfen yeni kod isteyin.' }
    }
    await prisma.accountDeletionToken.update({
      where: { id: token.id },
      data:  { attempts: newAttempts },
    })
    return { ok: false, error: `Kod hatalı. ${MAX_ATTEMPTS - newAttempts} deneme hakkınız kaldı.` }
  }

  // Doğru kod — token'ı tüket
  await prisma.accountDeletionToken.delete({ where: { id: token.id } })
  return { ok: true }
}
