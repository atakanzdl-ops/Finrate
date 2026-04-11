/**
 * Finrate Rapor Ãœretici â€” Standart (8 sayfa) + Kurumsal (15 sayfa)
 * KullanÄ±m: node buildReport.js [standard|corporate]
 */
'use strict'
const path = require('path')
const fs   = require('fs')
const { PDFDocument, rgb } = require(path.join(__dirname, '../app/node_modules/pdf-lib'))
const fontkit = require(path.join(__dirname, '../app/node_modules/@pdf-lib/fontkit'))
const H = require('./reportHelpers')
const { C, PAGE, TEMINAT, ratingColor, scoreToRating,
  drawText, rect, line, progressBar, categoryBar, drawGauge,
  drawRatingStrip, kpiCard, addHeader, addFooter, sectionTitle,
  fmtNum, fmtPct, fmtX, fmtDay, fmtM, statusOf } = H

// â”€â”€â”€ TEST VERÄ°SÄ° â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DATA = {
  entity: { name: 'ATLAS MAKÄ°NA SANAYÄ° A.Å.', vkn: '1234567890', sector: 'Ä°malat', nace: 'C.28', type: 'A.Å.', founded: 2009 },
  analysis: { year: 2024, period: 'ANNUAL', reportNo: 'FNR-2024-08841', validUntil: '31.03.2025', analyst: 'Sistem Otomasyonu' },
  scores: {
    financial: 67.4,
    subjective: 18,        // /30
    combined: 72,          // combineScores sonucu
    rating: 'BBB',
    liquidity: 71, profitability: 62, leverage: 68, activity: 74,
    // sektÃ¶r benchmark skorlarÄ± (100 Ã¼zerinden)
    bmLiquidity: 58, bmProfitability: 55, bmLeverage: 62, bmActivity: 60,
  },
  subjective: { kkb:8, bank:7, corp:3, compliance:4, total:22 },
  ratios: {
    currentRatio: 1.82,       bmCurrentRatio: 1.73,
    quickRatio: 1.14,         bmQuickRatio: 1.00,
    cashRatio: 0.28,
    netWorkingCapitalRatio: 0.22,
    cashConversionCycle: 48,
    grossMargin: 0.248,       bmGrossMargin: 0.20,
    ebitMargin: 0.112,
    ebitdaMargin: 0.138,      bmEbitdaMargin: 0.09,
    netProfitMargin: 0.068,   bmNetProfitMargin: 0.025,
    roa: 0.051,               bmRoa: 0.023,
    roe: 0.112,               bmRoe: 0.044,
    debtToEquity: 0.78,       bmDebtToEquity: 0.93,
    debtToAssets: 0.44,       bmDebtToAssets: 0.48,
    equityRatio: 0.56,
    shortTermDebtRatio: 0.58,
    debtToEbitda: 2.4,
    interestCoverage: 5.8,    bmInterestCoverage: 3.91,
    assetTurnover: 0.74,      bmAssetTurnover: 0.87,
    inventoryTurnoverDays: 62, bmInventoryDays: 70,
    receivablesTurnoverDays: 58, bmReceivablesDays: 53,
    payablesTurnoverDays: 72,
    fixedAssetTurnover: 1.38,
  },
  financials: {
    years: [2021, 2022, 2023, 2024],
    revenue:    [18200000, 28400000, 41600000, 52300000],
    netProfit:  [1020000,  1680000,  2460000,  3556000],
    grossProfit:[3640000,  5112000,  8320000,  12971000],
    ebitda:     [2548000,  4260000,  5824000,  7218000],
    totalAssets:[48000000, 58000000, 63000000, 69700000],
    equity:     [22000000, 26000000, 30000000, 39032000],
    shortTermLiab:[14000000,17000000,18000000,18300000],
    longTermLiab: [12000000,15000000,15000000,12368000],
    currentAssets:[24000000,28000000,31000000,35000000],
    fixedAssets:  [24000000,30000000,32000000,34700000],
  },
  trends: {
    currentRatio:   [1.71, 1.65, 1.72, 1.82],
    netMargin:      [0.056, 0.059, 0.059, 0.068],
    debtToEquity:   [1.18, 1.23, 1.10, 0.78],
    revenueGrowth:  [null, 0.56, 0.46, 0.26],
    realGrowth:     [null, 0.12, 0.08, 0.05],
    bmCurrentRatio: [1.65, 1.68, 1.70, 1.73],
    bmNetMargin:    [0.022,0.024,0.024,0.025],
    bmDebtToEquity: [1.05, 1.00, 0.96, 0.93],
  },
  actions: [
    { priority:1, title:'Alacak Tahsil SÃ¼resinin KÄ±saltÄ±lmasÄ±', category:'Faaliyet',
      current:'58 gÃ¼n', target:'45 gÃ¼n', gain:3.2, difficulty:'Orta', horizon:'3-6 ay',
      bankEffect:'DSO iyileÅŸmesi nakit akÄ±ÅŸÄ± gÃ¼venilirliÄŸini artÄ±rÄ±r, limit kararlarÄ±nda pozitif etki yaratÄ±r.',
      desc:'Alacak tahsil politikasÄ±nÄ±n gÃ¼ncellenmesi ve tahsilat takibinin sistematize edilmesi ile DSO 45 gÃ¼ne indirilebilir. Erken Ã¶deme indirimi mÃ¼ÅŸteri bazÄ±nda uygulanabilir.' },
    { priority:2, title:'KÄ±sa Vadeyi Uzun Vadeye DÃ¶nÃ¼ÅŸtÃ¼rme', category:'KaldÄ±raÃ§',
      current:'KV oran: %58', target:'KV oran: %45', gain:4.1, difficulty:'Orta', horizon:'6-12 ay',
      bankEffect:'KV borÃ§ oranÄ±nÄ±n dÃ¼ÅŸÃ¼rÃ¼lmesi likidite baskÄ±sÄ±nÄ± azaltÄ±r; bankanÄ±n yeniden yapÄ±landÄ±rma isteÄŸini artÄ±rÄ±r.',
      desc:'Mevcut kÄ±sa vadeli finansal borÃ§larÄ±n 3-5 yÄ±l vadeli TL yatÄ±rÄ±m kredisine Ã§evrilmesi; Ã¶nerilen araÃ§: KGF destekli yatÄ±rÄ±m kredisi.' },
    { priority:3, title:'Net KÃ¢r MarjÄ± Ä°yileÅŸtirmesi', category:'KÃ¢rlÄ±lÄ±k',
      current:'%6.8', target:'%8.5', gain:3.8, difficulty:'YÃ¼ksek', horizon:'12-18 ay',
      bankEffect:'Marj artÄ±ÅŸÄ± FAVÃ–K Ã¼retimini gÃ¼Ã§lendirir, Net BorÃ§/FAVÃ–K oranÄ±nÄ± iyileÅŸtirir.',
      desc:'ÃœrÃ¼n bazlÄ± maliyet analizi ile dÃ¼ÅŸÃ¼k marjlÄ± Ã¼rÃ¼n gamÄ±nÄ± daraltmak ve fiyatlama stratejisini gÃ¼Ã§lendirmek. Faaliyet giderlerinde %5-8 tasarruf hedeflenmeli.' },
    { priority:4, title:'Stok Devir HÄ±zÄ±nÄ±n ArtÄ±rÄ±lmasÄ±', category:'Faaliyet',
      current:'62 gÃ¼n', target:'50 gÃ¼n', gain:2.1, difficulty:'Orta', horizon:'3-6 ay',
      bankEffect:'Ã‡alÄ±ÅŸma sermayesi verimliliÄŸi nakit pozisyonunu gÃ¼Ã§lendirir.',
      desc:'Minimum stok seviyelerinin belirlenmesi, talep tahmin sisteminin gÃ¼Ã§lendirilmesi.' },
  ],
  creditAdvice: {
    recommendedTypes: ['KGF Destekli Ä°ÅŸletme Kredisi (â‰¤12 ay)', 'Rotatif Kredi Limiti', 'Akreditif / Teminat Mektubu'],
    kosgeb: true, kgf: true, eximbank: false,
    teminatOnerisi: 'Mevcut ipotek teminatÄ±nÄ±n yanÄ± sÄ±ra alacak temliki ile limit artÄ±ÅŸÄ± mÃ¼mkÃ¼n gÃ¶rÃ¼nmektedir.',
  },
}

// â”€â”€â”€ FONT YÃœKLEYÄ°CÄ° â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit)
  const fontDir = path.join(__dirname, '../app/node_modules/pdfjs-dist/standard_fonts')
  const reg  = await pdfDoc.embedFont(fs.readFileSync(path.join(fontDir,'LiberationSans-Regular.ttf')))
  const bold = await pdfDoc.embedFont(fs.readFileSync(path.join(fontDir,'LiberationSans-Bold.ttf')))
  return { reg, bold }
}

