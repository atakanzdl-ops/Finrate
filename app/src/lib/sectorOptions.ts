export type SectorOption = {
  value: string
  label: string
  hint:  string
}

export const SECTOR_OPTIONS: readonly SectorOption[] = [
  { value: 'Üretim',    label: 'Üretim',    hint: 'imalat, sanayi, fabrika' },
  { value: 'Ticaret',   label: 'Ticaret',   hint: 'bayi, perakende, toptan, otomotiv satışı' },
  { value: 'Hizmet',    label: 'Hizmet',    hint: 'danışmanlık, lojistik, yazılım hizmeti' },
  { value: 'İnşaat',    label: 'İnşaat',    hint: 'taahhüt, müteahhit' },
  { value: 'Turizm',    label: 'Turizm',    hint: 'otel, restoran, tur acentesi' },
  { value: 'Tarım',     label: 'Tarım',     hint: 'tarım, hayvancılık, gıda üretimi' },
  { value: 'Enerji',    label: 'Enerji',    hint: 'elektrik, doğalgaz, petrol' },
  { value: 'Sağlık',    label: 'Sağlık',    hint: 'hastane, klinik, ilaç ticareti' },
  { value: 'Eğitim',    label: 'Eğitim',    hint: 'okul, kurs, yayın' },
  { value: 'Finans',    label: 'Finans',    hint: 'banka, sigorta, leasing' },
  { value: 'Teknoloji', label: 'Teknoloji', hint: 'yazılım, donanım, IT hizmeti' },
  { value: 'Diğer',     label: 'Diğer',     hint: 'yukarıdakilerden hiçbiri' },
] as const

export const SECTOR_VALUES = new Set(SECTOR_OPTIONS.map(s => s.value))

export const SECTOR_VALUE_LIST = SECTOR_OPTIONS.map(s => s.value)
