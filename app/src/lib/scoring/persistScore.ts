import { prisma } from '@/lib/db'
import { calcSubjectiveScore, combineScores } from '@/lib/scoring/subjective'
import { scoreToRating } from '@/lib/scoring/score'

export interface ResolvedScore {
  finalScore: number
  finalRating: string
  meta: { __financialScore: number; __subjectiveTotal: number | null }
}

/**
 * Tek skor kaynağı: finansal skor + (varsa) entity'nin subjektif girdisi → finalScore.
 * Subjektif kayıt yoksa finalScore = finansal skor (0–100), __subjectiveTotal = null.
 * Upload, recalculate ve subjective POST hepsi bunu kullanır; sayfalar DB'deki değeri gösterir.
 */
export async function resolveFinalScore(entityId: string, financialScore: number): Promise<ResolvedScore> {
  const subj = await prisma.subjectiveInput.findUnique({ where: { entityId } })
  if (!subj) {
    return {
      finalScore: financialScore,
      finalRating: scoreToRating(financialScore),
      meta: { __financialScore: financialScore, __subjectiveTotal: null },
    }
  }
  const total = calcSubjectiveScore(subj).total
  const combined = combineScores(financialScore, total)
  return {
    finalScore: combined,
    finalRating: scoreToRating(combined),
    meta: { __financialScore: financialScore, __subjectiveTotal: total },
  }
}
