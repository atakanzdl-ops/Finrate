import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { CHART_OF_ACCOUNTS } from '@/lib/scoring/chartOfAccounts'
import { Prisma } from '@prisma/client'

const VALID_PERIODS = ['ANNUAL', 'Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2']

// GET /api/groups/[id]/elimination-entries?year=2025&period=Q4
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  // Opsiyonel filtreler
  const url      = new URL(req.url)
  const yearStr  = url.searchParams.get('year')
  const period   = url.searchParams.get('period')

  const where: Prisma.GroupEliminationEntryWhereInput = { groupId: id }
  if (yearStr) {
    const y = Number(yearStr)
    if (Number.isFinite(y)) where.year = y
  }
  if (period && VALID_PERIODS.includes(period)) {
    where.period = period
  }

  const entries = await prisma.groupEliminationEntry.findMany({
    where,
    orderBy: [{ year: 'desc' }, { period: 'desc' }, { createdAt: 'asc' }],
  })

  return jsonUtf8({ entries: entries.map(e => ({ ...e, amount: Number(e.amount) })) })
}

// POST /api/groups/[id]/elimination-entries
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({
    where: { id, userId },
    include: { entities: { where: { isActive: true }, select: { id: true } } },
  })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonUtf8({ error: 'Geçersiz JSON.' }, { status: 400 })
  }

  const {
    year, period,
    fromEntityId, fromAccountCode,
    toEntityId,   toAccountCode,
    amount, description,
  } = body ?? {}

  // ── Validation ──────────────────────────────────────────────────────────────

  if (!Number.isFinite(year as number) || (year as number) < 2000 || (year as number) > 2035) {
    return jsonUtf8({ error: 'Geçersiz yıl.' }, { status: 400 })
  }

  if (!VALID_PERIODS.includes(period as string)) {
    return jsonUtf8({ error: 'Geçersiz dönem.' }, { status: 400 })
  }

  const entityIds = group.entities.map(e => e.id)

  if (!entityIds.includes(fromEntityId as string)) {
    return jsonUtf8({ error: 'Kaynak firma grup içinde değil.' }, { status: 400 })
  }
  if (!entityIds.includes(toEntityId as string)) {
    return jsonUtf8({ error: 'Hedef firma grup içinde değil.' }, { status: 400 })
  }
  if (fromEntityId === toEntityId) {
    return jsonUtf8({ error: 'Kaynak ve hedef firma aynı olamaz.' }, { status: 400 })
  }

  if (typeof fromAccountCode !== 'string' || !(fromAccountCode in CHART_OF_ACCOUNTS)) {
    return jsonUtf8({ error: 'Geçersiz kaynak hesap kodu.' }, { status: 400 })
  }
  if (typeof toAccountCode !== 'string' || !(toAccountCode in CHART_OF_ACCOUNTS)) {
    return jsonUtf8({ error: 'Geçersiz hedef hesap kodu.' }, { status: 400 })
  }

  if (!Number.isFinite(amount as number) || (amount as number) <= 0) {
    return jsonUtf8({ error: 'Tutar pozitif olmalı.' }, { status: 400 })
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  try {
    const entry = await prisma.groupEliminationEntry.create({
      data: {
        groupId:         id,
        year:            year as number,
        period:          period as string,
        fromEntityId:    fromEntityId as string,
        fromAccountCode: fromAccountCode,
        toEntityId:      toEntityId as string,
        toAccountCode:   toAccountCode,
        amount:          amount as number,
        description:     typeof description === 'string' ? description : null,
      },
    })
    return jsonUtf8({ entry: { ...entry, amount: Number(entry.amount) } }, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return jsonUtf8({ error: 'Bu kombinasyon zaten mevcut.' }, { status: 409 })
    }
    throw e
  }
}
