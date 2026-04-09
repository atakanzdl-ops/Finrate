'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { getSectorBenchmark } from '@/lib/scoring/benchmarks'
import { combineScores } from '@/lib/scoring/subjective'
import { findOptimalPath } from '@/lib/scoring/optimizer'
import { calculateRatios } from '@/lib/scoring/ratios'
import { calculateScore, scoreToRating } from '@/lib/scoring/score'

/* ─── Types ─────────────────────────────────────── */
interface FinData {
  revenue?: number | null; cogs?: number | null; grossProfit?: number | null
  operatingExpenses?: number | null; ebit?: number | null; ebitda?: number | null
  interestExpense?: number | null; netProfit?: number | null
  cash?: number | null; tradeReceivables?: number | null; inventory?: number | null
  totalCurrentAssets?: number | null; tangibleAssets?: number | null
  totalNonCurrentAssets?: number | null; totalAssets?: number | null
  shortTermFinancialDebt?: number | null; tradePayables?: number | null
  totalCurrentLiabilities?: number | null; longTermFinancialDebt?: number | null
  totalNonCurrentLiabilities?: number | null
  totalEquity?: number | null; totalLiabilitiesAndEquity?: number | null
}
interface Analysis {
  id: string; year: number; period: string
  finalScore: number; finalRating: string
  liquidityScore: number; profitabilityScore: number; leverageScore: number; activityScore: number
  ratios: Record<string, number | null>
  entity?: { id: string; name: string; sector?: string | null }
  financialData?: FinData | null
}

/* ─── Helpers ────────────────────────────────────── */
const PERIOD_LABEL: Record<string, string> = {
  ANNUAL: 'Kesin Beyan', Q1: '1. Geçici', Q2: '2. Geçici', Q3: '3. Geçici', Q4: '4. Geçici',
}
const TEMINAT: Record<string, string> = {
  AAA: 'Kefalet olmaksızın çalışılabilir',
  AA:  'Maddi teminat olmaksızın kefalet karşılığı',
  A:   'Maddi teminat olmaksızın kefalet karşılığı',
  BBB: 'Kefalet veya müşteri çeki karşılığı',
  BB:  'Kefalet ile müşteri çeki veya ipotek teminatı',
  B:   'İpotek ve müşteri çeki teminatı karşılığı',
  CCC: 'Marjlı ipotek karşılığı',
  CC:  'Çalışma yapılmaz', C: 'Çalışma yapılmaz', D: 'Tasfiye',
}
const RATING_COLOR: Record<string, string> = {
  AAA: '#16a34a', AA: '#16a34a', A: '#22c55e',
  BBB: '#84cc16', BB: '#eab308', B: '#f97316',
  CCC: '#ea580c', CC: '#ef4444', C: '#dc2626', D: '#991b1b',
}

function combinedRating(s: number) {
  if (s >= 92) return 'AAA'; if (s >= 84) return 'AA'; if (s >= 76) return 'A'
  if (s >= 68) return 'BBB'; if (s >= 60) return 'BB'; if (s >= 52) return 'B'
  if (s >= 44) return 'CCC'; if (s >= 36) return 'CC'; if (s >= 28) return 'C'
  return 'D'
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + 'B'
  if (abs >= 1_000_000)     return (v / 1_000_000).toFixed(2) + 'M'
  if (abs >= 1_000)         return (v / 1_000).toFixed(1) + 'K'
  return v.toFixed(0)
}
function fmtPct(v: number | null | undefined) { return v == null ? '—' : (v * 100).toFixed(1) + '%' }
function fmtX(v: number | null | undefined, d = 2)   { return v == null ? '—' : v.toFixed(d) + 'x' }
function fmtDay(v: number | null | undefined) { return v == null ? '—' : Math.round(v) + ' gün' }

type St = 'good' | 'warn' | 'bad'
function st(v: number | null | undefined, invert: boolean, bad: number, warn: number): St {
  if (v == null) return 'warn'
  if (invert) return v <= warn ? 'good' : v <= bad ? 'warn' : 'bad'
  return v >= warn ? 'good' : v >= bad ? 'warn' : 'bad'
}

/* Status badge — pill badge yeşil/sarı/kırmızı */
function StatusBadge({ s }: { s: St }) {
  const cfg = s === 'good'
    ? { bg: '#dcfce7', color: '#16a34a', label: 'İyi' }
    : s === 'warn'
    ? { bg: '#fef9c3', color: '#d97706', label: 'Uyarı' }
    : { bg: '#fee2e2', color: '#dc2626', label: 'Zayıf' }
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: 9,
      padding: '2px 7px', borderRadius: 20, letterSpacing: 0.5, whiteSpace: 'nowrap',
    }}>{cfg.label}</span>
  )
}

/* SVG Donut Chart */
function DonutChart({ score, rColor }: { score: number; rColor: string }) {
  const r = 70
  const cx = 90; const cy = 90
  const circumference = 2 * Math.PI * r
  const filled = (score / 100) * circumference
  return (
    <svg viewBox="0 0 180 180" width={160} height={160} style={{ display: 'block', margin: '0 auto' }}>
      {/* gri track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={2} />
      {/* renkli fill */}
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke="#000000" strokeWidth={2}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      {/* skor metni */}
      <text x={cx} y={cy - 8} textAnchor="middle" fontFamily="Merriweather, serif" fontWeight={900} fontSize={34} fill="#0f172a">{score}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight={400} fontSize={12} fill="#64748b">/100</text>
    </svg>
  )
}

/* SVG Bar (kategori skorları) */
function CatBar({ val, color }: { val: number; color: string }) {
  const totalW = 280
  const filledW = Math.max(0, Math.min(totalW, (val / 100) * totalW))
  return (
    <svg viewBox={`0 0 ${totalW} 8`} width={totalW} height={8} style={{ display: 'block', borderRadius: 0, overflow: 'hidden' }}>
      <rect x={0} y={0} width={totalW} height={8} fill="none" stroke="#e2e8f0" strokeWidth={1} />
      <rect x={0} y={0} width={filledW} height={8} fill="#000000" />
    </svg>
  )
}

/* SVG mini bar (rasyo tablosu) */
function MiniBar({ firmVal, avgVal, s }: { firmVal: string; avgVal: string; s: St }) {
  const barColor = s === 'good' ? '#16a34a' : s === 'warn' ? '#d97706' : '#dc2626'
  // Normalize: eğer sayısal değerse göster
  const firm = parseFloat(firmVal.replace('%','').replace('x','').replace(' gün',''))
  const avg  = parseFloat(avgVal.replace('%','').replace('x','').replace(' gün',''))
  const ratio = (!isNaN(firm) && !isNaN(avg) && avg > 0) ? Math.min(1, firm / (avg * 2)) : 0.5
  const filledW = Math.round(ratio * 60)
  return (
    <svg viewBox="0 0 60 6" width={60} height={6} style={{ display: 'block' }}>
      <rect x={0} y={0} width={60} height={6} fill="none" stroke="#e2e8f0" strokeWidth={1} />
      <rect x={0} y={0} width={filledW} height={6} fill="#000000" />
    </svg>
  )
}

/* Rating Scale Band */
const RATINGS_SCALE = ['D','C','CC','CCC','B','BB','BBB','A','AA','AAA']
const SCALE_COLORS  = ['#991b1b','#dc2626','#ef4444','#f97316','#f97316','#eab308','#84cc16','#22c55e','#16a34a','#16a34a']

