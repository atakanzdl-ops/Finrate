'use client'

/**
 * RatingValidationCard (Faz 7.3.8b)
 *
 * V3 tahmin rating ile gerçek score.ts hesabını karşılaştırır.
 * Backend'den gelen actualRatingValidation objesi ile beslenir.
 *
 * 3 durum:
 *   1. ledgerApplied=false  → kırmızı, skor bastırılır
 *   2. isEstimateConfirmed  → turkuaz, olumlu
 *   3. !isEstimateConfirmed → amber, tutarsızlık uyarısı
 */

import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import type { ActualRatingValidation } from '@/lib/scoring/scenarioV3/postActionRating'

// ─── Yardımcı (test edilebilir export) ───────────────────────────────────────

export type ValidationCase = 'ledger_failed' | 'confirmed' | 'not_confirmed'

export function getValidationCase(v: ActualRatingValidation): ValidationCase {
  if (!v.ledgerApplied) return 'ledger_failed'
  if (v.isEstimateConfirmed) return 'confirmed'
  return 'not_confirmed'
}

export function formatScore(score: number): string {
  return score.toFixed(2)
}

export function formatScoreInt(score: number): string {
  return Math.round(score).toString()
}

export function showSubjectiveNote(subjectiveTotal: number): boolean {
  return subjectiveTotal === 0
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  validation: ActualRatingValidation
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export function RatingValidationCard({ validation: v }: Props) {
  const kase = getValidationCase(v)

  // ── CASE 1: Yevmiye uygulanamadı ─────────────────────────────────────────
  if (kase === 'ledger_failed') {
    return (
      <div
        className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4"
        style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
      >
        <div className="flex items-start gap-3">
          <XCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <h4
              className="font-semibold text-[#0B3C5D] text-sm"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Gerçek Skor Doğrulanamadı
            </h4>
            <p className="text-sm text-[#64748B] mt-1">
              Yevmiyeler uygulanamadı; gerçek hesap güvenilir değil.
            </p>
            {v.warnings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {v.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-red-700 flex items-start gap-1">
                    <span className="mt-0.5">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── CASE 2: Tahmin doğrulandı ─────────────────────────────────────────────
  if (kase === 'confirmed') {
    return (
      <div
        className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4"
        style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-[#2EC4B6] shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <h4
              className="font-semibold text-[#0B3C5D] text-sm"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Rating Doğrulandı
            </h4>

            {/* Blok A — Rating */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-md p-3 border border-teal-100">
                <p className="text-xs font-medium text-[#5A7A96] mb-1">V3 Tahmini</p>
                <p className="text-sm font-semibold text-[#0B3C5D]">
                  {v.currentActualRating} → {v.v3EstimatedRating}
                </p>
              </div>
              <div className="bg-white rounded-md p-3 border border-teal-100">
                <p className="text-xs font-medium text-[#2EC4B6] mb-1">Gerçek Hesap</p>
                <p className="text-sm font-semibold text-[#0B3C5D]">
                  {v.currentActualRating} → {v.postActualRating}
                </p>
              </div>
            </div>

            {/* Blok B — Skor detayı */}
            <div className="mt-3 bg-white rounded-md p-3 border border-teal-100 space-y-1">
              <ScoreLine
                label="Objektif"
                from={formatScore(v.currentObjectiveScore)}
                to={formatScore(v.postObjectiveScore)}
              />
              <div className="flex justify-between text-xs text-[#64748B]">
                <span>Subjektif (sabit)</span>
                <span className="font-medium text-[#1E293B]">{v.subjectiveTotal}</span>
              </div>
              <ScoreLine
                label="Birleşik"
                from={formatScoreInt(v.currentCombinedScore)}
                to={formatScoreInt(v.postCombinedScore)}
              />
            </div>

            {/* Blok C — Olumlu mesaj */}
            <p className="mt-3 text-xs text-teal-700">
              V3 tahmini gerçek hesapla uyumlu.
            </p>

            {showSubjectiveNote(v.subjectiveTotal) && (
              <SubjectiveNote />
            )}

            <WarningsList warnings={v.warnings} />
          </div>
        </div>
      </div>
    )
  }

  // ── CASE 3: Tutarsızlık (DEKAM senaryosu) ────────────────────────────────
  return (
    <div
      className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4"
      style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
        <div className="flex-1">
          <h4
            className="font-semibold text-[#0B3C5D] text-sm"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            V3 Tahmini ve Gerçek Hesap Karşılaştırması
          </h4>

          {/* Blok A — Rating karşılaştırma (2 sütun) */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-md p-3 border border-amber-100">
              <p className="text-xs font-medium text-[#5A7A96] mb-1">V3 Tahmini</p>
              <p className="text-sm font-semibold text-[#0B3C5D]">
                {v.currentActualRating} → {v.v3EstimatedRating}
              </p>
            </div>
            <div className="bg-white rounded-md p-3 border border-amber-100">
              <p className="text-xs font-medium text-[#2EC4B6] mb-1">Gerçek Hesap</p>
              <p className="text-sm font-semibold text-[#0B3C5D]">
                {v.currentActualRating} → {v.postActualRating}
              </p>
            </div>
          </div>

          {/* Blok B — Skor detayı */}
          <div className="mt-3 bg-white rounded-md p-3 border border-amber-100 space-y-1">
            <ScoreLine
              label="Objektif"
              from={formatScore(v.currentObjectiveScore)}
              to={formatScore(v.postObjectiveScore)}
            />
            <div className="flex justify-between text-xs text-[#64748B]">
              <span>Subjektif (sabit)</span>
              <span className="font-medium text-[#1E293B]">{v.subjectiveTotal}</span>
            </div>
            <ScoreLine
              label="Birleşik"
              from={formatScoreInt(v.currentCombinedScore)}
              to={formatScoreInt(v.postCombinedScore)}
            />
          </div>

          {/* Blok C — Tutarsızlık uyarısı */}
          <div className="mt-3 bg-amber-100 rounded-md p-3 flex gap-2">
            <Info className="text-amber-700 shrink-0 mt-0.5" size={14} />
            <p className="text-xs text-amber-800">
              V3 tahmini ile gerçek skor hesabı arasında fark var.
              Karar için gerçek skor hesabı esas alınmalıdır.
            </p>
          </div>

          {showSubjectiveNote(v.subjectiveTotal) && (
            <SubjectiveNote />
          )}

          <WarningsList warnings={v.warnings} />
        </div>
      </div>
    </div>
  )
}

// ─── Alt bileşenler ───────────────────────────────────────────────────────────

function ScoreLine({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="flex justify-between text-xs text-[#64748B]">
      <span>{label}</span>
      <span className="font-medium text-[#1E293B]">
        {from} → {to}
      </span>
    </div>
  )
}

function SubjectiveNote() {
  return (
    <p className="mt-2 text-xs text-[#5A7A96] italic">
      Subjektif değerlendirme bulunmadığı için bu hesapta 0 kabul edildi.
    </p>
  )
}

function WarningsList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="mt-3 border-t border-amber-200 pt-3">
      <p className="text-xs font-medium text-[#64748B] mb-1">Yevmiye sırasında uyarılar:</p>
      <ul className="space-y-1">
        {warnings.map((w, i) => (
          <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
            <span className="mt-0.5">•</span>
            <span>{w}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