// â”€â”€â”€ YENÄ° SAYFA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function newPage(doc, { reg, bold }, entityName, pageNum, title) {
  const page = doc.addPage([PAGE.w, PAGE.h])
  rect(page, 0, 0, PAGE.w, PAGE.h, { fill: C.white })
  addHeader(page, bold, reg, entityName, pageNum, title)
  addFooter(page, reg)
  return page
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SAYFA 1: KAPAK
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function buildCover(doc, fonts, d, isCorporate) {
  const { reg, bold } = fonts
  const page = doc.addPage([PAGE.w, PAGE.h])
  rect(page, 0, 0, PAGE.w, PAGE.h, { fill: C.white })

  // Ãœst navy bant
  rect(page, 0, PAGE.h - 160, PAGE.w, 160, { fill: C.navy })
  // Teal accent ÅŸerit
  rect(page, 0, PAGE.h - 163, PAGE.w, 3, { fill: C.teal })

  // Logo alanÄ±
  rect(page, PAGE.mx, PAGE.h - 80, 36, 36, { fill: C.teal })
  page.drawText('F', { x: PAGE.mx+12, y: PAGE.h-62, size:18, font:bold, color:C.white })
  page.drawText('FINRATE', { x: PAGE.mx+44, y: PAGE.h-58, size:22, font:bold, color:C.white })
  page.drawText('Finansal Derecelendirme Platformu', { x: PAGE.mx+44, y: PAGE.h-74, size:9, font:reg, color:rgb(148/255,163/255,184/255) })

  // Rapor baÅŸlÄ±ÄŸÄ± (saÄŸ Ã¼st)
  const titleStr = isCorporate ? 'KURUMSAL PREMÄ°UM' : 'STANDART'
  const rLabel = 'FÄ°NANSAL ANALÄ°Z RAPORU Â· ' + titleStr
  page.drawText(rLabel, { x: PAGE.w-PAGE.mx-bold.widthOfTextAtSize(rLabel,8), y: PAGE.h-68, size:8, font:bold, color:rgb(148/255,163/255,184/255) })

  // Alt saÄŸ: tarih
  const dateStr = new Date().toLocaleDateString('tr-TR',{day:'2-digit',month:'long',year:'numeric'})
  page.drawText(dateStr, { x:PAGE.w-PAGE.mx-reg.widthOfTextAtSize(dateStr,9), y:PAGE.h-82, size:9, font:reg, color:rgb(148/255,163/255,184/255) })

  // â”€â”€ Firma adÄ± â”€â”€
  const nameY = PAGE.h - 210
  page.drawText(d.entity.name, { x:PAGE.mx, y:nameY, size:26, font:bold, color:C.navy })
  const subInfo = [d.entity.vkn && 'VKN: '+d.entity.vkn, d.entity.sector, d.entity.nace].filter(Boolean).join('  Â·  ')
  page.drawText(subInfo, { x:PAGE.mx, y:nameY-18, size:10, font:reg, color:C.muted })

  // DÃ¶nem
  const periodStr = d.analysis.year + ' Â· ' + (d.analysis.period === 'ANNUAL' ? 'YÄ±llÄ±k Kesin Beyan' : d.analysis.period)
  page.drawText(periodStr, { x:PAGE.mx, y:nameY-34, size:10, font:bold, color:C.teal })

  if (isCorporate) {
    page.drawText('Åirket TÃ¼rÃ¼: '+d.entity.type+'  Â·  KuruluÅŸ: '+d.entity.founded+'  Â·  Faaliyet: '+(2024-d.entity.founded)+' YÄ±l', { x:PAGE.mx, y:nameY-50, size:9, font:reg, color:C.muted })
    page.drawText('Rapor No: '+d.analysis.reportNo+'  Â·  GeÃ§erlilik: '+d.analysis.validUntil, { x:PAGE.mx, y:nameY-64, size:9, font:reg, color:C.muted })
  }

  // Divider
  line(page, PAGE.mx, nameY-78, PAGE.w-PAGE.mx, nameY-78, { color:C.border })

  // â”€â”€ Gauge + Rating badge yan yana â”€â”€
  const gaugeY = nameY - 190
  // Gauge (sol)
  drawGauge(page, PAGE.mx+80, gaugeY, 62, d.scores.combined, bold, reg)
  page.drawText('Toplam Skor', { x:PAGE.mx+46, y:gaugeY-74, size:9, font:bold, color:C.muted })
  page.drawText('Finansal: '+d.scores.financial.toFixed(1)+'  Â·  Subjektif: '+d.scores.subjective, { x:PAGE.mx+20, y:gaugeY-86, size:8, font:reg, color:C.muted })

  // Rating badge (orta)
  const rcolor = ratingColor(d.scores.rating)
  rect(page, PAGE.mx+185, gaugeY-60, 110, 100, { fill:rcolor, border:C.border, bw:0.5 })
  const rw = bold.widthOfTextAtSize(d.scores.rating, 42)
  page.drawText(d.scores.rating, { x:PAGE.mx+185+(110-rw)/2, y:gaugeY+8, size:42, font:bold, color:C.white })
  page.drawText('KREDÄ° NOTU', { x:PAGE.mx+185+(110-bold.widthOfTextAtSize('KREDÄ° NOTU',8))/2, y:gaugeY-50, size:8, font:bold, color:rgb(1,1,1) })

  // Teminat (saÄŸ)
  const tem = TEMINAT[d.scores.rating] || ''
  rect(page, PAGE.mx+315, gaugeY-60, 236, 100, { fill:C.surface, border:C.border })
  page.drawText('TEMÄ°NAT KOÅULU', { x:PAGE.mx+323, y:gaugeY+26, size:8, font:bold, color:C.muted })
  drawText(page, tem, PAGE.mx+323, gaugeY+10, { font:bold, size:10, color:C.navy, maxW:220, lineH:14 })

  // Rating strip
  const stripY = gaugeY - 80
  page.drawText('Rating SkalasÄ±', { x:PAGE.mx, y:stripY+28, size:8, font:bold, color:C.muted })
  drawRatingStrip(page, reg, bold, PAGE.mx, stripY+8, d.scores.rating)

  // Footer ayÄ±rÄ±cÄ± + metodoloji notu
  line(page, PAGE.mx, 55, PAGE.w-PAGE.mx, 55, { color:C.border })
  page.drawText('Bu rapor Finrate tarafÄ±ndan, TCMB 2024 sektÃ¶r kÄ±yaslama verileri kullanÄ±larak bankacÄ±lÄ±k metodolojisi ile Ã¼retilmiÅŸtir. Gizlidir.', { x:PAGE.mx, y:40, size:7.5, font:reg, color:C.muted })
  page.drawText('finrate.com', { x:PAGE.w-PAGE.mx-reg.widthOfTextAtSize('finrate.com',7.5), y:40, size:7.5, font:reg, color:C.muted })

  return page
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SAYFA 2 (standard) / SAYFA 4 (corporate): YÃ–NETÄ°CÄ° Ã–ZETÄ°
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function buildSummary(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'YÃ¶netici Ã–zeti')
  const s = d.scores
  let y = PAGE.top - 30

  // â”€â”€ Skor kartlarÄ± Ã¼Ã§lÃ¼ â”€â”€
  const cardW = 155, cardH = 54, gap = 11
  const cards = [
    { label:'Finansal Skor', value: s.financial.toFixed(1)+' / 100', sub:'70 finansal metrik' },
    { label:'Subjektif Skor', value: s.subjective+' / 30', sub:'KKB Â· Banka Â· Kurumsal Â· Uyum' },
    { label:'Toplam Skor', value: s.combined+' / 100', sub: 'Rating: '+s.rating },
  ]
  cards.forEach((c,i) => kpiCard(page, reg, bold, PAGE.mx + i*(cardW+gap), y-cardH, cardW, cardH, c.label, c.value, c.sub))
  y -= cardH + 18

  // â”€â”€ 6 KPI â”€â”€
  const kpiW = 80, kpiH = 44, kpiGap = 7
  const fin = d.financials
  const kpis = [
    { label:'SatÄ±ÅŸlar', value: fmtM(fin.revenue[3]), sub: '+'+fmtNum((fin.revenue[3]/fin.revenue[2]-1)*100,1)+'% YoY' },
    { label:'Net KÃ¢r MarjÄ±', value: fmtPct(d.ratios.netProfitMargin), sub:'SektÃ¶r: '+fmtPct(d.ratios.bmNetProfitMargin) },
    { label:'Cari Oran', value: fmtX(d.ratios.currentRatio), sub:'SektÃ¶r: '+fmtX(d.ratios.bmCurrentRatio) },
    { label:'BorÃ§/Ã–zK', value: fmtX(d.ratios.debtToEquity), sub:'SektÃ¶r: '+fmtX(d.ratios.bmDebtToEquity) },
    { label:'SatÄ±ÅŸ BÃ¼y.', value: fmtPct((fin.revenue[3]/fin.revenue[2]-1)), sub:'Nominal' },
    { label:'Subjektif', value: s.subjective+'/30', sub:'KKB: '+d.subjective.kkb+'/10' },
  ]
  kpis.forEach((k,i) => kpiCard(page, reg, bold, PAGE.mx + i*(kpiW+kpiGap), y-kpiH, kpiW, kpiH, k.label, k.value, k.sub))
  y -= kpiH + 22

  // â”€â”€ Kategori bar chart â”€â”€
  y = sectionTitle(page, bold, reg, PAGE.mx, y, 'Kategori SkorlarÄ±', 'Firma vs TCMB SektÃ¶r OrtalamasÄ±')
  const cats = [
    { label:'Likidite (AÄŸÄ±rlÄ±k %25)', val:s.liquidity, bm:s.bmLiquidity },
    { label:'KÃ¢rlÄ±lÄ±k (AÄŸÄ±rlÄ±k %30)', val:s.profitability, bm:s.bmProfitability },
    { label:'KaldÄ±raÃ§ (AÄŸÄ±rlÄ±k %30)', val:s.leverage, bm:s.bmLeverage },
    { label:'Faaliyet (AÄŸÄ±rlÄ±k %15)', val:s.activity, bm:s.bmActivity },
  ]
  cats.forEach((c,i) => { categoryBar(page, reg, bold, PAGE.mx, y-i*26, c.label, c.val, c.bm, 260, 26) })
  // legend
  rect(page,PAGE.mx+370,y-8,10,10,{fill:C.teal}); page.drawText('Firma', {x:PAGE.mx+384,y:y-5,size:8,font:reg,color:C.text})
  line(page,PAGE.mx+418,y+2,PAGE.mx+418,y-18,{color:C.navy,thickness:2}); page.drawText('SektÃ¶r Ort.', {x:PAGE.mx+423,y:y-5,size:8,font:reg,color:C.text})
  y -= cats.length * 26 + 20

  // â”€â”€ GÃ¼Ã§lÃ¼ / Risk â”€â”€
  const strengths = [], risks = []
  if (s.liquidity >= 65) strengths.push('KÄ±sa vadeli yÃ¼kÃ¼mlÃ¼lÃ¼k karÅŸÄ±lama kapasitesi gÃ¼Ã§lÃ¼')
  else risks.push('Likidite gÃ¶rÃ¼nÃ¼mÃ¼ baskÄ± altÄ±nda')
  if (s.profitability >= 60) strengths.push('FAVÃ–K marjÄ± ve net kÃ¢rlÄ±lÄ±k sektÃ¶r Ã¼stÃ¼nde')
  else risks.push('KÃ¢rlÄ±lÄ±k dÃ¼zeyi notu aÅŸaÄŸÄ± Ã§ekiyor')
  if (s.leverage >= 65) strengths.push('BorÃ§luluk seviyesi yÃ¶netilebilir dÃ¼zeyde')
  else risks.push('KaldÄ±raÃ§ seviyesi dikkatli izleme gerektiriyor')
  if (s.activity >= 65) strengths.push('Faaliyet verimliliÄŸi sektÃ¶r ortalamasÄ±nda')
  else risks.push('Faaliyet dÃ¶ngÃ¼sÃ¼ iyileÅŸtirme alanÄ± sunuyor')

  const colW = (PAGE.w - PAGE.mx*2 - 12) / 2
  // GÃ¼Ã§lÃ¼
  rect(page, PAGE.mx, y-14-strengths.length*16, colW, 18+strengths.length*16, { fill:rgb(240/255,253/255,244/255), border:C.green, bw:0.5 })
  page.drawText('GÃœÃ‡LÃœ ALANLAR', { x:PAGE.mx+8, y:y-8, size:8, font:bold, color:C.green })
  strengths.forEach((s2,i) => { page.drawText('âœ“  '+s2, { x:PAGE.mx+8, y:y-22-i*16, size:8.5, font:reg, color:C.text }) })
  // Risk
  const rx = PAGE.mx + colW + 12
  rect(page, rx, y-14-risks.length*16, colW, 18+risks.length*16, { fill:rgb(254/255,242/255,242/255), border:C.red, bw:0.5 })
  page.drawText('RÄ°SK ALANLARI', { x:rx+8, y:y-8, size:8, font:bold, color:C.red })
  risks.forEach((r2,i) => { page.drawText('âš   '+r2, { x:rx+8, y:y-22-i*16, size:8.5, font:reg, color:C.text }) })
  y -= 18 + Math.max(strengths.length,risks.length)*16 + 16

  // â”€â”€ Genel deÄŸerlendirme metni â”€â”€
  const ratingMsg = s.combined>=68 ? 'olumlu deÄŸerlendirilmektedir ve bankacÄ±lÄ±k kanallarÄ±nda yeterliliÄŸini koruyan bir kredi profiline sahiptir.'
    : s.combined>=54 ? 'dengeli bir gÃ¶rÃ¼nÃ¼m sergilemektedir; seÃ§ici kredi risk yÃ¶netimi Ã¶nerilmektedir.'
    : 'zayÄ±f bir finansal profil sergilemektedir; kredi kararÄ±nda temkinli yaklaÅŸÄ±m gereklidir.'
  const evalText = d.entity.name+' iÃ§in '+ d.analysis.year+' yÄ±lÄ± analizi sonucunda toplam finansal skor '+s.combined+'/100 ve rating '+s.rating+' olarak hesaplanmÄ±ÅŸtÄ±r. Firma '+ratingMsg
  rect(page, PAGE.mx, y-46, PAGE.w-PAGE.mx*2, 50, { fill:C.surface, border:C.border })
  drawText(page, evalText, PAGE.mx+10, y-10, { font:reg, size:9, color:C.text, maxW:PAGE.w-PAGE.mx*2-20, lineH:14 })

  return page
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SAYFA 3-4 (std) / 5-6 (corp): FÄ°NANSAL ORANLAR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function buildRatiosPage(doc, fonts, d, pageNum, section) {
  const { reg, bold } = fonts
  const isLiq = section === 'liq'
  const page = newPage(doc, fonts, d.entity.name, pageNum, isLiq ? 'Likidite & BorÃ§lanma' : 'KÃ¢rlÄ±lÄ±k & Faaliyet')
  let y = PAGE.top - 28

  const colHeaders = ['Oran', 'Firma DeÄŸeri', 'SektÃ¶r Ort.', 'GÃ¶rsel KarÅŸÄ±laÅŸtÄ±rma', 'Durum']
  const colX = [PAGE.mx, PAGE.mx+140, PAGE.mx+220, PAGE.mx+295, PAGE.mx+470]
  const colW_ = [136,76,71,172,60]

  // BÃ¶lÃ¼m baÅŸlÄ±klarÄ± ve satÄ±rlarÄ±
  const sections_liq = [
    { title:'LÄ°KÄ°DÄ°TE ORANLARI', rows:[
      { name:'Cari Oran', val:fmtX(d.ratios.currentRatio), bm:fmtX(d.ratios.bmCurrentRatio), fp:d.ratios.currentRatio/3, bmp:d.ratios.bmCurrentRatio/3, st:statusOf(d.ratios.currentRatio,1.5,1.0) },
      { name:'Asit-Test (HÄ±zlÄ± Oran)', val:fmtX(d.ratios.quickRatio), bm:fmtX(d.ratios.bmQuickRatio), fp:d.ratios.quickRatio/2, bmp:d.ratios.bmQuickRatio/2, st:statusOf(d.ratios.quickRatio,1.0,0.7) },
      { name:'Nakit OranÄ±', val:fmtX(d.ratios.cashRatio), bm:'â€”', fp:d.ratios.cashRatio/0.8, bmp:0.3, st:statusOf(d.ratios.cashRatio,0.3,0.15) },
      { name:'NÃ‡S / Aktif OranÄ±', val:fmtPct(d.ratios.netWorkingCapitalRatio), bm:'â€”', fp:d.ratios.netWorkingCapitalRatio/0.5, bmp:0.3, st:statusOf(d.ratios.netWorkingCapitalRatio,0.2,0.05) },
      { name:'Nakit DÃ¶nÃ¼ÅŸÃ¼m DÃ¶ngÃ¼sÃ¼', val:fmtDay(d.ratios.cashConversionCycle), bm:'â€”', fp:1-d.ratios.cashConversionCycle/200, bmp:0.6, st:statusOf(d.ratios.cashConversionCycle,60,100,true) },
    ]},
    { title:'BORÃ‡LANMA & FÄ°NANSAL YAPI', rows:[
      { name:'BorÃ§ / Ã–zkaynak', val:fmtX(d.ratios.debtToEquity), bm:fmtX(d.ratios.bmDebtToEquity), fp:1-d.ratios.debtToEquity/3, bmp:1-d.ratios.bmDebtToEquity/3, st:statusOf(d.ratios.debtToEquity,1.0,2.0,true) },
      { name:'BorÃ§ / Aktif', val:fmtPct(d.ratios.debtToAssets), bm:fmtPct(d.ratios.bmDebtToAssets), fp:1-d.ratios.debtToAssets, bmp:1-d.ratios.bmDebtToAssets, st:statusOf(d.ratios.debtToAssets,0.5,0.7,true) },
      { name:'Ã–zkaynak OranÄ±', val:fmtPct(d.ratios.equityRatio), bm:'â€”', fp:d.ratios.equityRatio, bmp:0.5, st:statusOf(d.ratios.equityRatio,0.4,0.2) },
      { name:'KV BorÃ§ / Toplam BorÃ§', val:fmtPct(d.ratios.shortTermDebtRatio), bm:'â€”', fp:1-d.ratios.shortTermDebtRatio, bmp:0.45, st:statusOf(d.ratios.shortTermDebtRatio,0.5,0.7,true) },
      { name:'Net BorÃ§ / FAVÃ–K', val:fmtX(d.ratios.debtToEbitda), bm:'â€”', fp:1-d.ratios.debtToEbitda/10, bmp:0.7, st:statusOf(d.ratios.debtToEbitda,3.0,5.0,true) },
      { name:'Faiz KarÅŸÄ±lama OranÄ±', val:fmtX(d.ratios.interestCoverage), bm:fmtX(d.ratios.bmInterestCoverage), fp:Math.min(1,d.ratios.interestCoverage/8), bmp:d.ratios.bmInterestCoverage/8, st:statusOf(d.ratios.interestCoverage,3.5,1.5) },
    ]},
  ]
  const sections_prof = [
    { title:'KÃ‚RLILIK ORANLARI', rows:[
      { name:'BrÃ¼t KÃ¢r MarjÄ±', val:fmtPct(d.ratios.grossMargin), bm:fmtPct(d.ratios.bmGrossMargin), fp:d.ratios.grossMargin/0.5, bmp:d.ratios.bmGrossMargin/0.5, st:statusOf(d.ratios.grossMargin,0.20,0.10) },
      { name:'FAVÃ–K MarjÄ±', val:fmtPct(d.ratios.ebitdaMargin), bm:fmtPct(d.ratios.bmEbitdaMargin), fp:d.ratios.ebitdaMargin/0.3, bmp:d.ratios.bmEbitdaMargin/0.3, st:statusOf(d.ratios.ebitdaMargin,0.10,0.05) },
      { name:'Faaliyet KÃ¢r MarjÄ± (FVÃ–K)', val:fmtPct(d.ratios.ebitMargin), bm:'â€”', fp:d.ratios.ebitMargin/0.25, bmp:0.4, st:statusOf(d.ratios.ebitMargin,0.08,0.03) },
      { name:'Net KÃ¢r MarjÄ±', val:fmtPct(d.ratios.netProfitMargin), bm:fmtPct(d.ratios.bmNetProfitMargin), fp:d.ratios.netProfitMargin/0.15, bmp:d.ratios.bmNetProfitMargin/0.15, st:statusOf(d.ratios.netProfitMargin,0.05,0.01) },
      { name:'ROA (Aktif KÃ¢rlÄ±lÄ±ÄŸÄ±)', val:fmtPct(d.ratios.roa), bm:fmtPct(d.ratios.bmRoa), fp:d.ratios.roa/0.15, bmp:d.ratios.bmRoa/0.15, st:statusOf(d.ratios.roa,0.04,0.01) },
      { name:'ROE (Ã–zkaynak KÃ¢rlÄ±lÄ±ÄŸÄ±)', val:fmtPct(d.ratios.roe), bm:fmtPct(d.ratios.bmRoe), fp:d.ratios.roe/0.25, bmp:d.ratios.bmRoe/0.25, st:statusOf(d.ratios.roe,0.08,0.02) },
    ]},
    { title:'FAALÄ°YET & VERÄ°MLÄ°LÄ°K ORANLARI', rows:[
      { name:'Aktif Devir HÄ±zÄ±', val:fmtX(d.ratios.assetTurnover), bm:fmtX(d.ratios.bmAssetTurnover), fp:d.ratios.assetTurnover/2, bmp:d.ratios.bmAssetTurnover/2, st:statusOf(d.ratios.assetTurnover,0.8,0.4) },
      { name:'Alacak Tahsil SÃ¼resi (DSO)', val:fmtDay(d.ratios.receivablesTurnoverDays), bm:fmtDay(d.ratios.bmReceivablesDays), fp:1-d.ratios.receivablesTurnoverDays/150, bmp:1-d.ratios.bmReceivablesDays/150, st:statusOf(d.ratios.receivablesTurnoverDays,60,90,true) },
      { name:'Stok Devir SÃ¼resi (DIO)', val:fmtDay(d.ratios.inventoryTurnoverDays), bm:fmtDay(d.ratios.bmInventoryDays), fp:1-d.ratios.inventoryTurnoverDays/150, bmp:1-d.ratios.bmInventoryDays/150, st:statusOf(d.ratios.inventoryTurnoverDays,60,90,true) },
      { name:'BorÃ§ Ã–deme SÃ¼resi (DPO)', val:fmtDay(d.ratios.payablesTurnoverDays), bm:'â€”', fp:d.ratios.payablesTurnoverDays/120, bmp:0.4, st:statusOf(d.ratios.payablesTurnoverDays,45,20) },
      { name:'Sabit VarlÄ±k Devir HÄ±zÄ±', val:fmtX(d.ratios.fixedAssetTurnover), bm:'â€”', fp:d.ratios.fixedAssetTurnover/3, bmp:0.5, st:statusOf(d.ratios.fixedAssetTurnover,1.5,0.5) },
    ]},
  ]

  const secs = isLiq ? sections_liq : sections_prof
  const ROW_H = 24

  // Tablo baÅŸlÄ±k
  rect(page, PAGE.mx, y-16, PAGE.w-PAGE.mx*2, 18, { fill:C.navy })
  colHeaders.forEach((h,i) => { page.drawText(h, { x:colX[i]+4, y:y-11, size:8, font:bold, color:C.white }) })
  y -= 18

  for (const sec of secs) {
    y -= 6
    rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 16, { fill:C.tealPale })
    page.drawText(sec.title, { x:PAGE.mx+6, y:y-10, size:8.5, font:bold, color:C.navy })
    y -= 16
    for (const row of sec.rows) {
      const bg = y%2===0 ? C.white : C.surface
      rect(page, PAGE.mx, y-ROW_H+4, PAGE.w-PAGE.mx*2, ROW_H, { fill:bg, border:C.border, bw:0.3 })
      page.drawText(row.name, { x:colX[0]+4, y:y-14, size:8.5, font:reg, color:C.text })
      page.drawText(row.val,  { x:colX[1]+4, y:y-14, size:8.5, font:bold, color:C.navy })
      page.drawText(row.bm,   { x:colX[2]+4, y:y-14, size:8.5, font:reg, color:C.muted })
      // progress bar
      progressBar(page, colX[3]+2, y-18, 160, 10, Math.max(0,Math.min(1,row.fp||0)), Math.max(0,Math.min(1,row.bmp||0)), row.st)
      // status badge
      const stC = row.st==='good' ? C.green : row.st==='warn' ? C.amber : C.red
      const stL = row.st==='good' ? 'Ä°YÄ°' : row.st==='warn' ? 'UYARI' : 'ZAYIF'
      rect(page, colX[4]+2, y-18, 50, 12, { fill:row.st==='good'?rgb(240/255,253/255,244/255):row.st==='warn'?rgb(254/255,252/255,232/255):rgb(254/255,242/255,242/255), border:stC, bw:0.5 })
      page.drawText(stL, { x:colX[4]+2+(50-bold.widthOfTextAtSize(stL,7.5))/2, y:y-13, size:7.5, font:bold, color:stC })
      y -= ROW_H
    }
  }
  return page
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SAYFA 5 (std): TREND ANALÄ°ZÄ°
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function buildTrends(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Trend Analizi')
  let y = PAGE.top - 30

  sectionTitle(page, bold, reg, PAGE.mx, y, 'Trend Analizi', 'Son 4 YÄ±l Â· 2021-2024')
  y -= 20

  const t = d.trends
  const years = d.financials.years
  const chartW = (PAGE.w - PAGE.mx*2 - 30) / 2
  const chartH = 90
  const gap = 30

  function miniBarChart(cx, cy, cw, ch, title, series, seriesBm, unit, invert=false) {
    page.drawText(title, { x:cx, y:cy+ch+14, size:9, font:bold, color:C.navy })
    const barW = Math.floor((cw - (series.length-1)*6) / series.length)
    const maxVal = Math.max(...series.filter(Boolean), ...(seriesBm||[]).filter(Boolean), 0.001)
    rect(page, cx, cy, cw, ch, { fill:C.surface, border:C.border, bw:0.5 })
    series.forEach((v,i) => {
      if (v==null) return
      const bx = cx + i*(barW+6)
      const bh = Math.max(2, (v/maxVal)*(ch-18))
      // firma bar (teal)
      rect(page, bx, cy+14, barW*0.55, bh, { fill:C.teal })
      // bm bar (navy lighter)
      if (seriesBm && seriesBm[i]!=null) {
        const bh2 = Math.max(2,(seriesBm[i]/maxVal)*(ch-18))
        rect(page, bx+barW*0.58, cy+14, barW*0.38, bh2, { fill:rgb(100/255,149/255,180/255) })
      }
      // year label
      page.drawText(String(years[i]), { x:bx, y:cy+2, size:6.5, font:reg, color:C.muted })
      // value label
      const valStr = unit==='pct' ? fmtPct(v) : unit==='x' ? fmtX(v) : fmtNum(v,1)
      page.drawText(valStr, { x:bx, y:cy+ch-8, size:6, font:bold, color:C.text })
    })
    // legend
    rect(page,cx,cy+ch+4,8,5,{fill:C.teal}); page.drawText('Firma',{x:cx+10,y:cy+ch+5,size:6,font:reg,color:C.text})
    if(seriesBm) { rect(page,cx+40,cy+ch+4,8,5,{fill:rgb(100/255,149/255,180/255)}); page.drawText('SektÃ¶r',{x:cx+50,y:cy+ch+5,size:6,font:reg,color:C.text}) }
  }

  miniBarChart(PAGE.mx, y-chartH, chartW, chartH, 'Cari Oran Trendi', t.currentRatio, t.bmCurrentRatio, 'x')
  miniBarChart(PAGE.mx+chartW+gap, y-chartH, chartW, chartH, 'Net KÃ¢r MarjÄ± Trendi', t.netMargin, t.bmNetMargin, 'pct')
  y -= chartH + 50

  miniBarChart(PAGE.mx, y-chartH, chartW, chartH, 'BorÃ§/Ã–zkaynak Trendi (dÃ¼ÅŸÃ¼k = iyi)', t.debtToEquity, t.bmDebtToEquity, 'x')
  miniBarChart(PAGE.mx+chartW+gap, y-chartH, chartW, chartH, 'SatÄ±ÅŸ BÃ¼yÃ¼mesi (Nominal vs Reel)', t.revenueGrowth.map((v,i)=>v==null?null:v*100), t.realGrowth.map(v=>v==null?null:v*100), 'pct')
  y -= chartH + 45

  // SatÄ±ÅŸ ve KÃ¢r tablosu
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Finansal BÃ¼yÃ¼me Ã–zeti', 'â‚º bazÄ±nda')
  y -= 18
  const cols = ['', '2021', '2022', '2023', '2024']
  const rows = [
    ['SatÄ±ÅŸlar', ...d.financials.revenue.map(fmtM)],
    ['Net KÃ¢r', ...d.financials.netProfit.map(fmtM)],
    ['FAVÃ–K', ...d.financials.ebitda.map(fmtM)],
    ['Ã–zkaynak', ...d.financials.equity.map(fmtM)],
  ]
  const tcw = [120,90,90,90,90]
  const tx = [PAGE.mx, PAGE.mx+124, PAGE.mx+218, PAGE.mx+312, PAGE.mx+406]
  rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 16, { fill:C.navy })
  cols.forEach((c,i) => page.drawText(c, { x:tx[i]+4, y:y-9, size:8, font:bold, color:C.white }))
  y -= 16
  rows.forEach((row,ri) => {
    rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 16, { fill: ri%2===0?C.surface:C.white, border:C.border, bw:0.3 })
    row.forEach((cell,ci) => page.drawText(cell, { x:tx[ci]+4, y:y-9, size:8, font:ci===0?bold:reg, color:ci===0?C.navy:C.text }))
    y -= 16
  })
  return page
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SAYFA 6 (std): SENARYO ANALÄ°ZÄ°
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function buildScenario(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Senaryo Analizi')
  let y = PAGE.top - 30

  sectionTitle(page, bold, reg, PAGE.mx, y, 'Senaryo Analizi', 'Mevcut durum ve hedef rating senaryolarÄ±')
  y -= 28

  const current = { rating:d.scores.rating, score:d.scores.combined, label:'MEVCUT DURUM' }
  const target1 = { rating:'A', score:76, label:'1. KADEME HEDEFÄ°', gain:76-d.scores.combined, actions:['Alacak tahsil sÃ¼resini kÄ±salt','KV borcu UV\u2019ye Ã§evir'] }
  const target2 = { rating:'AA', score:84, label:'2. KADEME HEDEFÄ°', gain:84-d.scores.combined, actions:['Net kÃ¢r marjÄ±nÄ± artÄ±r','BorÃ§/Ã¶zkaynak oranÄ±nÄ± iyileÅŸtir','Faaliyet verimliliÄŸini artÄ±r'] }

  // Waterfall gÃ¶rseli (basit bar + kÃ¶prÃ¼ler)
  const scenarios = [
    { label:'Mevcut\n'+current.rating, score:current.score, color:ratingColor(current.rating) },
    { label:'+Alacak\nTahsilat', score:current.score+3.2, color:C.teal, delta:true },
    { label:'+KVâ†’UV\nDÃ¶nÃ¼ÅŸÃ¼m', score:current.score+3.2+4.1, color:C.teal, delta:true },
    { label:'+KÃ¢rlÄ±lÄ±k\nÄ°yileÅŸtirme', score:current.score+3.2+4.1+3.8, color:C.teal, delta:true },
    { label:'1. Kademe\n'+target1.rating, score:target1.score, color:ratingColor(target1.rating) },
    { label:'+BorÃ§\nYapÄ±sÄ±', score:target1.score+4, color:C.teal, delta:true },
    { label:'+Ã–zkaynak\nGÃ¼Ã§lendirme', score:target1.score+4+4, color:C.teal, delta:true },
    { label:'2. Kademe\n'+target2.rating, score:target2.score, color:ratingColor(target2.rating) },
  ]

  const wfW = PAGE.w - PAGE.mx*2
  const wfH = 100
  const barW2 = wfW/scenarios.length - 4
  const base = 40, maxScore = 100

  rect(page, PAGE.mx, y-wfH-20, wfW, wfH+20, { fill:C.surface, border:C.border })
  page.drawText('PUAN', { x:PAGE.mx+2, y:y-20, size:6.5, font:reg, color:C.muted })
  ;[40,60,80,100].forEach(v => {
    const ly = y-wfH-20 + (v-base)/(maxScore-base)*wfH
    line(page, PAGE.mx+20, ly, PAGE.mx+wfW, ly, { color:C.border, thickness:0.3 })
    page.drawText(String(v), { x:PAGE.mx+2, y:ly-3, size:6, font:reg, color:C.muted })
  })

  let prevScore = current.score
  scenarios.forEach((sc,i) => {
    const bx = PAGE.mx+22 + i*(barW2+4)
    const scoreH = ((sc.score-base)/(maxScore-base)) * wfH
    const barY = y-wfH-20 + (Math.min(prevScore,sc.score)-base)/(maxScore-base)*wfH
    const bh2 = Math.abs(sc.score-prevScore)/(maxScore-base)*wfH
    const barY2 = sc.delta ? barY : y-wfH-20
    const bh3 = sc.delta ? Math.max(3,bh2) : scoreH

    rect(page, bx, barY2, barW2, bh3, { fill:sc.color })
    // score label on top
    const scoreStr = sc.score.toFixed(0)
    page.drawText(scoreStr, { x:bx+(barW2-bold.widthOfTextAtSize(scoreStr,7))/2, y:barY2+bh3+2, size:7, font:bold, color:C.text })
    // x label below
    sc.label.split('\n').forEach((l,li) => {
      page.drawText(l, { x:bx, y:y-wfH-20-12-li*9, size:6.5, font:li===0?bold:reg, color:C.text })
    })
    if (!sc.delta) prevScore = sc.score
  })
  y -= wfH + 55
  // 3 senaryo kartÄ±
  const sW = (wfW - 20) / 3
  const scenarios3 = [current, target1, target2]
  scenarios3.forEach((sc,i) => {
    const sx = PAGE.mx + i*(sW+10)
    const isActive = i===0
    rect(page, sx, y-105, sW, 108, { fill:isActive?C.navy:C.surface, border:isActive?C.navy:C.border })
    page.drawText(sc.label, { x:sx+8, y:y-12, size:7, font:bold, color:isActive?C.teal:C.muted })
    page.drawText(sc.rating, { x:sx+8, y:y-34, size:28, font:bold, color:ratingColor(sc.rating) })
    page.drawText(sc.score+'/100', { x:sx+8, y:y-52, size:10, font:bold, color:isActive?C.white:C.text })
    if (sc.gain) page.drawText('+'+sc.gain.toFixed(1)+' puan artÄ±ÅŸ gerekli', { x:sx+8, y:y-66, size:8, font:reg, color:C.muted })
    if (sc.actions) {
      sc.actions.forEach((a,ai) => {
        page.drawText('â€¢ '+a, { x:sx+8, y:y-80-ai*12, size:7.5, font:reg, color:C.text })
      })
    }
  })
  return page
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SAYFA 7 (std): AKSÄ°YON PLANI
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function shouldShowConsolidationScorePage(d) {
  const consolidation = d.consolidation || {}
  const companies = Array.isArray(consolidation.companies) ? consolidation.companies : []
  const scopeItems = Array.isArray(consolidation.scope) ? consolidation.scope : []
  const hasNonRootCompany = companies.some((c) => c && c.id && c.id !== consolidation.rootCompanyId)
  const hasEligibleScope = scopeItems.some((s) => s && (s.classification === 'full_consolidation' || s.classification === 'equity_method'))
  return hasNonRootCompany && hasEligibleScope
}

async function buildConsolidatedScoreAnalysis(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Konsolide Skor Analizi')
  const consolidation = d.consolidation || {}
  const standaloneScore = consolidation.standaloneScore ?? d.scores.combined
  const consolidatedScore = consolidation.consolidatedScore ?? d.scores.combined
  const scoreDelta = consolidation.scoreDelta ?? (consolidatedScore - standaloneScore)
  const drivers = Array.isArray(consolidation.drivers) ? consolidation.drivers.slice(0, 3) : []

  sectionTitle(page, bold, reg, PAGE.mx, PAGE.top - 30, 'Konsolide Skor Analizi', 'Standalone ve konsolide skor farki')

  const cardW = 150
  const cardH = 96
  const gap = 14
  const totalW = cardW * 3 + gap * 2
  const startX = (PAGE.w - totalW) / 2
  const y = PAGE.top - 190

  const scoreCards = [
    { label: 'Standalone Skor', value: standaloneScore, color: C.navy },
    { label: 'Konsolide Skor', value: consolidatedScore, color: C.teal },
    { label: 'Fark', value: `${scoreDelta > 0 ? '+' : ''}${scoreDelta} puan`, color: scoreDelta < 0 ? C.red : C.green },
  ]

  scoreCards.forEach((c, i) => {
    const x = startX + i * (cardW + gap)
    rect(page, x, y, cardW, cardH, { fill: C.surface, border: C.border })
    page.drawText(c.label, { x: x + 12, y: y + 74, size: 9, font: bold, color: C.muted })
    page.drawText(String(c.value), { x: x + 12, y: y + 40, size: 24, font: bold, color: c.color })
  })

  const reasonY = y - 44
  page.drawText('Ana nedenler:', { x: PAGE.mx + 8, y: reasonY, size: 11, font: bold, color: C.navy })
  for (let i = 0; i < 3; i += 1) {
    const driver = drivers[i]
    const reason = driver?.reason || '-'
    const impact = typeof driver?.impact === 'number' ? driver.impact : 0
    const impactStr = `${impact > 0 ? '+' : ''}${impact}`
    page.drawText(`${i + 1}. ${reason} (${impactStr})`, {
      x: PAGE.mx + 16,
      y: reasonY - 20 - i * 16,
      size: 10,
      font: reg,
      color: C.text,
    })
  }
  return page
}
async function buildActions(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Aksiyon PlanÄ±')
  let y = PAGE.top - 28

  sectionTitle(page, bold, reg, PAGE.mx, y, 'Aksiyon PlanÄ±', 'Ã–ncelik sÄ±rasÄ±na gÃ¶re â€” kredi notu iyileÅŸtirme yol haritasÄ±')
  y -= 24

  for (const ac of d.actions) {
    const cardH = 88
    if (y - cardH < 60) break
    // kart Ã§erÃ§evesi
    rect(page, PAGE.mx, y-cardH, PAGE.w-PAGE.mx*2, cardH, { fill:C.white, border:C.border })
    // priority badge
    rect(page, PAGE.mx, y-cardH, 28, cardH, { fill:C.navy })
    page.drawText(String(ac.priority).padStart(2,'0'), { x:PAGE.mx+4, y:y-cardH/2-6, size:14, font:bold, color:C.teal })

    // BaÅŸlÄ±k + kategori
    page.drawText(ac.title, { x:PAGE.mx+36, y:y-12, size:11, font:bold, color:C.navy })
    rect(page, PAGE.mx+36, y-28, bold.widthOfTextAtSize(ac.category,7)+10, 13, { fill:C.tealPale, border:C.teal, bw:0.5 })
    page.drawText(ac.category, { x:PAGE.mx+41, y:y-24, size:7, font:bold, color:C.teal })

    // AÃ§Ä±klama
    drawText(page, ac.desc, PAGE.mx+36, y-42, { font:reg, size:8, color:C.text, maxW:340, lineH:12 })

    // Metrikler (saÄŸ taraf)
    const mx2 = PAGE.w - PAGE.mx - 180
    rect(page, mx2, y-cardH+4, 174, cardH-8, { fill:C.surface, border:C.border, bw:0.3 })
    page.drawText('Mevcut: '+ac.current, { x:mx2+8, y:y-16, size:8, font:reg, color:C.text })
    page.drawText('Hedef: '+ac.target, { x:mx2+8, y:y-30, size:8, font:bold, color:C.green })
    page.drawText('Puan katkÄ±sÄ±: +'+ac.gain.toFixed(1), { x:mx2+8, y:y-44, size:9, font:bold, color:C.teal })
    page.drawText('SÃ¼re: '+ac.horizon, { x:mx2+8, y:y-58, size:8, font:reg, color:C.muted })
    page.drawText('Zorluk: '+ac.difficulty, { x:mx2+8, y:y-70, size:8, font:reg, color:C.muted })
    // Banka etkisi
    drawText(page, 'ğŸ¦ '+ac.bankEffect, PAGE.mx+36, y-cardH+14, { font:reg, size:7.5, color:C.muted, maxW:340, lineH:10 })

    y -= cardH + 8
  }
  return page
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SAYFA 8 (std): METODOLOJÄ° & NOT SKALASI
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function buildMethodology(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Metodoloji & Not SkalasÄ±')
  let y = PAGE.top - 28

  y = sectionTitle(page, bold, reg, PAGE.mx, y, 'Finrate Metodolojisi', 'Hibrit Skorlama Modeli v3.0')
  y -= 4

  const methodText = 'Finrate, TÃ¼rkiye\'de bankacÄ±lÄ±k sektÃ¶rÃ¼nÃ¼n kredi karar sÃ¼reÃ§lerini referans alan, TCMB 2024 sektÃ¶r kÄ±yaslama verileri ile zenginleÅŸtirilmiÅŸ hibrit bir finansal derecelendirme modeli kullanmaktadÄ±r. Toplam 100 puan Ã¼zerinden hesaplanan skor, %70 aÄŸÄ±rlÄ±klÄ± finansal skorlama ile %30 aÄŸÄ±rlÄ±klÄ± subjektif deÄŸerlendirmeden oluÅŸur.'
  y = drawText(page, methodText, PAGE.mx, y, { font:reg, size:9, color:C.text, maxW:PAGE.w-PAGE.mx*2, lineH:13 })
  y -= 12

  // 4 kategori kutusu
  const cats = [
    { title:'Likidite (%25)', desc:'Cari oran, hÄ±zlÄ± oran, nakit oranÄ±, NÃ‡S/Aktif, CCC' },
    { title:'KÃ¢rlÄ±lÄ±k (%30)', desc:'FAVÃ–K marjÄ±, net kÃ¢r marjÄ±, ROA, ROE, bÃ¼yÃ¼me' },
    { title:'KaldÄ±raÃ§ (%30)', desc:'BorÃ§/Ã–zkaynak, faiz karÅŸÄ±lama, Net BorÃ§/FAVÃ–K' },
    { title:'Faaliyet (%15)', desc:'DSO, DIO, DPO, aktif devir, sabit varlÄ±k devir' },
  ]
  const cw2 = (PAGE.w-PAGE.mx*2-18)/4
  cats.forEach((c,i) => {
    const cx = PAGE.mx + i*(cw2+6)
    rect(page, cx, y-54, cw2, 56, { fill:C.tealPale, border:C.teal, bw:0.5 })
    page.drawText(c.title, { x:cx+6, y:y-10, size:8, font:bold, color:C.navy })
    drawText(page, c.desc, cx+6, y-24, { font:reg, size:7.5, color:C.text, maxW:cw2-12, lineH:11 })
  })
  y -= 70

  // Subjektif sistem
  y = sectionTitle(page, bold, reg, PAGE.mx, y, 'Subjektif DeÄŸerlendirme (30 Puan)', '')
  y -= 4
  const subRows = [
    ['KKB & Kredi Sicili','10 puan','KKB kategorisi, gecikme, protestolar, icra dosyalarÄ±'],
    ['Banka Ä°liÅŸkileri','10 puan','Limit kullanÄ±m oranÄ±, Ã§ok bankacÄ±lÄ±k, vade yapÄ±sÄ±'],
    ['Kurumsal YapÄ±','5 puan','Åirket yaÅŸÄ±, denetim dÃ¼zeyi, ortaklÄ±k netliÄŸi'],
    ['Uyum & Risk','5 puan','Vergi borcu, SGK borcu, aktif dava sayÄ±sÄ±'],
  ]
  subRows.forEach((row,i) => {
    rect(page, PAGE.mx, y-16, PAGE.w-PAGE.mx*2, 17, { fill:i%2===0?C.surface:C.white, border:C.border, bw:0.3 })
    page.drawText(row[0], { x:PAGE.mx+6, y:y-11, size:8.5, font:bold, color:C.navy })
    page.drawText(row[1], { x:PAGE.mx+180, y:y-11, size:8.5, font:bold, color:C.teal })
    page.drawText(row[2], { x:PAGE.mx+240, y:y-11, size:8, font:reg, color:C.text })
    y -= 17
  })
  y -= 12

  // Rating tablosu
  y = sectionTitle(page, bold, reg, PAGE.mx, y, 'Rating SkalasÄ± & Teminat KoÅŸullarÄ±', 'TCMB 2024 benchmark verileri esas alÄ±nmÄ±ÅŸtÄ±r')
  y -= 4

  const ratingRows = [
    ['AAA','92-100','Ä°stisnai gÃ¼Ã§','Kefalet olmaksÄ±zÄ±n Ã§alÄ±ÅŸÄ±labilir'],
    ['AA','84-91','Ã‡ok gÃ¼Ã§lÃ¼','Maddi teminat olmaksÄ±zÄ±n kefalet karÅŸÄ±lÄ±ÄŸÄ±'],
    ['A','76-83','GÃ¼Ã§lÃ¼','Maddi teminat olmaksÄ±zÄ±n kefalet karÅŸÄ±lÄ±ÄŸÄ±'],
    ['BBB','68-75','Yeterli','Kefalet veya mÃ¼ÅŸteri Ã§eki karÅŸÄ±lÄ±ÄŸÄ±'],
    ['BB','60-67','SpekÃ¼latif baÅŸlangÄ±cÄ±','Kefalet + mÃ¼ÅŸteri Ã§eki veya ipotek'],
    ['B','54-59','SpekÃ¼latif','Ä°potek ve mÃ¼ÅŸteri Ã§eki teminatÄ±'],
    ['CCC','50-53','Ã‡ok spekÃ¼latif','MarjlÄ± ipotek karÅŸÄ±lÄ±ÄŸÄ±'],
    ['CC','42-49','YÃ¼ksek risk','Ã‡alÄ±ÅŸma yapÄ±lmaz'],
    ['C','30-41','Ã‡ok yÃ¼ksek risk','Ã‡alÄ±ÅŸma yapÄ±lmaz'],
    ['D','0-29','TemerrÃ¼t','Tasfiye'],
  ]
  const rCols = ['Rating','Puan','Kredi GÃ¶rÃ¼nÃ¼mÃ¼','Teminat KoÅŸulu']
  const rX = [PAGE.mx, PAGE.mx+48, PAGE.mx+110, PAGE.mx+230]
  rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 16, { fill:C.navy })
  rCols.forEach((c,i) => page.drawText(c, { x:rX[i]+4, y:y-9, size:8, font:bold, color:C.white }))
  y -= 16
  ratingRows.forEach((row,i) => {
    const rc = ratingColor(row[0])
    rect(page, PAGE.mx, y-13, PAGE.w-PAGE.mx*2, 14, { fill:i%2===0?C.surface:C.white, border:C.border, bw:0.3 })
    rect(page, PAGE.mx, y-13, 44, 14, { fill:rc })
    page.drawText(row[0], { x:PAGE.mx+4, y:y-9, size:8.5, font:bold, color:C.white })
    row.slice(1).forEach((cell,ci) => page.drawText(cell, { x:rX[ci+1]+4, y:y-9, size:8, font:ci===0?bold:reg, color:C.text }))
    y -= 14
  })
  y -= 10

  // Yasal uyarÄ±
  rect(page, PAGE.mx, y-42, PAGE.w-PAGE.mx*2, 44, { fill:C.surface, border:C.border })
  page.drawText('YASAL UYARI', { x:PAGE.mx+8, y:y-10, size:8, font:bold, color:C.navy })
  const disclaimer = 'Bu rapor yalnÄ±zca bilgilendirme amaÃ§lÄ±dÄ±r ve resmi bir kredi kararÄ± niteliÄŸi taÅŸÄ±maz. Finrate tarafÄ±ndan TCMB sektÃ¶r verileri kullanÄ±larak Ã¼retilmiÅŸtir. Veriler ilgili ÅŸirket tarafÄ±ndan saÄŸlanmÄ±ÅŸ olup doÄŸrulama Finrate\'in sorumluluÄŸunda deÄŸildir. KVKK kapsamÄ±nda kiÅŸisel veri iÃ§erdiÄŸinden yetkisiz Ã¼Ã§Ã¼ncÃ¼ ÅŸahÄ±slarla paylaÅŸÄ±lmamalÄ±dÄ±r.'
  drawText(page, disclaimer, PAGE.mx+8, y-24, { font:reg, size:7.5, color:C.muted, maxW:PAGE.w-PAGE.mx*2-16, lineH:11 })
  return page
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// KURUMSAL EK SAYFALAR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function buildTOC(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Ä°Ã§indekiler')
  let y = PAGE.top - 40
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Ä°Ã§indekiler', '')
  y -= 30
  const items = [
    [1,'Kapak SayfasÄ±'], [2,'Ä°Ã§indekiler'], [3,'Firma & SektÃ¶r Bilgisi'],
    [4,'YÃ¶netici Ã–zeti'], [5,'Likidite & BorÃ§lanma OranlarÄ±'], [6,'KÃ¢rlÄ±lÄ±k & Faaliyet OranlarÄ±'],
    [7,'Trend Analizi'], [8,'BilanÃ§o Analizi'], [9,'Gelir Tablosu Analizi'],
    [10,'Nakit AkÄ±ÅŸ & Ã‡alÄ±ÅŸma Sermayesi'], [11,'Senaryo Analizi'], [12,'DetaylÄ± Aksiyon PlanÄ±'],
    [13,'Kredi YapÄ±lanma Ã–nerileri'], [14,'Subjektif FaktÃ¶rler DetayÄ±'], [15,'Metodoloji & Not SkalasÄ±'],
  ]
  items.forEach(([num, title]) => {
    const isSection = [4,5,7,8,11,12].includes(num)
    rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 15, { fill:isSection?C.tealPale:C.white, border:C.border, bw:0.3 })
    page.drawText(String(num).padStart(2,'0'), { x:PAGE.mx+6, y:y-9, size:8.5, font:bold, color:C.teal })
    page.drawText(title, { x:PAGE.mx+36, y:y-9, size:8.5, font:isSection?bold:reg, color:C.navy })
    // dots
    const dotsEnd = PAGE.w - PAGE.mx - 28
    const titleEnd = PAGE.mx + 36 + reg.widthOfTextAtSize(title, 8.5)
    let dx = titleEnd + 8
    while (dx < dotsEnd) { page.drawText('.', { x:dx, y:y-9, size:8, font:reg, color:C.border }); dx += 5 }
    page.drawText(String(num), { x:PAGE.w-PAGE.mx-20, y:y-9, size:8.5, font:bold, color:C.muted })
    y -= 15
  })
  return page
}

