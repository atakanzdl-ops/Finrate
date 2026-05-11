import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'

// PUT /api/groups/[id]/elimination-entries/[entryId]
// Güncelleme: sadece amount + description
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id, entryId } = await params

  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const existing = await prisma.groupEliminationEntry.findFirst({
    where: { id: entryId, groupId: id },
  })
  if (!existing) return jsonUtf8({ error: 'Kayıt bulunamadı.' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonUtf8({ error: 'Geçersiz JSON.' }, { status: 400 })
  }

  const { amount, description } = body ?? {}

  const data: { amount?: number; description?: string | null } = {}

  if (amount !== undefined) {
    if (!Number.isFinite(amount as number) || (amount as number) <= 0) {
      return jsonUtf8({ error: 'Tutar pozitif olmalı.' }, { status: 400 })
    }
    data.amount = amount as number
  }

  if (description !== undefined) {
    data.description = typeof description === 'string' ? description : null
  }

  if (Object.keys(data).length === 0) {
    return jsonUtf8({ error: 'Güncellenecek alan yok.' }, { status: 400 })
  }

  const entry = await prisma.groupEliminationEntry.update({
    where: { id: entryId },
    data,
  })

  return jsonUtf8({ entry: { ...entry, amount: Number(entry.amount) } })
}

// DELETE /api/groups/[id]/elimination-entries/[entryId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id, entryId } = await params

  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const existing = await prisma.groupEliminationEntry.findFirst({
    where: { id: entryId, groupId: id },
  })
  if (!existing) return jsonUtf8({ error: 'Kayıt bulunamadı.' }, { status: 404 })

  await prisma.groupEliminationEntry.delete({ where: { id: entryId } })

  return jsonUtf8({ success: true })
}
