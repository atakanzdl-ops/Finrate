import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// DELETE /api/groups/[id]/tenzilat/[entryId] — soft delete
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id, entryId } = await params

  const entry = await prisma.tenzilatEntry.findFirst({
    where: { id: entryId, groupId: id, userId },
  })
  if (!entry) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  await prisma.tenzilatEntry.update({
    where: { id: entryId },
    data: { isActive: false, deletedAt: new Date() },
  })

  return jsonUtf8({ success: true })
}
