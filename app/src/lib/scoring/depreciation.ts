// Amortisman gideri mizanda ayrı bir hesap olarak görünmez; birikmiş amortisman
// (257 MDV, 268 MODV) bakiyelerinin önceki döneme göre artışı dönem amortismanıdır.
// Duran varlık çıkışı (satış) varsa artış düşük çıkabilir; negatif çıkarsa null döner.

export interface AccountAmount { accountCode?: string; code?: string; amount: number | string }

const DEPRECIATION_CODES = ['257', '268', '278', '299']

function accumulated(accounts: AccountAmount[]): number | null {
  let sum = 0
  let found = false
  for (const a of accounts) {
    const code = a.accountCode ?? a.code ?? ''
    if (DEPRECIATION_CODES.includes(code)) {
      sum += Number(a.amount) || 0
      found = true
    }
  }
  return found ? sum : null
}

export function deriveDepreciation(prevAccounts: AccountAmount[], currAccounts: AccountAmount[]): number | null {
  const prev = accumulated(prevAccounts)
  const curr = accumulated(currAccounts)
  if (prev == null || curr == null) return null
  const delta = curr - prev
  if (delta < 0) return null
  return Math.round(delta * 100) / 100
}
