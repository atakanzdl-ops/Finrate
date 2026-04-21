import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// PATCH /api/groups/[id]/eliminations
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params

  // Grup bu kullanıcıya ait mi?
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const body = await req.json()

  const {
    intercompanySales            = 0,
    intercompanyPurchases        = 0,
    intercompanyReceivables      = 0,
    intercompanyPayables         = 0,
    intercompanyAdvancesGiven    = 0,
    intercompanyAdvancesReceived = 0,
    intercompanyProfit           = 0,
  } = body

  const elimination = await prisma.groupElimination.upsert({
    where:  { groupId: id },
    update: {
      intercompanySales:            Number(intercompanySales),
      intercompanyPurchases:        Number(intercompanyPurchases),
      intercompanyReceivables:      Number(intercompanyReceivables),
      intercompanyPayables:         Number(intercompanyPayables),
      intercompanyAdvancesGiven:    Number(intercompanyAdvancesGiven),
      intercompanyAdvancesReceived: Number(intercompanyAdvancesReceived),
      intercompanyProfit:           Number(intercompanyProfit),
    },
    create: {
      groupId:                      id,
      intercompanySales:            Number(intercompanySales),
      intercompanyPurchases:        Number(intercompanyPurchases),
      intercompanyReceivables:      Number(intercompanyReceivables),
      intercompanyPayables:         Number(intercompanyPayables),
      intercompanyAdvancesGiven:    Number(intercompanyAdvancesGiven),
      intercompanyAdvancesReceived: Number(intercompanyAdvancesReceived),
      intercompanyProfit:           Number(intercompanyProfit),
    },
  })

  return jsonUtf8({ elimination })
}
