/**
 * Backend enum/sabit değerlerini Türkçe display'e çevirir.
 * UI-facing tüm narrative'lerde bu kullanılmalı.
 *
 * Kural: raw enum string kullanıcıya gösterilmez.
 * Tüm backend enum'ları bu dosyadaki fonksiyonlardan geçer.
 */

/**
 * CeilingConstraint source tiplerini Türkçe gösterime çevirir.
 *
 * Kullanım: ceilingTypeToDisplay('PRODUCTIVITY') → 'Aktif Verimliliği'
 */
export function ceilingTypeToDisplay(type: string): string {
  const map: Record<string, string> = {
    // CeilingConstraint.source types (ratingReasoning.ts)
    'PRODUCTIVITY':       'Aktif Verimliliği',
    'SUSTAINABILITY':     'Sürdürülebilirlik',
    'SEMANTIC_GUARDRAIL': 'Yapısal Engel',
    'SECTOR_REALITY':     'Sektör Gerçekliği',
    // Finansal metrik tipleri (legacy / gelecek kullanım)
    'LEVERAGE':           'Borçluluk',
    'LIQUIDITY':          'Likidite',
    'PROFITABILITY':      'Kârlılık',
    'COVERAGE':           'Borç Karşılama',
    'SOLVENCY':           'Sermaye Yeterliliği',
  }
  return map[type] ?? type
}

/**
 * Güven seviyesi enum'larını Türkçe gösterime çevirir.
 *
 * Kullanım: confidenceToDisplay('HIGH') → 'Yüksek'
 */
export function confidenceToDisplay(level: string): string {
  const map: Record<string, string> = {
    'HIGH':   'Yüksek',
    'MEDIUM': 'Orta',
    'LOW':    'Düşük',
    'YUKSEK': 'Yüksek',
    'ORTA':   'Orta',
    'DUSUK':  'Düşük',
  }
  return map[level.toUpperCase()] ?? level
}

/**
 * Aksiyon tipi enum'larını Türkçe gösterime çevirir.
 *
 * Kullanım: actionTypeToDisplay('STRUCTURAL') → 'Yapısal'
 */
export function actionTypeToDisplay(type: string): string {
  const map: Record<string, string> = {
    'structural':  'yapısal',
    'cosmetic':    'yüzeysel',
    'STRUCTURAL':  'Yapısal',
    'COSMETIC':    'Yüzeysel',
    'HYBRID':      'Karma',
    'hybrid':      'karma',
    'operational': 'operasyonel',
    'financial':   'finansal',
  }
  return map[type] ?? type
}
