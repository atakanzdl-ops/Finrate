/**
 * uploadValidation.test.ts — validateYearPeriodMatch + checkDuplicates + checkDetectionMissing testleri (Faz 7.3.50A / 7.3.50A.1)
 *
 * validateYearPeriodMatch: saf fonksiyon, DB bağımlısı yok
 * checkDuplicates: prisma injectable → mock prisma ile test edilir
 * checkDetectionMissing: saf fonksiyon, DB bağımlısı yok (Faz 7.3.50A.1)
 */

import { validateYearPeriodMatch, checkDuplicates, checkDetectionMissing, checkEntityIdentity, fuzzyTitleMatch } from './uploadValidation'

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

// ─── checkEntityIdentity (Faz 7.3.50A.3) ─────────────────────────────────────

describe('checkEntityIdentity (Faz 7.3.50A.3)', () => {

  const entity = { name: 'Test Firması', taxNumber: null as string | null }
  const entityWithVkn = { name: 'Test Firması', taxNumber: '1234567890' }

  // T20 — ÖNCELİK 0: VKN tam eşleşme → ok:true (soft kontroller atlanır)
  test('T20 — VKN match → ok:true, soft checks skipped', () => {
    const result = checkEntityIdentity(
      { taxNumber: '1234567890', sourceConfidence: 'LOW' }, // LOW olsa da
      { name: 'Farklı Firma', taxNumber: '1234567890' },    // ama VKN eşleşiyor
      false,
    )
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  // T20a — CASE 1 HARD: VKN mismatch → 422 ENTITY_TAX_NUMBER_MISMATCH
  test('T20a — VKN mismatch → ok:false, ENTITY_TAX_NUMBER_MISMATCH (HARD)', () => {
    const result = checkEntityIdentity(
      { taxNumber: '1234567890', sourceConfidence: 'HIGH' },
      entityWithVkn,
      false,
    )
    // entityWithVkn.taxNumber === '1234567890' → eşleşme! Fark oluşturmak için farklı VKN
    const resultMismatch = checkEntityIdentity(
      { taxNumber: '9999999999', sourceConfidence: 'HIGH' },
      entityWithVkn,
      false,
    )
    expect(resultMismatch.ok).toBe(false)
    expect(resultMismatch.error).toBe('ENTITY_TAX_NUMBER_MISMATCH')
    expect(typeof resultMismatch.message).toBe('string')
    expect(resultMismatch.message!.length).toBeGreaterThan(0)
  })

  // T20b — CASE 1 HARD bypass impossible: confirmed=true hala 422
  test('T20b — VKN mismatch + confirmed=true → still ok:false (HARD, no bypass)', () => {
    const result = checkEntityIdentity(
      { taxNumber: '9999999999', sourceConfidence: 'HIGH' },
      entityWithVkn,
      true,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ENTITY_TAX_NUMBER_MISMATCH')
  })

  // T21 — CASE 2 SOFT: VKN var + entity VKN yok → ENTITY_TAX_UNVERIFIED_CONFIRM
  test('T21 — VKN detected + entity.taxNumber null → ENTITY_TAX_UNVERIFIED_CONFIRM', () => {
    const result = checkEntityIdentity(
      { taxNumber: '1234567890', sourceConfidence: 'HIGH' },
      entity,
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ENTITY_TAX_UNVERIFIED_CONFIRM')
    expect(result.detected?.taxNumber).toBe('1234567890')
    expect(result.entity?.name).toBe('Test Firması')
  })

  // T21a — CASE 2 bypass: confirmed=true → ok:true
  test('T21a — CASE 2 + confirmed=true → ok:true', () => {
    const result = checkEntityIdentity(
      { taxNumber: '1234567890', sourceConfidence: 'HIGH' },
      entity,
      true,
    )
    expect(result.ok).toBe(true)
  })

  // T21b — CASE 3 SOFT: TC var → ENTITY_TC_UNVERIFIED_CONFIRM
  test('T21b — TC kimlik detected, no VKN → ENTITY_TC_UNVERIFIED_CONFIRM', () => {
    const result = checkEntityIdentity(
      { tcKimlik: '12345678901', sourceConfidence: 'MEDIUM' },
      entity,
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ENTITY_TC_UNVERIFIED_CONFIRM')
    expect(result.detected?.tcKimlik).toBe('12345678901')
  })

  // T22 — CASE 4 SOFT: Unvan fuzzy mismatch → ENTITY_TITLE_MISMATCH_CONFIRM
  test('T22 — title fuzzy mismatch → ENTITY_TITLE_MISMATCH_CONFIRM', () => {
    const result = checkEntityIdentity(
      { title: 'Farklı Şirket A.Ş.', sourceConfidence: 'MEDIUM' },
      { name: 'Test Firması', taxNumber: null },
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ENTITY_TITLE_MISMATCH_CONFIRM')
    expect(result.detected?.title).toBe('Farklı Şirket A.Ş.')
    expect(result.entity?.name).toBe('Test Firması')
  })

  // T22a — CASE 4 PASS: Unvan fuzzy eşleşme → ok
  test('T22a — title fuzzy match (suffix normalization) → ok:true', () => {
    const result = checkEntityIdentity(
      { title: 'Test Firması Ltd. Şti.', sourceConfidence: 'MEDIUM' },
      { name: 'Test Firması', taxNumber: null },
      false,
    )
    expect(result.ok).toBe(true)
  })

  // T23 — CASE 5 SOFT: LOW confidence → ENTITY_UNVERIFIED_CONFIRM
  test('T23 — sourceConfidence=LOW → ENTITY_UNVERIFIED_CONFIRM', () => {
    const result = checkEntityIdentity(
      { sourceConfidence: 'LOW' },
      entity,
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ENTITY_UNVERIFIED_CONFIRM')
    expect(result.entity?.name).toBe('Test Firması')
  })

  // T23a — CASE 5 bypass: confirmed=true → ok:true
  test('T23a — CASE 5 + confirmed=true → ok:true', () => {
    const result = checkEntityIdentity(
      { sourceConfidence: 'LOW' },
      entity,
      true,
    )
    expect(result.ok).toBe(true)
  })

  // ─── Faz 7.3.50A.3.4 — mirror-aware testleri ─────────────────────────────

  // T_VAL1 — ENES senaryosu: TC=VKN match → sessiz ok:true (modal çıkmaz)
  test('T_VAL1 — ENES: detected.tcKimlik === entity.taxNumber → ok:true (TC=VKN match)', () => {
    const result = checkEntityIdentity(
      { tcKimlik: '35356829180', title: 'ATLI ENES', sourceConfidence: 'HIGH' },
      { name: 'enes', taxNumber: '35356829180' },
      false,
    )
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  // T_VAL2 — TC mismatch hard: detected.tcKimlik !== entity.taxNumber → ENTITY_TAX_NUMBER_MISMATCH
  test('T_VAL2 — TC mismatch hard → ok:false, ENTITY_TAX_NUMBER_MISMATCH', () => {
    const result = checkEntityIdentity(
      { tcKimlik: '11111111111', sourceConfidence: 'HIGH' },
      { name: 'Test Firması', taxNumber: '35356829180' },
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ENTITY_TAX_NUMBER_MISMATCH')
  })

  // T_VAL3 — DEKAM VKN match regresyon
  test('T_VAL3 — DEKAM: VKN match korundu → ok:true', () => {
    const result = checkEntityIdentity(
      { taxNumber: '2731120400', sourceConfidence: 'HIGH' },
      { name: 'DEKAM YAPI', taxNumber: '2731120400' },
      false,
    )
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  // T_VAL4 — T21b regresyon: entity.taxNumber null + TC detected → TC_UNVERIFIED korunur
  test('T_VAL4 — TC detected + entity.taxNumber null → ENTITY_TC_UNVERIFIED_CONFIRM (regresyon)', () => {
    const result = checkEntityIdentity(
      { tcKimlik: '35356829180', sourceConfidence: 'MEDIUM' },
      { name: 'Test Firması', taxNumber: null },
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ENTITY_TC_UNVERIFIED_CONFIRM')
  })

  // T_VAL5 — edge: entity 10 hane sermaye + detected TC 11 hane farklı → hard block
  test('T_VAL5 — entity VKN 10 hane + detected TC 11 hane farklı → hard ENTITY_TAX_NUMBER_MISMATCH', () => {
    const result = checkEntityIdentity(
      { tcKimlik: '35356829180', sourceConfidence: 'HIGH' },
      { name: 'Baska Sirket', taxNumber: '2731120400' },
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ENTITY_TAX_NUMBER_MISMATCH')
  })

  // T_VAL6 — VKN mismatch regresyon
  test('T_VAL6 — VKN mismatch regresyon korundu → ok:false, ENTITY_TAX_NUMBER_MISMATCH', () => {
    const result = checkEntityIdentity(
      { taxNumber: '1234567890', sourceConfidence: 'HIGH' },
      { name: 'Test Firması', taxNumber: '2731120400' },
      false,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ENTITY_TAX_NUMBER_MISMATCH')
  })

  // T_VAL7 — defansif: detected.taxNumber + tcKimlik her ikisi de entity.taxNumber ile match → ok:true (CASE 0 yakalar)
  test('T_VAL7 — defansif: taxNumber + tcKimlik her ikisi dolu, VKN match → ok:true', () => {
    const result = checkEntityIdentity(
      { taxNumber: '35356829180', tcKimlik: '35356829180', sourceConfidence: 'HIGH' },
      { name: 'ATLI ENES', taxNumber: '35356829180' },
      false,
    )
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })
})

// ─── fuzzyTitleMatch (Faz 7.3.50A.3) ─────────────────────────────────────────

describe('fuzzyTitleMatch (Faz 7.3.50A.3)', () => {

  test('Tam eşleşme → true', () => {
    expect(fuzzyTitleMatch('Test Firması', 'Test Firması')).toBe(true)
  })

  test('Türkçe normaliz → eşleşme', () => {
    expect(fuzzyTitleMatch('DEKAM LTD. ŞTİ.', 'Dekam Limited Şirketi')).toBe(true)
  })

  test('Token contains → true', () => {
    expect(fuzzyTitleMatch('Test Firması A.Ş.', 'Test')).toBe(true)
  })

  test('Levenshtein ≥80% → true', () => {
    // "testfirmasi" vs "testfirması" (1 char diff) → >80%
    expect(fuzzyTitleMatch('testfirmasi', 'testfirması')).toBe(true)
  })

  test('Tamamen farklı → false', () => {
    expect(fuzzyTitleMatch('Alfa Şirketi', 'Beta Holding')).toBe(false)
  })

  test('Her ikisi boş → true', () => {
    expect(fuzzyTitleMatch('', '')).toBe(true)
  })

  test('A.Ş. suffix temizleme', () => {
    // "Dekam A.Ş." → "dekam", "Dekam" → "dekam" → eşleşme
    expect(fuzzyTitleMatch('Dekam A.Ş.', 'Dekam')).toBe(true)
  })
})
