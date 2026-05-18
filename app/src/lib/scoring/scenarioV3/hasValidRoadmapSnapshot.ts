import { prisma } from '@/lib/db'
import {
  parseRoadmapSnapshot,
  isRoadmapSnapshotFresh,
  buildRoadmapInputFingerprint,
} from './roadmapSnapshot'

export type RoadmapValidation =
  | { valid: true }
  | { valid: false; reason: 'missing' | 'stale' | 'parse-error' | 'not-found' }

export async function validateRoadmapSnapshot(
  analysisId: string,
  userId: string,
): Promise<RoadmapValidation> {
  // findFirst pattern (Codex D6 teyit)
  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, userId },
    include: {
      entity:           true,
      financialAccounts: true,
    },
  })

  if (!analysis) {
    return { valid: false, reason: 'not-found' }
  }

  if (!analysis.roadmapSnapshot) {
    return { valid: false, reason: 'missing' }
  }

  const wrapper = parseRoadmapSnapshot(analysis.roadmapSnapshot)

  if (!wrapper) {
    return { valid: false, reason: 'parse-error' }
  }

  // Fingerprint freshness (Faz 7.3.60.1 ile aynı pattern)
  let subjectiveTotal: number | null = null
  try {
    const ratiosObj = analysis.ratios ? JSON.parse(analysis.ratios as string) : null
    subjectiveTotal = ratiosObj?.__subjectiveTotal ?? null
  } catch {
    subjectiveTotal = null
  }

  const currentFingerprint = buildRoadmapInputFingerprint({
    finalScore:            analysis.finalScore,
    finalRating:           analysis.finalRating,
    sectorCode:            analysis.entity?.sector ?? null,
    financialAccountsHash: String(analysis.financialAccounts?.length ?? 0),
    subjectiveTotal,
  })

  if (!isRoadmapSnapshotFresh(wrapper, currentFingerprint)) {
    return { valid: false, reason: 'stale' }
  }

  return { valid: true }
}
