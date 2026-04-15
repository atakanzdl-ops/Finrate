import { readFile } from 'fs/promises'
import path from 'path'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { OptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'

type Difficulty = 'medium' | 'hard'
type MetricUnit = 'pct' | 'x' | 'day' | 'ratio'

interface PdfSuggestion {
  key: string
  label: string
  category: string
  currentValue: number | null
  targetValue: number
  unit: MetricUnit
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

interface RatioInsight {
  label: string
  value: number | null
  unit: MetricUnit
  comment: string
}

const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 40,
  top: 782,
  bottom: 40,
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

function formatMetric(value: number | null, unit: MetricUnit) {
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
  return difficulty === 'hard' ? 'Yüksek' : 'Orta'
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
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

function drawCard(page: PDFPage, x: number, y: number, width: number, height: number, fill = rgb(1, 1, 1)) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: fill,
    borderColor: COLORS.border,
    borderWidth: 1,
  })
}

function addPage(pdfDoc: PDFDocument, regular: PDFFont, bold: PDFFont, title: string, entityName: string, subtitle: string, pageNumber: number) {
  const page = pdfDoc.addPage([PAGE.width, PAGE.height])
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(1, 1, 1) })
  page.drawRectangle({ x: 0, y: PAGE.top, width: PAGE.width, height: PAGE.height - PAGE.top, color: COLORS.primary })
  page.drawText('FINRATE', { x: PAGE.marginX, y: 805, size: 18, font: bold, color: rgb(1, 1, 1) })
  page.drawText(title, { x: PAGE.marginX, y: 786, size: 11, font: regular, color: rgb(1, 1, 1) })
  page.drawText(`${entityName} · ${subtitle}`, { x: PAGE.width - 220, y: 786, size: 10, font: regular, color: rgb(1, 1, 1) })
  page.drawLine({
    start: { x: PAGE.marginX, y: 26 },
    end: { x: PAGE.width - PAGE.marginX, y: 26 },
    thickness: 1,
    color: COLORS.border,
  })
  page.drawText(`FINRATE kurumsal rapor · Sayfa ${pageNumber}`, {
    x: PAGE.marginX,
    y: 12,
    size: 9,
    font: regular,
    color: COLORS.muted,
  })
  return page
}

function getLatestTarget(snapshot?: OptimizerSnapshot | null) {
  return snapshot?.targets?.[0] ?? null
}

function buildExecutiveSummary(analysis: PdfAnalysis, combinedScore: number, combinedRating: string, target: ReturnType<typeof getLatestTarget>) {
  const strengths: string[] = []
  const risks: string[] = []

  if (analysis.liquidityScore >= 65) strengths.push('Likidite görünümü dengeli')
  else risks.push('Likidite görünümü baskı altında')

  if (analysis.profitabilityScore >= 65) strengths.push('Kârlılık üretimi destekleyici')
  else risks.push('Kârlılık seviyesi notu aşağı çekiyor')

  if (analysis.leverageScore >= 60) strengths.push('Borçluluk seviyesi yönetilebilir')
  else risks.push('Kaldıraç seviyesi temkin gerektiriyor')

  if (analysis.activityScore >= 60) strengths.push('Faaliyet verimliliği kabul edilebilir')
  else risks.push('Faaliyet döngüsü zayıf çalışıyor')

  const ratingMessage =
    combinedScore >= 68
      ? 'Genel kredi görünümü güçlü ve karar vericiye güven verebilecek seviyede.'
      : combinedScore >= 44
        ? 'Genel kredi görünümü dengeli ancak seçici risk yönetimi gerektiriyor.'
        : 'Genel kredi görünümü zayıf; kredi kararında temkinli yaklaşım gerekir.'

  const targetMessage = target
    ? `Sistem, ${target.targetRating} hedef ratingine ulaşmak için yaklaşık +${formatNumber(target.totalGain, 1)} puan etkili bir aksiyon seti öneriyor.`
    : 'Bu analiz için saklanmış bir hedef rating aksiyon paketi bulunmuyor.'

  return {
    overview: `${analysis.entity?.name ?? 'Şirket'} için oluşturulan bu raporda toplam skor ${formatNumber(combinedScore, 0)} ve rating ${combinedRating} seviyesindedir. ${ratingMessage} ${targetMessage}`,
    strengths: strengths.length > 0 ? strengths : ['Belirgin güçlü alan sınırlı'],
    risks: risks.length > 0 ? risks : ['Belirgin kritik risk görünmüyor'],
  }
}

