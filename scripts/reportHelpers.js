/**
 * Finrate Rapor Yardımcıları — pdf-lib ile
 * Renk paleti: Navy #0B3C5D, Turquaz #2EC4B6
 */
const { rgb } = require('../app/node_modules/pdf-lib')

const C = {
  navy:    rgb(11/255,  60/255,  93/255),
  teal:    rgb(46/255, 196/255, 182/255),
  tealPale:rgb(230/255,249/255,247/255),
  white:   rgb(1,1,1),
  text:    rgb(15/255,  23/255,  42/255),
  muted:   rgb(100/255,116/255,139/255),
  border:  rgb(226/255,232/255,240/255),
  surface: rgb(248/255,250/255,252/255),
  green:   rgb(22/255, 163/255,  74/255),
  amber:   rgb(217/255,119/255,   6/255),
  red:     rgb(220/255,  38/255,  38/255),
  lightGray: rgb(241/255,245/255,249/255),
}

const PAGE = { w: 595.28, h: 841.89, mx: 44, top: 780, bottom: 44 }

const RATING_BANDS = [
  { min:92, label:'AAA' }, { min:84, label:'AA'  }, { min:76, label:'A'   },
  { min:68, label:'BBB' }, { min:60, label:'BB'  }, { min:54, label:'B'   },
  { min:50, label:'CCC' }, { min:42, label:'CC'  }, { min:30, label:'C'   },
  { min:0,  label:'D'   },
]

const RATING_COLOR = {
  AAA: rgb(22/255,163/255,74/255),  AA: rgb(22/255,163/255,74/255),
  A:   rgb(34/255,197/255,94/255),  BBB: rgb(132/255,204/255,22/255),
  BB:  rgb(234/255,179/255,8/255),  B: rgb(249/255,115/255,22/255),
  CCC: rgb(234/255,88/255,12/255),  CC: rgb(239/255,68/255,68/255),
  C:   rgb(220/255,38/255,38/255),  D: rgb(153/255,27/255,27/255),
}

const TEMINAT = {
  AAA: 'Kefalet olmaksızın çalışılabilir',
  AA:  'Maddi teminat olmaksızın kefalet karşılığı',
  A:   'Maddi teminat olmaksızın kefalet karşılığı',
  BBB: 'Kefalet veya müşteri çeki karşılığı',
  BB:  'Kefalet ile müşteri çeki veya ipotek teminatı',
  B:   'İpotek ve müşteri çeki teminatı karşılığı',
  CCC: 'Marjlı ipotek karşılığı',
  CC:  'Çalışma yapılmaz', C: 'Çalışma yapılmaz', D: 'Tasfiye',
}

function ratingColor(r) { return RATING_COLOR[r] || C.muted }
function scoreToRating(s) {
  for (const b of RATING_BANDS) if (s >= b.min) return b.label
  return 'D'
}

function wrap(text, font, size, maxW) {
  const words = String(text).split(/\s+/)
  const lines = []
  let cur = ''
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w
    try {
      if (font.widthOfTextAtSize(cand, size) <= maxW) { cur = cand }
      else { if (cur) lines.push(cur); cur = w }
    } catch { cur = cand }
  }
  if (cur) lines.push(cur)
  return lines
}

function drawText(page, text, x, y, { font, size=10, color=C.text, maxW=null, lineH=null }={}) {
  if (text == null) return y
  const t = String(text)
  if (maxW) {
    const lines = wrap(t, font, size, maxW)
    let cy = y
    for (const line of lines) {
      page.drawText(line, { x, y: cy, size, font, color })
      cy -= (lineH || size + 4)
    }
    return cy
  }
  page.drawText(t, { x, y, size, font, color })
  return y - (lineH || size + 4)
}

function rect(page, x, y, w, h, { fill=null, border=null, bw=0.5 }={}) {
  const opts = { x, y, width: w, height: h }
  if (fill) opts.color = fill
  if (border) { opts.borderColor = border; opts.borderWidth = bw }
  page.drawRectangle(opts)
}

function line(page, x1, y1, x2, y2, { color=C.border, thickness=0.5 }={}) {
  page.drawLine({ start:{x:x1,y:y1}, end:{x:x2,y:y2}, color, thickness })
}

