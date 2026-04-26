/**
 * SECTOR ID MAP — Türkçe sector string → SectorId bridge
 *
 * score.ts, benchmarks.ts ve entity veritabanı Türkçe string kullanır.
 * sectorStrategy modülü SectorId enum kullanır.
 * Bu dosya iki dünya arasındaki köprüdür.
 *
 * ÖNEMLİ: Bu dosya STANDALONE'dur. score.ts'e import edilebilmesi için
 * scoreAttribution, scoreImpactProfile veya scoreAttribution zincirine
 * bağlı hiçbir modülden import etmez (döngüsel bağımlılık önlemi).
 *
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #11)
 */

// SectorId bu dosyada canonical olarak tanımlıdır.
// eligibilityMatrix.ts bu dosyadan import eder.
export type SectorId = 'CONSTRUCTION' | 'TRADE' | 'MANUFACTURING' | 'AUTOMOTIVE'

/**
 * Türkçe sector string'ini SectorId'ye dönüştürür.
 * benchmarks.ts getSectorBenchmark() ile aynı toLocaleLowerCase('tr') + includes mantığını izler.
 *
 * @returns SectorId eşleşme varsa, yoksa undefined (caller fallback'e geçer)
 *
 * @example
 *   mapSectorStringToId('İnşaat')   // 'CONSTRUCTION'
 *   mapSectorStringToId('ticaret')  // 'TRADE'
 *   mapSectorStringToId('imalat')   // 'MANUFACTURING'
 *   mapSectorStringToId('Otomotiv') // 'AUTOMOTIVE'
 *   mapSectorStringToId('Genel')    // undefined → caller global default kullanır
 */
export function mapSectorStringToId(sector: string | null | undefined): SectorId | undefined {
  if (!sector) return undefined
  const s = sector.toLocaleLowerCase('tr')

  if (s.includes('inşaat') || s.includes('yapı') || s.includes('taahhüt') || s.includes('müteahhit'))
    return 'CONSTRUCTION'

  if (s.includes('otomotiv') || s.includes('araç') || s.includes('bayi') || s.includes('galeri') || s.includes('motorlu'))
    return 'AUTOMOTIVE'

  if (s.includes('imalat') || s.includes('üretim') || s.includes('sanayi') || s.includes('fabrika'))
    return 'MANUFACTURING'

  // Ticaret — toptan, perakende, genel ticaret hepsi TRADE
  if (s.includes('toptan') || s.includes('perakende') || s.includes('ticaret') ||
      s.includes('pazarlama') || s.includes('distribütör') || s.includes('dağıtım') ||
      s.includes('ithalat') || s.includes('ihracat'))
    return 'TRADE'

  return undefined
}
