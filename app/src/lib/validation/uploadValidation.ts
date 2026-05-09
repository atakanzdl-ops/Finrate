/**
 * uploadValidation.ts — Upload veri bütünlüğü validation yardımcıları (Faz 7.3.50A / 7.3.50A.1 / 7.3.50A.3)
 *
 * validateYearPeriodMatch:  parser tespiti ile form değerini karşılaştır
 * checkDuplicates:          source bazlı duplicate kontrolü (MIXED merge koruması)
 * checkDetectionMissing:    parser yıl tespit edemediyse onay iste (soft warning)
 * checkEntityIdentity:      firma kimlik doğrulama (VKN match, soft/hard senaryolar)
 * fuzzyTitleMatch:          Türkçe unvan benzerlik eşlemesi
 */

import { UPLOAD_ERRORS } from '@/lib/i18n/uploadErrors'
import type { ParsedIdentity } from '@/lib/parsers/excel'

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

// ─── Entity Identity (Faz 7.3.50A.3) ────────────────────────────────────────

export type EntityIdentityError =
  | 'ENTITY_TAX_NUMBER_MISMATCH'
  | 'ENTITY_TAX_UNVERIFIED_CONFIRM'
  | 'ENTITY_TC_UNVERIFIED_CONFIRM'
  | 'ENTITY_TITLE_MISMATCH_CONFIRM'
  | 'ENTITY_UNVERIFIED_CONFIRM'

export interface EntityIdentityResult {
  ok:        boolean
  error?:    EntityIdentityError
  detected?: { taxNumber?: string | null; tcKimlik?: string | null; title?: string | null }
  entity?:   { name?: string | null; taxNumber?: string | null }
  message?:  string
}

// ─── Fuzzy helpers ────────────────────────────────────────────────────────────

/** Türkçe → ASCII, küçük harf (pdf.ts norm kalıbında) */
function normFuzzy(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/[şŞ]/g, 's')
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[âÂ]/g, 'a')
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/** Şirket tipi takıları kaldır (norm edilmiş metin üzerinde) */
const CORP_RE = /(ltd\.?\s*sti\.?|limited\s*sirketi?|anonim\s*sirketi?|a\.s\.?|\bsirketi\b|\blimited\b|\banonim\b)/g

/**
 * Türkçe unvan benzerlik eşlemesi.
 *
 * 1. normFuzzy + şirket tipi takı temizleme
 * 2. Tam eşleşme veya token contains (%80 overlap)
 * 3. Levenshtein ≥ %80
 */
export function fuzzyTitleMatch(a: string, b: string): boolean {
  const clean = (s: string) =>
    normFuzzy(s).replace(CORP_RE, '').replace(/\s+/g, ' ').trim()

  const ca = clean(a)
  const cb = clean(b)

  if (!ca && !cb) return true
  if (!ca || !cb) return false
  if (ca === cb) return true
  if (ca.includes(cb) || cb.includes(ca)) return true

  // Levenshtein %80+
  const longer  = ca.length >= cb.length ? ca : cb
  const shorter = ca.length >= cb.length ? cb : ca
  const dist    = levenshtein(longer, shorter)
  return (longer.length - dist) / longer.length >= 0.8
}

/**
 * Dosyada bulunan kimlik ile sistemdeki entity'yi karşılaştırır.
 *
 * ÖNCELİK 0 — VKN match → her zaman identity OK (TC/unvan farkı IGNORE).
 * CASE 1 HARD  — VKN var + entity VKN var + farklı → 422
 * CASE 2 SOFT  — VKN var + entity VKN yok          → 409
 * CASE 3 SOFT  — VKN yok + TC var                  → 409
 * CASE 4 SOFT  — Sadece unvan, fuzzy mismatch       → 409
 * CASE 5 SOFT  — Hiç metadata (LOW)                → 409
 *
 * confirmed=true → CASE 1 hariç tüm soft senaryolar bypass edilir.
 */
export function checkEntityIdentity(
  detected:  ParsedIdentity,
  entity:    { name?: string | null; taxNumber?: string | null },
  confirmed: boolean,
): EntityIdentityResult {
  // ÖNCELİK 0: VKN tam eşleşme → identity OK, soft kontroller ATLANIR
  const vknMatch =
    detected.taxNumber && entity.taxNumber &&
    detected.taxNumber === entity.taxNumber
  if (vknMatch) return { ok: true }

  // CASE 1 HARD — VKN mismatch
  if (detected.taxNumber && entity.taxNumber && detected.taxNumber !== entity.taxNumber) {
    return {
      ok:       false,
      error:    'ENTITY_TAX_NUMBER_MISMATCH',
      message:  UPLOAD_ERRORS.ENTITY_TAX_NUMBER_MISMATCH(
        detected.title ?? detected.taxNumber,
        entity.name ?? '',
      ),
      detected: { taxNumber: detected.taxNumber, tcKimlik: detected.tcKimlik, title: detected.title },
      entity:   { name: entity.name, taxNumber: entity.taxNumber },
    }
  }

  if (confirmed) return { ok: true }

  // CASE 2 SOFT — VKN var, entity VKN yok
  if (detected.taxNumber && !entity.taxNumber) {
    return {
      ok:       false,
      error:    'ENTITY_TAX_UNVERIFIED_CONFIRM',
      message:  UPLOAD_ERRORS.ENTITY_TAX_UNVERIFIED_CONFIRM(detected.taxNumber, entity.name ?? ''),
      detected: { taxNumber: detected.taxNumber, title: detected.title },
      entity:   { name: entity.name, taxNumber: null },
    }
  }

  // CASE 3 SOFT — VKN yok, TC var
  if (!detected.taxNumber && detected.tcKimlik) {
    return {
      ok:       false,
      error:    'ENTITY_TC_UNVERIFIED_CONFIRM',
      message:  UPLOAD_ERRORS.ENTITY_TC_UNVERIFIED_CONFIRM(entity.name ?? ''),
      detected: { tcKimlik: detected.tcKimlik, title: detected.title },
      entity:   { name: entity.name },
    }
  }

  // CASE 4 SOFT — Sadece unvan, fuzzy mismatch
  if (!detected.taxNumber && !detected.tcKimlik && detected.title && entity.name) {
    const matched = fuzzyTitleMatch(detected.title, entity.name)
    if (!matched) {
      return {
        ok:       false,
        error:    'ENTITY_TITLE_MISMATCH_CONFIRM',
        message:  UPLOAD_ERRORS.ENTITY_TITLE_MISMATCH_CONFIRM(detected.title, entity.name),
        detected: { title: detected.title },
        entity:   { name: entity.name },
      }
    }
  }

  // CASE 5 SOFT — Hiç metadata (LOW confidence)
  if (detected.sourceConfidence === 'LOW') {
    return {
      ok:       false,
      error:    'ENTITY_UNVERIFIED_CONFIRM',
      message:  UPLOAD_ERRORS.ENTITY_UNVERIFIED_CONFIRM(entity.name ?? ''),
      entity:   { name: entity.name },
    }
  }

  return { ok: true }
}
