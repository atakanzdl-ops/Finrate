import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { parseExcelBuffer, parseCsvText } from '@/lib/parsers/excel'
import { calculateRatios, TURKEY_PPI } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'
import { createOptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'
import { checkDuplicates, checkEntityIdentity } from '@/lib/validation/uploadValidation'
import { UPLOAD_ERRORS }           from '@/lib/i18n/uploadErrors'

// ─── Alan grupları: hangi docType hangi alanları yazabilir (Faz 7.3.16) ────────
const BALANCE_SHEET_FIELDS = new Set([
  'cash', 'shortTermInvestments', 'tradeReceivables', 'otherReceivables',
  'inventory', 'constructionCosts', 'prepaidSuppliers', 'prepaidExpenses',
  'otherCurrentAssets', 'totalCurrentAssets',
  'longTermTradeReceivables', 'longTermOtherReceivables', 'longTermInvestments',
  'tangibleAssets', 'intangibleAssets', 'depletableAssets',
  'longTermPrepaidExpenses', 'otherNonCurrentAssets', 'totalNonCurrentAssets',
  'totalAssets',
  'shortTermFinancialDebt', 'tradePayables', 'otherShortTermPayables',
  'advancesReceived', 'constructionProgress', 'taxPayables', 'shortTermProvisions',
  'deferredRevenue', 'otherCurrentLiabilities', 'totalCurrentLiabilities',
  'longTermFinancialDebt', 'longTermTradePayables', 'longTermOtherPayables',
  'longTermAdvancesReceived', 'longTermProvisions', 'otherNonCurrentLiabilities',
  'totalNonCurrentLiabilities',
  'paidInCapital', 'capitalReserves', 'profitReserves', 'retainedEarnings',
  'retainedLosses', 'netProfitCurrentYear', 'totalEquity', 'totalLiabilitiesAndEquity',
])

const INCOME_STATEMENT_FIELDS = new Set([
  'grossSales', 'salesDiscounts', 'revenue', 'cogs', 'grossProfit',
  'operatingExpenses', 'ebit', 'ebitda', 'otherIncome', 'otherExpense',
  'interestExpense', 'extraordinaryIncome', 'extraordinaryExpense',
  'ebt', 'taxExpense', 'netProfit', 'netProfitCurrentYear', 'depreciation', 'purchases',
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return jsonUtf8({ error: 'Şirket bulunamadı.' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return jsonUtf8({ error: 'Dosya bulunamadı.' }, { status: 400 })

    // Faz 7.3.49 A / 7.5.4a: Boyut limiti — env bazlı, arrayBuffer() ÖNCE kontrol et
    const maxMB    = Number(process.env.MAX_FILE_SIZE_MB ?? 10)
    const maxBytes = maxMB * 1024 * 1024
    if (file.size > maxBytes) {
      return jsonUtf8(
        { error: `Dosya çok büyük. Maksimum ${maxMB} MB boyutunda dosya yükleyebilirsiniz.` },
        { status: 413 },
      )
    }

    // Faz 7.5.4a: MIME header allowlist (bazı tarayıcılar boş döndürür → truthy guard)
    const ALLOWED_MIME = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel',                                           // xls
      'text/csv',
      'text/plain',
      'application/pdf',
    ]
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      return jsonUtf8({ error: 'Geçersiz dosya türü.' }, { status: 400 })
    }

    // Yıl / dönem override (form'dan gelen)
    const formYear   = formData.get('year')   ? Number(formData.get('year'))  : null
    const formPeriod = formData.get('period') ? String(formData.get('period')) : null

    const fileName = file.name.toLowerCase()
    const isExcel  = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
    const isCsv    = fileName.endsWith('.csv')
    const isPdf    = fileName.endsWith('.pdf')

    if (!isExcel && !isCsv && !isPdf) {
      return jsonUtf8({ error: 'Yalnızca .xlsx, .xls, .csv veya .pdf dosyaları desteklenir.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    // Faz 7.5.4a: Magic byte check — CSV hariç (CSV'de magic byte yok)
    // detected null ise (tanımsız format) → extension + MIME zaten doğrulamış, geç
    if (!isCsv) {
      const { fileTypeFromBuffer } = await import('file-type')
      const detected = await fileTypeFromBuffer(buffer)
      if (detected) {
        const VALID_MAGIC_MIMES = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/pdf',
        ]
        if (!VALID_MAGIC_MIMES.includes(detected.mime)) {
          return jsonUtf8(
            { error: `Dosya içeriği uzantıyla uyumsuz (${detected.mime}).` },
            { status: 400 },
          )
        }
      }
    }

    let parsedRows
    if (isExcel) {
      parsedRows = await parseExcelBuffer(buffer)
    } else if (isCsv) {
      parsedRows = await parseCsvText(buffer.toString('utf-8'))
    } else {
      const { parsePdfBuffer } = await import('@/lib/parsers/pdf')
      parsedRows = await parsePdfBuffer(buffer)
    }

    console.info('[upload] parser output', {
      fileName: file.name,
      source: isExcel ? 'EXCEL' : isCsv ? 'CSV' : 'PDF',
      parsedRows: parsedRows.length,
      sample: parsedRows.slice(0, 2).map(r => ({
        year: r.year ?? null,
        period: r.period ?? null,
        fieldCount: Object.keys(r.fields ?? {}).length,
        path: r.meta?.path ?? null,
        confidence: r.meta?.confidence ?? null,
        otherIncome: r.fields?.otherIncome ?? null,
      })),
    })

    // Faz 7.3.50A: detectedYear/detectedPeriod'u override ÖNCE etiketle
    parsedRows = parsedRows.map(row => ({
      ...row,
      detectedYear:   row.year   ?? null,
      detectedPeriod: row.period ?? null,
    }))

    // Yıl/dönem override mantığı:
    // - Birden fazla satır varsa ve her satırın zaten yılı tespit edildiyse (dikey Excel gibi)
    //   override UYGULANMAZ — her satır kendi yıl/dönemini korur.
    // - Tek satır veya yılsız satır varsa (PDF, yatay Excel) override uygulanır.
    const multiRowWithYears         = parsedRows.length > 1 && parsedRows.every(r => r.year != null)
    const shouldValidateAgainstForm = !multiRowWithYears

    if (!multiRowWithYears && (formYear || formPeriod)) {
      parsedRows = parsedRows.map(row => ({
        ...row,
        year:   formYear   ?? row.year,
        period: formPeriod ?? row.period,
      }))
    }

    parsedRows = parsedRows.filter((row) => {
      const values = Object.values(row.fields ?? {})
      return values.some((v) => v != null && !isNaN(Number(v)))
    })

    if (parsedRows.length === 0) {
      return jsonUtf8({
        error: 'Dosyada okunabilir veri bulunamadı.',
        parseSummary: {
          parsedRows: 0,
          processedRows: 0,
          skippedRows: 0,
          parseWarnings: ['Parser okunabilir Excel satırı üretemedi.'],
        },
      }, { status: 400 })
    }

    // ─── Faz 7.3.50A: PREFLIGHT validation ──────────────────────────────────────

    // PREFLIGHT 1 — MISSING_YEAR_CONTEXT
    // Boş satır filtresi sonrası hâlâ yılsız satır varsa (hem parser hem form null)
    for (const row of parsedRows) {
      if (!row.year) {
        return jsonUtf8({
          error:   'MISSING_YEAR_CONTEXT',
          message: UPLOAD_ERRORS.MISSING_YEAR_CONTEXT,
        }, { status: 400 })
      }
    }

    // PREFLIGHT 1.5 — DETECTED_YEAR_MISSING_CONFIRM (Faz 7.3.50A.1)
    // Parser yıl tespit edemediyse (detectedYear null) + formYear var → onay iste
    // confirm=true ise bypass → form yılıyla devam
    const confirmDetectionMissing = formData.get('confirmDetectionMissing') === 'true'
    if (!confirmDetectionMissing) {
      for (const row of parsedRows) {
        if (row.detectedYear == null && formYear) {
          return jsonUtf8({
            error:    'DETECTED_YEAR_MISSING_CONFIRM',
            message:  UPLOAD_ERRORS.DETECTED_YEAR_MISSING_CONFIRM(formYear),
            detected: { year: null, period: row.detectedPeriod ?? null },
            form:     { year: formYear, period: formPeriod },
          }, { status: 409 })
        }
      }
    }

    // PREFLIGHT 2 — YEAR/PERIOD MISMATCH (multi-year Excel istisnasında atlanır)
    // Her ikisi de varsa ve farklıysa → 422. Parser null döndürdüyse form fallback → geçer.
    if (shouldValidateAgainstForm) {
      for (const row of parsedRows) {
        if (formYear && row.detectedYear && formYear !== row.detectedYear) {
          return jsonUtf8({
            error:    'YEAR_MISMATCH',
            message:  UPLOAD_ERRORS.YEAR_MISMATCH(row.detectedYear as number, formYear),
            detected: { year: row.detectedYear, period: row.detectedPeriod },
            form:     { year: formYear, period: formPeriod },
          }, { status: 422 })
        }
        const detectedPeriod = row.detectedPeriod as string | null

        const isQ4AnnualPair = (
          (detectedPeriod === 'Q4' && formPeriod === 'ANNUAL') ||
          (detectedPeriod === 'ANNUAL' && formPeriod === 'Q4')
        )

        if (formPeriod && detectedPeriod && formPeriod !== detectedPeriod && !isQ4AnnualPair) {
          return jsonUtf8({
            error:    'PERIOD_MISMATCH',
            message:  UPLOAD_ERRORS.PERIOD_MISMATCH(detectedPeriod, formPeriod),
            detected: { year: row.detectedYear, period: detectedPeriod },
            form:     { year: formYear, period: formPeriod },
          }, { status: 422 })
        }
      }
    }

    // PREFLIGHT 4 — ENTITY IDENTITY CHECK (Faz 7.3.50A.3 + 7.3.50B.2)
    // Dosyada bulunan VKN/TC/unvan ile sisteme kayıtlı entity karşılaştırılır.
    // ÖNCELİK 0: VKN match → tüm soft kontroller atlanır.
    // CASE 1-5 SOFT (409): confirmEntityUnverified=true ile bypass edilir.
    // Faz 7.3.50B.2: VKN mismatch da soft — mali müşavir bilinçli onaylayabilir.
    {
      const confirmEntityUnverified = formData.get('confirmEntityUnverified') === 'true'
      const detectedIdentity        = parsedRows[0]?.identity ?? { sourceConfidence: 'LOW' as const }
      const identityResult          = checkEntityIdentity(detectedIdentity, entity, confirmEntityUnverified)
      if (!identityResult.ok) {
        const status = 409
        return jsonUtf8({
          error:    identityResult.error,
          message:  identityResult.message,
          detected: identityResult.detected,
          entity:   identityResult.entity,
        }, { status })
      }

      // ─── A1: Tespit edilen kimlik numarasını entity'ye yaz (sadece taxNumber NULL ise) ───
      // VKN (10 hane) veya TCKN (11 hane) — mevcut değeri EZME, idempotent
      const detId = (detectedIdentity as { taxNumber?: string | null; tcKimlik?: string | null }).taxNumber
                 ?? (detectedIdentity as { taxNumber?: string | null; tcKimlik?: string | null }).tcKimlik
      if (detId && (detId.length === 10 || detId.length === 11) && !entity.taxNumber) {
        await prisma.entity.update({
          where: { id: entityId },
          data:  { taxNumber: detId },
        })
      }
    }

    // PREFLIGHT 3 — DUPLICATE SOURCE CHECK
    // existing.source === incomingSource → 409 (aynı kaynaktan üst üste)
    // existing.source === 'MIXED'        → 409 (MIXED üzerine tek kaynak yazılmaz)
    // farklı source VE MIXED değil       → conflict YOK → MIXED merge (L~356) devam eder
    const overwriteConfirmed = formData.get('overwrite') === 'true'
    const incomingSource     = isExcel ? 'EXCEL' : isCsv ? 'CSV' : 'PDF'
    if (!overwriteConfirmed) {
      const { conflicts } = await checkDuplicates(
        prisma,
        entityId,
        parsedRows
          .filter((row): row is typeof row & { year: number } => typeof row.year === 'number')
          .map(row => ({ year: row.year, period: (row.period as string) ?? 'ANNUAL' })),
        incomingSource as 'EXCEL' | 'CSV' | 'PDF',
      )
      if (conflicts.length > 0) {
        return jsonUtf8({
          error:    'DUPLICATE_DATA',
          message:  UPLOAD_ERRORS.DUPLICATE_DATA(conflicts.length),
          conflicts,
        }, { status: 409 })
      }
    }

    const results = []
    const skippedRows: Array<{ index: number; reason: string; year?: number; period?: string; meta?: unknown }> = []
    const parseWarnings = new Set<string>()

    parsedRows.forEach((row, index) => {
      row.meta?.parseWarnings.forEach(w => parseWarnings.add(w))
      row.meta?.reverseBalanceWarnings.forEach(w => parseWarnings.add(w))
      if (!row.year) {
        skippedRows.push({
          index,
          reason: 'Row year bulunamadığı için işlenemedi',
          period: row.period,
          meta: row.meta,
        })
      }
    })

    if (parseWarnings.size > 0) {
      console.warn('[upload] parse warnings', {
        fileName: file.name,
        warningCount: parseWarnings.size,
        firstWarnings: Array.from(parseWarnings).slice(0, 10),
      })
    }

    for (const [index, row] of parsedRows.entries()) {
      if (!row.year) continue

      const source = incomingSource
      const period = (row.period as string) ?? 'ANNUAL'
      const docType = (row.docType ?? 'UNKNOWN') as string

      // Eksik toplamları otomatik hesapla
      const f = row.fields
      // Parser'ın bizzat sağladığı alanları sakla — merge sırasında sadece bunlar DB'yi ezebilir.
      // docType bazlı filtre: MIZAN → sadece bilanço alanları; BEYANNAME → sadece gelir tablosu;
      // ANNUAL+BEYANNAME → tüm alanlar; UNKNOWN → hiçbiri.
      const allParserProvidedKeys = new Set(Object.keys(f).filter(k => f[k] != null))
      const parserProvidedKeys: Set<string> =
        (period === 'ANNUAL' && docType === 'BEYANNAME')
          ? allParserProvidedKeys
          : docType === 'MIZAN'
            ? new Set([...allParserProvidedKeys].filter(k => BALANCE_SHEET_FIELDS.has(k)))
            : docType === 'BEYANNAME'
              ? new Set([...allParserProvidedKeys].filter(k => INCOME_STATEMENT_FIELDS.has(k)))
              : new Set<string>()
      const n = (v: unknown) => (v != null && !isNaN(Number(v)) ? Number(v) : null)

      // Dönen sub-item çift sayım koruması:
      // Bazı KVB PDF'lerinde "Stoklar ve Yıllara Yaygın" birleşik satırı hem inventory hem
      // constructionCosts olarak okunabilir. Bu durumda parser totalCurrentAssets'i de
      // yanlış (çift sayımlı) okuyabilir. Daha güvenilir referans: totalAssets - totalNonCurrentAssets.
      if (f.inventory != null && f.constructionCosts != null) {
        const dSum = (n(f.cash) ?? 0) + (n(f.shortTermInvestments) ?? 0) +
          (n(f.tradeReceivables) ?? 0) + (n(f.otherReceivables) ?? 0) +
          (n(f.inventory) ?? 0) + (n(f.constructionCosts) ?? 0) +
          (n(f.prepaidExpenses) ?? 0) + (n(f.prepaidSuppliers) ?? 0) + (n(f.otherCurrentAssets) ?? 0)
        // Önce totalAssets - totalNonCurrentAssets'i dene (daha güvenilir); yoksa totalCurrentAssets
        const impliedCurrent =
          (n(f.totalAssets) != null && n(f.totalNonCurrentAssets) != null)
            ? Number(f.totalAssets) - Number(f.totalNonCurrentAssets)
            : n(f.totalCurrentAssets)
        if (impliedCurrent != null && impliedCurrent > 0) {
          const excess = dSum - impliedCurrent
          // Eğer fazlalık constructionCosts'a eşitse → inventory içinde zaten var
          if (excess > 0 && Math.abs(excess - Number(f.constructionCosts)) < impliedCurrent * 0.03) {
            f.constructionCosts = null
            // totalCurrentAssets'i de düzelt (parser yanlış okuduysa)
            f.totalCurrentAssets = impliedCurrent
          }
        }
      }

      if (f.totalCurrentAssets == null) {
        const nums = [
          n(f.cash),
          n(f.shortTermInvestments),
          n(f.tradeReceivables),
          n(f.otherReceivables),
          n(f.inventory),
          n(f.constructionCosts),
          n(f.prepaidExpenses),
          n(f.prepaidSuppliers),
          n(f.otherCurrentAssets),
        ].filter((x): x is number => x != null)
        const sum = nums.reduce((a, b) => a + b, 0)
        if (nums.length > 0) f.totalCurrentAssets = sum
      }
      if (f.totalNonCurrentAssets == null) {
        const nums = [
          n(f.longTermTradeReceivables),
          n(f.longTermOtherReceivables),
          n(f.longTermInvestments),
          n(f.tangibleAssets),
          n(f.intangibleAssets),
          n(f.depletableAssets),
          n(f.longTermPrepaidExpenses),
          n(f.otherNonCurrentAssets),
        ].filter((x): x is number => x != null)
        const sum = nums.reduce((a, b) => a + b, 0)
        if (nums.length > 0) f.totalNonCurrentAssets = sum
      }
      if (f.totalAssets == null) {
        const ca = n(f.totalCurrentAssets), nca = n(f.totalNonCurrentAssets)
        if (ca != null && nca != null) f.totalAssets = ca + nca
        else if (ca != null && nca == null) f.totalAssets = ca
        else if (ca == null && nca != null) f.totalAssets = nca
      }
      if (f.totalCurrentLiabilities == null) {
        const nums = [
          n(f.shortTermFinancialDebt),
          n(f.tradePayables),
          n(f.otherShortTermPayables),
          n(f.advancesReceived),
          n(f.constructionProgress),
          n(f.taxPayables),
          n(f.shortTermProvisions),
          n(f.deferredRevenue),
          n(f.otherCurrentLiabilities),
        ].filter((x): x is number => x != null)
        const sum = nums.reduce((a, b) => a + b, 0)
        if (nums.length > 0) f.totalCurrentLiabilities = sum
      }
      if (f.totalNonCurrentLiabilities == null) {
        const nums = [
          n(f.longTermFinancialDebt),
          n(f.longTermTradePayables),
          n(f.longTermOtherPayables),
          n(f.longTermAdvancesReceived),
          n(f.longTermProvisions),
          n(f.otherNonCurrentLiabilities),
        ].filter((x): x is number => x != null)
        const sum = nums.reduce((a, b) => a + b, 0)
        if (nums.length > 0) f.totalNonCurrentLiabilities = sum
      }
      // paidInCapital olmadan hesaplama — PDF tek başına netProfitCurrentYear getirirse
      // yanlış totalEquity üretip DB'deki mizan değerini ezmemeli
      if (f.totalEquity == null && f.paidInCapital != null) {
        const retainedLosses = n(f.retainedLosses)
        const nums = [
          n(f.paidInCapital),
          n(f.capitalReserves),
          n(f.profitReserves),
          n(f.retainedEarnings),
          n(f.netProfitCurrentYear ?? f.netProfit),
          retainedLosses != null ? -Math.abs(retainedLosses) : null,
        ].filter((x): x is number => x != null)
        const sum = nums.reduce((a, b) => a + b, 0)
        if (nums.length > 0) f.totalEquity = sum
      }
      if (f.totalEquity == null && f.totalAssets != null && f.totalCurrentLiabilities != null) {
        const assetVal = n(f.totalAssets)
        const clVal    = n(f.totalCurrentLiabilities)
        const ncl      = n(f.totalNonCurrentLiabilities) ?? 0
        if (assetVal != null && clVal != null) f.totalEquity = assetVal - clVal - ncl
      }
      if (f.totalLiabilitiesAndEquity == null) {
        const cl = n(f.totalCurrentLiabilities), ncl = n(f.totalNonCurrentLiabilities), eq = n(f.totalEquity)
        if (cl != null || ncl != null || eq != null)
          f.totalLiabilitiesAndEquity = (cl ?? 0) + (ncl ?? 0) + (eq ?? 0)
      }
      if (f.revenue == null && f.grossSales != null && f.salesDiscounts != null) {
        const grossSales = n(f.grossSales)
        const salesDiscounts = n(f.salesDiscounts)
        if (grossSales != null && salesDiscounts != null) f.revenue = grossSales - salesDiscounts
      }
      if (f.grossProfit == null && f.revenue != null && f.cogs != null) {
        const rev  = n(f.revenue)
        const cogs = n(f.cogs)
        if (rev != null && cogs != null) f.grossProfit = rev - cogs
      }
      if (f.ebit == null && f.grossProfit != null && f.operatingExpenses != null) {
        const gp = n(f.grossProfit)
        const op = n(f.operatingExpenses)
        if (gp != null && op != null) f.ebit = gp - op
      }
      if (f.ebt == null && f.ebit != null) {
        const ebit = n(f.ebit)
        if (ebit != null) {
          f.ebt =
            ebit +
            (n(f.otherIncome) ?? 0) -
            (n(f.otherExpense) ?? 0) -
            (n(f.interestExpense) ?? 0) +
            (n(f.extraordinaryIncome) ?? 0) -
            (n(f.extraordinaryExpense) ?? 0)
        }
      }
      if (f.ebitda == null && f.ebit != null) {
        f.ebitda = n(f.ebit) // depreciation yoksa ebit = ebitda yaklaşımı
      }
      // netProfit: önce netProfitCurrentYear (590 hesabı / mizan), sonra ebt-taxExpense
      if (f.netProfit == null) {
        if (f.netProfitCurrentYear != null) {
          f.netProfit = n(f.netProfitCurrentYear)
        } else if (f.ebt != null && f.taxExpense != null) {
          const ebtVal = n(f.ebt), taxVal = n(f.taxExpense)
          if (ebtVal != null && taxVal != null) f.netProfit = ebtVal - taxVal
        } else if (f.ebt != null) {
          f.netProfit = n(f.ebt) // vergi bilinmiyorsa ebt ≈ netProfit
        }
      }
      // netProfitCurrentYear (bilanço 59) yoksa netProfit ile eşitle — eski yanlış kayıtların üstüne yazar
      if (f.netProfitCurrentYear == null && f.netProfit != null) {
        f.netProfitCurrentYear = n(f.netProfit)
      }

      // docType bazlı alan temizliği — hem yeni kayıt oluşturma hem de merge için geçerli:
      // MIZAN → sadece bilanço alanları; Q+BEYANNAME → sadece gelir tablosu alanları.
      // Auto-calc türetilmiş alanlar bu temizlik SONRASINDA gerçek katkı sağlıyorsa korunur.
      if (docType === 'MIZAN') {
        for (const k of Object.keys(f)) {
          if (!BALANCE_SHEET_FIELDS.has(k)) (f as Record<string, unknown>)[k] = null
        }
      } else if (docType === 'BEYANNAME' && period !== 'ANNUAL') {
        for (const k of Object.keys(f)) {
          if (!INCOME_STATEMENT_FIELDS.has(k)) (f as Record<string, unknown>)[k] = null
        }
      }

      // Mevcut kaydı bul: varsa yeni verilerle merge et (null olan alanları koru)
      const existing = await prisma.financialData.findUnique({
        where: { entityId_year_period: { entityId, year: row.year, period } },
      })
      const nextSource = existing && existing.source !== source ? 'MIXED' : source
      // PDF parse bazı belgelerde sparse gelebilir; bu durumda mevcut bilanço alanlarını silmeyelim.
      // Sadece yeterince geniş alan seti gelirse full-replace uygula.
      const parsedFieldCount = Object.keys(row.fields ?? {}).length
      const shouldReplace = isPdf && parsedFieldCount >= 25
        && !(docType === 'BEYANNAME' && period !== 'ANNUAL')
      const mergedFields = existing
        ? shouldReplace
          ? Object.fromEntries(
              Object.entries(existing as Record<string, unknown>)
                .filter(([k]) => !(k in { id:1, entityId:1, year:1, period:1, source:1, fileName:1, createdAt:1, updatedAt:1 }))
                .map(([k]) => [k, (row.fields as Record<string, unknown>)[k] ?? null])
            )
          : Object.fromEntries(
              Object.entries({ ...(existing as Record<string, unknown>), ...row.fields })
                .filter(([k]) => !(k in { id:1, entityId:1, year:1, period:1, source:1, fileName:1, createdAt:1, updatedAt:1 }))
                .map(([k, v]) => {
                  // Sadece parser'ın bizzat sağladığı değerler DB'yi ezebilir.
                  // Auto-calc'ın hesapladığı değerler (örn. totalEquity) mevcut kaydı ezmez.
                  const newVal = parserProvidedKeys.has(k)
                    ? (row.fields as Record<string, unknown>)[k]
                    : null
                  return [k, newVal != null ? newVal : v]
                })
            )
        : row.fields

      if (existing) {
        console.info('[upload] merge strategy', {
          year: row.year,
          period,
          source,
          shouldReplace,
          parsedFieldCount,
        })
      }

      // Merge sonrası totalEquity yeniden hesapla:
      // paidInCapital ve netProfitCurrentYear (veya netProfit) hazırsa her zaman doğru sonuç üret.
      // Bu, mizan'da hesap 59 olmasa bile beyanname sonrası doğru equity'yi garantiler.
      {
        const mf = mergedFields as Record<string, number | null>
        const nm = (v: unknown) => (v != null && !isNaN(Number(v)) ? Number(v) : null)
        const mfPaid = nm(mf.paidInCapital)
        const mfNP   = nm(mf.netProfitCurrentYear ?? mf.netProfit)
        if (mfPaid != null && mfNP != null) {
          const rl = nm(mf.retainedLosses)
          const equityComponents = [
            mfPaid,
            nm(mf.capitalReserves),
            nm(mf.profitReserves),
            nm(mf.retainedEarnings),
            mfNP,
            rl != null ? -Math.abs(rl) : null,
          ].filter((x): x is number => x != null)
          mf.totalEquity = equityComponents.reduce((a, b) => a + b, 0)
          // totalLiabilitiesAndEquity da güncelle
          const cl  = nm(mf.totalCurrentLiabilities)
          const ncl = nm(mf.totalNonCurrentLiabilities)
          if (cl != null || ncl != null)
            mf.totalLiabilitiesAndEquity = (cl ?? 0) + (ncl ?? 0) + mf.totalEquity
        }
      }

      const financialData = await prisma.financialData.upsert({
        where: { entityId_year_period: { entityId, year: row.year, period } },
        update: { ...mergedFields, source: nextSource, fileName: file.name, updatedAt: new Date() },
        create: { entityId, year: row.year, period, source: nextSource, fileName: file.name, ...mergedFields },
      })

      const parseWarningsJson = row.meta?.parseWarnings ? JSON.stringify(row.meta.parseWarnings) : null
      const unmappedJson = row.unmapped?.length ? JSON.stringify(row.unmapped) : null
      const uploadId = crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO "financial_data_uploads"
          ("id", "entityId", "financialDataId", "year", "period", "source", "fileName", "parsedFieldCount", "unmapped", "parseWarnings", "createdAt")
        VALUES
          (${uploadId}, ${entityId}, ${financialData.id}, ${row.year}, ${period}, ${source}, ${file.name}, ${Object.keys(row.fields ?? {}).length}, ${unmappedJson}, ${parseWarningsJson}, NOW())
      `

      // Önceki yıl verisini sorgula (büyüme + dönem ortalamaları için)
      const prevYearData = await prisma.financialData.findFirst({
        where: { entityId, year: row.year - 1, period },
        select: { revenue: true, inventory: true, tradeReceivables: true, tradePayables: true, advancesReceived: true },
      })
      const ppiRate = TURKEY_PPI[row.year] ?? TURKEY_PPI[2024]
      const enrichedFields = {
        ...mergedFields,
        sector:               entity.sector,
        prevRevenue:          prevYearData?.revenue          ?? null,
        prevInventory:        prevYearData?.inventory        ?? null,
        prevTradeReceivables: prevYearData?.tradeReceivables ?? null,
        prevTradePayables:    prevYearData?.tradePayables    ?? null,
        prevAdvancesReceived: prevYearData?.advancesReceived ?? null,
        ppiRate,
      }

      const ratios = calculateRatios(enrichedFields)
      const score  = calculateScore(ratios, entity.sector)
      const optimizerSnapshot = createOptimizerSnapshot(ratios, score.finalScore, entity.sector)

      const analysis = await prisma.analysis.upsert({
        where: { entityId_year_period: { entityId, year: row.year, period } },
        update: {
          financialDataId:    financialData.id,
          finalScore:         score.finalScore,
          finalRating:        score.finalRating,
          liquidityScore:     score.liquidityScore,
          profitabilityScore: score.profitabilityScore,
          leverageScore:      score.leverageScore,
          activityScore:      score.activityScore,
          ratios:             JSON.stringify({ ...ratios, __overallCoverage: score.overallCoverage ?? null }),
          optimizerSnapshot:  JSON.stringify(optimizerSnapshot),
          updatedAt:          new Date(),
        },
        create: {
          userId,
          entityId,
          financialDataId:    financialData.id,
          year:               row.year,
          period:             period,
          mode:               'SOLO',
          finalScore:         score.finalScore,
          finalRating:        score.finalRating,
          liquidityScore:     score.liquidityScore,
          profitabilityScore: score.profitabilityScore,
          leverageScore:      score.leverageScore,
          activityScore:      score.activityScore,
          ratios:             JSON.stringify({ ...ratios, __overallCoverage: score.overallCoverage ?? null }),
          optimizerSnapshot:  JSON.stringify(optimizerSnapshot),
        },
      })

      // Ham hesap kodu verisi varsa FinancialAccount tablosuna kaydet
      // period + docType bazlı merge: BEYANNAME ve mizan birbirini EZMESİN
      if (row.rawAccounts && row.rawAccounts.length > 0) {
        // Audit trail — ters bakiye reklasifikasyonları logla
        if (row.reversals && row.reversals.length > 0) {
          console.log(`[upload] Analiz ${analysis.id} için ${row.reversals.length} ters bakiye reklasifiye edildi`)
          for (const r of row.reversals) {
            console.log(`  ${r.originalCode} → ${r.reclassifiedCode} (${r.amount.toLocaleString('tr-TR')} TL)`)
          }
        }

        if (period === 'ANNUAL' && docType === 'BEYANNAME') {
          // Yıllık beyanname: tek kaynak olduğu için tüm hesaplar yazılır
          await prisma.financialAccount.deleteMany({ where: { analysisId: analysis.id } })
          await prisma.financialAccount.createMany({
            data: row.rawAccounts.map(a => ({
              analysisId:  analysis.id,
              accountCode: a.code,
              accountName: '',
              amount:      a.amount,
            })),
            skipDuplicates: true,
          })
        } else if (docType === 'MIZAN') {
          // Mizan (Excel veya PDF): sadece bilanço hesapları (1xx-5xx)
          // 6xx gelir tablosu hesapları korunur (beyanname tarafından yazılmış olabilir)
          await prisma.financialAccount.deleteMany({
            where: {
              analysisId: analysis.id,
              OR: [
                { accountCode: { startsWith: '1' } },
                { accountCode: { startsWith: '2' } },
                { accountCode: { startsWith: '3' } },
                { accountCode: { startsWith: '4' } },
                { accountCode: { startsWith: '5' } },
              ],
            },
          })
          const balanceAccounts = row.rawAccounts.filter(a =>
            ['1', '2', '3', '4', '5'].some(p => a.code.startsWith(p))
          )
          if (balanceAccounts.length > 0) {
            await prisma.financialAccount.createMany({
              data: balanceAccounts.map(a => ({
                analysisId:  analysis.id,
                accountCode: a.code,
                accountName: '',
                amount:      a.amount,
              })),
              skipDuplicates: true,
            })
          }
        } else if (docType === 'BEYANNAME') {
          // Geçici beyanname (Q dönemi): sadece gelir tablosu hesapları (6xx)
          // 1xx-5xx bilanço hesapları korunur (mizan tarafından yazılmış olabilir)
          await prisma.financialAccount.deleteMany({
            where: {
              analysisId:  analysis.id,
              accountCode: { startsWith: '6' },
            },
          })
          const incomeAccounts = row.rawAccounts.filter(a => a.code.startsWith('6'))
          if (incomeAccounts.length > 0) {
            await prisma.financialAccount.createMany({
              data: incomeAccounts.map(a => ({
                analysisId:  analysis.id,
                accountCode: a.code,
                accountName: '',
                amount:      a.amount,
              })),
              skipDuplicates: true,
            })
          }
        } else {
          // UNKNOWN docType — defansif: mevcut kayıtlara dokunma
          console.warn('[upload] unknown docType, skipping rawAccounts write', {
            analysisId: analysis.id,
            rawAccountsCount: row.rawAccounts.length,
          })
        }

        console.info('[upload] financialAccounts saved', {
          analysisId: analysis.id,
          year: row.year,
          period,
          docType,
          count: row.rawAccounts.length,
        })
      }

      // Faz 7.3.50A: yearMismatch kaldırıldı — artık PREFLIGHT 2'de 422 bloklayıcı
      results.push({
        index,
        year:     row.year,
        period:   row.period,
        rating:   score.finalRating,
        score:    score.finalScore,
        unmapped: row.unmapped,
        meta:     row.meta,
      })
    }

    if (results.length === 0) {
      return jsonUtf8({
        error: 'Excel satırları parse edildi ancak işlenebilir yıl/dönem bilgisi üretilemedi.',
        parseSummary: {
          parsedRows: parsedRows.length,
          processedRows: 0,
          skippedRows: skippedRows.length,
          skippedDetails: skippedRows,
          parseWarnings: Array.from(parseWarnings),
        },
      }, { status: 400 })
    }

    // === Faz 7.3.60.1: roadmapSnapshot invalidation (financialAccounts yazımı bittikten sonra) ===
    await prisma.analysis.updateMany({
      where: {
        entityId,
        userId,
        roadmapSnapshot: { not: null },
      },
      data: { roadmapSnapshot: null },
    })

    return jsonUtf8({
      imported: results.length,
      results,
      parseSummary: {
        parsedRows: parsedRows.length,
        processedRows: results.length,
        skippedRows: skippedRows.length,
        skippedDetails: skippedRows,
        parseWarnings: Array.from(parseWarnings),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const correlationId = crypto.randomUUID()
    console.error('[upload] error:', { correlationId, error: msg })
    return jsonUtf8({ error: 'Dosya işlenirken hata oluştu.', correlationId }, { status: 500 })
  }
}
