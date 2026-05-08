/**
 * uploadValidation.test.ts — validateYearPeriodMatch + checkDuplicates + checkDetectionMissing testleri (Faz 7.3.50A / 7.3.50A.1)
 *
 * validateYearPeriodMatch: saf fonksiyon, DB bağımlısı yok
 * checkDuplicates: prisma injectable → mock prisma ile test edilir
 * checkDetectionMissing: saf fonksiyon, DB bağımlısı yok (Faz 7.3.50A.1)
 */

import { validateYearPeriodMatch, checkDuplicates, checkDetectionMissing } from './uploadValidation'

// ─── validateYearPeriodMatch ──────────────────────────────────────────────────

describe('validateYearPeriodMatch', () => {

  test('YEAR_MISMATCH: formYear ≠ detectedYear → ok:false, error:YEAR_MISMATCH', () => {
    const result = validateYearPeriodMatch(
      { year: 2023, period: 'ANNUAL' },
      { year: 2024, period: 'ANNUAL' },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('YEAR_MISMATCH')
    expect(result.detected?.year).toBe(2023)
    expect(result.form?.year).toBe(2024)
    expect(typeof result.message).toBe('string')
    expect(result.message!.length).toBeGreaterThan(0)
  })

  test('PERIOD_MISMATCH: formPeriod ≠ detectedPeriod → ok:false, error:PERIOD_MISMATCH', () => {
    const result = validateYearPeriodMatch(
      { year: 2024, period: 'Q1' },
      { year: 2024, period: 'Q3' },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('PERIOD_MISMATCH')
  })

  test('Year önce kontrol: year + period farklı → YEAR_MISMATCH (period değil)', () => {
    const result = validateYearPeriodMatch(
      { year: 2023, period: 'Q1' },
      { year: 2024, period: 'Q3' },
    )
    expect(result.error).toBe('YEAR_MISMATCH')
  })

  test('detectedYear null + formYear var → ok:true (form fallback geçer)', () => {
    const result = validateYearPeriodMatch(
      { year: null, period: null },
      { year: 2024, period: 'ANNUAL' },
    )
    expect(result.ok).toBe(true)
  })

  test('detectedYear var + formYear null → ok:true (form yoksa mismatch yok)', () => {
    const result = validateYearPeriodMatch(
      { year: 2024, period: 'ANNUAL' },
      {},
    )
    expect(result.ok).toBe(true)
  })

  test('skipFormValidation: true → ok:true (multi-year Excel istisnası)', () => {
    const result = validateYearPeriodMatch(
      { year: 2023, period: 'ANNUAL' },
      { year: 2024, period: 'ANNUAL' },
      { skipFormValidation: true },
    )
    expect(result.ok).toBe(true)
  })

  test('Her ikisi de null → ok:true', () => {
    const result = validateYearPeriodMatch({}, {})
    expect(result.ok).toBe(true)
  })
})

// ─── checkDuplicates ──────────────────────────────────────────────────────────

describe('checkDuplicates', () => {

  function makePrisma(source: string | null) {
    return {
      financialData: {
        findUnique: jest.fn(() =>
          Promise.resolve(source ? { source, updatedAt: new Date('2025-01-15') } : null),
        ),
      },
    }
  }

  test('existing null → conflict yok', async () => {
    const prisma = makePrisma(null)
    const { conflicts } = await checkDuplicates(prisma, 'e1', [{ year: 2024, period: 'ANNUAL' }], 'EXCEL')
    expect(conflicts).toHaveLength(0)
  })

  test('T8 — existing EXCEL + incoming EXCEL → conflict (aynı kaynak)', async () => {
    const prisma = makePrisma('EXCEL')
    const { conflicts } = await checkDuplicates(prisma, 'e1', [{ year: 2024, period: 'ANNUAL' }], 'EXCEL')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].existingSource).toBe('EXCEL')
    expect(conflicts[0].incomingSource).toBe('EXCEL')
    expect(conflicts[0].year).toBe(2024)
    expect(conflicts[0].period).toBe('ANNUAL')
  })

  test('T9 — existing MIXED + incoming PDF → conflict (MIXED üzerine yazılamaz)', async () => {
    const prisma = makePrisma('MIXED')
    const { conflicts } = await checkDuplicates(prisma, 'e1', [{ year: 2024, period: 'ANNUAL' }], 'PDF')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].existingSource).toBe('MIXED')
    expect(conflicts[0].incomingSource).toBe('PDF')
  })

  test('T7 — existing EXCEL + incoming PDF → conflict YOK (MIXED merge devam)', async () => {
    const prisma = makePrisma('EXCEL')
    const { conflicts } = await checkDuplicates(prisma, 'e1', [{ year: 2024, period: 'ANNUAL' }], 'PDF')
    expect(conflicts).toHaveLength(0)
  })

  test('existing CSV + incoming EXCEL → conflict YOK (farklı kaynak, MIXED merge)', async () => {
    const prisma = makePrisma('CSV')
    const { conflicts } = await checkDuplicates(prisma, 'e1', [{ year: 2024, period: 'ANNUAL' }], 'EXCEL')
    expect(conflicts).toHaveLength(0)
  })

  test('Birden fazla satır: karma sonuç — yalnızca same-source conflict sayılır', async () => {
    let callCount = 0
    const prisma = {
      financialData: {
        findUnique: jest.fn(() => {
          callCount++
          if (callCount === 1) return Promise.resolve({ source: 'EXCEL', updatedAt: new Date() })  // same → conflict
          if (callCount === 2) return Promise.resolve({ source: 'PDF',   updatedAt: new Date() })  // different → no conflict
          return Promise.resolve(null)
        }),
      },
    }
    const rows = [
      { year: 2023, period: 'ANNUAL' },
      { year: 2024, period: 'ANNUAL' },
    ]
    const { conflicts } = await checkDuplicates(prisma as never, 'e1', rows, 'EXCEL')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].year).toBe(2023)
  })

  test('existingUploadDate alanı conflict içinde yer alır', async () => {
    const date = new Date('2025-03-10')
    const prisma = {
      financialData: {
        findUnique: jest.fn(() => Promise.resolve({ source: 'EXCEL', updatedAt: date })),
      },
    }
    const { conflicts } = await checkDuplicates(prisma as never, 'e1', [{ year: 2024, period: 'ANNUAL' }], 'EXCEL')
    expect(conflicts[0].existingUploadDate).toEqual(date)
  })
})

