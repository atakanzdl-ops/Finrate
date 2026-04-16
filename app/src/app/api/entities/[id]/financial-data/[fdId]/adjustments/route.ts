import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// Yetki kontrolü yardımcısı
async function authorize(userId: string, entityId: string, fdId: string) {
  return prisma.financialData.findFirst({
    where: { id: fdId, entityId, entity: { userId } },
  })
}

// GET /api/entities/[id]/financial-data/[fdId]/adjustments?scenario=...
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fdId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId, fdId } = await params
  const fd = await authorize(userId, entityId, fdId)
  if (!fd) return jsonUtf8({ error: 'Bulunamadi.' }, { status: 404 })

  const scenario = req.nextUrl.searchParams.get('scenario') ?? 'Varsayilan'

  const adjustments = await prisma.manualAdjustment.findMany({
    where: { financialDataId: fdId, scenarioName: scenario },
    orderBy: { fieldName: 'asc' },
  })

  return jsonUtf8({ adjustments })
}

// POST /api/entities/[id]/financial-data/[fdId]/adjustments
// Body: { fieldName, adjustedValue, originalValue?, note?, scenarioName? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fdId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId, fdId } = await params
  const fd = await authorize(userId, entityId, fdId)
  if (!fd) return jsonUtf8({ error: 'Bulunamadi.' }, { status: 404 })

  const body = await req.json()
  const { fieldName, adjustedValue, originalValue, note, scenarioName = 'Varsayilan' } = body

  if (!fieldName || adjustedValue === undefined || adjustedValue === null) {
    return jsonUtf8({ error: 'fieldName ve adjustedValue zorunlu.' }, { status: 400 })
  }

  // Upsert: ayni alan + senaryo icin varsa guncelle, yoksa olustur
  const adjustment = await prisma.manualAdjustment.upsert({
    where: {
      financialDataId_fieldName_scenarioName: {
        financialDataId: fdId,
        fieldName,
        scenarioName,
      },
    },
    update: {
      adjustedValue: Number(adjustedValue),
      originalValue: originalValue != null ? Number(originalValue) : undefined,
      note: note ?? undefined,
    },
    create: {
      financialDataId: fdId,
      fieldName,
      adjustedValue: Number(adjustedValue),
      originalValue: originalValue != null ? Number(originalValue) : null,
      note: note ?? null,
      scenarioName,
    },
  })

  return jsonUtf8({ adjustment })
}

// DELETE /api/entities/[id]/financial-data/[fdId]/adjustments
// Body: { fieldName, scenarioName? } — belli bir alani sil
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fdId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId, fdId } = await params
  const fd = await authorize(userId, entityId, fdId)
  if (!fd) return jsonUtf8({ error: 'Bulunamadi.' }, { status: 404 })

  const body = await req.json()
  const { fieldName, scenarioName = 'Varsayilan' } = body

  if (!fieldName) return jsonUtf8({ error: 'fieldName zorunlu.' }, { status: 400 })

  await prisma.manualAdjustment.deleteMany({
    where: { financialDataId: fdId, fieldName, scenarioName },
  })

  return jsonUtf8({ success: true })
}
