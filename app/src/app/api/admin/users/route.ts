import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { isAdminUser } from '@/lib/entitlements'

// GET /api/admin/users — yönetici: tüm kullanıcılar + abonelik + kullanım
export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })
  if (!(await isAdminUser(userId))) return jsonUtf8({ error: 'Bu sayfa yalnızca yöneticilere açıktır.' }, { status: 403 })

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, email: true, fullName: true, companyName: true, role: true, isVerified: true, isActive: true, createdAt: true,
      subscription: { select: { plan: true, status: true, currentPeriodEnd: true, analysisCredits: true, creditsExpireAt: true, notes: true } },
      _count: { select: { entities: true, analyses: true } },
    },
  })
  return jsonUtf8({ users })
}
