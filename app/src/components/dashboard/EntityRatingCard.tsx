'use client'

/**
 * EntityRatingCard (Faz 7.3.27, bug fix Faz 7.3.28)
 *
 * Mali müşavir kontrol panelinde her firma için mini kart.
 * Firma adı + sektör badge + skor + rating + trend oku + mini bar grafik.
 *
 * Dışa aktarılan saf fonksiyonlar (test edilebilir):
 *   miniPeriodLabel, computeTrendX, groupAnalysesByEntity, latestUpdatedAt,
 *   sortEntitiesByLatest, computeTrend, latestAnalysisPeriodLabel
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { periodLabel } from './RatingHistoryChart'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CardAnalysisItem {
  id: string
  year: number
  period: string
  updatedAt?: string | null
  finalScore: number
  finalRating: string
  entity?: { id: string; name: string; sector?: string | null } | null
}

export interface EntityInfo {
  id: string
  name: string
  sector?: string | null
}

export interface EntityGroup {
  entity: EntityInfo
  analyses: CardAnalysisItem[]
}

// ─── İç sort (RatingHistoryChart.sortAnalyses ile aynı mantık) ────────────────

const PERIOD_ORDER: Record<string, number> = {
  ANNUAL: 0, Q1: 1, Q2: 2, Q3: 3, Q4: 4,
}

function sortByPeriod(analyses: CardAnalysisItem[]): CardAnalysisItem[] {
  return [...analyses].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    return (PERIOD_ORDER[a.period] ?? 5) - (PERIOD_ORDER[b.period] ?? 5)
  })
}

// ─── Yardımcı (test edilebilir export) ───────────────────────────────────────

/**
 * Mini X-ekseni etiketi: ANNUAL → son 2 rakam ("24"), Q1/Q2/Q3/Q4 → "Q4"
 * 8px çubuk genişliğinde sığacak şekilde kısa tutulur.
 */
export function miniPeriodLabel(year: number, period: string): string {
  return period === 'ANNUAL' ? String(year).slice(-2) : period
}

/**
 * SVG trend çizgisi için i. çubuğun x koordinatı (Faz 7.3.28 fix).
 * viewBox 0-400, n çubuk eşit genişlikte → merkez (i + 0.5) / n * 400.
 * Eski formül (50 + i * 300/(n-1)) bar merkezini ±16px kaçırıyordu.
 */
export function computeTrendX(i: number, n: number): number {
  return (i + 0.5) / n * 400
}

/** Analizleri entity.id'ye göre gruplar. entity alanı olmayan analizler atlanır. */
export function groupAnalysesByEntity(analyses: CardAnalysisItem[]): EntityGroup[] {
  const map = new Map<string, EntityGroup>()
  for (const a of analyses) {
    if (!a.entity) continue
    const id = a.entity.id
    if (!map.has(id)) {
      map.set(id, { entity: a.entity, analyses: [] })
    }
    map.get(id)!.analyses.push(a)
  }
  return Array.from(map.values())
}

/**
 * Bir analizler listesinden en yeni updatedAt değerini döner.
 * NOT (Faz 7.3.28): jsonUtf8.normalizeStrings Prisma Date'leri {} yapıyor.
 * Bu fonksiyon yedekte kalmaktadır; sortEntitiesByLatest artık kullanmıyor.
 */
export function latestUpdatedAt(analyses: CardAnalysisItem[]): string | null {
  if (!analyses.length) return null
  let latest: string | null = null
  for (const a of analyses) {
    if (!a.updatedAt || typeof a.updatedAt !== 'string') continue
    if (!latest || new Date(a.updatedAt) > new Date(latest)) {
      latest = a.updatedAt
    }
  }
  return latest
}

/**
 * EntityGroup listesini en son analiz yılı + dönemi'ne göre DESC sıralar (Faz 7.3.28).
 * updatedAt API serialization hatası (Date→{}) nedeniyle year×10 + PERIOD_ORDER skoru kullanılır.
 */
export function sortEntitiesByLatest(groups: EntityGroup[]): EntityGroup[] {
  function maxChronScore(g: EntityGroup): number {
    let max = -Infinity
    for (const a of g.analyses) {
      const s = a.year * 10 + (PERIOD_ORDER[a.period] ?? 5)
      if (s > max) max = s
    }
    return max === -Infinity ? 0 : max
  }
  return [...groups].sort((a, b) => maxChronScore(b) - maxChronScore(a))
}

/**
 * Bir analizler listesinden kronolojik olarak en son dönem etiketini döner.
 * Subtitle'da tarih yerine kullanılır (Faz 7.3.28).
 */
export function latestAnalysisPeriodLabel(analyses: CardAnalysisItem[]): string | null {
  if (!analyses.length) return null
  const sorted = sortByPeriod(analyses)
  const last = sorted[sorted.length - 1]
  if (!last) return null
  return periodLabel(last.year, last.period)
}