async function buildFirmSector(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Firma & SektÃ¶r Bilgisi')
  let y = PAGE.top - 28
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Firma Genel Bilgileri', '')
  y -= 20
  const info = [
    ['Firma ÃœnvanÄ±', d.entity.name], ['VKN', d.entity.vkn], ['SektÃ¶r', d.entity.sector],
    ['NACE Kodu', d.entity.nace], ['Åirket TÃ¼rÃ¼', d.entity.type],
    ['KuruluÅŸ YÄ±lÄ±', String(d.entity.founded)], ['Faaliyet SÃ¼resi', String(2024-d.entity.founded)+' yÄ±l'],
    ['Analiz DÃ¶nemi', d.analysis.year+' Â· YÄ±llÄ±k'], ['Rapor NumarasÄ±', d.analysis.reportNo],
  ]
  info.forEach(([k,v],i) => {
    rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 15, { fill:i%2===0?C.surface:C.white, border:C.border, bw:0.3 })
    page.drawText(k, { x:PAGE.mx+6, y:y-9, size:8.5, font:bold, color:C.navy })
    page.drawText(v, { x:PAGE.mx+200, y:y-9, size:8.5, font:reg, color:C.text })
    y -= 15
  })
  y -= 16
  sectionTitle(page, bold, reg, PAGE.mx, y, 'SektÃ¶r Risk Profili', 'Ä°malat Sanayi â€” TCMB 2024')
  y -= 20
  const sectorMetrics = [
    ['SektÃ¶r Ortalama Cari Oran','1.73x'], ['SektÃ¶r Ortalama BorÃ§/Ã–zK','0.93x'],
    ['SektÃ¶r FAVÃ–K MarjÄ±','%9.0'], ['SektÃ¶r Net KÃ¢r MarjÄ±','%2.5'],
    ['SektÃ¶r ROA','%2.3'], ['SektÃ¶r Faiz KarÅŸÄ±lama','3.91x'],
  ]
  sectorMetrics.forEach(([k,v],i) => {
    rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 15, { fill:i%2===0?C.surface:C.white, border:C.border, bw:0.3 })
    page.drawText(k, { x:PAGE.mx+6, y:y-9, size:8.5, font:reg, color:C.text })
    page.drawText(v, { x:PAGE.w-PAGE.mx-60, y:y-9, size:8.5, font:bold, color:C.navy })
    y -= 15
  })
  y -= 16
  // KOBÄ° sÄ±nÄ±flamasÄ±
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Firma Ã–lÃ§eÄŸi DeÄŸerlendirmesi', '')
  y -= 20
  const rev = d.financials.revenue[3]
  const scale = rev > 250e6 ? 'BÃ¼yÃ¼k Ä°ÅŸletme' : rev > 25e6 ? 'Orta Ã–lÃ§ekli KOBÄ°' : 'KÃ¼Ã§Ã¼k Ä°ÅŸletme'
  rect(page, PAGE.mx, y-40, PAGE.w-PAGE.mx*2, 42, { fill:C.tealPale, border:C.teal, bw:0.5 })
  page.drawText(scale, { x:PAGE.mx+10, y:y-12, size:14, font:bold, color:C.navy })
  page.drawText('2024 YÄ±lÄ± Net SatÄ±ÅŸ: '+fmtM(rev)+'  Â·  UFRS/KOBÄ° TFRS tabi', { x:PAGE.mx+10, y:y-30, size:9, font:reg, color:C.muted })
  return page
}

