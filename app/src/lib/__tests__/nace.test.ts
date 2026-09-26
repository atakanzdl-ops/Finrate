import { normalizeNace, sectorFromNace, extractNaceFromText } from '../nace'

describe('nace — normalize / sektör türetme / PDF çıkarımı', () => {
  test('normalizeNace: 464305 → 46.43.05, noktalı ve boşluklu girişler de kabul', () => {
    expect(normalizeNace('464305')).toBe('46.43.05')
    expect(normalizeNace('46.43.05')).toBe('46.43.05')
    expect(normalizeNace('46 43 05')).toBe('46.43.05')
    expect(normalizeNace('4643')).toBe('46.43')
    expect(normalizeNace('46')).toBeNull()
    expect(normalizeNace('')).toBeNull()
    expect(normalizeNace('abc')).toBeNull()
  })

  test('sectorFromNace: Tekno 464305 → Ticaret (toptan), 3511 → Enerji, 4120 → İnşaat, 2511 → Üretim', () => {
    expect(sectorFromNace('464305')).toBe('Ticaret')
    expect(sectorFromNace('351100')).toBe('Enerji')
    expect(sectorFromNace('412001')).toBe('İnşaat')
    expect(sectorFromNace('251100')).toBe('Üretim')
    expect(sectorFromNace('620100')).toBe('Teknoloji')
    expect(sectorFromNace('861000')).toBe('Sağlık')
    expect(sectorFromNace(null)).toBeNull()
  })

  test('extractNaceFromText: GİB geçici beyanname "Faaliyet Kodu" bloğu', () => {
    const text = [
      'İşletmeden çekilen enflasyon düzeltmesi farkları 0,00',
      'Faaliyet Kodu Brüt Satış Tutarı',
      'BRÜT KAZANÇ DAĞILIMI',
      '464305 274.982.113,76',
      '',
    ].join('\n')
    expect(extractNaceFromText(text)).toBe('46.43.05')
  })

  test('extractNaceFromText: satır yoksa null (yıllık kurumlar beyannamesi)', () => {
    expect(extractNaceFromText('Ticari Bilanço Karı\n1.366.099,03')).toBeNull()
  })
})
