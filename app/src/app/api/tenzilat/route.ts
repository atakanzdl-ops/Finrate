import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

function getUserId(req: NextRequest): string | null {
  try {
    const token = req.cookies.get('finrate_token')?.value
    if (!token) return null
    return verifyToken(token).userId
  } catch {
    return null
  }
}

// GET /api/tenzilat
export async function GET(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entityId  = searchParams.get('entityId')
  const analysisId = searchParams.get('analysisId')

  const entries = await prisma.tenzilatEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(entityId   && { entityId }),
      ...(analysisId && { analysisId }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      entity: { select: { name: true } },
    },
  })

  return NextResponse.json({ entries })
}

// POST /api/tenzilat
export async function POST(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  try {
    const body = await req.json()
    const {
      entityId, groupId, analysisId, year, period = 'ANNUAL',
      adjustmentType, adjustmentAmount, description, scope = 'ENTITY',
    } = body

    if (!adjustmentType || adjustmentAmount == null || !description || !year) {
      return NextResponse.json({ error: 'Zorunlu alanlar eksik.' }, { status: 400 })
    }
    if (description.trim().length < 10) {
      return NextResponse.json({ error: 'Açıklama en az 10 karakter olmalıdır.' }, { status: 400 })
    }

    const entry = await prisma.tenzilatEntry.create({
      data: {
        userId,
        entityId:        entityId ?? null,
        groupId:         groupId ?? null,
        analysisId:      analysisId ?? null,
        year:            Number(year),
        period,
        adjustmentType,
        adjustmentAmount: adjustmentAmount,
        description:     description.trim(),
        scope,
      },
    })

    // Denetim kaydı
    await prisma.tenzilatAuditLog.create({
      data: {
        entryId:  entry.id,
        userId,
        action:   'CREATED',
        newValue: JSON.stringify({ adjustmentType, adjustmentAmount, description }),
        ipAddress: req.headers.get('x-forwarded-for') ?? null,
      },
    })

    return NextResponse.json({ entry }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