// ─── checkDetectionMissing ────────────────────────────────────────────────────

describe('checkDetectionMissing (Faz 7.3.50A.1)', () => {

  test('detectedYear null + formYear var + confirmed=false → ok:false, DETECTED_YEAR_MISSING_CONFIRM', () => {
    const result = checkDetectionMissing(
      { year: null, period: null },
      { year: 2024, period: 'ANNUAL' },
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('DETECTED_YEAR_MISSING_CONFIRM')
    expect(typeof result.message).toBe('string')
    expect(result.message!.length).toBeGreaterThan(0)
    expect(result.message).toContain('2024')
    expect(result.detected?.year).toBeNull()
    expect(result.form?.year).toBe(2024)
  })

  test('detectedYear null + formYear var + confirmed=true → ok:true (bypass)', () => {
    const result = checkDetectionMissing(
      { year: null, period: null },
      { year: 2024, period: 'ANNUAL' },
      true,
    )
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  test('detectedYear null + formYear null → ok:true (PREFLIGHT 1 sorumluluğu)', () => {
    const result = checkDetectionMissing(
      { year: null },
      { year: null },
      false,
    )
    expect(result.ok).toBe(true)
  })

  test('detectedYear var + formYear var → ok:true (yıl tespit edildi, onay gerekmez)', () => {
    const result = checkDetectionMissing(
      { year: 2024, period: 'ANNUAL' },
      { year: 2024, period: 'ANNUAL' },
      false,
    )
    expect(result.ok).toBe(true)
  })

  test('detectedYear var + formYear farklı → ok:true (PREFLIGHT 2 sorumluluğu)', () => {
    const result = checkDetectionMissing(
      { year: 2023, period: 'ANNUAL' },
      { year: 2024, period: 'ANNUAL' },
      false,
    )
    expect(result.ok).toBe(true)
  })

  test('detected.period form.period ile birlikte döner', () => {
    const result = checkDetectionMissing(
      { year: null, period: 'Q3' },
      { year: 2024, period: 'ANNUAL' },
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.detected?.period).toBe('Q3')
    expect(result.form?.period).toBe('ANNUAL')
  })
})
