import { describeUploadError } from './uploadErrorText'

describe('describeUploadError', () => {
  it('bilinen kodda sunucunun açıklayıcı mesajını korur', () => {
    const t = describeUploadError(422, { error: 'YEAR_MISMATCH', message: 'Yüklediğiniz dosya 2024 yılı için, formda 2023 seçtiniz.' })
    expect(t).toContain('2024')
  })

  it('bilinen kodda mesaj yoksa sade metin döner', () => {
    expect(describeUploadError(400, { error: 'MISSING_YEAR_CONTEXT' })).toMatch(/yıl bilgisi/i)
    expect(describeUploadError(402, { error: 'NO_CREDITS' })).toMatch(/analiz hakkınız/i)
  })

  it('teknik mime metnini sadeleştirir', () => {
    const t = describeUploadError(400, { error: 'Dosya içeriği uzantıyla uyumsuz (application/zip).' })
    expect(t).not.toContain('application/zip')
    expect(t).toMatch(/uzantısıyla uyuşmuyor/)
  })

  it('parse jargonunu sadeleştirir', () => {
    const t = describeUploadError(400, { error: 'Excel satırları parse edildi ancak işlenebilir yıl/dönem bilgisi üretilemedi.' })
    expect(t).not.toMatch(/parse/i)
  })

  it('JSON olmayan 413 / 504 gövdesinde durum koduna göre metin döner', () => {
    expect(describeUploadError(413, {})).toMatch(/10 MB/)
    expect(describeUploadError(504, null)).toMatch(/zaman aşımı/)
  })

  it('500 hatasında destek kodunu kısaltarak ekler', () => {
    const t = describeUploadError(500, { error: 'Dosya işlenirken hata oluştu.', correlationId: '1234567890abcdef' })
    expect(t).toContain('Destek kodu: 12345678')
    expect(t).not.toContain('abcdef')
  })

  it('bilinmeyen büyük harfli kodu kullanıcıya göstermez', () => {
    const t = describeUploadError(400, { error: 'SOME_UNKNOWN_CODE' })
    expect(t).not.toContain('SOME_UNKNOWN_CODE')
  })
})
