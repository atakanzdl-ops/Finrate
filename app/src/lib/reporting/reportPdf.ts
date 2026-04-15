import { readFile } from 'fs/promises'
import path from 'path'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { OptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'

type Difficulty = 'medium' | 'hard' | 'ORTA' | 'ZOR' | 'KOLAY'

interface PdfSuggestion {
  key: string
  label: string
  category: string
  currentValue: number | null
  targetValue: number
  unit: 'pct' | 'x' | 'day' | 'ratio'
  marginalScoreGain: number
  difficulty: Difficulty
  timeHorizon: string
}

interface PdfActionPlan {
  title: string
  projectedScore: number
  projectedRating: string
  achievable: boolean
  suggestions: PdfSuggestion[]
}

interface PdfAnalysis {
  id: string
  year: number
  period: string
  finalScore: number
  finalRating: string
  liquidityScore: number
  profitabilityScore: number
  leverageScore: number
  activityScore: number
  ratios: Record<string, number | null>
  optimizerSnapshot?: OptimizerSnapshot | null
  entity?: { id: string; name: string; sector?: string | null } | null
}

interface PdfPayload {
  analysis: PdfAnalysis
  combinedScore: number
  combinedRating: string
  subjectiveTotal: number
}

const COLORS = {
  primary: rgb(11 / 255, 60 / 255, 93 / 255),
  secondary: rgb(31 / 255, 164 / 255, 169 / 255),
  text: rgb(26 / 255, 26 / 255, 26 / 255),
  muted: rgb(107 / 255, 114 / 255, 128 / 255),
  border: rgb(229 / 255, 233 / 255, 240 / 255),
  surface: rgb(247 / 255, 249 / 255, 251 / 255),
  green: rgb(22 / 255, 163 / 255, 74 / 255),
  amber: rgb(217 / 255, 119 / 255, 6 / 255),
  red: rgb(220 / 255, 38 / 255, 38 / 255),
}

const PERIOD_LABEL: Record<string, string> = {
  ANNUAL: 'Yıllık',
  Q1: '1. Geçici',
  Q2: '2. Geçici',
  Q3: '3. Geçici',
  Q4: '4. Geçici',
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatMetric(value: number | null, unit: PdfSuggestion['unit']) {
  if (value == null || Number.isNaN(value)) return '—'
  if (unit === 'pct') return `%${formatNumber(value * 100, 1)}`
  if (unit === 'x') return `${formatNumber(value, 2)}x`
  if (unit === 'day') return `${formatNumber(Math.round(value), 0)} gün`
  return formatNumber(value, 2)
}

function getRatingColor(rating: string) {
  if (['AAA', 'AA', 'A'].includes(rating)) return COLORS.green
  if (rating === 'BBB') return COLORS.amber
  return COLORS.red
}

function getDifficultyLabel(difficulty: Difficulty) {
  return difficulty === 'hard' ? 'Zorluk: Yüksek' : 'Zorluk: Orta'
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }

    if (current) lines.push(current)
    current = word
  }

  if (current) lines.push(current)
  return lines
}

function drawTextBlock(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, size: number, color = COLORS.text, lineGap = 4) {
  const lines = wrapText(text, font, size, width)
  let cursor = y
  for (const line of lines) {
    page.drawText(line, { x, y: cursor, size, font, color })
    cursor -= size + lineGap
  }
  return cursor
}

function drawCard(page: PDFPage, x: number, y: number, width: number, height: number) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(1, 1, 1),
    borderColor: COLORS.border,
    borderWidth: 1,
  })
}

function drawMetricCard(page: PDFPage, title: string, value: string, subtitle: string, x: number, y: number, width: number, regular: PDFFont, bold: PDFFont) {
  drawCard(page, x, y, width, 78)
  page.drawText(title, { x: x + 16, y: y + 56, size: 10, font: bold, color: COLORS.muted })
  page.drawText(value, { x: x + 16, y: y + 31, size: 22, font: bold, color: COLORS.text })
  page.drawText(subtitle, { x: x + 16, y: y + 14, size: 9, font: regular, color: COLORS.muted })
}