async function buildBalanceSheet(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'BilanÃ§o Analizi')
  let y = PAGE.top - 28
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Ã–zet BilanÃ§o', 'Son 4 yÄ±l karÅŸÄ±laÅŸtÄ±rmalÄ± (â‚º)')
  y -= 20
  const years = d.financials.years
  const cols = ['', ...years.map(String)]
  const rows = [
    ['DÃ¶nen VarlÄ±klar', ...d.financials.currentAssets.map(fmtM)],
    ['Duran VarlÄ±klar', ...d.financials.fixedAssets.map(fmtM)],
    ['TOPLAM AKTÄ°F', ...d.financials.totalAssets.map(fmtM)],
    ['KV YÃ¼kÃ¼mlÃ¼lÃ¼kler', ...d.financials.shortTermLiab.map(fmtM)],
    ['UV YÃ¼kÃ¼mlÃ¼lÃ¼kler', ...d.financials.longTermLiab.map(fmtM)],
    ['Ã–zkaynak', ...d.financials.equity.map(fmtM)],
    ['TOPLAM PASÄ°F', ...d.financials.totalAssets.map(fmtM)],
  ]
  const isBold = [false,false,true,false,false,false,true]
  const colX2 = [PAGE.mx, PAGE.mx+140, PAGE.mx+250, PAGE.mx+350, PAGE.mx+450]
  rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 16, { fill:C.navy })
  cols.forEach((c,i) => page.drawText(c, { x:colX2[i]+4, y:y-9, size:8, font:bold, color:C.white }))
  y -= 16
  rows.forEach((row,ri) => {
    const isB = isBold[ri]
    rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 15, { fill:isB?C.tealPale:ri%2===0?C.surface:C.white, border:C.border, bw:0.3 })
    row.forEach((cell,ci) => page.drawText(cell, { x:colX2[ci]+4, y:y-9, size:8.5, font:isB||ci===0?bold:reg, color:C.navy }))
    y -= 15
  })
  y -= 16
  // Aktif / Pasif yapÄ±sÄ± metni
  sectionTitle(page, bold, reg, PAGE.mx, y, 'BilanÃ§o YapÄ±sÄ± Yorumu', '')
  y -= 16
  const lastCA = d.financials.currentAssets[3], lastTA = d.financials.totalAssets[3]
  const lastEq = d.financials.equity[3]
  const caRatio = lastCA/lastTA, eqRatio = lastEq/lastTA
  const structText = 'Toplam aktifin '+fmtPct(caRatio)+' dÃ¶nen varlÄ±klardan oluÅŸmaktadÄ±r. Ã–zkaynak oranÄ± '+fmtPct(eqRatio)+' ile gÃ¼Ã§lÃ¼ bir Ã¶zkaynak tabanÄ±na iÅŸaret etmektedir. Son 4 yÄ±l iÃ§inde Ã¶zkaynaklar '+fmtM(d.financials.equity[0])+'den '+fmtM(lastEq)+'e yÃ¼kselerek '+(lastEq/d.financials.equity[0]*100-100).toFixed(0)+'% bÃ¼yÃ¼me kaydetmiÅŸtir.'
  drawText(page, structText, PAGE.mx, y, { font:reg, size:9, color:C.text, maxW:PAGE.w-PAGE.mx*2, lineH:13 })
  return page
}

