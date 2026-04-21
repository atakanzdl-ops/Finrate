'use client'

/**
 * ScenarioPanel — Hedef nota ulaşmak için iteratif senaryo analizi
 *
 * Props:
 *   analysisId?  — solo analiz için
 *   groupId?     — grup analizi için
 *   currentScore — mevcut skor (grup için gerekli, solo için API'den alınır)
 *   currentGrade — mevcut not (dropdown seçeneklerini belirler)
 */

import React, { useState } from 'react'
import {
  Loader2, ChevronDown, ChevronUp,
  Target, ArrowRight, CheckCircle2, AlertCircle,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScenarioAction {
  actionId:    string
  label:       string
  description: string
  amountTL:    number
  scoreDelta:  number
  difficulty:  'easy' | 'medium' | 'hard' | 'very_hard'
  timeHorizon: 'short' | 'medium' | 'long'
  howTo:       string
  ratioBefore: Record<string, number | null>
  ratioAfter:  Record<string, number | null>
}

interface ScenarioResult {
  horizon:         'short' | 'medium' | 'long'
  horizonLabel:    string
  targetGrade:     string
  actions:         ScenarioAction[]
  scoreBefore:     number
  scoreAfter:      number
  gradeBefore:     string
  gradeAfter:      string
  totalTLMovement: number
  goalReached:     boolean
}

export interface ScenarioPanelProps {
  analysisId?:   string
  groupId?:      string
  currentScore?: number
  currentGrade:  string
}

// ─── Sabitler ────────────────────────────────────────────────────────────────

const RATING_ORDER = ['C', 'CC', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA']

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Kolay', medium: 'Orta', hard: 'Zor', very_hard: 'Çok Zor',
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '#10B981', medium: '#F59E0B', hard: '#EF4444', very_hard: '#7C3AED',
}

const HORIZON_CARD_TITLE: Record<string, string> = {
  short:  'Acil Müdahale',
  medium: 'Yapısal İyileştirme',
  long:   'Stratejik Dönüşüm',
}

const HORIZON_SUBTITLE: Record<string, string> = {
  short:  '0–3 Ay',
  medium: '3–12 Ay',
  long:   '1–3 Yıl',
}

const RATIO_LABELS: Record<string, string> = {
  currentRatio:     'Cari Oran',
  quickRatio:       'Asit-Test',
  interestCoverage: 'Faiz Karş.',
  netProfitMargin:  'Net Kâr Marjı',
  grossMargin:      'Brüt Marj',
  equityRatio:      'Özkaynak Oranı',
  debtToEquity:     'D/E',
  debtToEbitda:     'Borç/EBITDA',
  roa:              'ROA',
  roe:              'ROE',
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function fmt(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return `₺${(v / 1_000_000_000).toFixed(1)} Mrd`
  if (abs >= 1_000_000)     return `₺${(v / 1_000_000).toFixed(1)} M`
  if (abs >= 1_000)         return `₺${(v / 1_000).toFixed(0)} B`
  return `₺${v.toFixed(0)}`
}

function fmtRatio(v: number | null | undefined): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs < 10)  return v.toFixed(2)
  if (abs < 100) return v.toFixed(1)
  return v.toFixed(0)
}

function gradeColor(g: string): string {
  if (['AAA', 'AA', 'A'].includes(g))  return '#10B981'
  if (['BBB', 'BB'].includes(g))        return '#F59E0B'
  if (['B', 'CCC'].includes(g))         return '#EF4444'
  return '#7C3AED'
}

