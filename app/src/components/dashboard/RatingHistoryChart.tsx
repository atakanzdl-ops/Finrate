'use client'

/**
 * RatingHistoryChart (Faz 7.3.26)
 *
 * "Analiz Geçmişi" kart listesinin yerine geçen skor geçmişi grafiği.
 * Stil referansı: analiz/page.tsx "Gelir & Performans Analizi" inline bileşeni.
 *
 * Dışa aktarılan saf fonksiyonlar (test edilebilir):
 *   periodLabel, sortAnalyses, filterAnalyses
 */

import { useState } from 'react'
import { motion } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisItem {
  id: string
  year: number
  period: string
  finalScore: number
  finalRating: string
  entity?: { id: string; name: string } | null
}

export type ChartTab = 'tumu' | 'yillik' | 'ceyreklik'

// ─── Yardımcı (test edilebilir export) ───────────────────────────────────────

/** X ekseni etiketi: ANNUAL → "2024", Q4 → "2024/Q4" */
export function periodLabel(year: number, period: string): string {
  return period === 'ANNUAL' ? String(year) : `${year}/${period}`
}

const PERIOD_ORDER: Record<string, number> = {
  ANNUAL: 0, Q1: 1, Q2: 2, Q3: 3, Q4: 4,
}

/** Analizleri kronolojik sıraya dizer (yıl artan; aynı yılda ANNUAL → Q4) */
export function sortAnalyses(analyses: AnalysisItem[]): AnalysisItem[] {
  return [...analyses].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    return (PERIOD_ORDER[a.period] ?? 5) - (PERIOD_ORDER[b.period] ?? 5)
  })
}

/** Sekmeye göre filtrele */
export function filterAnalyses(analyses: AnalysisItem[], tab: ChartTab): AnalysisItem[] {
  if (tab === 'yillik')    return analyses.filter(a => a.period === 'ANNUAL')
  if (tab === 'ceyreklik') return analyses.filter(a => a.period !== 'ANNUAL')
  return analyses
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

interface Props {
  analyses: AnalysisItem[]
}

export default function RatingHistoryChart({ analyses }: Props) {
  const [tab, setTab]           = useState<ChartTab>('tumu')
  const [hoveredBar, setHoveredBar] = useState<string | null>(null)

  const sorted   = sortAnalyses(analyses)
  const filtered = filterAnalyses(sorted, tab)
  const n        = filtered.length

  // Trend line koordinatları (skor 0-100 → y 0-200, ters)
  const trendPoints = filtered.map((a, i) => {
    const x = n === 1 ? 200 : 50 + i * (300 / Math.max(n - 1, 1))
    const y = 200 - (a.finalScore / 100) * 200
    return [x, y] as [number, number]
  })

  const pathD = trendPoints.length < 2 ? '' : trendPoints.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [px, py] = trendPoints[i - 1]
    const cx = (px + x) / 2
    return acc + ` C${cx},${py} ${cx},${y} ${x},${y}`
  }, '')

  const areaD = pathD
    ? pathD +
      ` L${trendPoints[trendPoints.length - 1][0]},200 L${trendPoints[0][0]},200 Z`
    : ''

  const last = filtered[filtered.length - 1] ?? null

  // Y ekseni etiketleri: 100 / 75 / 50 / 25 / 0
  const yLabels = [100, 75, 50, 25, 0]

  return (
    <div className="card card-chart">
      <div className="card-head">
        <div className="card-head-left">
          <h2 className="card-title">Analiz Geçmişi</h2>
          <p className="card-desc">{n} Dönemlik skor trendi</p>
        </div>
        <div className="card-head-right">
          <div className="tab-group">
            <button
              className={`tab ${tab === 'tumu' ? 'active' : ''}`}
              onClick={() => setTab('tumu')}
            >
              Tümü
            </button>
            <button
              className={`tab ${tab === 'yillik' ? 'active' : ''}`}
              onClick={() => setTab('yillik')}
            >
              Yıllık
            </button>
            <button
              className={`tab ${tab === 'ceyreklik' ? 'active' : ''}`}
              onClick={() => setTab('ceyreklik')}
            >
              Çeyreklik
            </button>
          </div>
        </div>
      </div>

      <div className="card-body">
        {n === 0 ? (
          <div className="text-center py-10 text-slate-500">
            Bu filtre için görüntülenecek analiz bulunamadı.
          </div>
        ) : (
          <>
            <div className="chart-area">
              {/* Y ekseni */}
              <div className="chart-y-axis">
                {yLabels.map(v => (
                  <span key={v}>{v}</span>
                ))}
              </div>

              {/* Canvas */}
              <div className="chart-canvas">
                {/* Grid lines */}
                {[100, 75, 50, 25, 0].map(b => (
                  <div key={b} className="chart-grid-line" style={{ bottom: `${b}%` }} />
                ))}

                {/* Bar grupları */}
                {filtered.map((a) => {
                  const key   = `${a.id}`
                  const isHov = hoveredBar === key
                  const score = Math.round(a.finalScore)

                  return (
                    <div
                      key={key}
                      className="bar-group"
                      onMouseEnter={() => setHoveredBar(key)}
                      onMouseLeave={() => setHoveredBar(null)}
                      style={{ position: 'relative' }}
                    >
                      {/* Hover tooltip */}
                      {isHov && (
                        <div style={{
                          position:    'absolute',
                          bottom:      '100%',
                          left:        '50%',
                          transform:   'translateX(-50%)',
                          background:  '#0B3C5D',
                          color:       '#fff',
                          borderRadius: 8,
                          padding:     '5px 8px',
                          fontSize:    10,
                          fontWeight:  700,
                          whiteSpace:  'nowrap',
                          zIndex:      10,
                          marginBottom: 4,
                          pointerEvents: 'none',
                          boxShadow:   '0 8px 18px rgba(11,60,93,0.14)',
                        }}>
                          <div style={{ color: '#2EC4B6' }}>
                            {periodLabel(a.year, a.period)}
                          </div>
                          <div>Skor: {score}</div>
                          <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                            Rating: {a.finalRating}
                          </div>
                        </div>
                      )}

                      <div className="bar-pair">
                        <motion.div
                          className="bar"
                          style={{ background: '#0B3C5D', width: '10px', borderRadius: '2px' }}
                          initial={{ height: 0 }}
                          animate={{ height: `${a.finalScore}%` }}
                          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>

                      <span className="bar-label">
                        {periodLabel(a.year, a.period)}
                      </span>
                    </div>
                  )
                })}

                {/* Trend overlay */}
                {pathD && (
                  <svg
                    className="trend-overlay"
                    viewBox="0 0 400 200"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="trendGradRH" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#2EC4B6" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#2EC4B6" stopOpacity="0"   />
                      </linearGradient>
                    </defs>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#2EC4B6"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      opacity="0.9"
                    />
                    <path d={areaD} fill="url(#trendGradRH)" />
                    <circle
                      cx={trendPoints[trendPoints.length - 1][0]}
                      cy={trendPoints[trendPoints.length - 1][1]}
                      r="4"
                      fill="#2EC4B6"
                    />
                  </svg>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#0B3C5D' }} />
                <span>Skor</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#2EC4B6' }} />
                <span>Trend</span>
              </div>
              {last != null && (
                <div className="chart-summary">
                  <span className="summary-label">Son Dönem:</span>
                  <span className="summary-value">
                    {Math.round(last.finalScore)} • {last.finalRating}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