function buildRatioInsights(ratios: Record<string, number | null>): RatioInsight[] {
  const currentRatio = ratios.currentRatio ?? null
  const quickRatio = ratios.quickRatio ?? null
  const netMargin = ratios.netProfitMargin ?? null
  const ebitdaMargin = ratios.ebitdaMargin ?? null
  const debtToEquity = ratios.debtToEquity ?? null
  const interestCoverage = ratios.interestCoverage ?? null
  const receivableDays = ratios.receivablesTurnoverDays ?? null
  const inventoryDays = ratios.inventoryTurnoverDays ?? null

  return [
    {
      label: 'Cari oran',
      value: currentRatio,
      unit: 'x',
      comment: currentRatio == null ? 'Likidite verisi eksik.' : currentRatio >= 1.5 ? 'Kısa vadeli yükümlülükleri karşılama kapasitesi kabul edilebilir.' : 'Kısa vadeli ödeme gücü zayıf, nakit tamponu güçlendirilmelidir.',
    },
    {
      label: 'Asit-test oranı',
      value: quickRatio,
      unit: 'x',
      comment: quickRatio == null ? 'Likit varlık görünümü ölçülemiyor.' : quickRatio >= 1 ? 'Stok hariç likit varlık yapısı yeterli.' : 'Stok hariç likidite zayıf, tahsilat ve nakit planı önceliklidir.',
    },
    {
      label: 'Net kâr marjı',
      value: netMargin,
      unit: 'pct',
      comment: netMargin == null ? 'Net kârlılık verisi eksik.' : netMargin > 0.08 ? 'Nihai kârlılık kredi notunu destekliyor.' : netMargin >= 0 ? 'Kârlılık pozitif ancak tampon üretmek için sınırlı.' : 'Zarar görünümü notu baskılıyor; fiyatlama ve maliyet aksiyonu gerekir.',
    },
    {
      label: 'FAVÖK marjı',
      value: ebitdaMargin,
      unit: 'pct',
      comment: ebitdaMargin == null ? 'Operasyonel kârlılık verisi eksik.' : ebitdaMargin > 0.12 ? 'Operasyonel nakit üretimi güçlü görünüyor.' : ebitdaMargin >= 0.05 ? 'Operasyonel marj pozitif ancak iyileştirme alanı var.' : 'Operasyonel verimlilik zayıf; marj baskısı yüksek.',
    },
    {
      label: 'Borç / özkaynak',
      value: debtToEquity,
      unit: 'x',
      comment: debtToEquity == null ? 'Borçluluk verisi eksik.' : debtToEquity <= 1.2 ? 'Sermaye yapısı görece dengeli.' : debtToEquity <= 2 ? 'Borçluluk yönetilebilir ancak temkin gerektiriyor.' : 'Kaldıraç seviyesi yüksek; sermaye ve borç yeniden yapılandırması önem kazanıyor.',
    },
    {
      label: 'Faiz karşılama',
      value: interestCoverage,
      unit: 'x',
      comment: interestCoverage == null ? 'Faiz karşılama verisi eksik.' : interestCoverage >= 3 ? 'Faiz yükünü operasyonel kârlılık taşıyabiliyor.' : interestCoverage >= 1.5 ? 'Faiz taşıma kapasitesi sınırda.' : 'Faiz yükü baskın; finansman yapısı yeniden ele alınmalıdır.',
    },
    {
      label: 'Alacak tahsil süresi',
      value: receivableDays,
      unit: 'day',
      comment: receivableDays == null ? 'Tahsilat çevrimi verisi eksik.' : receivableDays <= 75 ? 'Tahsilat disiplini kabul edilebilir.' : 'Tahsilat süresi uzuyor; işletme sermayesi baskısı artıyor.',
    },
    {
      label: 'Stok devir süresi',
      value: inventoryDays,
      unit: 'day',
      comment: inventoryDays == null ? 'Stok çevrimi verisi eksik.' : inventoryDays <= 90 ? 'Stok çevrimi makul seviyede.' : 'Stokta bekleme süresi yüksek; nakit döngüsü yavaşlıyor.',
    },
  ]
}

function drawSectionTitle(page: PDFPage, title: string, subtitle: string, y: number, regular: PDFFont, bold: PDFFont) {
  page.drawText(title, { x: PAGE.marginX, y, size: 18, font: bold, color: COLORS.text })
  page.drawText(subtitle, { x: PAGE.marginX, y: y - 16, size: 10, font: regular, color: COLORS.muted })
}

