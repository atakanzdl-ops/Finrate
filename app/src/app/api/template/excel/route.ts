import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  // Şablon sütun başlıkları
  const headers = [
    'Yıl', 'Dönem',
    // Gelir Tablosu
    'Net Satışlar', 'SMM', 'Brüt Kar', 'Faaliyet Giderleri',
    'FVÖK', 'Amortisman', 'FAVÖK', 'Finansman Gideri',
    'Diğer Gelirler', 'Diğer Giderler', 'Vergi Öncesi Kar', 'Vergi Gideri', 'Net Kar',
    // Dönen Varlıklar
    'Nakit', 'KV Yatırımlar', 'Ticari Alacaklar', 'Stoklar',
    'Diğer Dönen Varlıklar', 'Dönen Varlıklar',
    // Duran Varlıklar
    'Maddi Duran Varlıklar', 'Maddi Olmayan Duran Varlıklar',
    'UV Yatırımlar', 'Diğer Duran Varlıklar', 'Duran Varlıklar', 'Toplam Aktif',
    // Borçlar
    'KV Finansal Borçlar', 'Ticari Borçlar', 'Diğer KV Borçlar', 'KV Borçlar Toplamı',
    'UV Finansal Borçlar', 'Diğer UV Borçlar', 'UV Borçlar Toplamı',
    // Öz Kaynak
    'Ödenmiş Sermaye', 'Geçmiş Yıl Karları', 'Dönem Net Karı',
    'Toplam Öz Kaynak', 'Pasif Toplamı',
    // DPO
    'Satın Alımlar',
  ]

  // Örnek satırlar
  const exampleRows = [
    [2023, 'ANNUAL',
      10000000, 6000000, 4000000, 1500000,
      2500000, 300000, 2800000, 400000,
      100000, 50000, 2150000, 430000, 1720000,
      500000, 200000, 1200000, 800000,
      150000, 2850000,
      1500000, 200000,
      300000, 100000, 2100000, 4950000,
      800000, 600000, 200000, 1600000,
      1200000, 100000, 1300000,
      1000000, 500000, 550000,
      2050000, 3950000,
      5500000,
    ],
    [2022, 'ANNUAL',
      8500000, 5200000, 3300000, 1300000,
      2000000, 250000, 2250000, 380000,
      80000, 60000, 1640000, 328000, 1312000,
      400000, 150000, 1050000, 700000,
      120000, 2420000,
      1350000, 180000,
      250000, 90000, 1870000, 4290000,
      750000, 550000, 180000, 1480000,
      1100000, 90000, 1190000,
      1000000, 350000, 270000,
      1620000, 3350000,
      4700000,
    ],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows])

  // Sütun genişlikleri
  ws['!cols'] = headers.map(() => ({ wch: 22 }))

  // Başlık satırı stili (kalın + arka plan)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[cellAddr]) continue
    ws[cellAddr].s = {
      font:    { bold: true, color: { rgb: 'FFFFFF' } },
      fill:    { fgColor: { rgb: '0E5E7B' } },
      alignment: { horizontal: 'center' },
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Finansal Veriler')

  // Açıklama sayfası
  const infoData = [
    ['FINRATE — Excel Şablonu'],
    [''],
    ['Dönem Değerleri:', 'ANNUAL (Yıllık), Q1, Q2, Q3, Q4'],
    ['Sayısal Değerler:', 'Virgül veya nokta ondalık ayırıcı kullanabilirsiniz'],
    ['Boş Bırakma:', 'Verisi olmayan alanları boş bırakabilirsiniz'],
    ['Yıl Formatı:', '2023, 2022 gibi 4 haneli yıl girin'],
    [''],
    ['Her satır bir dönem-şirket kombinasyonunu temsil eder.'],
    ['İlk iki örnek satır referans amaçlıdır, silebilirsiniz.'],
  ]
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData)
  wsInfo['!cols'] = [{ wch: 25 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Açıklamalar')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="finrate_sablon.xlsx"',
    },
  })
}