// Progress bar: firma (teal) vs benchmark (navy dashed overlay)
function progressBar(page, x, y, w, h, firmPct, bmPct, status) {
  const bgColor = C.lightGray
  const fillColor = status === 'good' ? C.green : status === 'warn' ? C.amber : C.red
  rect(page, x, y, w, h, { fill: bgColor, border: C.border })
  const fw = Math.min(w, Math.max(0, w * Math.min(firmPct, 1)))
  if (fw > 0) rect(page, x, y, fw, h, { fill: fillColor })
  // benchmark line
  const bx = x + Math.min(w, Math.max(0, w * Math.min(bmPct, 1)))
  line(page, bx, y - 2, bx, y + h + 2, { color: C.navy, thickness: 1.5 })
}

// Horizontal bar chart (categories)
function categoryBar(page, font, bold, x, y, label, val, bmVal, barW=200, rowH=22) {
  drawText(page, label, x, y + 6, { font, size:9, color:C.text })
  const bx = x + 95
  // bg
  rect(page, bx, y, barW, 12, { fill: C.lightGray, border: C.border })
  // firm bar
  const fw = Math.min(barW, (val/100) * barW)
  rect(page, bx, y, fw, 12, { fill: C.teal })
  // bm marker
  const bmx = bx + Math.min(barW, (bmVal/100) * barW)
  line(page, bmx, y-2, bmx, y+14, { color: C.navy, thickness: 1.5 })
  // values
  drawText(page, val.toFixed(0), bx + barW + 6, y+4, { font:bold, size:9, color:C.teal })
  drawText(page, '(Sektör: ' + bmVal.toFixed(0) + ')', bx + barW + 28, y+4, { font, size:8, color:C.muted })
}

// Gauge — SVG-based isn't possible in pdf-lib; we draw arcs manually with line segments
function drawGauge(page, cx, cy, r, score, bold, regular) {
  const total = 180
  const segments = 60
  const startAngle = Math.PI // 9 o'clock
  const endAngle = 0 // 3 o'clock (half circle)
  // draw background arc (gray)
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI - (i / segments) * Math.PI
    const x = cx + r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    if (i > 0) {
      const a0 = Math.PI - ((i-1)/segments)*Math.PI
      const x0 = cx + r*Math.cos(a0); const y0 = cy + r*Math.sin(a0)
      page.drawLine({ start:{x:x0,y:y0}, end:{x,y}, color:C.lightGray, thickness:8 })
    }
  }
  // draw score arc (colored)
  const fillSeg = Math.round((score / 100) * segments)
  const sColor = score >= 68 ? C.green : score >= 54 ? C.amber : C.red
  for (let i = 1; i <= fillSeg; i++) {
    const a0 = Math.PI - ((i-1)/segments)*Math.PI
    const a1 = Math.PI - (i/segments)*Math.PI
    const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0)
    const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1)
    page.drawLine({ start:{x:x0,y:y0}, end:{x:x1,y:y1}, color:sColor, thickness:8 })
  }
  // center score
  const scoreStr = score.toFixed(0)
  const sw = bold.widthOfTextAtSize(scoreStr, 28)
  page.drawText(scoreStr, { x: cx - sw/2, y: cy - 10, size:28, font:bold, color:C.text })
  page.drawText('/100', { x: cx - regular.widthOfTextAtSize('/100',9)/2, y: cy - 22, size:9, font:regular, color:C.muted })
}

// Rating scale strip
function drawRatingStrip(page, font, bold, x, y, currentRating, stripW=507) {
  const ratings = ['AAA','AA','A','BBB','BB','B','CCC','CC','C','D']
  const cw = stripW / ratings.length
  ratings.forEach((r, i) => {
    const rx = x + i * cw
    const isActive = r === currentRating
    rect(page, rx, y, cw - 1, 18, { fill: isActive ? RATING_COLOR[r] : C.lightGray, border: C.border, bw:0.3 })
    const tw = (isActive ? bold : font).widthOfTextAtSize(r, isActive?8:7)
    page.drawText(r, { x: rx+(cw-1-tw)/2, y: y+5, size: isActive?8:7, font: isActive?bold:font, color: isActive?C.white:C.muted })
    if (isActive) {
      // triangle marker above
      page.drawText('▼', { x: rx+(cw-1-8)/2, y: y+20, size:8, font:bold, color: RATING_COLOR[r] })
    }
  })
}