export async function buildReportPdf({ analysis, combinedScore, combinedRating, subjectiveTotal }: PdfPayload) {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)

  const regularFontBytes = await readFile(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Regular.ttf'))
  const boldFontBytes = await readFile(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Bold.ttf'))
  const regular = await pdfDoc.embedFont(regularFontBytes)
  const bold = await pdfDoc.embedFont(boldFontBytes)

  const entityName = analysis.entity?.name ?? 'Şirket'
  const fileName = `${slugify(entityName)}-${analysis.year}-finansal-rapor.pdf`
  const periodLabel = PERIOD_LABEL[analysis.period] ?? analysis.period
  const reportDate = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date())
  const latestTarget = getLatestTarget(analysis.optimizerSnapshot)
  const executive = buildExecutiveSummary(analysis, combinedScore, combinedRating, latestTarget)
  const ratioInsights = buildRatioInsights(analysis.ratios)

  const cover = pdfDoc.addPage([PAGE.width, PAGE.height])
  cover.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(1, 1, 1) })
  cover.drawRectangle({ x: 0, y: 580, width: PAGE.width, height: 261.89, color: COLORS.primary })
  cover.drawText('FINRATE', { x: PAGE.marginX, y: 772, size: 22, font: bold, color: rgb(1, 1, 1) })
  cover.drawText('Kurumsal Finansal Analiz Raporu', { x: PAGE.marginX, y: 742, size: 28, font: bold, color: rgb(1, 1, 1) })
  cover.drawText(entityName, { x: PAGE.marginX, y: 690, size: 24, font: bold, color: rgb(1, 1, 1) })
  cover.drawText(`${analysis.year} · ${periodLabel}`, { x: PAGE.marginX, y: 668, size: 12, font: regular, color: rgb(1, 1, 1) })
  cover.drawText(`Analiz tarihi: ${reportDate}`, { x: PAGE.marginX, y: 646, size: 11, font: regular, color: rgb(1, 1, 1) })

  drawCard(cover, PAGE.marginX, 424, 240, 118, COLORS.surface)
  cover.drawText('Toplam Skor', { x: 58, y: 514, size: 11, font: bold, color: COLORS.muted })
  cover.drawText(formatNumber(combinedScore, 0), { x: 58, y: 468, size: 42, font: bold, color: COLORS.text })
  cover.drawText(`Finansal skor: ${formatNumber(analysis.finalScore, 0)} · Subjektif etki: ${formatNumber(subjectiveTotal, 0)}`, { x: 58, y: 444, size: 10, font: regular, color: COLORS.muted })

  drawCard(cover, 315, 424, 240, 118)
  cover.drawText('Rating', { x: 333, y: 514, size: 11, font: bold, color: COLORS.muted })
  cover.drawText(combinedRating, { x: 333, y: 468, size: 42, font: bold, color: getRatingColor(combinedRating) })
  cover.drawText(`Baz rating: ${analysis.finalRating}`, { x: 333, y: 444, size: 10, font: regular, color: COLORS.muted })

  cover.drawText('Rapor notu', { x: PAGE.marginX, y: 372, size: 14, font: bold, color: COLORS.text })
  const coverSummary = latestTarget
    ? `Bu belge, ${entityName} için mevcut finansal görünümü ve ${latestTarget.targetRating} hedef ratingine ulaşmak üzere önerilen aksiyon setini içerir.`
    : `Bu belge, ${entityName} için mevcut finansal görünümü ve temel kredi risk değerlendirmesini içerir.`
  drawTextBlock(cover, coverSummary, PAGE.marginX, 348, 515, regular, 11, COLORS.muted, 5)

  const summaryPage = addPage(pdfDoc, regular, bold, 'Yönetici Özeti', entityName, `${analysis.year} ${periodLabel}`, 2)
  drawSectionTitle(summaryPage, 'Yönetici Özeti', 'Risk, güçlü alanlar ve kısa karar notu', 728, regular, bold)
  drawCard(summaryPage, PAGE.marginX, 560, 515, 118)
  drawTextBlock(summaryPage, executive.overview, 58, 650, 480, regular, 11, COLORS.text, 5)
  summaryPage.drawText('Güçlü alanlar', { x: 58, y: 608, size: 11, font: bold, color: COLORS.green })
  executive.strengths.forEach((item, index) => {
    summaryPage.drawText(`• ${item}`, { x: 58, y: 588 - index * 16, size: 10, font: regular, color: COLORS.text })
  })
  summaryPage.drawText('Risk alanları', { x: 290, y: 608, size: 11, font: bold, color: COLORS.red })
  executive.risks.forEach((item, index) => {
    summaryPage.drawText(`• ${item}`, { x: 290, y: 588 - index * 16, size: 10, font: regular, color: COLORS.text })
  })

  drawSectionTitle(summaryPage, 'Skor Breakdown', 'Kategori skorlarının karar mantığı', 520, regular, bold)
  const categories: Array<{ label: string; value: number; color: ReturnType<typeof rgb>; comment: string }> = [
    { label: 'Likidite', value: analysis.liquidityScore, color: COLORS.secondary, comment: analysis.liquidityScore >= 65 ? 'Ödeme gücü dengeli.' : 'Kısa vadeli yükümlülük baskısı var.' },
    { label: 'Karlılık', value: analysis.profitabilityScore, color: COLORS.green, comment: analysis.profitabilityScore >= 65 ? 'Marj üretimi destekleyici.' : 'Kârlılık notu aşağı çekiyor.' },
    { label: 'Kaldıraç', value: analysis.leverageScore, color: COLORS.amber, comment: analysis.leverageScore >= 60 ? 'Borçluluk kontrol altında.' : 'Sermaye yapısı temkin gerektiriyor.' },
    { label: 'Faaliyet', value: analysis.activityScore, color: COLORS.primary, comment: analysis.activityScore >= 60 ? 'Faaliyet verimi kabul edilebilir.' : 'Döngü hızında iyileştirme gerekiyor.' },
  ]

  let breakdownY = 468
  categories.forEach((item) => {
    summaryPage.drawText(item.label, { x: 58, y: breakdownY + 8, size: 11, font: bold, color: COLORS.text })
    summaryPage.drawRectangle({ x: 150, y: breakdownY + 2, width: 220, height: 10, color: COLORS.surface, borderColor: COLORS.border, borderWidth: 1 })
    summaryPage.drawRectangle({ x: 150, y: breakdownY + 2, width: Math.max(8, (item.value / 100) * 220), height: 10, color: item.color })
    summaryPage.drawText(formatNumber(item.value, 0), { x: 384, y: breakdownY + 4, size: 10, font: bold, color: COLORS.text })
    summaryPage.drawText(item.comment, { x: 430, y: breakdownY + 4, size: 9, font: regular, color: COLORS.muted })
    breakdownY -= 34
  })

  drawCard(summaryPage, PAGE.marginX, 178, 515, 104)
  summaryPage.drawText('Aksiyon özeti', { x: 58, y: 252, size: 12, font: bold, color: COLORS.text })
  if (latestTarget) {
    summaryPage.drawText(`Hedef rating: ${latestTarget.targetRating}`, { x: 58, y: 228, size: 10, font: bold, color: getRatingColor(latestTarget.targetRating) })
    summaryPage.drawText(`Minimum set: ${latestTarget.minimumPlan.suggestions.length} aksiyon`, { x: 58, y: 210, size: 10, font: regular, color: COLORS.text })
    summaryPage.drawText(`Ideal set: ${latestTarget.idealPlan.suggestions.length} aksiyon`, { x: 58, y: 194, size: 10, font: regular, color: COLORS.text })
    drawTextBlock(summaryPage, `Bu aksiyon seti yaklaşık +${formatNumber(latestTarget.totalGain, 1)} puan etki ile hedef rating'e ulaşmak için önerilmiştir.`, 260, 228, 260, regular, 10, COLORS.muted, 4)
  } else {
    drawTextBlock(summaryPage, 'Bu analiz için kayıtlı optimizer snapshot bulunmuyor.', 58, 224, 460, regular, 10, COLORS.muted, 4)
  }

  const financePage = addPage(pdfDoc, regular, bold, 'Finansal Analiz', entityName, `${analysis.year} ${periodLabel}`, 3)
  drawSectionTitle(financePage, 'Finansal Analiz', 'Oranlar ve kısa yorumlar', 728, regular, bold)

  let insightY = 680
  ratioInsights.forEach((item, index) => {
    if (index % 2 === 0) {
      drawCard(financePage, PAGE.marginX, insightY - 62, 515, 58)
    }
    const colX = index % 2 === 0 ? 58 : 310
    financePage.drawText(item.label, { x: colX, y: insightY - 16, size: 10, font: bold, color: COLORS.text })
    financePage.drawText(formatMetric(item.value, item.unit), { x: colX, y: insightY - 34, size: 18, font: bold, color: COLORS.primary })
    drawTextBlock(financePage, item.comment, colX, insightY - 48, 205, regular, 9, COLORS.muted, 3)
    if (index % 2 === 1) insightY -= 76
  })

  drawSectionTitle(financePage, 'Karar Yorumu', 'Kredi komitesine sunulabilir kısa değerlendirme', 340, regular, bold)
  drawCard(financePage, PAGE.marginX, 188, 515, 128)
  const decisionText = latestTarget
    ? `${entityName}, ${combinedRating} rating seviyesinde değerlendirilmektedir. En kritik kırılma alanları kârlılık, likidite ve işletme sermayesi yönetimidir. Minimum set uygulandığında ${latestTarget.minimumPlan.projectedRating}, ideal sette ise ${latestTarget.idealPlan.projectedRating} seviyesine yönelim beklenmektedir.`
    : `${entityName}, ${combinedRating} rating seviyesinde değerlendirilmektedir. Finansal karar açısından temel odak alanı kârlılık, likidite ve borç servisi kapasitesidir.`
  drawTextBlock(financePage, decisionText, 58, 286, 480, regular, 11, COLORS.text, 5)

  let actionPageNumber = 4
  let actionPage = addPage(pdfDoc, regular, bold, 'Aksiyon Planı', entityName, `${analysis.year} ${periodLabel}`, actionPageNumber)
  drawSectionTitle(actionPage, 'Aksiyon Planı', 'Minimum set ve ideal set', 728, regular, bold)
  let cursorY = 688

  const plans: PdfActionPlan[] = latestTarget
    ? [
        { ...latestTarget.minimumPlan, title: 'Minimum Set' },
        { ...latestTarget.idealPlan, title: 'Ideal Set' },
      ]
    : []

  const ensureSpace = (neededHeight: number) => {
    if (cursorY - neededHeight >= 72) return
    actionPageNumber += 1
    actionPage = addPage(pdfDoc, regular, bold, 'Aksiyon Planı', entityName, `${analysis.year} ${periodLabel}`, actionPageNumber)
    cursorY = 728
  }

  if (plans.length === 0) {
    drawCard(actionPage, PAGE.marginX, 600, 515, 80)
    drawTextBlock(actionPage, 'Bu analiz için kaydedilmiş bir minimum set veya ideal set bulunmuyor.', 58, 646, 470, regular, 11, COLORS.muted, 4)
  }

  plans.forEach((plan) => {
    ensureSpace(84)
    drawCard(actionPage, PAGE.marginX, cursorY - 54, 515, 62)
    actionPage.drawText(plan.title, { x: 58, y: cursorY - 12, size: 14, font: bold, color: COLORS.text })
    actionPage.drawText(`Projeksiyon: ${formatNumber(plan.projectedScore, 0)} puan · ${plan.projectedRating}`, { x: 58, y: cursorY - 30, size: 10, font: regular, color: COLORS.muted })
    actionPage.drawText(plan.achievable ? 'Hedefe ulaşabilir' : 'Ek aksiyon gerekir', { x: 420, y: cursorY - 22, size: 10, font: bold, color: plan.achievable ? COLORS.green : COLORS.amber })
    cursorY -= 82

    plan.suggestions.forEach((suggestion) => {
      ensureSpace(94)
      drawCard(actionPage, PAGE.marginX, cursorY - 68, 515, 76)
      actionPage.drawText(suggestion.label, { x: 58, y: cursorY - 12, size: 11, font: bold, color: COLORS.text })
      actionPage.drawText(`${suggestion.category} · +${formatNumber(suggestion.marginalScoreGain, 1)} puan`, { x: 392, y: cursorY - 12, size: 10, font: bold, color: COLORS.primary })
      actionPage.drawText(`Mevcut: ${formatMetric(suggestion.currentValue, suggestion.unit)}`, { x: 58, y: cursorY - 32, size: 10, font: regular, color: COLORS.text })
      actionPage.drawText(`Hedef: ${formatMetric(suggestion.targetValue, suggestion.unit)}`, { x: 182, y: cursorY - 32, size: 10, font: regular, color: COLORS.text })
      actionPage.drawText(`Zorluk: ${getDifficultyLabel(suggestion.difficulty)}`, { x: 310, y: cursorY - 32, size: 10, font: regular, color: COLORS.text })
      actionPage.drawText(`Zaman: ${suggestion.timeHorizon}`, { x: 430, y: cursorY - 32, size: 10, font: regular, color: COLORS.text })
      drawTextBlock(actionPage, `Bu aksiyon, ${suggestion.label} metriğini mevcut seviyeden hedef seviyeye taşıyarak kredi skoruna marjinal katkı yaratmayı amaçlar.`, 58, cursorY - 50, 450, regular, 9, COLORS.muted, 3)
      cursorY -= 92
    })
  })

  const pdfBytes = await pdfDoc.save()
  return {
    fileName,
    bytes: pdfBytes,
  }
}
