import { getNextRating, findOptimalPath, type OptimizationResult } from './optimizer'
import type { RatioResult } from './ratios'
import { scoreToRating } from './score'

export interface OptimizerTargetSnapshot {
  targetRating: string
  totalGain: number
  minimumPlan: OptimizationResult['minimumPlan']
  idealPlan: OptimizationResult['idealPlan']
}

export interface OptimizerSnapshot {
  currentScore: number
  currentRating: string
  generatedAt: string
  targets: OptimizerTargetSnapshot[]
}

export function createOptimizerSnapshot(
  ratios: RatioResult,
  currentScore: number,
  sector?: string | null,
): OptimizerSnapshot {
  const currentRating = scoreToRating(currentScore)
  const nextRating = getNextRating(currentRating)
  const next2Rating = nextRating ? getNextRating(nextRating) : null
  const targets = [nextRating, next2Rating]
    .filter((rating): rating is string => Boolean(rating))
    .map((targetRating) => {
      const result = findOptimalPath(ratios, currentScore, targetRating, sector)
      return {
        targetRating,
        totalGain: Math.round((result.idealPlan.projectedScore - currentScore) * 100) / 100,
        minimumPlan: result.minimumPlan,
        idealPlan: result.idealPlan,
      }
    })

  return {
    currentScore,
    currentRating,
    generatedAt: new Date().toISOString(),
    targets,
  }
}
