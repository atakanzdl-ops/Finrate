// ─── NACE SEKTÖR KOD HARİTASI ─────────────────────────────────────────────
// Finrate sektör adı → "NACE kodu — Türkçe açıklama" string
// benchmarks.ts'deki sektör anahtarlarıyla birebir eşleşir.

export const NACE_MAP: Record<string, string> = {
  'Tarım':              'A.01 — Tarımsal Üretim ve Hayvancılık',
  'İmalat':             'C — İmalat Sanayi',
  'Enerji':             'D.35 — Elektrik, Gaz, Buhar ve İklimlendirme',
  'İnşaat':             'F.41 — Bina İnşaatı ve Taahhüt',
  'Toptan Ticaret':     'G.46 — Toptan Ticaret (Perakende Hariç)',
  'Perakende Ticaret':  'G.47 — Perakende Ticaret',
  'Gıda':               'C.10 — Gıda Ürünleri İmalatı',
  'Tekstil':            'C.13 — Tekstil Ürünleri İmalatı',
  'Otomotiv':           'G.45 — Motorlu Taşıt Araçları Ticareti',
  'Pazarlama':          'M.73 — Reklam, Piyasa Araştırması',
  'Bilişim':            'J.62 — Bilgisayar Programlama ve Yazılım',
  'Sağlık':             'Q.86 — İnsan Sağlığı Hizmetleri',
  'Mimarlık':           'M.71 — Mimarlık ve Mühendislik Faaliyetleri',
  'Hizmet':             'N — İdari ve Destek Hizmet Faaliyetleri',
  'Gayrimenkul':        'L.68 — Gayrimenkul Faaliyetleri',
  'Ulaştırma':          'H.49 — Kara Taşımacılığı ve Boru Hattı Taşımacılığı',
  'Turizm':             'I.55 — Konaklama ve Yiyecek-İçecek Hizmetleri',
  'Genel':              '— Çeşitli Sektörler (Karma)',
}

/** Sektör adından NACE string döner; bilinmiyorsa "— ..." fallback */
export function getNaceCode(sector: string | null | undefined): string {
  if (!sector) return '— Sektör Bilgisi Girilmemiş'
  return NACE_MAP[sector] ?? `— ${sector}`
}