function drawTableHeader(page: PDFPage, columns: string[], x: number, y: number, widths: number[], font: PDFFont) {
  let left = x
  columns.forEach((column, index) => {
    page.drawText(column, { x: left, y, size: 9, font, color: COLORS.muted })
    left += widths[index]
  })
}

function getLatestTarget(snapshot?: OptimizerSnapshot | null) {
  return snapshot?.targets?.[0] ?? null
}

export async function buildReportPdf({ analysis, combinedScore, combinedRating, subjectiveTotal }: PdfPayload) {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)

  const regularFontBytes = await readFile(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Regular.ttf'))
  const boldFontBytes = await readFile(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Bold.ttf'))
  const regular = await pdfDoc.embedFont(regularFontBytes)
  const bold = await pdfDoc.embedFont(boldFontBytes)

  const entityName = analysis.entity?.name ?? 'Sirket'
  const fileName = `${slugify(entityName)}-${analysis.year}-finansal-rapor.pdf`
  const periodLabel = PERIOD_LABEL[analysis.period] ?? analysis.period
  const createdAt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date())
  const latestTarget = getLatestTarget(analysis.optimizerSnapshot)

  const page1 = pdfDoc.addPage([595.28, 841.89])
  page1.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(1, 1, 1) })
  page1.drawRectangle({ x: 0, y: 782, width: 595.28, height: 59.89, color: COLORS.primary })
  page1.drawText('FINRATE Finansal Rapor', { x: 40, y: 807, size: 20, font: bold, color: rgb(1, 1, 1) })
  page1.drawText(`${entityName} · ${analysis.year} ${periodLabel}`, { x: 40, y: 789, size: 10, font: regular, color: rgb(1, 1, 1) })
  page1.drawText(createdAt, { x: 470, y: 789, size: 10, font: regular, color: rgb(1, 1, 1) })

  page1.drawText('Yonetici Ozeti', { x: 40, y: 744, size: 18, font: bold, color: COLORS.text })
  const intro = latestTarget
    ? `Bu rapor, ${entityName} icin olusturulan finansal analiz sonucunu ve hedef ratinge ulasmak icin onerilen aksiyon setlerini sunar. Bu aksiyon seti yaklasik +${formatNumber(latestTarget.totalGain, 1)} puan etki ile hedef ratinge ulasmak icin onerilmistir.`
    : `${entityName} icin olusturulan bu rapor mevcut finansal tablo, rating sonucu ve temel guclu/zayif alanlari tek dosyada toplar.`
  drawTextBlock(page1, intro, 40, 722, 515, regular, 11, COLORS.muted, 5)

  const metricTop = 622
  drawMetricCard(page1, 'Skor', formatNumber(combinedScore, 0), `Subjektif etki: ${formatNumber(subjectiveTotal, 0)} puan`, 40, metricTop, 120, regular, bold)
  drawMetricCard(page1, 'Rating', combinedRating, `Baz rating: ${analysis.finalRating}`, 176, metricTop, 120, regular, bold)
  drawMetricCard(page1, 'Likidite', formatNumber(analysis.liquidityScore, 0), 'Kategori skoru', 312, metricTop, 120, regular, bold)
  drawMetricCard(page1, 'Karlilik', formatNumber(analysis.profitabilityScore, 0), 'Kategori skoru', 448, metricTop, 107, regular, bold)

  page1.drawText('Kategori Gorunumu', { x: 40, y: 584, size: 12, font: bold, color: COLORS.text })
  const categories: Array<[string, number]> = [
    ['Likidite', analysis.liquidityScore],
    ['Karlılık', analysis.profitabilityScore],
    ['Kaldıraç', analysis.leverageScore],
    ['Faaliyet', analysis.activityScore],
  ]
  let barY = 556
  categories.forEach(([label, raw]) => {
    const value = Number(raw ?? 0)
    page1.drawText(label, { x: 40, y: barY + 4, size: 10, font: bold, color: COLORS.text })
    page1.drawRectangle({ x: 120, y: barY, width: 320, height: 12, color: COLORS.surface, borderColor: COLORS.border, borderWidth: 1 })
    page1.drawRectangle({ x: 120, y: barY, width: Math.max(12, (value / 100) * 320), height: 12, color: COLORS.secondary })
    page1.drawText(formatNumber(value, 0), { x: 454, y: barY + 2, size: 10, font: bold, color: COLORS.text })
    barY -= 26
  })

  page1.drawText('Temel Finansal Gostergeler', { x: 40, y: 432, size: 12, font: bold, color: COLORS.text })
  drawCard(page1, 40, 258, 515, 156)
  drawTableHeader(page1, ['Metrik', 'Mevcut', 'Metrik', 'Mevcut'], 58, 392, [170, 70, 170, 70], bold)
  const ratioRows: Array<[string, number | null, PdfSuggestion['unit']]> = [
    ['Cari Oran', analysis.ratios.currentRatio ?? null, 'x'],
    ['Asit-Test', analysis.ratios.quickRatio ?? null, 'x'],
    ['Net Kar Marji', analysis.ratios.netProfitMargin ?? null, 'pct'],
    ['FAVOK Marji', analysis.ratios.ebitdaMargin ?? null, 'pct'],
    ['Borc / Ozkaynak', analysis.ratios.debtToEquity ?? null, 'x'],
    ['Faiz Karsilama', analysis.ratios.interestCoverage ?? null, 'x'],
    ['Tahsil Suresi', analysis.ratios.receivablesTurnoverDays ?? null, 'day'],
    ['Stok Devir Suresi', analysis.ratios.inventoryTurnoverDays ?? null, 'day'],
  ]

  let rowY = 366
  for (let index = 0; index < ratioRows.length; index += 2) {
    const left = ratioRows[index]
    const right = ratioRows[index + 1]
    page1.drawText(left[0], { x: 58, y: rowY, size: 10, font: regular, color: COLORS.text })
    page1.drawText(formatMetric(left[1], left[2]), { x: 228, y: rowY, size: 10, font: bold, color: COLORS.text })
    if (right) {
      page1.drawText(right[0], { x: 310, y: rowY, size: 10, font: regular, color: COLORS.text })
      page1.drawText(formatMetric(right[1], right[2]), { x: 480, y: rowY, size: 10, font: bold, color: COLORS.text })
    }
    rowY -= 24
  }

  page1.drawText('Aksiyon Ozetı', { x: 40, y: 224, size: 12, font: bold, color: COLORS.text })
  drawCard(page1, 40, 78, 515, 128)
  if (latestTarget) {
    const targetColor = getRatingColor(latestTarget.targetRating)
    page1.drawText(`Hedef rating: ${latestTarget.targetRating}`, { x: 58, y: 178, size: 12, font: bold, color: targetColor })
    page1.drawText(`Minimum set: ${latestTarget.minimumPlan.suggestions.length} aksiyon`, { x: 58, y: 156, size: 10, font: regular, color: COLORS.text })
    page1.drawText(`Ideal set: ${latestTarget.idealPlan.suggestions.length} aksiyon`, { x: 58, y: 138, size: 10, font: regular, color: COLORS.text })
    page1.drawText(`Beklenen toplam etki: +${formatNumber(latestTarget.totalGain, 1)} puan`, { x: 58, y: 120, size: 10, font: regular, color: COLORS.text })
    const summaryText = `Bu aksiyon seti yaklaşık +${formatNumber(latestTarget.totalGain, 1)} puan etki ile hedef rating'e ulaşmak için önerilmiştir.`
    drawTextBlock(page1, summaryText, 300, 178, 220, regular, 10, COLORS.muted, 4)
  } else {
    drawTextBlock(page1, 'Bu analiz için saklanmış bir optimizer snapshot bulunamadı. PDF mevcut finansal görünümü göstermektedir.', 58, 160, 460, regular, 10, COLORS.muted, 4)
  }

  const page2 = pdfDoc.addPage([595.28, 841.89])
  page2.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(1, 1, 1) })
  page2.drawRectangle({ x: 0, y: 782, width: 595.28, height: 59.89, color: COLORS.primary })
  page2.drawText('Aksiyon Plani', { x: 40, y: 807, size: 20, font: bold, color: rgb(1, 1, 1) })
  page2.drawText(`${entityName} · Minimum Set / Ideal Set`, { x: 40, y: 789, size: 10, font: regular, color: rgb(1, 1, 1) })

  const plans: PdfActionPlan[] = latestTarget
    ? [
        { ...latestTarget.minimumPlan, title: 'Minimum Set' },
        { ...latestTarget.idealPlan, title: 'Ideal Set' },
      ]
    : []

  let planTop = 724
  for (const plan of plans) {
    drawCard(page2, 40, planTop - 22, 515, 44)
    page2.drawText(plan.title, { x: 56, y: planTop, size: 13, font: bold, color: COLORS.text })
    page2.drawText(`Projeksiyon: ${formatNumber(plan.projectedScore, 0)} puan · ${plan.projectedRating}`, { x: 56, y: planTop - 16, size: 10, font: regular, color: COLORS.muted })
    page2.drawText(plan.achievable ? 'Hedefe ulasabilir' : 'Ek aksiyon gerekir', {
      x: 420,
      y: planTop - 6,
      size: 10,
      font: bold,
      color: plan.achievable ? COLORS.green : COLORS.amber,
    })
    planTop -= 62

    if (plan.suggestions.length === 0) {
      page2.drawText('Bu plan icin onerilen aksiyon bulunmuyor.', { x: 56, y: planTop, size: 10, font: regular, color: COLORS.muted })
      planTop -= 28
      continue
    }

    for (const suggestion of plan.suggestions.slice(0, 6)) {
      const boxHeight = 68
      if (planTop - boxHeight < 48) break
      drawCard(page2, 40, planTop - boxHeight + 8, 515, boxHeight)
      page2.drawText(suggestion.label, { x: 56, y: planTop + 48 - boxHeight, size: 11, font: bold, color: COLORS.text })
      page2.drawText(`${suggestion.category} · +${formatNumber(suggestion.marginalScoreGain, 1)} puan`, {
        x: 420,
        y: planTop + 48 - boxHeight,
        size: 10,
        font: bold,
        color: COLORS.primary,
      })
      page2.drawText(`Mevcut: ${formatMetric(suggestion.currentValue, suggestion.unit)}`, { x: 56, y: planTop + 28 - boxHeight, size: 10, font: regular, color: COLORS.text })
      page2.drawText(`Hedef: ${formatMetric(suggestion.targetValue, suggestion.unit)}`, { x: 190, y: planTop + 28 - boxHeight, size: 10, font: regular, color: COLORS.text })
      page2.drawText(getDifficultyLabel(suggestion.difficulty), { x: 320, y: planTop + 28 - boxHeight, size: 10, font: regular, color: COLORS.text })
      page2.drawText(`Zaman: ${suggestion.timeHorizon}`, { x: 430, y: planTop + 28 - boxHeight, size: 10, font: regular, color: COLORS.text })
      planTop -= 80
    }

    planTop -= 12
  }

  page2.drawText('Bu PDF, FINRATE rapor ekranindan gercek dosya olarak uretilmistir.', {
    x: 40,
    y: 30,
    size: 9,
    font: regular,
    color: COLORS.muted,
  })

  const pdfBytes = await pdfDoc.save()
  return {
    fileName,
    bytes: pdfBytes,
  }
}
