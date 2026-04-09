import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// GET /api/tenzilat
export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

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

  return jsonUtf8({ entries })
}

// POST /api/tenzilat
export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  try {
    const body = await req.json()
    const {
      entityId, groupId, analysisId, year, period = 'ANNUAL',
      adjustmentType, adjustmentAmount, description, scope = 'ENTITY',
    } = body

    if (!adjustmentType || adjustmentAmount == null || !description || !year) {
      return jsonUtf8({ error: 'Zorunlu alanlar eksik.' }, { status: 400 })
    }
    if (description.trim().length < 10) {
      return jsonUtf8({ error: 'Açıklama en az 10 karakter olmalıdır.' }, { status: 400 })
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

    return jsonUtf8({ entry }, { status: 201 })
  } catch (err) {
    console.error(err)
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
