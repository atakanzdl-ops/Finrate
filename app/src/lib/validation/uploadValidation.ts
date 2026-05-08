/**
 * uploadValidation.ts — Upload veri bütünlüğü validation yardımcıları (Faz 7.3.50A / 7.3.50A.1)
 *
 * validateYearPeriodMatch:  parser tespiti ile form değerini karşılaştır
 * checkDuplicates:          source bazlı duplicate kontrolü (MIXED merge koruması)
 * checkDetectionMissing:    parser yıl tespit edemediyse onay iste (soft warning)
 */

import { UPLOAD_ERRORS } from '@/lib/i18n/uploadErrors'

// ─── ValidationResult ─────────────────────────────────────────────────────────

export interface ValidationResult {
  ok:        boolean
  error?:    'YEAR_MISMATCH' | 'PERIOD_MISMATCH' | 'MISSING_YEAR_CONTEXT'
  detected?: { year?: number | null; period?: string | null }
  form?:     { year?: number; period?: string }
  message?:  string
}

/**
 * Parser tespiti ile form değerini karşılaştır.
 *
 * - Her ikisi de varsa ve farklıysa → hata (ok: false).
 * - Parser tespit edemediyse (null/undefined) → form değeri fallback → ok: true.
 * - skipFormValidation: multi-year Excel istisnasında PREFLIGHT 2 atlanır.
 */
export function validateYearPeriodMatch(
  detected: { year?: number | null; period?: string | null },
  form:     { year?: number; period?: string },
  options:  { skipFormValidation?: boolean } = {},
): ValidationResult {
  if (options.skipFormValidation) return { ok: true }

  if (form.year && detected.year && form.year !== detected.year) {
    return {
      ok:       false,
      error:    'YEAR_MISMATCH',
      message:  UPLOAD_ERRORS.YEAR_MISMATCH(detected.year, form.year),
      detected,
      form,
    }
  }

  if (form.period && detected.period && form.period !== detected.period) {
    return {
      ok:       false,
      error:    'PERIOD_MISMATCH',
      message:  UPLOAD_ERRORS.PERIOD_MISMATCH(detected.period, form.period),
      detected,
      form,
    }
  }

  return { ok: true }
}

// ─── DuplicateConflict ────────────────────────────────────────────────────────

export interface DuplicateConflict {
  year:               number
  period:             string
  existingSource:     'EXCEL' | 'CSV' | 'PDF' | 'MIXED'
  incomingSource:     'EXCEL' | 'CSV' | 'PDF'
  existingUploadDate: Date
}

/**
 * Source bazlı duplicate kontrolü.
 *
 * KURAL:
 *   existing.source === incomingSource → conflict (aynı kaynaktan üst üste yükleme)
 *   existing.source === 'MIXED'        → conflict (MIXED üzerine tek kaynak yazılmaz)
 *   diğer (örn. EXCEL vs PDF)          → conflict YOK → MIXED merge akışı devam eder
 *
 * @param prisma         Prisma client (injectable for testing)
 * @param entityId       Şirket ID
 * @param rows           Kontrol edilecek year/period çiftleri
 * @param incomingSource Yüklenen dosyanın kaynağı
 */
export async function checkDuplicates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma:          any,
  entityId:        string,
  rows:            Array<{ year: number; period: string }>,
  incomingSource:  'EXCEL' | 'CSV' | 'PDF',
): Promise<{ conflicts: DuplicateConflict[] }> {
  const conflicts: DuplicateConflict[] = []

  for (const row of rows) {
    const existing = await prisma.financialData.findUnique({
      where: { entityId_year_period: { entityId, year: row.year, period: row.period } },
    })

    if (existing) {
      const isSameSource   = existing.source === incomingSource
      const isAlreadyMixed = existing.source === 'MIXED'

      if (isSameSource || isAlreadyMixed) {
        conflicts.push({
          year:               row.year,
          period:             row.period,
          existingSource:     existing.source as DuplicateConflict['existingSource'],
          incomingSource,
          existingUploadDate: existing.updatedAt,
        })
      }
      // Farklı source VE MIXED değil → conflict YOK → MIXED merge (route.ts L356) devam eder
    }
  }

  return { conflicts }
}

// ─── DetectionMissingResult ───────────────────────────────────────────────────

export interface DetectionMissingResult {
  ok:        boolean
  error?:    'DETECTED_YEAR_MISSING_CONFIRM'
  detected?: { year: null; period?: string | null }
  form?:     { year: number; period?: string | null }
  message?:  string
}

/**
 * Parser yıl tespit edemediyse (detectedYear null) ve form yılı varsa → onay iste.
 *
 * KURAL:
 *   confirmed=true                        → ok: true (bypass)
 *   detected.year == null && form.year    → ok: false, 409 soft warning
 *   detected.year != null                 → ok: true (parser tespit etti, onay gerekmez)
 *
 * @param detected  Parser'ın tespit ettiği year/period (null ise tespit yok)
 * @param form      Formdan gelen year/period
 * @param confirmed confirmDetectionMissing=true ise bypass
 */
export function checkDetectionMissing(
  detected:  { year?: number | null; period?: string | null },
  form:      { year?: number | null; period?: string | null },
  confirmed: boolean,
): DetectionMissingResult {
  if (confirmed) return { ok: true }

  if (detected.year == null && form.year != null) {
    return {
      ok:       false,
      error:    'DETECTED_YEAR_MISSING_CONFIRM',
      message:  UPLOAD_ERRORS.DETECTED_YEAR_MISSING_CONFIRM(form.year),
      detected: { year: null, period: detected.period ?? null },
      form:     { year: form.year, period: form.period ?? null },
    }
  }

  return { ok: true }
}