// KPI card
function kpiCard(page, font, bold, x, y, w, h, label, value, sub='') {
  rect(page, x, y, w, h, { fill: C.white, border: C.border })
  drawText(page, label, x+8, y+h-10, { font, size:7, color:C.muted })
  drawText(page, value, x+8, y+h-24, { font:bold, size:13, color:C.navy })
  if (sub) drawText(page, sub, x+8, y+6, { font, size:7, color:C.muted })
}

// Page header
function addHeader(page, bold, regular, entityName, pageNum, pageTitle) {
  rect(page, 0, PAGE.top, PAGE.w, PAGE.h - PAGE.top, { fill: C.navy })
  // Logo block
  rect(page, PAGE.mx, 796, 24, 24, { fill: C.teal })
  bold.widthOfTextAtSize && page.drawText('F', { x: PAGE.mx+8, y:803, size:12, font:bold, color:C.white })
  page.drawText('FINRATE', { x: PAGE.mx+30, y:806, size:14, font:bold, color:C.white })
  page.drawText(pageTitle, { x: PAGE.mx+30, y:796, size:8, font:regular, color:rgb(148/255,163/255,184/255) })
  // right side
  const right = PAGE.w - PAGE.mx
  page.drawText(entityName, { x: right - bold.widthOfTextAtSize(entityName,9), y:806, size:9, font:bold, color:C.white })
  page.drawText('Sayfa ' + pageNum, { x: right - regular.widthOfTextAtSize('Sayfa '+pageNum,8), y:796, size:8, font:regular, color:rgb(148/255,163/255,184/255) })
}

// Page footer
function addFooter(page, regular) {
  line(page, PAGE.mx, 30, PAGE.w-PAGE.mx, 30, { color:C.border })
  page.drawText('Bu rapor gizlidir. Yalnızca ilgili taraflarca kullanılabilir. Finrate tarafından üretilmiştir.', { x:PAGE.mx, y:16, size:7, font:regular, color:C.muted })
  const site = 'finrate.com'
  page.drawText(site, { x: PAGE.w-PAGE.mx-regular.widthOfTextAtSize(site,7), y:16, size:7, font:regular, color:C.muted })
}

// Section title inside page
function sectionTitle(page, bold, regular, x, y, title, subtitle='') {
  line(page, x, y+2, x+4, y+2, { color: C.teal, thickness:3 })
  page.drawText(title, { x: x+10, y, size:13, font:bold, color:C.navy })
  if (subtitle) page.drawText(subtitle, { x: x+10, y: y-14, size:8, font:regular, color:C.muted })
  return subtitle ? y - 26 : y - 18
}

function fmtNum(v, digits=1) {
  if (v==null || isNaN(v)) return '—'
  return new Intl.NumberFormat('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:digits}).format(v)
}
function fmtPct(v) { return v==null ? '—' : '%' + (v*100).toFixed(1) }
function fmtX(v,d=2)   { return v==null ? '—' : v.toFixed(d)+'x' }
function fmtDay(v) { return v==null ? '—' : Math.round(v)+' gün' }
function fmtM(v) { // Milyonla göster
  if (v==null || isNaN(v)) return '—'
  if (Math.abs(v)>=1e9) return (v/1e9).toFixed(1)+'B ₺'
  if (Math.abs(v)>=1e6) return (v/1e6).toFixed(1)+'M ₺'
  if (Math.abs(v)>=1e3) return (v/1e3).toFixed(0)+'K ₺'
  return v.toFixed(0)+' ₺'
}

function statusOf(val, goodThr, warnThr, lowerIsBetter=false) {
  if (val==null) return 'warn'
  if (lowerIsBetter) return val<=goodThr?'good':val<=warnThr?'warn':'bad'
  return val>=goodThr?'good':val>=warnThr?'warn':'bad'
}

module.exports = { C, PAGE, RATING_BANDS, TEMINAT, ratingColor, scoreToRating,
  wrap, drawText, rect, line, progressBar, categoryBar, drawGauge,
  drawRatingStrip, kpiCard, addHeader, addFooter, sectionTitle,
  fmtNum, fmtPct, fmtX, fmtDay, fmtM, statusOf }