/**
 * Son iki dönem arası skor farkı (kronolojik sıraya göre).
 * Tek analiz varsa null döner.
 */
export function computeTrend(analyses: CardAnalysisItem[]): number | null {
  if (analyses.length < 2) return null
  const sorted = sortByPeriod(analyses)
  return sorted[sorted.length - 1].finalScore - sorted[sorted.length - 2].finalScore
}

// ─── Rating rengi (kart içi) ──────────────────────────────────────────────────

function ratingTone(rating: string): string {
  if (['AAA', 'AA', 'A'].includes(rating)) return 'text-emerald-600 bg-emerald-50 border-emerald-100'
  if (rating === 'BBB') return 'text-amber-700 bg-amber-50 border-amber-100'
  return 'text-red-600 bg-red-50 border-red-100'
}

// ─── Bileşen ─────────────────────────────────────────────────────────────────

interface Props {
  entity: EntityInfo
  analyses: CardAnalysisItem[]
}

export default function EntityRatingCard({ entity, analyses }: Props) {
  const router = useRouter()
  const [hoveredBar, setHoveredBar] = useState<string | null>(null)

  const sorted = sortByPeriod(analyses)
  const n      = sorted.length
  const last   = sorted[sorted.length - 1] ?? null
  const trend  = computeTrend(analyses)

  // Trend line koordinatları — Faz 7.3.28: computeTrendX ile bar merkezine hizalı
  const trendPoints = sorted.map((a, i) => {
    const x = computeTrendX(i, n)
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
    ? pathD + ` L${trendPoints[trendPoints.length - 1][0]},200 L${trendPoints[0][0]},200 Z`
    : ''

  // Her kart benzersiz gradient ID (SVG çakışmasını önler)
  const gradId = `trendGradEC-${entity.id}`

  function handleClick() {
    router.push(`/dashboard/analiz?entityId=${entity.id}`)
  }

  return (
    <div
      className="card"
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      {/* ── Firma adı + sektör badge ── */}
      <div className="card-head" style={{ paddingBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            fontSize: 13, fontWeight: 800, color: '#0B3C5D',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            margin: 0,
          }}>
            {entity.name}
          </h3>
        </div>
        {entity.sector && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
            background: 'rgba(11,60,93,0.07)', color: '#5A7A96',
            borderRadius: 4, padding: '2px 6px',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {entity.sector.toUpperCase()}
          </span>
        )}
      </div>

      {/* ── Skor + Rating + Trend ── */}
      {last && (
        <div style={{ paddingLeft: 20, paddingRight: 20, paddingBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#0B3C5D', lineHeight: 1 }}>
              {Math.round(last.finalScore)}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ratingTone(last.finalRating)}`}>
              {last.finalRating}
            </span>
            {trend != null && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: trend >= 0 ? '#059669' : '#dc2626',
                display: 'flex', alignItems: 'center', gap: 2,
              }}>
                {trend >= 0
                  ? <TrendingUp size={11} />
                  : <TrendingDown size={11} />}
                {trend >= 0 ? '+' : ''}{trend.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Mini grafik (chart-area: 120px, bar: 8px genişlik) ── */}
      <div style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 12 }}>
        <div className="chart-area" style={{ height: 120, marginTop: 0 }}>
          {/* Y-ekseni YOK — mini boyut için gerekli değil */}
          <div className="chart-canvas">
            {sorted.map((a) => {
              const key   = a.id
              const isHov = hoveredBar === key
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
                      position:     'absolute',
                      bottom:       '100%',
                      left:         '50%',
                      transform:    'translateX(-50%)',
                      background:   '#0B3C5D',
                      color:        '#fff',
                      borderRadius: 6,
                      padding:      '4px 7px',
                      fontSize:     9,
                      fontWeight:   700,
                      whiteSpace:   'nowrap',
                      zIndex:       20,
                      marginBottom: 3,
                      pointerEvents: 'none',
                      boxShadow:    '0 4px 14px rgba(11,60,93,0.22)',
                    }}>
                      <div style={{ color: '#2EC4B6' }}>{periodLabel(a.year, a.period)}</div>
                      <div>Skor: {Math.round(a.finalScore)}</div>
                      <div style={{ color: 'rgba(255,255,255,0.55)' }}>Rating: {a.finalRating}</div>
                    </div>
                  )}

                  <div className="bar-pair">
                    <motion.div
                      className="bar"
                      style={{ background: '#0B3C5D', width: '8px', borderRadius: '2px' }}
                      initial={{ height: 0 }}
                      animate={{ height: `${a.finalScore}%` }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>

                  <span className="bar-label" style={{ fontSize: 8 }}>
                    {miniPeriodLabel(a.year, a.period)}
                  </span>
                </div>
              )
            })}

            {/* Turkuaz trend overlay */}
            {pathD && (
              <svg
                className="trend-overlay"
                viewBox="0 0 400 200"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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
                <path d={areaD} fill={`url(#${gradId})`} />
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
      </div>
    </div>
  )
}
