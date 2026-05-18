import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { validateRoadmapSnapshot } from '@/lib/scoring/scenarioV3/hasValidRoadmapSnapshot'
import { ROADMAP_ERROR_CODES, ROADMAP_MESSAGES } from '@/lib/constants/roadmapMessages'

/**
 * POST /api/analyses/[id]/report
 * Analizi "raporlandı" olarak işaretler (reportedAt = now)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params

  const analysis = await prisma.analysis.findFirst({ where: { id, userId } })
  if (!analysis) return jsonUtf8({ error: 'Analiz bulunamadı.' }, { status: 404 })

  // === YENİ — Snapshot validation (409 Conflict) ===
  const validation = await validateRoadmapSnapshot(id, userId)
  if (!validation.valid) {
    const isStale  = validation.reason === 'stale'
    const code     = isStale ? ROADMAP_ERROR_CODES.ROADMAP_STALE    : ROADMAP_ERROR_CODES.ROADMAP_REQUIRED
    const message  = isStale ? ROADMAP_MESSAGES.ROADMAP_STALE       : ROADMAP_MESSAGES.ROADMAP_REQUIRED
    return jsonUtf8({ error: message, code }, { status: 409 })
  }

  await prisma.analysis.update({
    where: { id },
    data: { reportedAt: new Date() },
  })

  return jsonUtf8({ ok: true })
}
