/**
 * Ters bakiye reklasifikasyon kuralları.
 * Bir hesap negatif bakiye verirse hangi hesaba aktarılmalı?
 */

export interface ReversalRule {
  fromCode: string
  toCode: string
  ruleId: string
  note: string
}

export const REVERSAL_RULES: Record<string, ReversalRule> = {
  // Ticari alacak/avans çifti
  '120': { fromCode: '120', toCode: '340', ruleId: 'R_120_340', note: 'Alıcılar alacak bakiye → Alınan Avanslar' },
  '340': { fromCode: '340', toCode: '120', ruleId: 'R_340_120', note: 'Alınan Avans borç bakiye → Alıcılar' },

  '121': { fromCode: '121', toCode: '340', ruleId: 'R_121_340', note: 'Alacak Senetleri alacak bakiye → Alınan Avanslar' },

  // Ticari borç/avans çifti
  '320': { fromCode: '320', toCode: '159', ruleId: 'R_320_159', note: 'Satıcılar borç bakiye → Verilen Sipariş Avansları' },
  '159': { fromCode: '159', toCode: '320', ruleId: 'R_159_320', note: 'Verilen Avans alacak bakiye → Satıcılar' },

  '321': { fromCode: '321', toCode: '159', ruleId: 'R_321_159', note: 'Borç Senetleri borç bakiye → Verilen Avanslar' },

  // Ortaklar
  '131': { fromCode: '131', toCode: '331', ruleId: 'R_131_331', note: 'Ortaklardan Alacak alacak bakiye → Ortaklara Borç' },
  '331': { fromCode: '331', toCode: '131', ruleId: 'R_331_131', note: 'Ortaklara Borç borç bakiye → Ortaklardan Alacak' },

  // İştirakler
  '132': { fromCode: '132', toCode: '332', ruleId: 'R_132_332', note: 'İştiraklerden Alacak alacak bakiye → İştiraklere Borç' },
  '332': { fromCode: '332', toCode: '132', ruleId: 'R_332_132', note: 'İştiraklere Borç borç bakiye → İştiraklerden Alacak' },

  // Bağlı Ortaklıklar
  '133': { fromCode: '133', toCode: '333', ruleId: 'R_133_333', note: 'Bağlı Ort. Alacak alacak bakiye → Bağlı Ort. Borç' },
  '333': { fromCode: '333', toCode: '133', ruleId: 'R_333_133', note: 'Bağlı Ort. Borç borç bakiye → Bağlı Ort. Alacak' },

  // Personel
  '135': { fromCode: '135', toCode: '335', ruleId: 'R_135_335', note: 'Personelden Alacak alacak bakiye → Personele Borç' },
  '335': { fromCode: '335', toCode: '135', ruleId: 'R_335_135', note: 'Personele Borç borç bakiye → Personelden Alacak' },

  // Diğer alacak/borç
  '136': { fromCode: '136', toCode: '336', ruleId: 'R_136_336', note: 'Diğer Alacaklar alacak bakiye → Diğer Borçlar' },
  '336': { fromCode: '336', toCode: '136', ruleId: 'R_336_136', note: 'Diğer Borçlar borç bakiye → Diğer Alacaklar' },

  // Gelecek aya/yıla ait gider/gelir
  '180': { fromCode: '180', toCode: '380', ruleId: 'R_180_380', note: 'Gelecek Aya Gider alacak bakiye → Gelecek Aya Gelir' },
  '380': { fromCode: '380', toCode: '180', ruleId: 'R_380_180', note: 'Gelecek Aya Gelir borç bakiye → Gelecek Aya Gider' },

  '280': { fromCode: '280', toCode: '480', ruleId: 'R_280_480', note: 'Gelecek Yıla Gider alacak bakiye → Gelecek Yıla Gelir' },
  '480': { fromCode: '480', toCode: '280', ruleId: 'R_480_280', note: 'Gelecek Yıla Gelir borç bakiye → Gelecek Yıla Gider' },
}

export interface ReversalEntry {
  originalCode: string
  reclassifiedCode: string
  ruleId: string
  amount: number          // pozitif (reclass sonrası bakiye)
  originalAmount: number  // negatif (orijinal bakiye)
  note: string
}

/**
 * Bir hesap-bakiye çiftini alır, ters bakiye ise reklasifiye eder.
 * Normal durumda değişmeden döndürür.
 */
export function reclassifyIfReversed(
  code: string,
  amount: number
): { code: string; amount: number; reversal?: ReversalEntry } {
  // Ters bakiye kontrolü — pozitif bakiyeli (varlık, gider) hesaplar negatif olursa
  // Pasif ve gelir hesapları borç bakiye verirse de ters sayılır
  if (amount >= 0) return { code, amount }

  const rule = REVERSAL_RULES[code]
  if (!rule) {
    // Kural yok — olduğu gibi bırak, analyzer warning üretsin
    return { code, amount }
  }

  return {
    code: rule.toCode,
    amount: Math.abs(amount),
    reversal: {
      originalCode: code,
      reclassifiedCode: rule.toCode,
      ruleId: rule.ruleId,
      amount: Math.abs(amount),
      originalAmount: amount,
      note: rule.note,
    },
  }
}

/**
 * Birden fazla hesabı toplu reklasifiye eder, audit trail tutar.
 */
export function reclassifyAccounts(
  accounts: { code: string; amount: number }[]
): { accounts: { code: string; amount: number }[]; reversals: ReversalEntry[] } {
  const result: { code: string; amount: number }[] = []
  const reversals: ReversalEntry[] = []

  // Önce aynı hesap kodlarını topla (120'in bir satırı +X, bir satırı -Y olabilir)
  const merged = new Map<string, number>()
  for (const a of accounts) {
    merged.set(a.code, (merged.get(a.code) ?? 0) + a.amount)
  }

  // Sonra her net bakiyeyi reklasifiye et
  for (const [code, amount] of merged.entries()) {
    if (amount === 0) continue

    const rec = reclassifyIfReversed(code, amount)
    result.push({ code: rec.code, amount: rec.amount })
    if (rec.reversal) reversals.push(rec.reversal)
  }

  // Aynı hedef koda birden fazla reklas olabilir — tekrar birleştir
  const finalMerged = new Map<string, number>()
  for (const r of result) {
    finalMerged.set(r.code, (finalMerged.get(r.code) ?? 0) + r.amount)
  }

  return {
    accounts: Array.from(finalMerged.entries()).map(([code, amount]) => ({ code, amount })),
    reversals,
  }
}