async function buildIncomeStatement(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Gelir Tablosu Analizi')
  let y = PAGE.top - 28
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Ã–zet Gelir Tablosu', 'Son 4 yÄ±l (â‚º)')
  y -= 20
  const years = d.financials.years
  const rows = [
    ['Net SatÄ±ÅŸlar', ...d.financials.revenue.map(fmtM)],
    ['BrÃ¼t KÃ¢r', ...d.financials.grossProfit.map(fmtM)],
    ['FAVÃ–K', ...d.financials.ebitda.map(fmtM)],
    ['Net KÃ¢r', ...d.financials.netProfit.map(fmtM)],
  ]
  const colX3 = [PAGE.mx, PAGE.mx+140, PAGE.mx+250, PAGE.mx+350, PAGE.mx+450]
  rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 16, { fill:C.navy })
  ;['', ...years.map(String)].forEach((c,i) => page.drawText(c, { x:colX3[i]+4, y:y-9, size:8, font:bold, color:C.white }))
  y -= 16
  rows.forEach((row,ri) => {
    rect(page, PAGE.mx, y-14, PAGE.w-PAGE.mx*2, 15, { fill:ri%2===0?C.surface:C.white, border:C.border, bw:0.3 })
    row.forEach((cell,ci) => page.drawText(cell, { x:colX3[ci]+4, y:y-9, size:8.5, font:ci===0?bold:reg, color:C.navy }))
    y -= 15
  })
  y -= 16
  // Marj trendi
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Marj Trendi', 'BrÃ¼t / FAVÃ–K / Net KÃ¢r MarjÄ±')
  y -= 18
  const margins = ['grossProfit','ebitda','netProfit'].map(k => d.financials[k].map((v,i)=>v/d.financials.revenue[i]))
  const mLabels = ['BrÃ¼t KÃ¢r MarjÄ±','FAVÃ–K MarjÄ±','Net KÃ¢r MarjÄ±']
  const mColors = [C.teal, C.navy, C.green]
  const mW = PAGE.w - PAGE.mx*2
  const mH = 70
  rect(page, PAGE.mx, y-mH, mW, mH, { fill:C.surface, border:C.border })
  margins.forEach((series, si) => {
    const maxM = 0.35
    series.forEach((v,i) => {
      if (i===0) return
      const x0 = PAGE.mx + (i-1)/(years.length-1)*mW
      const x1 = PAGE.mx + i/(years.length-1)*mW
      const y0 = y-mH + series[i-1]/maxM*mH
      const y1 = y-mH + v/maxM*mH
      line(page, x0, y0, x1, y1, { color:mColors[si], thickness:1.5 })
      // dot
      rect(page, x1-2, y1-2, 4, 4, { fill:mColors[si] })
      page.drawText(fmtPct(v), { x:x1+2, y:y1+2, size:6, font:bold, color:mColors[si] })
    })
    // legend
    rect(page, PAGE.mx + si*70, y+4, 10, 4, { fill:mColors[si] })
    page.drawText(mLabels[si], { x:PAGE.mx+si*70+13, y:y+2, size:6.5, font:reg, color:C.text })
  })
  years.forEach((yr,i) => page.drawText(String(yr), { x:PAGE.mx+i/(years.length-1)*mW-10, y:y-mH-10, size:7, font:reg, color:C.muted }))
  return page
}

