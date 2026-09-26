import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export interface AccountFlags { hasBalance: boolean; hasIncome: boolean }

/**
 * Analiz başına "bilanço (1xx-5xx) hesabı var mı / gelir (6xx) hesabı var mı" bayrakları.
 * Liste uçlarında binlerce hesap satırını taşımak yerine tek bir GROUP BY sorgusu.
 * Sorgu başarısız olursa (test mock'u vb.) boş harita döner; çağıran taraf yedek yolu kullanır.
 */
export async function getAccountFlags(analysisIds: string[]): Promise<Map<string, AccountFlags>> {
  const map = new Map<string, AccountFlags>()
  if (analysisIds.length === 0) return map
  try {
    const rows = await prisma.$queryRaw<Array<{ analysisId: string; hasBalance: boolean; hasIncome: boolean }>>`
      SELECT "analysisId",
             bool_or("accountCode" ~ '^[1-5]') AS "hasBalance",
             bool_or("accountCode" ~ '^6')     AS "hasIncome"
      FROM "financial_accounts"
      WHERE "analysisId" IN (${Prisma.join(analysisIds)})
      GROUP BY "analysisId"`
    for (const r of rows) map.set(r.analysisId, { hasBalance: !!r.hasBalance, hasIncome: !!r.hasIncome })
  } catch {
    /* yedek yol: çağıran taraf financialAccounts listesinden türetir */
  }
  return map
}
