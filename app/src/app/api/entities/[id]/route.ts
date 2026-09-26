import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { rescoreFinancialData } from '@/lib/scoring/rescoreFinancialData'
import { isValidOptionalTaxNumber, normalizeTaxNumber } from '@/lib/validation/taxNumber'
import { SECTOR_VALUES } from '@/lib/sectorOptions'
import { normalizeNace } from '@/lib/nace'

const VALID_ENTITY_TYPES = new Set(['STANDALONE', 'PARENT', 'SUBSIDIARY', 'JV'])

// GET /api/entities/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const entity = await prisma.entity.findFirst({
    where: { id, userId },
    include: {
      financialData: {
        orderBy: [{ year: 'desc' }, { period: 'asc' }],
        include: {
          analysis: {
            select: {
              id: true,
              financialAccounts: { select: { accountCode: true, amount: true } },
            },
          },
        },
      },
      group: { select: { id: true, name: true } },
    },
  })

  if (!entity) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })
  return jsonUtf8({ entity })
}

// PATCH /api/entities/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.entity.findFirst({ where: { id, userId } })
  if (!existing) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  try {
    const body = await req.json()
    const { name, taxNumber, sector, entityType, groupId, ownershipPct, weightBasis, naceCode } = body
    if (naceCode !== undefined && naceCode !== null && naceCode !== '' && !normalizeNace(naceCode)) {
      return jsonUtf8({ error: 'NACE / faaliyet kodu 4–6 haneli rakam olmalıdır.' }, { status: 400 })
    }

    // ── Validasyon ────────────────────────────────────────────────────────────
    if (name !== undefined && name.trim().length < 2) {
      return jsonUtf8({ error: 'Şirket adı en az 2 karakter olmalıdır.' }, { status: 400 })
    }
    if (taxNumber !== undefined && !isValidOptionalTaxNumber(taxNumber)) {
      return jsonUtf8({ error: 'VKN/TCKN 10 veya 11 haneli rakam olmalıdır.' }, { status: 400 })
    }
    if (sector !== undefined && sector !== null && sector !== '') {
      if (!SECTOR_VALUES.has(sector)) {
        return jsonUtf8({ error: 'Geçersiz sektör.' }, { status: 400 })
      }
    }
    if (entityType !== undefined && entityType !== null) {
      if (!VALID_ENTITY_TYPES.has(entityType)) {
        return jsonUtf8({ error: 'Geçersiz şirket tipi.' }, { status: 400 })
      }
    }

    // Ownership check — yeni groupId bu kullanıcıya ait mi?
    if (groupId !== undefined && groupId !== null) {
      const ownedGroup = await prisma.group.findFirst({ where: { id: groupId, userId } })
      if (!ownedGroup) {
        return jsonUtf8({ error: 'Grup bulunamadı veya erişim yetkiniz yok.' }, { status: 403 })
      }
    }

    // Sektör değişti mi? (boş string → null normalleştirmesi dahil)
    const sectorChanged = sector !== undefined && (sector || null) !== existing.sector

    const normalizedTaxNumber = normalizeTaxNumber(taxNumber)

    const entity = await prisma.entity.update({
      where: { id },
      data: {
        ...(name        !== undefined && { name: name.trim() }),
        ...(taxNumber   !== undefined && { taxNumber: normalizedTaxNumber }),
        ...(sector      !== undefined && { sector: sector || null, sectorSource: sector ? 'USER' : null }),
        ...(naceCode    !== undefined && { naceCode: normalizeNace(naceCode) }),
        ...(entityType  !== undefined && { entityType }),
        ...(groupId     !== undefined && { groupId }),
        ...(ownershipPct !== undefined && { ownershipPct }),
        ...(weightBasis  !== undefined && { weightBasis }),
      },
    })

    // ── Sektör değişince analiz recalc ───────────────────────────────────────
    let recalculated = 0
    if (sectorChanged) {
      // Sektör benchmark'ı değişti → yükleme yoluyla BİREBİR aynı skorlama
      // (yıllıklandırma + guardrail + subjektif birleşimi): rescoreFinancialData
      const allData = await prisma.financialData.findMany({
        where: { entityId: id },
        select: { id: true, analysis: { select: { id: true } } },
      })
      for (const fd of allData) {
        if (!fd.analysis) continue
        const res = await rescoreFinancialData(fd.id)
        if (res) recalculated++
      }

      // === Faz 7.3.60.1: roadmapSnapshot invalidation (sectorChanged guard kullanılıyor) ===
      await prisma.analysis.updateMany({
        where: {
          entityId:        id,
          userId,
          roadmapSnapshot: { not: null },
        },
        data: { roadmapSnapshot: null },
      })
    }

    return jsonUtf8({ entity, recalculated })
  } catch (err) {
    console.error('[PATCH /api/entities]', err)
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}

// DELETE /api/entities/[id] — soft delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.entity.findFirst({ where: { id, userId } })
  if (!existing) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  await prisma.entity.update({ where: { id }, data: { isActive: false } })
  return jsonUtf8({ success: true })
}