async function buildCashFlow(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Nakit AkÄ±ÅŸ & Ã‡alÄ±ÅŸma Sermayesi')
  let y = PAGE.top - 28
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Nakit DÃ¶nÃ¼ÅŸÃ¼m DÃ¶ngÃ¼sÃ¼', 'DSO + DIO - DPO')
  y -= 20
  const dso = d.ratios.receivablesTurnoverDays
  const dio = d.ratios.inventoryTurnoverDays
  const dpo = d.ratios.payablesTurnoverDays
  const ccc = dso + dio - dpo

  const nMetrics = [
    { label:'DSO (Alacak Tahsil SÃ¼resi)', val:fmtDay(dso), bm:fmtDay(d.ratios.bmReceivablesDays), st:statusOf(dso,60,90,true) },
    { label:'DIO (Stok Devir SÃ¼resi)', val:fmtDay(dio), bm:fmtDay(d.ratios.bmInventoryDays), st:statusOf(dio,60,90,true) },
    { label:'DPO (BorÃ§ Ã–deme SÃ¼resi)', val:fmtDay(dpo), bm:'â€”', st:statusOf(dpo,45,20) },
    { label:'CCC (Nakit DÃ¶ngÃ¼sÃ¼ = DSO+DIO-DPO)', val:fmtDay(ccc), bm:'â€”', st:statusOf(ccc,50,100,true) },
  ]
  nMetrics.forEach((m,i) => {
    rect(page, PAGE.mx, y-22, PAGE.w-PAGE.mx*2, 24, { fill:i%2===0?C.surface:C.white, border:C.border, bw:0.3 })
    page.drawText(m.label, { x:PAGE.mx+6, y:y-12, size:9, font:reg, color:C.text })
    page.drawText(m.val, { x:PAGE.mx+270, y:y-12, size:10, font:bold, color:C.navy })
    page.drawText('SektÃ¶r: '+m.bm, { x:PAGE.mx+340, y:y-12, size:8, font:reg, color:C.muted })
    const stC2 = m.st==='good'?C.green:m.st==='warn'?C.amber:C.red
    const stL2 = m.st==='good'?'Ä°YÄ°':m.st==='warn'?'UYARI':'ZAYIF'
    rect(page, PAGE.mx+440, y-18, 55, 13, { fill:m.st==='good'?rgb(240/255,253/255,244/255):m.st==='warn'?rgb(254/255,252/255,232/255):rgb(254/255,242/255,242/255), border:stC2, bw:0.5 })
    page.drawText(stL2, { x:PAGE.mx+440+(55-bold.widthOfTextAtSize(stL2,7.5))/2, y:y-12, size:7.5, font:bold, color:stC2 })
    y -= 24
  })
  y -= 16
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Ã‡alÄ±ÅŸma Sermayesi Analizi', '')
  y -= 18
  const nwc = d.financials.currentAssets[3] - d.financials.shortTermLiab[3]
  const nwcRatio = nwc / d.financials.revenue[3]
  const nwcText = 'Net Ã§alÄ±ÅŸma sermayesi '+fmtM(nwc)+' (SatÄ±ÅŸlarÄ±n '+fmtPct(nwcRatio)+') olup kÄ±sa vadeli yÃ¼kÃ¼mlÃ¼lÃ¼kler karÅŸÄ±sÄ±nda yeterli tampon oluÅŸturmaktadÄ±r. Nakit dÃ¶ngÃ¼sÃ¼ '+Math.round(ccc)+' gÃ¼n seviyesindedir. DSO\'nun sektÃ¶r ortalamasÄ±nÄ±n (+'+Math.round(dso-d.ratios.bmReceivablesDays)+' gÃ¼n) Ã¼zerinde olmasÄ± en kritik iyileÅŸtirme alanÄ±dÄ±r.'
  drawText(page, nwcText, PAGE.mx, y, { font:reg, size:9, color:C.text, maxW:PAGE.w-PAGE.mx*2, lineH:13 })
  return page
}

