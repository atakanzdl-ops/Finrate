/**
 * GET /api/subjective?entityIds=id1,id2,...
 *
 * Batch subjective score endpoint — N+1 yerine tek HTTP request + tek DB query.
 * Tekil /api/entities/[id]/subjective endpoint'i SubjectiveForm için KORUNUR.
 */

import { NextRequest }              from 'next/server'
import { jsonUtf8 }                 from '@/lib/http/jsonUtf8'
import { prisma }                   from '@/lib/db'
import { getUserIdFromRequest }     from '@/lib/auth'
import { calcSubjectiveScore }      from '@/lib/scoring/subjective'

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entityIdsParam   = searchParams.get('entityIds')

  if (!entityIdsParam) {
    return jsonUtf8({ error: 'entityIds parametresi gerekli.' }, { status: 400 })
  }

  const entityIds = entityIdsParam
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (entityIds.length === 0) {
    return jsonUtf8({ results: {} }, { status: 200 })
  }

  // Tek DB sorgusu — userId filtresi: user'a ait olmayan entity'ler döndürülmez
  const entities = await prisma.entity.findMany({
    where: { id: { in: entityIds }, userId },
    include: { subjectiveInput: true },
  })

  const results: Record<string, {
    subjectiveInput: typeof entities[0]['subjectiveInput']
    score: ReturnType<typeof calcSubjectiveScore> | null
  }> = {}

  for (const entity of entities) {
    const input = entity.subjectiveInput
    const score = input ? calcSubjectiveScore(input as Parameters<typeof calcSubjectiveScore>[0]) : null
    results[entity.id] = { subjectiveInput: input, score }
  }

  return jsonUtf8({ results }, { status: 200 })
}
