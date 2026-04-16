import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// DELETE /api/entities/[id]/financial-data/[fdId]/adjustments/[adjId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fdId: string; adjId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId, fdId, adjId } = await params

  // Yetki kontrol: entity bu kullaniciya ait mi?
  const fd = await prisma.financialData.findFirst({
    where: { id: fdId, entityId, entity: { userId } },
  })
  if (!fd) return jsonUtf8({ error: 'Bulunamadi.' }, { status: 404 })

  // Duzeltme bu fdId'e ait mi?
  const adj = await prisma.manualAdjustment.findFirst({
    where: { id: adjId, financialDataId: fdId },
  })
  if (!adj) return jsonUtf8({ error: 'Duzeltme bulunamadi.' }, { status: 404 })

  await prisma.manualAdjustment.delete({ where: { id: adjId } })

  return jsonUtf8({ success: true })
}