async function buildCreditAdvice(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Kredi YapÄ±lanma Ã–nerileri')
  let y = PAGE.top - 28
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Kredi TÃ¼rÃ¼ Ã–nerileri', d.scores.rating+' ratinge sahip firmalar iÃ§in')
  y -= 20
  d.creditAdvice.recommendedTypes.forEach((t,i) => {
    rect(page, PAGE.mx, y-18, PAGE.w-PAGE.mx*2, 20, { fill:i%2===0?C.tealPale:C.white, border:C.teal, bw:0.3 })
    page.drawText('âœ“  '+t, { x:PAGE.mx+8, y:y-11, size:9.5, font:bold, color:C.navy })
    y -= 20
  })
  y -= 16
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Devlet Destekli Finansman FÄ±rsatlarÄ±', '')
  y -= 20
  const destek = [
    { name:'KOSGEB', available:d.creditAdvice.kosgeb, desc:'Ä°ÅŸletme geliÅŸtirme desteÄŸi ve dÃ¼ÅŸÃ¼k faizli kredi imkÃ¢nlarÄ±' },
    { name:'KGF', available:d.creditAdvice.kgf, desc:'Kredi Garanti Fonu kefaleti ile banka kredi limitinin geniÅŸletilmesi' },
    { name:'Eximbank', available:d.creditAdvice.eximbank, desc:'Ä°hracat kredisi ve alÄ±cÄ± kredisi imkÃ¢nlarÄ± (ihracat varsa)' },
  ]
  destek.forEach((item,i) => {
    rect(page, PAGE.mx, y-30, PAGE.w-PAGE.mx*2, 32, { fill:item.available?rgb(240/255,253/255,244/255):C.surface, border:item.available?C.green:C.border, bw:0.5 })
    page.drawText(item.name, { x:PAGE.mx+8, y:y-10, size:10, font:bold, color:item.available?C.green:C.muted })
    page.drawText(item.available?'UYGUN':'UYGUN DEÄÄ°L', { x:PAGE.mx+80, y:y-10, size:8, font:bold, color:item.available?C.green:C.red })
    page.drawText(item.desc, { x:PAGE.mx+8, y:y-24, size:8.5, font:reg, color:C.text })
    y -= 32
  })
  y -= 16
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Teminat Optimizasyon Stratejisi', '')
  y -= 18
  drawText(page, d.creditAdvice.teminatOnerisi, PAGE.mx, y, { font:reg, size:9.5, color:C.text, maxW:PAGE.w-PAGE.mx*2, lineH:14 })
  return page
}