function RatingScaleBand({ activeRating }: { activeRating: string }) {
  const idx = RATINGS_SCALE.indexOf(activeRating)
  return (
    <div style={{ background: '#ffffff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Rating Skalası</div>
      <div style={{ display: 'flex', gap: 2 }}>
        {RATINGS_SCALE.map((rt, i) => (
          <div key={rt} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 14, background: SCALE_COLORS[i], borderRadius: 3, position: 'relative' }}>
              {i === idx && (
                <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: SCALE_COLORS[i], fontWeight: 900 }}>▲</div>
              )}
            </div>
            <div style={{ fontSize: 8, fontWeight: i === idx ? 900 : 400, color: i === idx ? SCALE_COLORS[i] : '#94a3b8', marginTop: 4 }}>{rt}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Sayfa header/footer bileşenleri ── */
function PageHeader({ title, pageNum, entityName, year }: { title: string; pageNum: number; entityName: string; year: number }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
        <div style={{ fontFamily: 'Merriweather, serif', fontWeight: 900, fontSize: 18, color: '#0a1f3a', letterSpacing: 1 }}>FINRATE</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{entityName} · {year}</div>
      </div>
      <div style={{ height: 2, background: 'linear-gradient(90deg, #0ea5e9 0%, #38e2d4 100%)', borderRadius: 1 }} />
      <div style={{ display: 'none' }}>{pageNum}</div>
    </div>
  )
}

function PageFooter({ entityName, now, pageNum, total }: { entityName: string; now: string; pageNum: number; total: number }) {
  return (
    <div style={{ position: 'absolute', bottom: 28, left: 56, right: 56 }}>
      <div style={{ height: 1, background: '#e2e8f0', marginBottom: 10 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
        <span>finrate.app | Gizli &amp; Kurumsal</span>
        <span>{entityName} · {now}</span>
        <span>Sayfa {pageNum} / {total}</span>
      </div>
    </div>
  )
}

/* ─── RaporContent ────────────────────────────────── */
function RaporContent() {
  const params = useSearchParams()
  const id     = params.get('id')
  const [analysis,  setAnalysis]  = useState<Analysis | null>(null)
  const [subjTotal, setSubjTotal] = useState(0)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    fetch('/api/analyses').then(r => r.json()).then(d => {
      const found: Analysis | undefined = (d.analyses ?? []).find((a: Analysis) => a.id === id)
      setAnalysis(found ?? null)
      if (found?.entity?.id) {
        fetch(`/api/entities/${found.entity.id}/subjective`)
          .then(r => r.ok ? r.json() : null)
          .then(s => { if (s?.score?.total != null) setSubjTotal(s.score.total) })
      }
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#ffffff' }}>
      <Loader2 size={28} style={{ color: '#0ea5e9', animation: 'spin 1s linear infinite' }} />
    </div>
  )
  if (!analysis) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#ffffff', color: '#64748b' }}>
      Analiz bulunamadı.
    </div>
  )

  const r     = analysis.ratios
  const fd    = analysis.financialData
  const now   = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const cs    = combineScores(analysis.finalScore, subjTotal)
  const rtng  = combinedRating(cs)
  const rColor = RATING_COLOR[rtng] ?? '#0ea5e9'

  const catBars = [
    { label: 'Likidite',  val: Math.round(analysis.liquidityScore),     color: '#0ea5e9' },
    { label: 'Karlılık',  val: Math.round(analysis.profitabilityScore), color: '#0ea5e9' },
    { label: 'Kaldıraç', val: Math.round(analysis.leverageScore),      color: '#f97316' },
    { label: 'Faaliyet', val: Math.round(analysis.activityScore),      color: '#f59e0b' },
  ]

  // Sektör benchmark (rapor için durum göstergeleri)
  const bm = getSectorBenchmark(analysis.entity?.sector)

  // ── Narratif yardımcılar ──────────────────────────────────────────────────
  const pctStr  = (v: number | null | undefined) => v == null ? '—' : `%${(v*100).toFixed(1)}`
  const xStr    = (v: number | null | undefined, d=2) => v == null ? '—' : `${v.toFixed(d)}x`
  const dayStr  = (v: number | null | undefined) => v == null ? '—' : `${Math.round(v as number)} gün`
  const moneyStr = (v: number | null | undefined) => {
    if (v == null) return '—'
    const abs = Math.abs(v as number)
    if (abs >= 1_000_000) return `${((v as number)/1_000_000).toFixed(2)} M TL`
    if (abs >= 1_000)    return `${((v as number)/1_000).toFixed(0)} K TL`
    return `${(v as number).toFixed(0)} TL`
  }
  const cmp = (val: number | null, good: number, bad: number): 'iyi' | 'orta' | 'kötü' =>
    val == null ? 'orta' : val >= good ? 'iyi' : val >= bad ? 'orta' : 'kötü'
  const cmpInv = (val: number | null, good: number, bad: number): 'iyi' | 'orta' | 'kötü' =>
    val == null ? 'orta' : val <= good ? 'iyi' : val <= bad ? 'orta' : 'kötü'
  const bullet = (text: string, level: 'iyi' | 'orta' | 'kötü') => ({ text, level })

  // Genel Değerlendirme
  const genel: { text: string; level: 'iyi' | 'orta' | 'kötü' }[] = []
  genel.push(bullet(
    `${analysis.year} yılı ${PERIOD_LABEL[analysis.period] ?? analysis.period} döneminde Finrate skoru ${cs} / 100 — ${rtng} derecelendirmesi.`,
    cs >= 68 ? 'iyi' : cs >= 44 ? 'orta' : 'kötü'
  ))
  if (r.revenueGrowth != null)
    genel.push(bullet(
      `Nominal gelir büyümesi ${pctStr(r.revenueGrowth)}${r.realGrowth != null ? `, ÜFE arındırılmış reel büyüme ${pctStr(r.realGrowth)}` : ''}.`,
      (r.revenueGrowth as number) >= 0 ? 'iyi' : 'kötü'
    ))
  if (r.netWorkingCapital != null)
    genel.push(bullet(
      `Net çalışma sermayesi ${moneyStr(r.netWorkingCapital)} — ${(r.netWorkingCapital as number) > 0 ? 'pozitif, kısa vadeli yükümlülükler karşılanabilir durumda' : 'negatif, kısa vadeli likidite baskısı mevcut'}.`,
      (r.netWorkingCapital as number) > 0 ? 'iyi' : 'kötü'
    ))

  // Karlılık
  const karl: { text: string; level: 'iyi' | 'orta' | 'kötü' }[] = []
  if (r.grossMargin != null)
    karl.push(bullet(
      `Brüt kâr marjı ${pctStr(r.grossMargin)} (sektör: ${pctStr(bm.grossMargin)}) — ${cmp(r.grossMargin as number, bm.grossMargin*0.9, bm.grossMargin*0.5) === 'iyi' ? 'sektörle uyumlu veya üzerinde' : cmp(r.grossMargin as number, bm.grossMargin*0.9, bm.grossMargin*0.5) === 'orta' ? 'sektörün altında, iyileştirme potansiyeli var' : 'sektörün belirgin altında, maliyet/fiyatlama baskısı'}.`,
      cmp(r.grossMargin as number, bm.grossMargin*0.9, bm.grossMargin*0.5)
    ))
  if (r.ebitdaMargin != null)
    karl.push(bullet(
      `FAVÖK marjı ${pctStr(r.ebitdaMargin)} (sektör: ${pctStr(bm.ebitdaMargin)}) — ${cmp(r.ebitdaMargin as number, bm.ebitdaMargin*0.85, 0) === 'iyi' ? 'operasyonel nakit üretimi güçlü' : (r.ebitdaMargin as number) <= 0 ? 'negatif FAVÖK — operasyonel zarar' : 'FAVÖK marjı düşük, operasyonel verimlilik sınırlı'}.`,
      (r.ebitdaMargin as number) <= 0 ? 'kötü' : cmp(r.ebitdaMargin as number, bm.ebitdaMargin*0.85, 0)
    ))
  if (r.netProfitMargin != null)
    karl.push(bullet(
      `Net kâr marjı ${pctStr(r.netProfitMargin)} (sektör: ${pctStr(bm.netProfitMargin)}) — ${(r.netProfitMargin as number) < -0.05 ? 'ciddi zarar, final skor tavanlanmıştır' : (r.netProfitMargin as number) < 0 ? 'zarar açıklıyor, kârlılık iyileştirme öncelikli' : (r.netProfitMargin as number) >= bm.netProfitMargin * 0.8 ? 'sektörle uyumlu net kârlılık' : 'düşük net kâr marjı'}.`,
      (r.netProfitMargin as number) < 0 ? 'kötü' : cmp(r.netProfitMargin as number, bm.netProfitMargin*0.8, bm.netProfitMargin*0.3)
    ))
  if (r.roa != null)
    karl.push(bullet(
      `ROA ${pctStr(r.roa)}, ROE ${pctStr(r.roe)} — varlık ve özkaynak verimliliği ${cmp(r.roa as number, bm.roa*0.8, 0) === 'iyi' ? 'yeterli' : 'geliştirilebilir'}.`,
      cmp(r.roa as number, bm.roa*0.8, 0)
    ))

  // Likidite
  const liki: { text: string; level: 'iyi' | 'orta' | 'kötü' }[] = []
  if (r.currentRatio != null)
    liki.push(bullet(
      `Cari oran ${xStr(r.currentRatio)} (sektör: ${xStr(bm.currentRatio)}) — ${cmp(r.currentRatio as number, bm.currentRatio*0.9, bm.currentRatio*0.6) === 'iyi' ? 'kısa vadeli ödeme gücü yeterli' : cmp(r.currentRatio as number, bm.currentRatio*0.9, bm.currentRatio*0.6) === 'orta' ? 'likidite sınırda, dikkat gerekiyor' : 'düşük likidite, kısa vadeli risk var'}.`,
      cmp(r.currentRatio as number, bm.currentRatio*0.9, bm.currentRatio*0.6)
    ))
  if (r.quickRatio != null)
    liki.push(bullet(
      `Asit-test oranı ${xStr(r.quickRatio)} — stok hariç anlık ödeme kapasitesi ${(r.quickRatio as number) >= 1 ? 'yeterli' : (r.quickRatio as number) >= 0.6 ? 'sınırda' : 'yetersiz'}.`,
      (r.quickRatio as number) >= 1 ? 'iyi' : (r.quickRatio as number) >= 0.6 ? 'orta' : 'kötü'
    ))
  if (r.cashConversionCycle != null)
    liki.push(bullet(
      `Nakit dönüşüm süresi ${dayStr(r.cashConversionCycle)} — ${(r.cashConversionCycle as number) < 0 ? 'negatif NDS, nakit tahsilatı tedarik ödemesinden önce gerçekleşiyor (çok olumlu)' : (r.cashConversionCycle as number) < 30 ? 'hızlı nakit döngüsü' : (r.cashConversionCycle as number) < 90 ? 'kabul edilebilir nakit döngüsü' : 'uzun nakit döngüsü, finansman ihtiyacını artırıyor'}.`,
      (r.cashConversionCycle as number) < 30 ? 'iyi' : (r.cashConversionCycle as number) < 90 ? 'orta' : 'kötü'
    ))

  // Borçlanma
  const borc: { text: string; level: 'iyi' | 'orta' | 'kötü' }[] = []
  if (r.debtToEquity != null)
    borc.push(bullet(
      `Borç/özkaynak oranı ${xStr(r.debtToEquity)} (sektör: ${xStr(bm.debtToEquity)}) — ${cmpInv(r.debtToEquity as number, bm.debtToEquity*1.1, bm.debtToEquity*2.0) === 'iyi' ? 'sektörle uyumlu kaldıraç' : cmpInv(r.debtToEquity as number, bm.debtToEquity*1.1, bm.debtToEquity*2.0) === 'orta' ? 'sektör üzerinde borçluluk, yakından izlenmeli' : 'yüksek finansal kaldıraç, özkaynak güçlendirmesi önerilir'}.`,
      cmpInv(r.debtToEquity as number, bm.debtToEquity*1.1, bm.debtToEquity*2.0)
    ))
  if (r.debtToEbitda != null)
    borc.push(bullet(
      (r.debtToEbitda as number) < 0
        ? `Net nakit pozisyonunda — toplam finansal borç nakit/yatırımlardan düşük. Mali esneklik yüksek.`
        : `Net borç/FAVÖK ${xStr(r.debtToEbitda, 1)} — ${(r.debtToEbitda as number) <= 3 ? 'borç geri ödeme kapasitesi güçlü' : (r.debtToEbitda as number) <= 6 ? 'borç yükü kabul edilebilir ancak izlenmeli' : 'yüksek borç yükü, refinansman veya kârlılık iyileştirmesi gerekiyor'}.`,
      (r.debtToEbitda as number) < 0 ? 'iyi' : cmpInv(r.debtToEbitda as number, 3, 6)
    ))
  if (r.interestCoverage != null)
    borc.push(bullet(
      (r.interestCoverage as number) === Infinity
        ? `Faiz gideri raporlanmamış veya sıfır — faiz yük değerlendirmesi borç düzeyine göre yapılmıştır.`
        : `Faiz karşılama oranı ${xStr(r.interestCoverage, 1)} — ${(r.interestCoverage as number) >= 3 ? 'faiz yükümlülükleri rahatça karşılanabiliyor' : (r.interestCoverage as number) >= 1.5 ? 'faiz karşılama sınırda, kârlılık baskısı var' : 'kritik düzeyde düşük — faiz ödeme riski mevcut'}.`,
      (r.interestCoverage as number) === Infinity ? 'orta' : ((r.interestCoverage as number) >= 3 ? 'iyi' : (r.interestCoverage as number) >= 1.5 ? 'orta' : 'kötü')
    ))

  // Faaliyet
  const faal: { text: string; level: 'iyi' | 'orta' | 'kötü' }[] = []
  if (r.assetTurnover != null)
    faal.push(bullet(
      `Aktif devir hızı ${xStr(r.assetTurnover)} (sektör: ${xStr(bm.assetTurnover)}) — varlık kullanım verimliliği ${cmp(r.assetTurnover as number, bm.assetTurnover*0.8, bm.assetTurnover*0.4) === 'iyi' ? 'yeterli' : 'geliştirilebilir'}.`,
      cmp(r.assetTurnover as number, bm.assetTurnover*0.8, bm.assetTurnover*0.4)
    ))
  if (r.inventoryTurnoverDays != null)
    faal.push(bullet(
      `Stok devir süresi ${dayStr(r.inventoryTurnoverDays)} (sektör: ${dayStr(bm.inventoryDays)}) — ${cmpInv(r.inventoryTurnoverDays as number, bm.inventoryDays*1.1, bm.inventoryDays*2.0) === 'iyi' ? 'stok yönetimi etkin' : cmpInv(r.inventoryTurnoverDays as number, bm.inventoryDays*1.1, bm.inventoryDays*2.0) === 'orta' ? 'sektör ortalamasının üzerinde, stok optimizasyonu faydalı olur' : 'aşırı yüksek stok süresi, bağlı sermaye riski'}.`,
      cmpInv(r.inventoryTurnoverDays as number, bm.inventoryDays*1.1, bm.inventoryDays*2.0)
    ))
  if (r.receivablesTurnoverDays != null)
    faal.push(bullet(
      `Alacak tahsil süresi ${dayStr(r.receivablesTurnoverDays)} (sektör: ${dayStr(bm.receivablesDays)}) — ${cmpInv(r.receivablesTurnoverDays as number, bm.receivablesDays*1.1, bm.receivablesDays*2.0) === 'iyi' ? 'tahsilat etkin' : 'tahsilat süreci iyileştirilebilir'}.`,
      cmpInv(r.receivablesTurnoverDays as number, bm.receivablesDays*1.1, bm.receivablesDays*2.0)
    ))
  if (r.payablesTurnoverDays != null)
    faal.push(bullet(
      `Borç ödeme süresi ${dayStr(r.payablesTurnoverDays)} — ${(r.payablesTurnoverDays as number) >= 30 ? 'tedarikçi finansmanından yararlanılıyor' : 'kısa ödeme vadesi, tedarikçi uzatma müzakeresi değerlendirilebilir'}.`,
      (r.payablesTurnoverDays as number) >= 30 ? 'iyi' : 'orta'
    ))

  // Optimizasyon önerileri (+1 ve +2 not)
  const baseFinancialScore = analysis.finalScore  // finansal baz skor
  const RATING_STEPS = ['D','C','CC','CCC','B','BB','BBB','A','AA','AAA']
  const ratingIdx = RATING_STEPS.indexOf(rtng)
  const nextRating  = ratingIdx < RATING_STEPS.length - 1 ? RATING_STEPS[ratingIdx + 1] : rtng
  const next2Rating = ratingIdx < RATING_STEPS.length - 2 ? RATING_STEPS[ratingIdx + 2] : null
  const optResult  = findOptimalPath(r as unknown as Parameters<typeof findOptimalPath>[0], cs, nextRating, analysis.entity?.sector)
  const optResult2 = next2Rating ? findOptimalPath(r as unknown as Parameters<typeof findOptimalPath>[0], cs, next2Rating, analysis.entity?.sector) : null

  // Detaylı aksiyon metni üretici
  function richAction(key: string, cur: number | null, tgt: number, unit: string): string {
    const pct  = (v: number) => `%${(v*100).toFixed(1)}`
    const xv   = (v: number) => `${v.toFixed(2)}x`
    const day  = (v: number) => `${Math.round(v)} gün`
    const mn   = (v: number | null) => v == null ? '—' : Math.abs(v) >= 1e6 ? `${(v/1e6).toFixed(2)} M TL` : Math.abs(v) >= 1e3 ? `${(v/1e3).toFixed(0)} K TL` : `${v.toFixed(0)} TL`
    const fv   = (v: number | null) => v == null ? '—' : unit === 'pct' ? pct(v) : unit === 'x' ? xv(v) : unit === 'day' ? day(v) : v.toFixed(2)
    const base = cur == null ? '—' : fv(cur)
    const target = fv(tgt)
    const totalAssets = fd?.totalAssets ?? null
    const rev = fd?.revenue ?? null
    const kvBorç = fd?.shortTermFinancialDebt ?? null
    const stok = fd?.inventory ?? null
    const alacak = fd?.tradeReceivables ?? null

    switch (key) {
      case 'currentRatio':
        return `Cari oran ${base}'dan ${target}'e yükseltilmeli. Bu hedefe ulaşmak için iki temel yol vardır: (1) Kısa vadeli finansal borçların bir kısmını (yaklaşık ${mn(kvBorç ? kvBorç * 0.30 : null)}) 36-48 ay vadeli uzun vadeli krediye çevirerek KV yükümlülükleri azaltmak — bu işlem hem cari oranı hem de likidite skorunu doğrudan iyileştirir; (2) Tahsilat sürecini hızlandırarak (müşteri çek vadeleri kısaltılması, erken ödeme iskontosu sunulması) dönen varlıkları büyütmek. Bankalarla müzakere ederken mevcut kredi kullanım oranının azaltılması ve kullanılmayan kredi limitleri devreye alınabilir.`
      case 'quickRatio':
        return `Asit-test oranı ${base}'dan ${target}'e çıkarılmalı. Bu oran, stoklar hariç likit varlıkların kısa vadeli borçlara oranıdır. İyileştirme için: (1) Mevcut stokların daha hızlı nakde çevrilmesi — stoklarda %20-30 indirimle ivecen satış ya da spot ihracat kampanyaları; (2) Nakit ve benzeri varlıkların artırılması — vadeli mevduat hesaplarındaki fonların cari hesaba aktarılması; (3) Kısa vadeli ticari borçların tedarikçilerle yeniden yapılandırılarak 60-90 gün'e uzatılması. Bu adımlar eş zamanlı uygulandığında asit-test oranında belirgin iyileşme görülür.`
      case 'netProfitMargin':
        return `Net kâr marjı ${base}'dan ${target}'e yükseltilmeli; bu ${rev != null ? `${mn(rev! * (tgt - (cur??0)))} ek kâr` : 'anlamlı ek kâr'} demektir. Uygulama adımları: (1) **Maliyet kontrolü**: Satışların maliyeti (SMM) içindeki hammadde, işçilik ve genel üretim giderlerinin kalemler bazında analiz edilmesi; alternatif tedarikçi müzakereleri ile %5-8 tasarruf hedefi; (2) **Fiyatlama güçlendirmesi**: Ürün/hizmet karmasında yüksek marjlı kalemlerin payının artırılması, müşteri segmentasyonuna göre dinamik fiyatlama; (3) **Faaliyet giderleri**: Personel verimliliği ölçümleri, enerji tasarrufu projeleri, dijitalleşme yatırımları ile genel gider tabanının küçültülmesi. Hedef marj, sektör ortalaması olan %${(bm.netProfitMargin*100).toFixed(1)}'ın üzerine çıkmaktır.`
      case 'ebitdaMargin':
        return `FAVÖK marjı ${base}'dan ${target}'e yükseltilmeli. FAVÖK; faiz, amortisman ve vergi öncesi operasyonel kârlılığı ölçer — bankalar bu göstergeye özellikle dikkat eder. İyileştirme için: (1) Operasyonel verimlilik projeleri — süreç otomasyonu, atık azaltma, kapasite kullanım oranını artırma; (2) Değer zinciri analizi ile katma değer yaratmayan faaliyetlerin elimine edilmesi; (3) Sabit gider yapısının esnekleştirilmesi — uzun dönemli kira taahhütlerinin yeniden müzakere edilmesi, değişken maliyet oranının artırılması. Sektör FAVÖK ortalaması %${(bm.ebitdaMargin*100).toFixed(1)}'dır; bu eşiğin aşılması kredi notunu doğrudan etkiler.`
      case 'grossMargin':
        return `Brüt kâr marjı ${base}'dan ${target}'e çıkarılmalı. Brüt marj, temel rekabetçi gücün göstergesidir. Adımlar: (1) **Tedarik zinciri optimizasyonu**: Büyük hacimli alımlarda iskonto müzakereleri, toplu sipariş avantajları, tedarikçi sayısının azaltılarak stratejik ortaklıkların güçlendirilmesi; (2) **Ürün/hizmet karması**: Düşük marjlı ürünlerin üretim programından çıkarılması veya fiyat artışı, yüksek marjlı premium segmentin büyütülmesi; (3) **Üretim verimliliği**: Fire ve ıskarta oranlarının düşürülmesi, makine verimliliğinin artırılması (OEE hedefi ≥ %85).`
      case 'roa':
        return `Aktif kârlılığı (ROA) ${base}'dan ${target}'e çıkarılmalı. Bu oran, her ${mn(totalAssets)} varlıktan ne kadar kâr üretildiğini gösterir. İyileştirme yolları: (1) **Kârlılık artışı** (pay): Net kâr marjı iyileştirme önerilerini uygulayın; (2) **Varlık verimliliği** (payda): Kullanılmayan veya düşük verimli varlıkların (atıl makine, boş gayrimenkul, uzun vadeli yatırımlar) tasfiyesi; (3) **Alacak ve stok yönetimi**: Dönen varlıkların küçültülmesi ile aynı kâr daha küçük aktifle üretilir — aktif devir hızı artar, ROA yükselir. Sektör ROA ortalaması %${(bm.roa*100).toFixed(1)}'dır.`
      case 'debtToEquity':
        return `Borç/özkaynak oranı ${base}'dan ${target}'e indirilmeli. Bu oran ${base} iken her 1 TL özkaynak için ${base} TL borç kullanılıyor demektir — hedef ${target}'e inmek anlamına gelir. Uygulama: (1) **Borç geri ödemesi**: Öncelikle en yüksek faizli kredilerin kapatılması; serbest nakit akışının %60-70'inin borç amortismanına yönlendirilmesi; (2) **Özkaynak artırımı**: Kâr dağıtımının sınırlandırılarak kârın içsel büyüme için tutulması (kâr yedeklemesi); mevcut ortakların sermaye katkısı veya stratejik ortak girişi; (3) **Varlık bazlı finansman**: Gayrimenkul veya ekipman sat-geri-kirala işlemi ile nakit sağlanması ve kısa vadeli borcun kapatılması.`
      case 'debtToAssets':
        return `Borç/aktif oranı ${base}'dan ${target}'e indirilmeli. Mevcut durumda aktifin ${base}'ı borçla finanse ediliyor; hedef ${target}'e çekilmektir. Adımlar: (1) Uzun vadeli yatırım finansmanında öz kaynak ağırlığının artırılması — yeni yatırımları %40+ öz kaynakla finanse etme politikası benimsenmesi; (2) Kısa vadeli çalışma sermayesi finansmanında tedarikçi vadelerinin uzatılması, müşteri avansı alınması — bu yöntemler banka borcu ihtiyacını azaltır; (3) Aktif tarafında atıl varlık satışı ile toplam aktiflerin küçültülmesi ve borcun aynı anda kapatılması.`
      case 'interestCoverage':
        return `Faiz karşılama oranı ${base}'dan ${target}'e yükseltilmeli. Bu oran, FAVÖK'ün finansman giderlerini kaç kez karşıladığını gösterir — bankaların kredi tahsis kararında kritik eşik genellikle 3x'dir. İyileştirme: (1) **FAVÖK artışı** (pay): Operasyonel verimlilik ve kârlılık önerileri uygulandığında faiz karşılama otomatik olarak iyileşir; (2) **Faiz gideri azaltımı** (payda): Yüksek faizli kredilerin daha düşük faizli alternatiflerle refinanse edilmesi — mevcut piyasa koşullarında sabit faizli uzun vadeli enstrümanlara geçiş; (3) Kredi teminat kalitesinin iyileştirilerek (ipotek, kefalet) faiz marjında 100-200 baz puan indirim talep edilmesi.`
      case 'receivablesTurnoverDays':
        return `Alacak tahsil süresi ${base}'dan ${target}'e kısaltılmalı. Mevcut durumda alacakların tahsili ortalama ${base} sürüyor; bu sektör ortalaması ${day(bm.receivablesDays)}'ın ${(cur??0) > bm.receivablesDays ? 'üzerinde' : 'altında'}. Pratik adımlar: (1) **Tahsilat politikası**: Vadesi 30 günü aşan alacaklar için otomatik hatırlatma sistemi kurulması; 90 gün üzerindeki alacaklar için hukuki süreç başlatılması; (2) **Erken ödeme teşviki**: Nakit ödeme veya 10 gün içi ödeme için %1-2 iskonto sunulması — finansman maliyetinden ucuz olduğunda ekonomik; (3) **Müşteri limiti yönetimi**: Yüksek alacak bakiyeli müşterilere yeni sipariş limitinin geçici dondurulması; akreditif ve banka teminat mektubu uygulaması.`
      case 'inventoryTurnoverDays':
        return `Stok devir süresi ${base}'dan ${target}'e indirilmeli. Mevcut ${base} ile ${mn(stok)} tutarında stok bağlı sermaye var demektir. İyileştirme adımları: (1) **Talep tahmini**: Satış geçmiş verilerine dayalı ABC analizinin uygulanması — A grubu (yüksek değer) ürünlerde minimum stok, C grubu ürünlerde sipariş bazlı üretim; (2) **Tedarik zinciri**: Tedarikçi teslimat sürelerinin kısaltılması, JIT (tam zamanında üretim) yaklaşımı — bu adım stok miktarını %20-35 düşürebilir; (3) **Yavaş hareket eden stoklar**: Stok yaşlandırma raporu ile 180 gün üzeri kalan kalemlerin belirlenmesi ve kampanya/iskonto ile tasfiyesi.`
      case 'assetTurnover':
        return `Aktif devir hızı ${base}'dan ${target}'e çıkarılmalı. Bu oran, varlık başına üretilen ciro verimliliğini ölçer. Adımlar: (1) **Ciro artışı**: Satış kanallarının çeşitlendirilmesi, yeni müşteri segmentlerine girilmesi, ihracat kanallarının açılması — aynı aktif tabanıyla daha fazla ciro üretmek; (2) **Varlık optimizasyonu**: Kullanılmayan makine ve ekipmanların satışa çıkarılması veya kiralanması; (3) **Kapasite kullanımı**: Vardiya sayısının artırılması, alt yüklenici modeli ile ek kapasitenin dışarıdan sağlanması — sabit varlıklara yatırım yapmadan ciro artışı.`
      default:
        return `${key}: ${base}'dan ${target}'e iyileştirme hedeflenmektedir. İlgili finansal kalemlerin analizi ve eylem planı için finans uzmanınıza danışınız.`
    }
  }

  // ── Otomatik Senaryo Hesabı ───────────────────────────────────────────────
  interface ScenarioResult {
    title: string
    subtitle: string
    color: string
    rows: { label: string; from: string; to: string; change: string }[]
    projScore: number
    projRating: string
    delta: number
    applicable: boolean
  }

  const sector = analysis.entity?.sector

  // Yardımcı: finansal veriden oran hesapla ve skor döndür
  function scenarioScore(overrides: Partial<typeof fd>): { score: number; rating: string } {
    if (!fd) return { score: cs, rating: rtng }
    const merged = { ...fd, ...overrides }
    const uvFinDebt = merged.longTermFinancialDebt ?? 0
    const otherUV   = (merged.totalNonCurrentLiabilities ?? 0) - (fd.longTermFinancialDebt ?? 0)
    const newUV     = uvFinDebt + Math.max(0, otherUV)

    const input = {
      cash: merged.cash, shortTermInvestments: null,
      tradeReceivables: merged.tradeReceivables, inventory: merged.inventory,
      otherCurrentAssets: null, totalCurrentAssets: merged.totalCurrentAssets,
      tangibleAssets: merged.tangibleAssets, intangibleAssets: null,
      longTermInvestments: null, otherNonCurrentAssets: null,
      totalNonCurrentAssets: merged.totalNonCurrentAssets, totalAssets: merged.totalAssets,
      shortTermFinancialDebt: merged.shortTermFinancialDebt,
      tradePayables: merged.tradePayables, otherCurrentLiabilities: null,
      totalCurrentLiabilities: merged.totalCurrentLiabilities,
      longTermFinancialDebt: merged.longTermFinancialDebt,
      otherNonCurrentLiabilities: null,
      totalNonCurrentLiabilities: newUV,
      paidInCapital: null, retainedEarnings: null, netProfitCurrentYear: null,
      totalEquity: merged.totalEquity,
      totalLiabilitiesAndEquity: merged.totalLiabilitiesAndEquity,
      revenue: merged.revenue, cogs: merged.cogs, grossProfit: merged.grossProfit,
      operatingExpenses: merged.operatingExpenses, ebit: merged.ebit,
      depreciation: null, ebitda: merged.ebitda,
      interestExpense: merged.interestExpense, otherIncome: null, otherExpense: null,
      ebt: null, taxExpense: null, netProfit: merged.netProfit, purchases: null,
    }
    const newRatios = calculateRatios(input)
    const newScore  = calculateScore(newRatios, sector).finalScore
    const newRating = scoreToRating(newScore)
    return { score: newScore, rating: newRating }
  }

  const scenarios: ScenarioResult[] = []

  // SENARYO A: KV→UV Borç Yapılandırma (%70, 48 ay)
  if (fd && fd.shortTermFinancialDebt && fd.shortTermFinancialDebt > 0) {
    const kvDebt   = fd.shortTermFinancialDebt
    const transfer = kvDebt * 0.70
    const newKV    = kvDebt * 0.30
    const newTCL   = (fd.totalCurrentLiabilities ?? 0) - transfer
    const newLTFD  = (fd.longTermFinancialDebt ?? 0) + transfer
    const newUVTL  = (fd.totalNonCurrentLiabilities ?? 0) + transfer

    const { score: sA, rating: rA } = scenarioScore({
      shortTermFinancialDebt: newKV,
      totalCurrentLiabilities: newTCL,
      longTermFinancialDebt: newLTFD,
      totalNonCurrentLiabilities: newUVTL,
    })
    const deltaA = Math.round(Math.min(100, cs + (sA - baseFinancialScore) * 0.70))
    const ratingA = scoreToRating(deltaA)
    scenarios.push({
      title: 'Borç Yapılandırma',
      subtitle: 'KV finansal borçların %70\'ini 48 aylık UV krediye dönüştür',
      color: '#f97316',
      rows: [
        {
          label: 'KV Finansal Borç',
          from: moneyStr(kvDebt),
          to:   moneyStr(newKV),
          change: `${moneyStr(transfer)} UV\'ye taşındı`,
        },
        {
          label: 'Cari Oran (tahmini)',
          from: xStr(r.currentRatio),
          to:   xStr(newTCL > 0 && fd.totalCurrentAssets ? fd.totalCurrentAssets / newTCL : null),
          change: 'KV yükümlülük azaldı',
        },
      ],
      projScore: deltaA,
      projRating: ratingA,
      delta: deltaA - cs,
      applicable: deltaA >= cs,
    })
  }

  // SENARYO B: Sermaye Artışı (%25)
  if (fd && fd.totalEquity && (r.equityRatio == null || (r.equityRatio as number) < 0.45)) {
    const addEquity   = fd.totalEquity * 0.25
    const newEquity   = fd.totalEquity + addEquity
    const newAssets   = (fd.totalAssets ?? 0) + addEquity
    const newCurrA    = (fd.totalCurrentAssets ?? 0) + addEquity
    const newTA       = newAssets
    const { score: sB, rating: rB } = scenarioScore({
      totalEquity:        newEquity,
      totalAssets:        newTA,
      totalCurrentAssets: newCurrA,
      totalLiabilitiesAndEquity: newTA,
      cash: (fd.cash ?? 0) + addEquity,
    })
    const deltaB = Math.round(Math.min(100, cs + (sB - baseFinancialScore) * 0.70))
    const ratingB = scoreToRating(deltaB)
    scenarios.push({
      title: 'Sermaye Güçlendirme',
      subtitle: 'Ortaklar katkısı veya kâr yedeklemesiyle özkaynak %25 artışı',
      color: '#0ea5e9',
      rows: [
        {
          label: 'Özkaynak',
          from: moneyStr(fd.totalEquity),
          to:   moneyStr(newEquity),
          change: `+${moneyStr(addEquity)} nakit enjeksiyonu`,
        },
        {
          label: 'Özkaynak Oranı (tahmini)',
          from: pctStr(r.equityRatio),
          to:   pctStr(newTA > 0 ? newEquity / newTA : null),
          change: 'Finansal sağlamlık artıyor',
        },
      ],
      projScore: deltaB,
      projRating: ratingB,
      delta: deltaB - cs,
      applicable: deltaB >= cs,
    })
  }

  // SENARYO C: Kârlılık İyileştirmesi
  if (fd && fd.revenue && fd.revenue > 0) {
    const targetMargin  = Math.max(
      (bm.netProfitMargin),
      (r.netProfitMargin as number ?? 0) + 0.03
    )
    const newNetProfit  = fd.revenue * targetMargin
    const newEbitda     = fd.ebitda != null
      ? fd.ebitda + (newNetProfit - (fd.netProfit ?? 0))
      : null
    const newEbit       = fd.ebit != null
      ? fd.ebit + (newNetProfit - (fd.netProfit ?? 0))
      : null
    const newEquity     = (fd.totalEquity ?? 0) + (newNetProfit - (fd.netProfit ?? 0))
    const { score: sC, rating: rC } = scenarioScore({
      netProfit:   newNetProfit,
      ebitda:      newEbitda,
      ebit:        newEbit,
      totalEquity: newEquity,
    })
    if (sC > cs + 1) {
      scenarios.push({
        title: 'Kârlılık Hedefi',
        subtitle: `Net kâr marjını ${pctStr(r.netProfitMargin)}'dan ${pctStr(targetMargin)}'a çıkar`,
        color: '#16a34a',
        rows: [
          {
            label: 'Net Kâr / Zarar',
            from: moneyStr(fd.netProfit),
            to:   moneyStr(newNetProfit),
            change: fd.netProfit != null ? `+${moneyStr(newNetProfit - fd.netProfit)}` : '',
          },
          {
            label: 'Net Kâr Marjı',
            from: pctStr(r.netProfitMargin),
            to:   pctStr(targetMargin),
            change: 'Maliyet kısıtı veya fiyatlama güçlendirmesi',
          },
        ],
        projScore: Math.round(Math.min(100, cs + (sC - baseFinancialScore) * 0.70)),
        projRating: scoreToRating(Math.round(Math.min(100, cs + (sC - baseFinancialScore) * 0.70))),
        delta: Math.round(Math.min(100, cs + (sC - baseFinancialScore) * 0.70)) - cs,
        applicable: true,
      })
    }
  }

  const ratioTable: { group: string; color: string; rows: { label: string; val: string; avg: string; s: St }[] }[] = [
    {
      group: 'Likidite', color: '#0ea5e9',
      rows: [
        { label: 'Cari Oran',              val: r.currentRatio != null ? fmtX(r.currentRatio) : '—',                avg: fmtX(bm.currentRatio),      s: st(r.currentRatio, false, bm.currentRatio * 0.6, bm.currentRatio * 0.9) },
        { label: 'Asit-Test (Hızlı)',      val: r.quickRatio != null ? fmtX(r.quickRatio) : '—',                  avg: fmtX(bm.quickRatio),        s: st(r.quickRatio, false, bm.quickRatio * 0.5, bm.quickRatio * 0.85) },
        { label: 'Nakit Oranı',            val: r.cashRatio != null ? fmtX(r.cashRatio) : '—',                    avg: '—',                        s: st(r.cashRatio, false, 0.05, 0.15) },
        { label: 'NÇS / Aktif',            val: r.netWorkingCapitalRatio != null ? fmtPct(r.netWorkingCapitalRatio) : '—', avg: '—',              s: st(r.netWorkingCapitalRatio, false, 0, 0.05) },
        { label: 'Nakit Dönüşüm Süresi',  val: r.cashConversionCycle != null ? fmtDay(r.cashConversionCycle) : '—', avg: '—',                  s: st(r.cashConversionCycle, true, 120, 60) },
      ]
    },
    {
      group: 'Karlılık', color: '#0ea5e9',
      rows: [
        { label: 'Brüt Kâr Marjı',        val: r.grossMargin != null ? fmtPct(r.grossMargin) : '—',              avg: fmtPct(bm.grossMargin),     s: st(r.grossMargin, false, bm.grossMargin * 0.5, bm.grossMargin * 0.85) },
        { label: 'FAVÖK Marjı',            val: r.ebitdaMargin != null ? fmtPct(r.ebitdaMargin) : '—',            avg: fmtPct(bm.ebitdaMargin),    s: st(r.ebitdaMargin, false, bm.ebitdaMargin * 0.4, bm.ebitdaMargin * 0.8) },
        { label: 'FVÖK Marjı (EBIT)',      val: r.ebitMargin != null ? fmtPct(r.ebitMargin) : '—',                avg: '—',                        s: st(r.ebitMargin, false, 0, 0.05) },
        { label: 'Net Kâr Marjı',          val: r.netProfitMargin != null ? fmtPct(r.netProfitMargin) : '—',      avg: fmtPct(bm.netProfitMargin), s: st(r.netProfitMargin, false, 0, bm.netProfitMargin * 0.7) },
        { label: 'Aktif Karlılığı (ROA)',  val: r.roa != null ? fmtPct(r.roa) : '—',                            avg: fmtPct(bm.roa),             s: st(r.roa, false, 0, bm.roa * 0.7) },
        { label: 'Özkaynak Karlılığı (ROE)', val: r.roe != null ? fmtPct(r.roe) : '—',                          avg: fmtPct(bm.roe),             s: st(r.roe, false, 0, bm.roe * 0.7) },
        { label: 'Yatırım Getirisi (ROIC)', val: r.roic != null ? fmtPct(r.roic) : '—',                         avg: '—',                        s: st(r.roic, false, 0, 0.08) },
        { label: 'Nominal Gelir Büyümesi', val: r.revenueGrowth != null ? fmtPct(r.revenueGrowth) : '—',         avg: '—',                        s: st(r.revenueGrowth, false, -0.05, 0.10) },
        { label: 'Reel Büyüme (ÜFE Dzt.)', val: r.realGrowth != null ? fmtPct(r.realGrowth) : '—',             avg: '—',                        s: st(r.realGrowth, false, -0.10, 0.05) },
      ]
    },
    {
      group: 'Kaldıraç', color: '#f97316',
      rows: [
        { label: 'Borç / Özkaynak',        val: r.debtToEquity != null ? fmtX(r.debtToEquity) : '—',             avg: fmtX(bm.debtToEquity),      s: st(r.debtToEquity, true, bm.debtToEquity * 2.2, bm.debtToEquity * 1.3) },
        { label: 'Borç / Aktif',           val: r.debtToAssets != null ? fmtPct(r.debtToAssets) : '—',           avg: fmtPct(bm.debtToAssets),    s: st(r.debtToAssets, true, bm.debtToAssets * 1.5, bm.debtToAssets * 1.15) },
        { label: 'Özkaynak Oranı',         val: r.equityRatio != null ? fmtPct(r.equityRatio) : '—',             avg: '—',                        s: st(r.equityRatio, false, 0.20, 0.35) },
        { label: 'KV Borç Oranı',          val: r.shortTermDebtRatio != null ? fmtPct(r.shortTermDebtRatio) : '—', avg: '—',                     s: st(r.shortTermDebtRatio, true, 0.85, 0.65) },
        { label: 'Net Borç / FAVÖK',       val: r.debtToEbitda != null ? (r.debtToEbitda < 0 ? 'Net Nakit' : fmtX(r.debtToEbitda, 1)) : '—', avg: '3.0x', s: st(r.debtToEbitda, true, 7.0, 4.0) },
        { label: 'Faiz Karşılama',         val: r.interestCoverage === Infinity ? '∞ (Faiz Yok)' : r.interestCoverage != null ? fmtX(r.interestCoverage, 1) : '—', avg: fmtX(bm.interestCoverage, 1), s: r.interestCoverage === Infinity ? 'good' : st(r.interestCoverage, false, 1.2, bm.interestCoverage * 0.7) },
      ]
    },
    {
      group: 'Faaliyet', color: '#f59e0b',
      rows: [
        { label: 'Aktif Devir Hızı',       val: r.assetTurnover != null ? fmtX(r.assetTurnover) : '—',           avg: fmtX(bm.assetTurnover),     s: st(r.assetTurnover, false, bm.assetTurnover * 0.3, bm.assetTurnover * 0.75) },
        { label: 'Sabit Aktif Devir',      val: r.fixedAssetTurnover != null ? fmtX(r.fixedAssetTurnover) : '—', avg: '—',                        s: st(r.fixedAssetTurnover, false, 0.5, 1.2) },
        { label: 'Stok Devir Süresi',      val: r.inventoryTurnoverDays != null ? fmtDay(r.inventoryTurnoverDays) : '—', avg: fmtDay(bm.inventoryDays), s: st(r.inventoryTurnoverDays, true, bm.inventoryDays * 2.5, bm.inventoryDays * 1.3) },
        { label: 'Alacak Tahsil Süresi',   val: r.receivablesTurnoverDays != null ? fmtDay(r.receivablesTurnoverDays) : '—', avg: fmtDay(bm.receivablesDays), s: st(r.receivablesTurnoverDays, true, bm.receivablesDays * 2.5, bm.receivablesDays * 1.3) },
        { label: 'Borç Ödeme Süresi',      val: r.payablesTurnoverDays != null ? fmtDay(r.payablesTurnoverDays) : '—', avg: '—',                  s: st(r.payablesTurnoverDays, false, 15, 30) },
        { label: 'Faaliyet Gider Oranı',   val: r.operatingExpenseRatio != null ? fmtPct(r.operatingExpenseRatio) : '—', avg: '—',                s: st(r.operatingExpenseRatio, true, 0.55, 0.35) },
      ]
    },
  ]

  const entityName = analysis.entity?.name ?? 'Şirket'
  // Sayfa sayısı: 4 sabit (Kapak+Rasyolar+Narratif+Optimizasyon) + Senaryo + MaliVeriler
  const totalPages = 4 + (scenarios.length > 0 ? 1 : 0) + (fd ? 1 : 0)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&family=Inter:wght@300;400;600;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { background: #ffffff !important; font-family: 'Inter', sans-serif; color: #000000; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          .no-print { display: none !important; }
          body { background: #ffffff !important; }
          .page { page-break-after: always; margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, background: '#ffffff', padding: '12px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(15,23,42,0.1)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Finrate · Finansal Rapor</span>
        <button onClick={() => window.print()} style={{ background: '#0ea5e9', color: '#ffffff', border: 'none', padding: '8px 18px', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
          PDF Olarak Kaydet
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 40px', gap: 20, background: '#ffffff' }}>

        {/* ── SAYFA 1: KAPAK + SKOR ─────────────── */}
        <div className="page" style={{ width: 794, minHeight: 1123, background: '#ffffff', padding: '0', position: 'relative', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>

          {/* Üst bant lacivert */}
          <div style={{ background: '#0a1f3a', padding: '24px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'Merriweather, serif', fontWeight: 900, fontSize: 32, color: '#ffffff', letterSpacing: 2, lineHeight: 1 }}>FINRATE</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, letterSpacing: 1 }}>Finansal Derecelendirme Raporu</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8', lineHeight: 1.8 }}>
              <div>Rapor Tarihi: {now}</div>
              <div>Dönem: {analysis.year} · {PERIOD_LABEL[analysis.period] ?? analysis.period}</div>
            </div>
          </div>

          <div style={{ padding: '20px 48px 60px' }}>

            {/* Şirket Başlığı */}
            <div style={{ background: '#ffffff', borderRadius: 16, padding: '18px 24px', boxShadow: '0 2px 12px rgba(15,23,42,0.08)', marginBottom: 20, border: '1px solid rgba(15,23,42,0.06)' }}>
              <div style={{ fontSize: 10, color: '#0ea5e9', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
                {analysis.entity?.sector ?? 'Sektör Belirtilmemiş'}
              </div>
              <div style={{ fontFamily: 'Merriweather, serif', fontSize: 32, fontWeight: 900, color: '#0a1f3a', lineHeight: 1.1, marginBottom: 6 }}>
                {entityName}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Finrate · TCMB 2024 Sektör Kıyaslaması</div>
            </div>

            {/* Ana Skor — 2 kolon grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

              {/* Sol: SVG Donut */}
              <div style={{ background: '#ffffff', borderRadius: 16, padding: '20px 16px', textAlign: 'center', boxShadow: '0 2px 12px rgba(15,23,42,0.08)', border: `1px solid rgba(15,23,42,0.06)`, borderTop: `4px solid ${rColor}` }}>
                <div style={{ fontSize: 10, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Finrate Skoru</div>
                <DonutChart score={cs} rColor={rColor} />
                <div style={{ fontFamily: 'Merriweather, serif', fontSize: 36, fontWeight: 900, color: rColor, marginTop: 8 }}>{rtng}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{TEMINAT[rtng]}</div>
              </div>

              {/* Sağ: SVG bar grafikleri */}
              <div style={{ background: '#ffffff', borderRadius: 16, padding: '20px 20px', boxShadow: '0 2px 12px rgba(15,23,42,0.08)', border: '1px solid rgba(15,23,42,0.06)' }}>
                <div style={{ fontSize: 10, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>Kategori Skorları</div>
                {catBars.map(bar => (
                  <div key={bar.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>{bar.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: bar.color }}>{bar.val}</span>
                    </div>
                    <CatBar val={bar.val} color={bar.color} />
                  </div>
                ))}
              </div>
            </div>

            {/* Mali Özet — 4 kart */}
            {fd && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Net Satışlar',   val: fmtNum(fd.revenue),     accent: '#0ea5e9' },
                  { label: 'Brüt Kâr',       val: fmtNum(fd.grossProfit), accent: '#0ea5e9' },
                  { label: 'FAVÖK',          val: fmtNum(fd.ebitda),      accent: '#f97316' },
                  { label: 'Net Kâr/Zarar',  val: fmtNum(fd.netProfit),   accent: fd.netProfit != null && fd.netProfit < 0 ? '#dc2626' : '#16a34a' },
                ].map(kpi => (
                  <div key={kpi.label} style={{ background: '#ffffff', borderRadius: 12, padding: '16px 12px', textAlign: 'center', boxShadow: '0 1px 6px rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.06)', borderTop: `3px solid ${kpi.accent}` }}>
                    <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{kpi.label}</div>
                    <div style={{ fontFamily: 'Merriweather, serif', fontSize: 18, fontWeight: 900, color: kpi.accent }}>{kpi.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Rating Skalası */}
            <RatingScaleBand activeRating={rtng} />

          </div>

          {/* Footer */}
          <div style={{ position: 'absolute', bottom: 24, left: 56, right: 56 }}>
            <div style={{ height: 1, background: '#e2e8f0', marginBottom: 10 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
              <span>finrate.app | Gizli &amp; Kurumsal</span>
              <span>{entityName} · {now}</span>
              <span>Sayfa 1 / {totalPages}</span>
            </div>
          </div>
        </div>

        {/* ── SAYFA 2: RASYOLAR ─────────────────── */}
        <div className="page" style={{ width: 794, minHeight: 1123, background: '#ffffff', padding: '0', position: 'relative', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>

          {/* Banner */}
          <div style={{ background: '#0a1f3a', padding: '18px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'Merriweather, serif', fontWeight: 900, fontSize: 18, color: '#ffffff' }}>FINRATE</div>
            <div style={{ fontSize: 11, color: '#38e2d4', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Finansal Oran Analizi</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{entityName} · {analysis.year}</div>
          </div>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #0ea5e9 0%, #38e2d4 100%)' }} />

          <div style={{ padding: '20px 48px 60px' }}>

            {/* Kolon başlıkları */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 60px 64px', gap: 0, padding: '8px 12px', marginBottom: 4, borderBottom: '2px solid #e2e8f0', background: '#ffffff', borderRadius: '8px 8px 0 0' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>Oran</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#0f172a', letterSpacing: 2, textTransform: 'uppercase', textAlign: 'right' }}>Firma</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', textAlign: 'right' }}>Sektör Ort.</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>Gösterge</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>Durum</span>
            </div>

            {/* Rasyo tablosu */}
            {ratioTable.map(section => (
              <div key={section.group} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#f8fafc', borderLeft: `4px solid ${section.color}`, borderRadius: '0 4px 4px 0', marginBottom: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: section.color, letterSpacing: 2, textTransform: 'uppercase' }}>
                    {section.group}
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <tbody>
                    {section.rows.map((row, i) => (
                      <tr key={row.label} style={{ borderBottom: `1px solid #ffffff`, background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{row.label}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: row.val === '—' ? '#cbd5e1' : '#0f172a', fontVariantNumeric: 'tabular-nums', width: 90 }}>{row.val}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 400, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', width: 90 }}>{row.avg}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', width: 60 }}>
                          {row.val !== '—' && <MiniBar firmVal={row.val} avgVal={row.avg} s={row.s} />}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', width: 64 }}>
                          {row.val !== '—' && <StatusBadge s={row.s} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <PageFooter entityName={entityName} now={now} pageNum={2} total={totalPages} />
        </div>

        {/* ── SAYFA 3: NARATİF ANALİZ ──────────────── */}
        <div className="page" style={{ width: 794, minHeight: 1123, background: '#ffffff', padding: '0', position: 'relative', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>

          <div style={{ background: '#0a1f3a', padding: '18px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'Merriweather, serif', fontWeight: 900, fontSize: 18, color: '#ffffff' }}>FINRATE</div>
            <div style={{ fontSize: 11, color: '#38e2d4', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Finansal Değerlendirme</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{entityName} · {analysis.year}</div>
          </div>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #0ea5e9 0%, #38e2d4 100%)' }} />

          <div style={{ padding: '20px 48px 60px' }}>
            {[
              { title: 'Genel Değerlendirme', color: rColor, items: genel },
              { title: 'Karlılık', color: '#0ea5e9', items: karl },
              { title: 'Likidite', color: '#0ea5e9', items: liki },
              { title: 'Borçlanma', color: '#f97316', items: borc },
              { title: 'Faaliyet Etkinliği', color: '#f59e0b', items: faal },
            ].map(section => section.items.length === 0 ? null : (
              <div key={section.title} style={{ background: '#ffffff', borderRadius: 12, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 6px rgba(15,23,42,0.06)', borderLeft: `4px solid ${section.color}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: section.color, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>{section.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {section.items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, color: item.level === 'iyi' ? '#16a34a' : item.level === 'kötü' ? '#dc2626' : '#d97706', marginTop: 1 }}>
                        {item.level === 'iyi' ? '✓' : item.level === 'kötü' ? '✗' : '△'}
                      </span>
                      <span style={{ fontSize: 11, color: item.level === 'iyi' ? '#166534' : item.level === 'kötü' ? '#991b1b' : '#0f172a', lineHeight: 1.6 }}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <PageFooter entityName={entityName} now={now} pageNum={3} total={totalPages} />
        </div>

        {/* ── SAYFA 4: OPTİMİZASYON YOL HARİTASI ──── */}
        <div className="page" style={{ width: 794, minHeight: 1123, background: '#ffffff', padding: '0', position: 'relative', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>

          <div style={{ background: '#0a1f3a', padding: '18px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'Merriweather, serif', fontWeight: 900, fontSize: 18, color: '#ffffff' }}>FINRATE</div>
            <div style={{ fontSize: 11, color: '#38e2d4', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Rating Artırma Yol Haritası</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{entityName} · {analysis.year}</div>
          </div>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #0ea5e9 0%, #38e2d4 100%)' }} />

          <div style={{ padding: '20px 48px 60px' }}>

            {/* Hedef özeti — +1 ve +2 not */}
            <div style={{ display: 'grid', gridTemplateColumns: next2Rating ? '1fr 28px 1fr 28px 1fr 28px 1fr' : '1fr 28px 1fr 28px 1fr', gap: 0, marginBottom: 20, alignItems: 'center' }}>
              <div style={{ background: '#ffffff', border: `2px solid ${rColor}`, borderRadius: 10, padding: '14px 12px', textAlign: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
                <div style={{ fontSize: 8, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Mevcut</div>
                <div style={{ fontFamily: 'Merriweather, serif', fontSize: 30, fontWeight: 900, color: rColor }}>{rtng}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>{cs} puan</div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 16, color: '#94a3b8' }}>→</div>
              <div style={{ background: '#f0fdf4', border: `2px solid ${(RATING_COLOR[nextRating] ?? '#38e2d4')}`, borderRadius: 10, padding: '14px 12px', textAlign: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
                <div style={{ fontSize: 8, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>+1 Not Hedefi</div>
                <div style={{ fontFamily: 'Merriweather, serif', fontSize: 30, fontWeight: 900, color: RATING_COLOR[nextRating] ?? '#38e2d4' }}>{nextRating}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>≥ {optResult.targetScore} puan</div>
                <div style={{ fontSize: 9, color: optResult.achievable ? '#16a34a' : '#f97316', fontWeight: 700, marginTop: 4 }}>
                  {optResult.achievable ? '✓ Ulaşılabilir' : `${optResult.projectedScore} puana erişebilir`}
                </div>
              </div>
              {next2Rating && optResult2 && (<>
              <div style={{ textAlign: 'center', fontSize: 16, color: '#94a3b8' }}>→</div>
              <div style={{ background: '#eff6ff', border: `2px solid ${(RATING_COLOR[next2Rating] ?? '#0ea5e9')}`, borderRadius: 10, padding: '14px 12px', textAlign: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
                <div style={{ fontSize: 8, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>+2 Not Hedefi</div>
                <div style={{ fontFamily: 'Merriweather, serif', fontSize: 30, fontWeight: 900, color: RATING_COLOR[next2Rating] ?? '#0ea5e9' }}>{next2Rating}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>≥ {optResult2.targetScore} puan</div>
                <div style={{ fontSize: 9, color: optResult2.achievable ? '#16a34a' : '#f97316', fontWeight: 700, marginTop: 4 }}>
                  {optResult2.achievable ? '✓ Ulaşılabilir' : `Ek eylem gerekli`}
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 16, color: '#94a3b8' }}>→</div>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 12px', textAlign: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
                <div style={{ fontSize: 8, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Uzun Vade</div>
                <div style={{ fontFamily: 'Merriweather, serif', fontSize: 22, fontWeight: 900, color: '#94a3b8' }}>BBB+</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Yatırım sınıfı</div>
              </div>
              </>)}
            </div>

            {/* Öneri Tablosu */}
            {optResult.suggestions.length > 0 && (
              <div style={{ background: '#ffffff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(15,23,42,0.06)', marginBottom: 24 }}>
                <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>Öncelikli İyileştirme Adımları</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>#</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>Metrik</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>Kategori</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>Mevcut</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>Hedef</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 9, fontWeight: 700, color: '#38e2d4', letterSpacing: 2, textTransform: 'uppercase' }}>Puan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optResult.suggestions.map((s, i) => {
                      const catColor: Record<string, string> = { Likidite: '#0ea5e9', Karlılık: '#0ea5e9', Kaldıraç: '#f97316', Faaliyet: '#f59e0b' }
                      const cc = catColor[s.category] ?? '#64748b'
                      const fmtV = (v: number | null, u: typeof s.unit) => {
                        if (v == null) return '—'
                        if (u === 'pct') return `%${(v*100).toFixed(1)}`
                        if (u === 'x')   return `${v.toFixed(2)}x`
                        if (u === 'day') return `${Math.round(v)} gün`
                        return v.toFixed(2)
                      }
                      return (
                        <tr key={s.key} style={{ borderBottom: '1px solid #ffffff', background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                          <td style={{ padding: '9px 12px', color: '#94a3b8', fontWeight: 700 }}>{i+1}</td>
                          <td style={{ padding: '9px 12px', color: '#0f172a', fontWeight: 600 }}>{s.label}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: cc, background: cc + '18', padding: '2px 7px', borderRadius: 20 }}>{s.category}</span>
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{fmtV(s.currentValue, s.unit)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: cc, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtV(s.targetValue, s.unit)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#38e2d4', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>+{s.scoreGain.toFixed(1)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                      <td colSpan={5} style={{ padding: '8px 12px', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Tüm öneriler uygulandığında projeksiyon</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#38e2d4', fontWeight: 900, fontSize: 13 }}>
                        {optResult.projectedScore.toFixed(0)} puan · {optResult.projectedRating}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Aksiyon Açıklamaları */}
            {optResult.suggestions.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Aksiyon Detayları</div>
                {optResult.suggestions.map((s, i) => (
                  <div key={s.key} style={{ display: 'flex', gap: 12, marginBottom: 14, padding: '14px 16px', background: '#ffffff', borderRadius: 8, borderLeft: `3px solid ${({ Likidite: '#0ea5e9', Karlılık: '#0ea5e9', Kaldıraç: '#f97316', Faaliyet: '#f59e0b' } as Record<string,string>)[s.category] ?? '#38e2d4'}`, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: '#0a1f3a', flexShrink: 0, minWidth: 20 }}>[ ]</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{s.label}: {s.currentValue != null ? (s.unit === 'pct' ? `%${(s.currentValue*100).toFixed(1)}` : s.unit === 'x' ? `${s.currentValue.toFixed(2)}x` : s.unit === 'day' ? `${Math.round(s.currentValue)} gün` : s.currentValue.toFixed(2)) : '—'} → {s.unit === 'pct' ? `%${(s.targetValue*100).toFixed(1)}` : s.unit === 'x' ? `${s.targetValue.toFixed(2)}x` : s.unit === 'day' ? `${Math.round(s.targetValue)} gün` : s.targetValue.toFixed(2)}</div>
                      <div style={{ fontSize: 10.5, color: '#475569', lineHeight: 1.7 }}>{richAction(s.key, s.currentValue, s.targetValue, s.unit)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <PageFooter entityName={entityName} now={now} pageNum={4} total={totalPages} />
        </div>

        {/* ── SAYFA 5: SENARYO ANALİZİ ─────────────── */}
        {scenarios.length > 0 && (
          <div className="page" style={{ width: 794, minHeight: 1123, background: '#ffffff', padding: '0', position: 'relative', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>

            <div style={{ background: '#0a1f3a', padding: '18px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'Merriweather, serif', fontWeight: 900, fontSize: 18, color: '#ffffff' }}>FINRATE</div>
              <div style={{ fontSize: 11, color: '#f97316', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Senaryo Analizi</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{entityName} · {analysis.year}</div>
            </div>
            <div style={{ height: 2, background: 'linear-gradient(90deg, #0ea5e9 0%, #38e2d4 100%)' }} />

            <div style={{ padding: '20px 48px 60px' }}>

              {/* Giriş */}
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#c2410c', fontWeight: 700, marginBottom: 4 }}>Otomatik Senaryo Projeksiyonu</div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
                  Mevcut finansal yapı üzerinde uygulanabilecek aksiyonların kredi notu üzerindeki tahmini etkisi. Her senaryo bağımsız değerlendirilmiştir.
                </div>
              </div>

              {/* Senaryo Kartları */}
              {scenarios.map((sc, si) => (
                <div key={si} style={{ marginBottom: 20, background: '#ffffff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(15,23,42,0.06)', borderTop: `3px solid ${sc.color}` }}>
                  {/* Kart Başlığı */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: sc.color, letterSpacing: 0.5 }}>
                        {String.fromCharCode(65 + si)}. {sc.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>{sc.subtitle}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>Mevcut</div>
                        <div style={{ fontFamily: 'Merriweather, serif', fontSize: 22, fontWeight: 900, color: rColor }}>{rtng}</div>
                        <div style={{ fontSize: 9, color: '#94a3b8' }}>{cs} puan</div>
                      </div>
                      <div style={{ fontSize: 18, color: '#cbd5e1' }}>→</div>
                      <div style={{ textAlign: 'center', background: `${RATING_COLOR[sc.projRating] ?? sc.color}12`, borderRadius: 8, padding: '6px 14px', border: `1px solid ${RATING_COLOR[sc.projRating] ?? sc.color}30` }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>Projeksiyon</div>
                        <div style={{ fontFamily: 'Merriweather, serif', fontSize: 22, fontWeight: 900, color: RATING_COLOR[sc.projRating] ?? sc.color }}>{sc.projRating}</div>
                        <div style={{ fontSize: 9, color: sc.delta > 0 ? '#16a34a' : '#64748b', fontWeight: 700 }}>
                          {sc.delta > 0 ? `+${sc.delta.toFixed(1)}` : sc.delta.toFixed(1)} puan
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Parametre Tablosu */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #ffffff', background: '#fafafa' }}>
                        <th style={{ padding: '8px 20px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase' }}>Parametre</th>
                        <th style={{ padding: '8px 20px', textAlign: 'right', fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase' }}>Mevcut</th>
                        <th style={{ padding: '8px 20px', textAlign: 'right', fontSize: 9, fontWeight: 700, color: sc.color, letterSpacing: 2, textTransform: 'uppercase' }}>Senaryo</th>
                        <th style={{ padding: '8px 20px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase' }}>Açıklama</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sc.rows.map((row, ri) => (
                        <tr key={ri} style={{ borderBottom: '1px solid #ffffff', background: ri % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                          <td style={{ padding: '10px 20px', color: '#64748b', fontWeight: 500 }}>{row.label}</td>
                          <td style={{ padding: '10px 20px', textAlign: 'right', color: '#0f172a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{row.from}</td>
                          <td style={{ padding: '10px 20px', textAlign: 'right', color: sc.color, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{row.to}</td>
                          <td style={{ padding: '10px 20px', color: '#94a3b8', fontSize: 10 }}>{row.change}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {/* Kombine Senaryo notu */}
              {scenarios.length >= 2 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.6 }}>
                    <span style={{ color: '#f97316', fontWeight: 700 }}>Not: </span>
                    Senaryolar birbirinden bağımsız hesaplanmıştır. A ve B senaryolarının birlikte uygulanması, bağımsız toplamından farklı sonuç verebilir. Optimizasyon yol haritası için önceki sayfaya bakınız.
                  </div>
                </div>
              )}
            </div>

            <PageFooter entityName={entityName} now={now} pageNum={5} total={totalPages} />
          </div>
        )}

        {/* ── SAYFA 6: MALİ VERİLER ─────────────── */}
        {fd && (
          <div className="page" style={{ width: 794, minHeight: 1123, background: '#ffffff', padding: '0', position: 'relative', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>

            <div style={{ background: '#0a1f3a', padding: '18px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'Merriweather, serif', fontWeight: 900, fontSize: 18, color: '#ffffff' }}>FINRATE</div>
              <div style={{ fontSize: 11, color: '#38e2d4', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Mali Tablolar</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{entityName} · {analysis.year}</div>
            </div>
            <div style={{ height: 2, background: 'linear-gradient(90deg, #0ea5e9 0%, #38e2d4 100%)' }} />

            <div style={{ padding: '20px 48px 60px' }}>

              {/* Üst: Aktif | Pasif */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

                {/* AKTİF */}
                <div style={{ background: '#ffffff', borderRadius: 12, padding: '18px', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#0ea5e9', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #e0f2fe' }}>Aktif (Varlıklar)</div>
                  {([
                    ['DÖNEN VARLIKLAR', null],
                    ['Nakit ve Benzerleri', fd.cash],
                    ['Ticari Alacaklar', fd.tradeReceivables],
                    ['Stoklar', fd.inventory],
                    ['Dönen Varlıklar Toplamı', fd.totalCurrentAssets],
                    ['DURAN VARLIKLAR', null],
                    ['Maddi Duran Varlıklar', fd.tangibleAssets],
                    ['Duran Varlıklar Toplamı', fd.totalNonCurrentAssets],
                    ['TOPLAM AKTİF', fd.totalAssets],
                  ] as [string, number | null | undefined][]).map(([label, val], i) => {
                    const isSection = (label as string) === (label as string).toUpperCase() && val == null
                    const isTotal = (label as string).startsWith('TOPLAM')
                    if (isSection && !isTotal) return (
                      <div key={i} style={{ padding: '8px 0 3px', fontSize: 9, fontWeight: 800, color: '#94a3b8', letterSpacing: 2, borderTop: i > 0 ? '1px solid #ffffff' : 'none', marginTop: i > 0 ? 6 : 0, textTransform: 'uppercase' }}>{label}</div>
                    )
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: isTotal ? '7px 0' : '4px 0', borderBottom: isTotal ? '2px solid #e0f2fe' : '1px solid #f8fafc', fontSize: 11, marginTop: isTotal ? 4 : 0 }}>
                        <span style={{ color: isTotal ? '#0f172a' : '#64748b', fontWeight: isTotal ? 800 : 400 }}>{label}</span>
                        <span style={{ fontWeight: isTotal ? 900 : 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(val)}</span>
                      </div>
                    )
                  })}
                </div>

                {/* PASİF */}
                <div style={{ background: '#ffffff', borderRadius: 12, padding: '18px', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#f97316', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #ffedd5' }}>Pasif (Kaynaklar)</div>
                  {([
                    ['KISA VADELİ BORÇLAR', null],
                    ['KV Finansal Borçlar', fd.shortTermFinancialDebt],
                    ['Ticari Borçlar', fd.tradePayables],
                    ['KV Borçlar Toplamı', fd.totalCurrentLiabilities],
                    ['UZUN VADELİ BORÇLAR', null],
                    ['UV Finansal Borçlar', fd.longTermFinancialDebt],
                    ['UV Borçlar Toplamı', fd.totalNonCurrentLiabilities],
                    ['ÖZKAYNAK', null],
                    ['Toplam Özkaynak', fd.totalEquity],
                    ['TOPLAM KAYNAKLAR', fd.totalLiabilitiesAndEquity ?? fd.totalAssets],
                  ] as [string, number | null | undefined][]).map(([label, val], i) => {
                    const isSection = (label as string) === (label as string).toUpperCase() && val == null
                    const isTotal = (label as string).startsWith('TOPLAM')
                    if (isSection && !isTotal) return (
                      <div key={i} style={{ padding: '8px 0 3px', fontSize: 9, fontWeight: 800, color: '#94a3b8', letterSpacing: 2, borderTop: i > 0 ? '1px solid #ffffff' : 'none', marginTop: i > 0 ? 6 : 0, textTransform: 'uppercase' }}>{label}</div>
                    )
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: isTotal ? '7px 0' : '4px 0', borderBottom: isTotal ? '2px solid #ffedd5' : '1px solid #f8fafc', fontSize: 11, marginTop: isTotal ? 4 : 0 }}>
                        <span style={{ color: isTotal ? '#0f172a' : '#64748b', fontWeight: isTotal ? 800 : 400 }}>{label}</span>
                        <span style={{ fontWeight: isTotal ? 900 : 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(val)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Alt: Gelir Tablosu — tam genişlik */}
              <div style={{ background: '#ffffff', borderRadius: 12, padding: '18px', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #dcfce7' }}>Gelir Tablosu</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div>
                    {([
                      ['GELİRLER', null],
                      ['Net Satışlar / Ciro', fd.revenue],
                      ['Satışların Maliyeti (SMM)', fd.cogs],
                      ['Brüt Kâr', fd.grossProfit],
                    ] as [string, number | null | undefined][]).map(([label, val], i) => {
                      const isSection = (label as string) === (label as string).toUpperCase() && val == null
                      return isSection ? (
                        <div key={i} style={{ padding: '6px 0 3px', fontSize: 9, fontWeight: 800, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase' }}>{label}</div>
                      ) : (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f8fafc', fontSize: 11 }}>
                          <span style={{ color: '#64748b' }}>{label}</span>
                          <span style={{ fontWeight: 700, color: val != null && (val as number) < 0 ? '#dc2626' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(val)}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div>
                    {([
                      ['KÂRLILIK', null],
                      ['FAVÖK / EBITDA', fd.ebitda],
                      ['FVÖK / EBIT', fd.ebit],
                      ['Finansman Giderleri', fd.interestExpense],
                      ['Faaliyet Giderleri', fd.operatingExpenses],
                      ['Net Kâr / Zarar', fd.netProfit],
                    ] as [string, number | null | undefined][]).map(([label, val], i) => {
                      const isSection = (label as string) === (label as string).toUpperCase() && val == null
                      return isSection ? (
                        <div key={i} style={{ padding: '6px 0 3px', fontSize: 9, fontWeight: 800, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase' }}>{label}</div>
                      ) : (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f8fafc', fontSize: 11 }}>
                          <span style={{ color: '#64748b' }}>{label}</span>
                          <span style={{ fontWeight: 700, color: val != null && (val as number) < 0 ? '#dc2626' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(val)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <PageFooter entityName={entityName} now={now} pageNum={scenarios.length > 0 ? 6 : 5} total={totalPages} />
          </div>
        )}

      </div>
    </>
  )
}

export default function RaporPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#ffffff' }}>
        <Loader2 size={24} style={{ color: '#0ea5e9' }} />
      </div>
    }>
      <RaporContent />
    </Suspense>
  )
}
