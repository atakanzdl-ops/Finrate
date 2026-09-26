// NACE Rev.2 bölüm (ilk 2 hane) → Finrate sektör seçeneği (lib/sectorOptions.ts değerleri).
// Kayıt formunda kullanıcı faaliyet kodunu girer, sektör buradan otomatik önerilir.
// Beyannamedeki "Faaliyet Kodu" (örn. 464305) aynı tabloyla karşılaştırılır.

const DIVISION_TO_SECTOR: Array<[from: number, to: number, sector: string]> = [
  [1, 3, 'Tarım'],          // tarım, ormancılık, balıkçılık
  [5, 9, 'Üretim'],         // madencilik
  [10, 33, 'Üretim'],       // imalat
  [35, 35, 'Enerji'],       // elektrik, gaz, buhar
  [36, 39, 'Hizmet'],       // su, atık
  [41, 43, 'İnşaat'],
  [45, 47, 'Ticaret'],      // motorlu taşıt, toptan, perakende
  [49, 53, 'Hizmet'],       // ulaştırma, depolama
  [55, 56, 'Turizm'],       // konaklama, yiyecek-içecek
  [58, 63, 'Teknoloji'],    // yayıncılık, yazılım, bilgi hizmetleri
  [64, 66, 'Finans'],
  [68, 68, 'Hizmet'],       // gayrimenkul
  [69, 75, 'Hizmet'],       // mesleki, bilimsel, teknik
  [77, 82, 'Hizmet'],       // idari ve destek
  [84, 84, 'Hizmet'],       // kamu
  [85, 85, 'Eğitim'],
  [86, 88, 'Sağlık'],
  [90, 99, 'Hizmet'],
]

/** "464305" | "46.43.05" | "46 43 05" → "46.43.05"; geçersizse null */
export function normalizeNace(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 4 || digits.length > 6) return null
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)].filter(p => p.length === 2)
  return parts.join('.')
}

export function naceDivision(code: string | null | undefined): number | null {
  const n = normalizeNace(code)
  if (!n) return null
  return parseInt(n.slice(0, 2), 10)
}

export function sectorFromNace(code: string | null | undefined): string | null {
  const div = naceDivision(code)
  if (div == null) return null
  const hit = DIVISION_TO_SECTOR.find(([a, b]) => div >= a && div <= b)
  return hit ? hit[2] : 'Diğer'
}

/** Beyanname PDF metninden "Faaliyet Kodu" satırını izleyen 6 haneli kodu bulur. */
export function extractNaceFromText(text: string): string | null {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/faaliyet\s*kodu/i.test(lines[i])) continue
    for (let j = i; j < Math.min(i + 6, lines.length); j++) {
      const m = lines[j].match(/(?:^|\s)(\d{6})(?:\s|$)/)
      if (m) return normalizeNace(m[1])
    }
  }
  return null
}