async function buildSubjectiveDetail(doc, fonts, d, pageNum) {
  const { reg, bold } = fonts
  const page = newPage(doc, fonts, d.entity.name, pageNum, 'Subjektif FaktÃ¶rler DetayÄ±')
  let y = PAGE.top - 28
  sectionTitle(page, bold, reg, PAGE.mx, y, 'Subjektif DeÄŸerlendirme DetayÄ±', 'Toplam: '+d.subjective.total+'/30 puan')
  y -= 24

  const subSections = [
    { title:'KKB & Kredi Sicili', score:d.subjective.kkb, max:10,
      items:['KKB kategori deÄŸerlendirmesi: Ä°yi (7/7)','Aktif gecikme gÃ¼nÃ¼: Yok (+3/3)','Ã‡ek protestosu: Yok','Ä°cra dosyasÄ±: Yok'],
      insight:'KKB sicili temiz ve gecikme olmaksÄ±zÄ±n yÃ¶netilmektedir. Bu faktÃ¶r kredi kararÄ±nda pozitif sinyal olarak deÄŸerlendirilmektedir.' },
    { title:'Banka Ä°liÅŸkileri', score:d.subjective.bank, max:10,
      items:['Limit kullanÄ±m oranÄ±: %62 â†’ 3/5','Ã‡ok bankacÄ±lÄ±k: Evet (+2/2)','Ortalama vade: 18 ay â†’ 1/3'],
      insight:'Limit kullanÄ±m oranÄ±nÄ±n %62 olmasÄ± makul. Ortalama vadenin uzatÄ±lmasÄ± (>24 ay) banka iliÅŸkileri skorunu iyileÅŸtirebilir.' },
    { title:'Kurumsal YapÄ±', score:d.subjective.corp, max:5,
      items:['Åirket yaÅŸÄ±: 15 yÄ±l â†’ 2/2','Denetim dÃ¼zeyi: YMM â†’ 1/3','OrtaklÄ±k yapÄ±sÄ±: Belirli'],
      insight:'BaÄŸÄ±msÄ±z denetim (tam tasdik) geÃ§iÅŸi kurumsal yapÄ± skorunu +2 puan artÄ±rÄ±r ve bankacÄ±lÄ±k deÄŸerlendirmesinde gÃ¼Ã§lÃ¼ sinyal oluÅŸturur.' },
    { title:'Uyum & Risk', score:d.subjective.compliance, max:5,
      items:['Vergi borcu: Yok (+2)','SGK borcu: Yok (+1)','Aktif dava: 1 adet (-1)'],
      insight:'Mevcut dava sayÄ±sÄ±nÄ±n azaltÄ±lmasÄ± veya sonuÃ§landÄ±rÄ±lmasÄ± uyum skorunu tam puana taÅŸÄ±r.' },
  ]

  subSections.forEach(sec => {
    rect(page, PAGE.mx, y-110, PAGE.w-PAGE.mx*2, 112, { fill:C.surface, border:C.border })
    // Sol: baÅŸlÄ±k + puan
    page.drawText(sec.title, { x:PAGE.mx+10, y:y-12, size:11, font:bold, color:C.navy })
    const pStr = sec.score+'/'+sec.max+' puan'
    page.drawText(pStr, { x:PAGE.mx+10, y:y-26, size:14, font:bold, color:C.teal })
    // Puan barÄ±
    const bw3 = 140
    rect(page, PAGE.mx+10, y-42, bw3, 10, { fill:C.lightGray, border:C.border })
    rect(page, PAGE.mx+10, y-42, bw3*(sec.score/sec.max), 10, { fill:C.teal })
    // Kalemler
    sec.items.forEach((item,i) => page.drawText('â€¢ '+item, { x:PAGE.mx+10, y:y-60-i*14, size:8, font:reg, color:C.text }))
    // SaÄŸ: insight
    rect(page, PAGE.mx+200, y-108, PAGE.w-PAGE.mx*2-208, 106, { fill:C.white, border:C.border, bw:0.3 })
    page.drawText('Ä°yileÅŸtirme Notu', { x:PAGE.mx+208, y:y-12, size:8, font:bold, color:C.amber })
    drawText(page, sec.insight, PAGE.mx+208, y-28, { font:reg, size:8.5, color:C.text, maxW:PAGE.w-PAGE.mx*2-220, lineH:13 })
    y -= 120
  })
  return page
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ANA FONKSÄ°YON
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function buildReport(type) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fonts = await loadFonts(doc)
  const d = DATA
  const isCorporate = type === 'corporate'

  if (isCorporate) {
    await buildCover(doc, fonts, d, true)          // 1
    await buildTOC(doc, fonts, d, 2)               // 2
    await buildFirmSector(doc, fonts, d, 3)        // 3
    await buildSummary(doc, fonts, d, 4)           // 4
    await buildRatiosPage(doc, fonts, d, 5, 'liq') // 5
    await buildRatiosPage(doc, fonts, d, 6, 'prof')// 6
    await buildTrends(doc, fonts, d, 7)            // 7
    await buildBalanceSheet(doc, fonts, d, 8)      // 8
    await buildIncomeStatement(doc, fonts, d, 9)   // 9
    await buildCashFlow(doc, fonts, d, 10)         // 10
    await buildScenario(doc, fonts, d, 11)         // 11
    let nextPage = 12
    if (shouldShowConsolidationScorePage(d)) {
      await buildConsolidatedScoreAnalysis(doc, fonts, d, nextPage)
      nextPage += 1
    }
    await buildActions(doc, fonts, d, nextPage)
    nextPage += 1
    await buildCreditAdvice(doc, fonts, d, nextPage)
    nextPage += 1
    await buildSubjectiveDetail(doc, fonts, d, nextPage)
    nextPage += 1
    await buildMethodology(doc, fonts, d, nextPage)
  } else {
    await buildCover(doc, fonts, d, false)          // 1
    await buildSummary(doc, fonts, d, 2)            // 2
    await buildRatiosPage(doc, fonts, d, 3, 'liq')  // 3
    await buildRatiosPage(doc, fonts, d, 4, 'prof') // 4
    await buildTrends(doc, fonts, d, 5)             // 5
    await buildScenario(doc, fonts, d, 6)           // 6
    await buildActions(doc, fonts, d, 7)            // 7
    await buildMethodology(doc, fonts, d, 8)        // 8
  }

  const bytes = await doc.save()
  const outName = isCorporate ? 'finrate_kurumsal_rapor.pdf' : 'finrate_standart_rapor.pdf'
  const outPath = path.join(__dirname, 'output', outName)
  fs.writeFileSync(outPath, bytes)
  console.log('âœ… '+outName+' oluÅŸturuldu â†’ '+outPath+' ('+Math.round(bytes.length/1024)+' KB)')
}

const type = process.argv[2] || 'standard'
buildReport(type).catch(e => { console.error('âŒ', e.message); process.exit(1) })

