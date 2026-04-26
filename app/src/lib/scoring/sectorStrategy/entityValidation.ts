/**
 * ENTITY VALIDATION — Minimum guardrail (Faz 5.0)
 *
 * Multi-scenario generator (Faz 5.1) entity okuyacak. Eksik veya tutarsız
 * girdi → kötü senaryo → kullanıcı güveni kaybı. Bu minimum guardrail
 * Faz 5.1'i bloke etmez, sadece hard fail ve skip kararları verir.
 *
 * Kapsam:
 *   Hard fail → motor çalışamaz (sector eksik, revenue=0, totalAssets=0)
 *   Soft warning → aksiyon skip edilir (gerekli alan eksik)
 *
 * KAPSAM DIŞI (Faz 6+ tam validation katmanı):
 *   - Oran tutarlılığı (totalCurrentAssets < cash)
 *   - Sektör-spesifik veri kalitesi
 *   - Cross-field coherence
 *
 * KULLANIM DİSİPLİNİ:
 *   Faz 5.1 motoru bu katmanı CHECK olarak kullanır.
 *   Validation iç içe geçmez, motor mantığına karışmaz.
 *
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #8)
 * Ref: docs/PHASE_5_DECISIONS.md
 */

import type { FinancialInput } from '../ratios'
import type { ActionId } from '../scoreImpactProfile'
import { mapSectorStringToId } from './sectorIdMap'

export const VALIDATION_STRATEGY_VERSION = '5.0-2026-04-26'

export type ValidationSeverity = 'fatal' | 'warning'

export interface ValidationIssue {
  severity:        ValidationSeverity
  field?:          string
  message:         string
  affectedActions?: ActionId[]
}

export interface ValidationResult {
  valid:       boolean          // false → hard fail, motor çalışmamalı
  errors:      ValidationIssue[]
  warnings:    ValidationIssue[]
  skipActions: ActionId[]       // bu aksiyonlar senaryoya dahil edilmemeli
}

/**
 * Aksiyon başına minimum gerekli alan haritası.
 * Faz 2 actionEffects.ts'teki gerçek alan erişimine göre (alan adları FinancialInput ile eşleşir).
 *
 * NOT: `revenue` ve `totalAssets` global hard fail kapsamında zaten kontrol edilir,
 * burada tekrar kontrol edilmez. Sadece aksiyon-spesifik alanlar listelenir.
 *
 * A06: cogs opsiyonel (applyA06 revenue'ya fallback yapar) — sadece inventory zorunlu
 * A10: totalCurrentLiabilities opsiyonel (action conditional ile çalışır)
 * A12: totalAssets opsiyonel (action conditional ile çalışır)
 */
const ACTION_REQUIREMENTS: Record<ActionId, (keyof FinancialInput)[]> = {
  A05: ['tradeReceivables'],           // AR→nakit; revenue global kapsamda
  A06: ['inventory'],                  // DIO; cogs fallback revenue'ya (global kapsamda)
  A10: ['shortTermFinancialDebt'],     // KV borç; totalCurrentLiabilities conditional
  A12: ['totalEquity'],                // özkaynak artışı; totalAssets conditional
  A18: ['grossProfit'],               // marj; revenue global kapsamda
}

// ─── GLOBAL VALIDATION ────────────────────────────────────────────────────────

/**
 * Entity motor için geçerli mi? Hard fail + aksiyon skip kararları.
 *
 * @param entity FinancialInput tipinde entity (JS nesnesi olarak alınır, tip güvenli kontrol yapılır)
 * @returns ValidationResult — valid=false ise motor çalışmamalı
 */
export function validateEntityForScenarioGeneration(entity: Partial<FinancialInput> | null | undefined): ValidationResult {
  const errors:   ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  const skipActions = new Set<ActionId>()

  // ── 1. Sector zorunlu ────────────────────────────────────────────────────
  if (!entity?.sector || typeof entity.sector !== 'string' || !entity.sector.trim()) {
    errors.push({
      severity: 'fatal',
      field:    'sector',
      message:  'sector zorunlu, eksik veya boş — skor motoru sektörsüz çalışamaz',
    })
  } else {
    const sectorId = mapSectorStringToId(entity.sector)
    if (!sectorId) {
      warnings.push({
        severity: 'warning',
        field:    'sector',
        message:  `Bilinmeyen sektör: '${entity.sector}'. Global default eşikler kullanılacak.`,
      })
    }
  }

  // ── 2. revenue zorunlu ve > 0 ────────────────────────────────────────────
  if (typeof entity?.revenue !== 'number' || entity.revenue <= 0) {
    errors.push({
      severity: 'fatal',
      field:    'revenue',
      message:  'revenue zorunlu ve 0\'dan büyük olmalı — oran hesapları imkansız',
    })
  }

  // ── 3. totalAssets zorunlu ve > 0 ────────────────────────────────────────
  if (typeof entity?.totalAssets !== 'number' || entity.totalAssets <= 0) {
    errors.push({
      severity: 'fatal',
      field:    'totalAssets',
      message:  'totalAssets zorunlu ve 0\'dan büyük olmalı — varlık bazlı oranlar imkansız',
    })
  }

  // ── 4. Aksiyon başına minimum alan kontrolü (skip kararı) ─────────────────
  for (const [actionId, requiredFields] of Object.entries(ACTION_REQUIREMENTS) as [ActionId, (keyof FinancialInput)[]][]) {
    const missing = requiredFields.filter(
      f => entity?.[f] === undefined || entity?.[f] === null
    )
    if (missing.length > 0) {
      warnings.push({
        severity:       'warning',
        message:        `${actionId} için gerekli alanlar eksik: ${missing.join(', ')}. Bu aksiyon senaryoya dahil edilmeyecek.`,
        affectedActions: [actionId],
      })
      skipActions.add(actionId)
    }
  }

  return {
    valid:       errors.length === 0,
    errors,
    warnings,
    skipActions: Array.from(skipActions),
  }
}

// ─── AKSIYON BAŞINA KONTROL ───────────────────────────────────────────────────

/**
 * Tek aksiyon için entity uygunluğu.
 * Faz 5.1 motoru her aksiyon adayında bu fonksiyonu çağırır.
 *
 * @returns true → aksiyon uygulanabilir, false → skip
 */
export function validateEntityForAction(
  entity:   Partial<FinancialInput> | null | undefined,
  actionId: ActionId,
): boolean {
  const required = ACTION_REQUIREMENTS[actionId]
  if (!required) return false
  return required.every(f => entity?.[f] !== undefined && entity?.[f] !== null)
}

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

/**
 * Hard fail durumunda kullanıcıya gösterilecek mesaj.
 * valid=true ise boş string döner.
 */
export function summarizeFatalErrors(result: ValidationResult): string {
  if (result.valid) return ''
  return result.errors
    .map(e => `❌ ${e.field ?? 'genel'}: ${e.message}`)
    .join('\n')
}