function getTargetOptions(currentGrade: string): string[] {
  const idx = RATING_ORDER.indexOf(currentGrade)
  const opts: string[] = []
  if (idx !== -1 && idx + 1 < RATING_ORDER.length) opts.push(RATING_ORDER[idx + 1])
  if (idx !== -1 && idx + 2 < RATING_ORDER.length) opts.push(RATING_ORDER[idx + 2])
  return opts
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export default function ScenarioPanel({
  analysisId,
  groupId,
  currentScore: csProp,
  currentGrade,
}: ScenarioPanelProps) {
  const targetOptions = getTargetOptions(currentGrade)

  const [targetGrade,    setTargetGrade]    = useState<string>(targetOptions[0] ?? '')
  const [loading,        setLoading]        = useState(false)
  const [scenarios,      setScenarios]      = useState<ScenarioResult[] | null>(null)
  const [resolvedScore,  setResolvedScore]  = useState<number>(csProp ?? 0)
  const [resolvedGrade,  setResolvedGrade]  = useState<string>(currentGrade)
  const [expandedCard,   setExpandedCard]   = useState<number | null>(null)
  const [expandedAction, setExpandedAction] = useState<number | null>(null)
  const [error,          setError]          = useState<string | null>(null)

  if (targetOptions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <p style={{ fontSize: 13, color: '#94A3B8' }}>
          AAA notuna ulaşıldı — daha yüksek hedef mevcut değil.
        </p>
      </div>
    )
  }

  async function handleCalculate() {
    if (!targetGrade) return
    setLoading(true)
    setScenarios(null)
    setError(null)
    setExpandedCard(null)
    setExpandedAction(null)

    try {
      const body: Record<string, unknown> = { targetGrade }
      if (analysisId)          body.analysisId   = analysisId
      if (groupId)             body.groupId      = groupId
      if (groupId && csProp != null) body.currentScore = csProp

      const res  = await fetch('/api/scenarios', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Hata oluştu.'); return }

      setScenarios(data.scenarios)
      setResolvedScore(data.currentScore)
      setResolvedGrade(data.currentGrade)
    } catch {
      setError('Bağlantı hatası oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const selectedScenario = expandedCard !== null ? scenarios?.[expandedCard] ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Hedef Not Seçici ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <div className="card-head-left">
            <h4 className="card-title">Hedef Not Belirle</h4>
            <p className="card-desc">Hangi nota ulaşmak istiyorsunuz?</p>
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>

          {/* Mevcut not */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>Mevcut Not:</span>
            <span style={{
              padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: 14,
              background: gradeColor(currentGrade) + '18', color: gradeColor(currentGrade),
            }}>
              {currentGrade}
            </span>
          </div>

          <ArrowRight size={14} style={{ color: '#CBD5E1', flexShrink: 0 }} />

          {/* Hedef seçenekleri */}
          <div style={{ display: 'flex', gap: 8 }}>
            {targetOptions.map(g => (
              <button
                key={g}
                onClick={() => setTargetGrade(g)}
                style={{
                  padding: '6px 16px', borderRadius: 8,
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  transition: 'all 0.15s',
                  border:     targetGrade === g ? `2px solid ${gradeColor(g)}` : '2px solid #E5E9F0',
                  background: targetGrade === g ? gradeColor(g) + '15' : '#fff',
                  color:      targetGrade === g ? gradeColor(g) : '#64748B',
                }}
              >
                {g} Hedefle
              </button>
            ))}
          </div>

          {/* Hesapla */}
          <button
            onClick={handleCalculate}
            disabled={loading || !targetGrade}
            className="btn-gradient"
            style={{
              marginLeft: 'auto', padding: '8px 20px', borderRadius: 8,
              fontWeight: 600, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <Target size={14} />
            }
            {loading ? 'Hesaplanıyor...' : 'Hesapla'}
          </button>
        </div>

        {error && (
          <div style={{ padding: '0 24px 16px' }}>
            <p style={{ fontSize: 13, color: '#EF4444' }}>{error}</p>
          </div>
        )}
      </div>

      {/* ── Yükleniyor ────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 10, padding: '40px 0',
        }}>
          <Loader2 size={28} style={{ color: '#0B3C5D', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 13, color: '#64748B' }}>Senaryo hesaplanıyor...</p>
        </div>
      )}

      {/* ── 3 Senaryo Kartı ───────────────────────────────────────────────── */}
      {scenarios && !loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {scenarios.map((sc, i) => (
              <button
                key={sc.horizon}
                onClick={() => {
                  setExpandedCard(expandedCard === i ? null : i)
                  setExpandedAction(null)
                }}
                style={{
                  background:   '#fff',
                  border:       expandedCard === i ? '2px solid #0B3C5D' : '1px solid #E5E9F0',
                  borderRadius: 12,
                  padding:      '20px',
                  textAlign:    'left',
                  cursor:       'pointer',
                  transition:   'all 0.2s',
                  boxShadow:    expandedCard === i
                    ? '0 4px 20px rgba(11,60,93,0.12)'
                    : '0 1px 2px rgba(10,30,60,0.05)',
                }}
              >
                {/* Başlık */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: 15, color: '#0B3C5D', fontFamily: 'Outfit, sans-serif', marginBottom: 2 }}>
                      {HORIZON_CARD_TITLE[sc.horizon]}
                    </p>
                    <p style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>
                      {HORIZON_SUBTITLE[sc.horizon]}
                    </p>
                  </div>
                  {expandedCard === i
                    ? <ChevronUp   size={16} style={{ color: '#0B3C5D',  flexShrink: 0 }} />
                    : <ChevronDown size={16} style={{ color: '#94A3B8', flexShrink: 0 }} />
                  }
                </div>

                {/* Skor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', fontFamily: 'Outfit, sans-serif' }}>
                    {sc.scoreBefore.toFixed(1)}
                  </span>
                  <ArrowRight size={13} style={{ color: '#CBD5E1' }} />
                  <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: gradeColor(sc.gradeAfter) }}>
                    {sc.scoreAfter.toFixed(1)}
                  </span>
                </div>

                {/* Not badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 5, fontWeight: 700, fontSize: 12,
                    background: gradeColor(sc.gradeBefore) + '18', color: gradeColor(sc.gradeBefore),
                  }}>
                    {sc.gradeBefore}
                  </span>
                  <ArrowRight size={10} style={{ color: '#CBD5E1' }} />
                  <span style={{
                    padding: '2px 8px', borderRadius: 5, fontWeight: 700, fontSize: 12,
                    background: gradeColor(sc.gradeAfter) + '18', color: gradeColor(sc.gradeAfter),
                  }}>
                    {sc.gradeAfter}
                  </span>
                </div>

                {/* Hedef durumu */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
                  {sc.goalReached ? (
                    <>
                      <CheckCircle2 size={13} style={{ color: '#10B981' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981' }}>Hedefe ulaşıldı</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={13} style={{ color: '#F59E0B' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B' }}>Kısmi iyileşme</span>
                    </>
                  )}
                </div>

                {/* Alt bilgi */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <p style={{ fontSize: 12, color: '#64748B' }}>
                    <span style={{ fontWeight: 600 }}>{sc.actions.length}</span> aksiyon önerisi
                  </p>
                  <p style={{ fontSize: 12, color: '#64748B' }}>
                    <span style={{ fontWeight: 600 }}>{fmt(sc.totalTLMovement)}</span> toplam hareket
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* ── Seçilen Senaryo Detayı ─────────────────────────────────────── */}
          {selectedScenario && (
            <div className="card" style={{ border: '1px solid rgba(11,60,93,0.12)' }}>
              <div className="card-head">
                <div className="card-head-left">
                  <h4 className="card-title">
                    {HORIZON_CARD_TITLE[selectedScenario.horizon]} — Aksiyon Planı
                  </h4>
                  <p className="card-desc">
                    {HORIZON_SUBTITLE[selectedScenario.horizon]} içinde uygulanabilecek adımlar
                  </p>
                </div>
              </div>

              <div className="card-body">
                {selectedScenario.actions.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>
                    Bu vade için önerilecek aksiyon bulunamadı.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedScenario.actions.map((action, ai) => {
                      const changedRatios = (Object.entries(action.ratioAfter) as [string, number | null][])
                        .filter(([k, after]) => {
                          const before = (action.ratioBefore as Record<string, number | null>)[k]
                          return before != null && after != null && Math.abs((after ?? 0) - (before ?? 0)) > 0.005
                        })

                      return (
                        <div
                          key={action.actionId}
                          style={{
                            border:       '1px solid',
                            borderColor:  expandedAction === ai ? 'rgba(11,60,93,0.2)' : '#E5E9F0',
                            borderRadius: 10,
                            overflow:     'hidden',
                            background:   expandedAction === ai ? '#FAFCFE' : '#fff',
                            transition:   'all 0.15s',
                          }}
                        >
                          {/* Aksiyon başlığı */}
                          <button
                            onClick={() => setExpandedAction(expandedAction === ai ? null : ai)}
                            style={{
                              width:       '100%',
                              display:     'flex',
                              alignItems:  'center',
                              gap:         12,
                              padding:     '14px 16px',
                              background:  'transparent',
                              border:      'none',
                              cursor:      'pointer',
                              textAlign:   'left',
                            }}
                          >
                            {/* Sıra no */}
                            <span style={{
                              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                              background: '#0B3C5D', color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700,
                            }}>
                              {ai + 1}
                            </span>

                            {/* Label + desc */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontWeight: 700, fontSize: 13.5, color: '#0B3C5D' }}>
                                {action.label}
                              </p>
                              <p style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>
                                {action.description}
                              </p>
                            </div>

                            {/* TL + skor */}
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <p style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>
                                {fmt(action.amountTL)}
                              </p>
                              <p style={{ fontSize: 11, color: '#10B981', fontWeight: 600, marginTop: 1 }}>
                                +{action.scoreDelta.toFixed(1)} puan
                              </p>
                            </div>

                            {/* Zorluk */}
                            <span style={{
                              padding:    '3px 8px', borderRadius: 5, fontSize: 11,
                              fontWeight: 600, flexShrink: 0,
                              background: DIFFICULTY_COLOR[action.difficulty] + '18',
                              color:      DIFFICULTY_COLOR[action.difficulty],
                            }}>
                              {DIFFICULTY_LABEL[action.difficulty]}
                            </span>

                            {/* Süre */}
                            <span style={{
                              padding:    '3px 8px', borderRadius: 5, fontSize: 11,
                              fontWeight: 600, flexShrink: 0,
                              background: '#EDF4F8', color: '#0B3C5D',
                            }}>
                              {HORIZON_SUBTITLE[action.timeHorizon]}
                            </span>

                            {expandedAction === ai
                              ? <ChevronUp   size={13} style={{ color: '#64748B', flexShrink: 0 }} />
                              : <ChevronDown size={13} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                            }
                          </button>

                          {/* Aksiyon detay */}
                          {expandedAction === ai && (
                            <div style={{ padding: '0 16px 16px', borderTop: '1px solid #F1F5F9' }}>

                              {/* Nasıl yapılır */}
                              <div style={{
                                background: '#EDF4F8', borderRadius: 8,
                                padding: '10px 14px', marginTop: 12, marginBottom: 14,
                              }}>
                                <p style={{ fontSize: 11, fontWeight: 600, color: '#0B3C5D', marginBottom: 3 }}>
                                  Nasıl Yapılır?
                                </p>
                                <p style={{ fontSize: 12.5, color: '#1E293B', lineHeight: 1.5 }}>
                                  {action.howTo}
                                </p>
                              </div>

                              {/* Etkilenen rasyolar */}
                              {changedRatios.length > 0 && (
                                <div>
                                  <p style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Etkilenen Rasyolar
                                  </p>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                      <tr>
                                        {['Rasyo','Önce','Sonra','Δ'].map(h => (
                                          <th key={h} style={{
                                            textAlign:  h === 'Rasyo' ? 'left' : 'right',
                                            padding:    '4px 8px',
                                            color:      '#94A3B8',
                                            fontWeight: 600, fontSize: 11,
                                          }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {changedRatios.map(([k, after]) => {
                                        const before = (action.ratioBefore as Record<string, number | null>)[k]
                                        const delta  = (after ?? 0) - (before ?? 0)
                                        return (
                                          <tr key={k} style={{ borderTop: '1px solid #F8FAFC' }}>
                                            <td style={{ padding: '5px 8px', color: '#1E293B', fontWeight: 500 }}>
                                              {RATIO_LABELS[k] ?? k}
                                            </td>
                                            <td style={{ padding: '5px 8px', textAlign: 'right', color: '#64748B' }}>
                                              {fmtRatio(before)}
                                            </td>
                                            <td style={{ padding: '5px 8px', textAlign: 'right', color: '#1E293B', fontWeight: 600 }}>
                                              {fmtRatio(after)}
                                            </td>
                                            <td style={{
                                              padding: '5px 8px', textAlign: 'right', fontWeight: 600,
                                              color: delta > 0 ? '#10B981' : '#EF4444',
                                            }}>
                                              {delta > 0 ? '+' : ''}{fmtRatio(delta)}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── Toplam Özet ─────────────────────────────────────────── */}
                <div style={{
                  marginTop:    20,
                  background:   'linear-gradient(135deg, #EDF4F8 0%, #F8FAFC 100%)',
                  border:       '1px solid rgba(11,60,93,0.1)',
                  borderRadius: 10,
                  padding:      '16px 20px',
                }}>
                  <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, marginBottom: 4 }}>Başlangıç → Tahmini Bitiş</p>
                      <p style={{ fontWeight: 800, fontSize: 15, color: '#0B3C5D', fontFamily: 'Outfit, sans-serif' }}>
                        {selectedScenario.scoreBefore.toFixed(1)} → {selectedScenario.scoreAfter.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, marginBottom: 4 }}>Not Değişimi</p>
                      <p style={{ fontWeight: 700, fontSize: 14, color: gradeColor(selectedScenario.gradeAfter) }}>
                        {selectedScenario.gradeBefore} → {selectedScenario.gradeAfter}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, marginBottom: 4 }}>Toplam TL Hareketi</p>
                      <p style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>
                        {fmt(selectedScenario.totalTLMovement)}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, marginBottom: 4 }}>Tahmini Süre</p>
                      <p style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>
                        {HORIZON_SUBTITLE[selectedScenario.horizon]}
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
                    * Bu sonuçlar tahminidir. Gerçek etki piyasa koşullarına ve uygulama kalitesine bağlıdır.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
