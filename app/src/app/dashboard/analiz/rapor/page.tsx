'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Printer } from 'lucide-react'

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
  entity?: { id: string; name: string }
  financialData?: FinData | null
}

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
  CC:  'Çalışma yapılmaz',
  C:   'Çalışma yapılmaz',
  D:   'Tasfiye',
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M'
  if (abs >= 1_000)     return (v / 1_000).toFixed(1) + 'K'
  return v.toFixed(2)
}

function fmtRatio(v: number | null | undefined, unit: 'pct' | 'x' | 'days'): string {
  if (v == null) return '—'
  if (unit === 'days') return Math.round(v) + ' gün'
  if (unit === 'pct')  return (v * 100).toFixed(1) + '%'
  return v.toFixed(2) + 'x'
}

type Status = 'good' | 'warn' | 'bad'

function ratioStatus(value: number | null | undefined, min?: number, max?: number, good?: number, invert = false): Status {
  if (value == null) return 'good'
  if (invert) {
    if (max != null && value > max) return 'bad'
    if (good != null && value > good) return 'warn'
  } else {
    if (min != null && value < min) return 'bad'
    if (max != null && value > max) return 'bad'
    if (good != null && value < good) return 'warn'
  }
  return 'good'
}

function StatusIcon({ s }: { s: Status }) {
  if (s === 'good') return <span style={{ color: '#10b981' }}>✓</span>
  if (s === 'warn') return <span style={{ color: '#eab308' }}>△</span>
  return <span style={{ color: '#ef4444' }}>✗</span>
}

function RaporContent() {
  const params  = useSearchParams()
  const id      = params.get('id')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    fetch('/api/analyses').then(r => r.json()).then(d => {
      const list: Analysis[] = d.analyses ?? []
      const found = list.find(a => a.id === id)
      setAnalysis(found ?? null)
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen">
      <Loader2 size={24} className="animate-spin" />
    </div>
  )
  if (!analysis) return (
    <div className="flex justify-center items-center min-h-screen text-gray-500">
      Analiz bulunamadı.
    </div>
  )

  const r = analysis.ratios
  const now = new Date().toLocaleDateString('tr-TR')

  const ratios25: { label: string; value: number | null | undefined; unit: 'pct' | 'x' | 'days'; min?: number; max?: number; good?: number; invert?: boolean }[] = [
    { label: 'Cari Oran',            value: r.currentRatio,           unit: 'x',    min: 1.05, good: 1.4 },
    { label: 'Asit-Test Oranı',      value: r.quickRatio,             unit: 'x',    min: 0.65, good: 0.85 },
    { label: 'Nakit Oranı',          value: r.cashRatio,              unit: 'x',    min: 0.10, good: 0.2 },
    { label: 'NÇS / Aktif',          value: r.netWorkingCapitalRatio, unit: 'pct',  min: 0, good: 0.1 },
    { label: 'Nakit Dönüşüm (gün)', value: r.cashConversionCycle,    unit: 'days', max: 90, good: 60, invert: true },
    { label: 'Brüt Kâr Marjı',      value: r.grossMargin,            unit: 'pct',  min: 0.10, good: 0.25 },
    { label: 'FAVÖK Marjı',          value: r.ebitdaMargin,           unit: 'pct',  min: 0.05, good: 0.15 },
    { label: 'FVÖK Marjı',           value: r.ebitMargin,             unit: 'pct',  min: 0, good: 0.08 },
    { label: 'Net Kâr Marjı',        value: r.netProfitMargin,        unit: 'pct',  min: 0, good: 0.05 },
    { label: 'ROA',                  value: r.roa,                    unit: 'pct',  min: 0.02, good: 0.08 },
    { label: 'ROE',                  value: r.roe,                    unit: 'pct',  min: 0.05, good: 0.15 },
    { label: 'ROIC',                 value: r.roic,                   unit: 'pct',  min: 0.05, good: 0.12 },
    { label: 'Borç/Özkaynak',        value: r.debtToEquity,           unit: 'x',    max: 2.0, good: 1.0, invert: true },
    { label: 'Borç/Aktif',           value: r.debtToAssets,           unit: 'pct',  max: 0.7, good: 0.5, invert: true },
    { label: 'Net Borç/FAVÖK',       value: r.debtToEbitda,           unit: 'x',    max: 4.0, good: 2.5, invert: true },
    { label: 'Faiz Karşılama',       value: r.interestCoverage,       unit: 'x',    min: 2.0, good: 4.0 },
    { label: 'Özkaynak Oranı',       value: r.equityRatio,            unit: 'pct',  min: 0.3, good: 0.5 },
    { label: 'KV Borç Oranı',        value: r.shortTermDebtRatio,     unit: 'pct',  max: 0.7, good: 0.5, invert: true },
    { label: 'Aktif Devir Hızı',     value: r.assetTurnover,          unit: 'x',    min: 0.5, good: 1.0 },
    { label: 'Stok Devir (gün)',      value: r.inventoryTurnoverDays,  unit: 'days', max: 150, good: 90, invert: true },
    { label: 'Alacak Devir (gün)',    value: r.receivablesTurnoverDays,unit: 'days', max: 90, good: 60, invert: true },
    { label: 'Borç Devir (gün)',      value: r.payablesTurnoverDays,   unit: 'days', min: 15, good: 45 },
    { label: 'Sabit Varlık Devir',   value: r.fixedAssetTurnover,     unit: 'x',    min: 0.5, good: 1.5 },
    { label: 'Faaliyet Gider Oranı', value: r.operatingExpenseRatio,  unit: 'pct',  max: 0.5, good: 0.3, invert: true },
  ]

  const fd = analysis.financialData

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 900, margin: '0 auto', padding: 24, color: '#1a1a1a', fontSize: 11 }}>
      {/* Print butonu — ekranda görünür, baskıda gizlenir */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }} className="no-print">
        <button
          onClick={() => window.print()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8,
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          <Printer size={15} /> PDF Olarak Kaydet
        </button>
      </div>

      {/* Başlık */}
      <div style={{ borderBottom: '2px solid #0ea5e9', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0ea5e9' }}>FİNRATE</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>Finansal Derecelendirme Raporu</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#888' }}>
            <div>Rapor Tarihi: {now}</div>
            <div>Dönem: {analysis.year} · {PERIOD_LABEL[analysis.period] ?? analysis.period}</div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700 }}>
          {analysis.entity?.name ?? 'Şirket'}
        </div>
      </div>

      {/* Rating Özeti */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'FİNRATE SKORU', value: Math.round(analysis.finalScore).toString(), color: '#0ea5e9' },
          { label: 'KREDİ NOTU',    value: analysis.finalRating, color: '#f59e0b' },
          { label: 'LİKİDİTE',      value: Math.round(analysis.liquidityScore).toString(), color: '#0ea5e9' },
          { label: 'KARLILIK',      value: Math.round(analysis.profitabilityScore).toString(), color: '#10b981' },
        ].map(item => (
          <div key={item.label} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#888', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Teminat koşulu */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1 }}>TEMİNAT KOŞULU: </span>
        <span style={{ fontSize: 11, color: '#1e293b', fontWeight: 600 }}>{TEMINAT[analysis.finalRating]}</span>
      </div>

      {/* 25 Finansal Oran */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, borderBottom: '1px solid #0ea5e9', paddingBottom: 4, marginBottom: 8, color: '#0ea5e9', letterSpacing: 1 }}>
          FİNANSAL ORAN ANALİZİ — 25 GÖSTERGE
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          {ratios25.filter(row => row.value != null).map(row => {
            const s = ratioStatus(row.value, row.min, row.max, row.good, row.invert)
            return (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#374151' }}>{row.label}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  <StatusIcon s={s} /> {fmtRatio(row.value, row.unit)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mali Veriler */}
      {fd && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, borderBottom: '1px solid #0ea5e9', paddingBottom: 4, marginBottom: 8, color: '#0ea5e9', letterSpacing: 1 }}>
            MALİ VERİLER
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            {([
              ['DÖNEN VARLIKLAR', null],
              ['Nakit', fd.cash],
              ['Ticari Alacaklar', fd.tradeReceivables],
              ['Stoklar', fd.inventory],
              ['Dönen Varlıklar Toplamı', fd.totalCurrentAssets],
              ['DURAN VARLIKLAR', null],
              ['Maddi Duran Varlıklar', fd.tangibleAssets],
              ['Duran Varlıklar Toplamı', fd.totalNonCurrentAssets],
              ['TOPLAM AKTİF', fd.totalAssets],
              ['KISA VADELİ BORÇLAR', null],
              ['KV Finansal Borçlar', fd.shortTermFinancialDebt],
              ['Ticari Borçlar', fd.tradePayables],
              ['KV Borçlar Toplamı', fd.totalCurrentLiabilities],
              ['UV Borçlar Toplamı', fd.totalNonCurrentLiabilities],
              ['TOPLAM ÖZKAYNAK', fd.totalEquity],
              ['GELİR TABLOSU', null],
              ['Net Satışlar / Ciro', fd.revenue],
              ['Brüt Kâr', fd.grossProfit],
              ['FAVÖK / EBITDA', fd.ebitda],
              ['Net Kâr / Zarar', fd.netProfit],
            ] as [string, number | null | undefined][]).map(([label, val], i) => {
              const isHeader = val === null && val === null && i % 1 === 0 && typeof val !== 'number'
              const isSection = label === label.toUpperCase() && val == null
              if (isSection) return (
                <div key={label} style={{ gridColumn: '1 / -1', marginTop: 8, marginBottom: 2, fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1 }}>
                  {label}
                </div>
              )
              return (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#374151' }}>{label}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(val)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Alt bilgi */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 20, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8' }}>
        <span>Bu rapor Finrate sistemi tarafından otomatik olarak üretilmiştir.</span>
        <span>finrate.app · {now}</span>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  )
}

export default function RaporPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" /></div>}>
      <RaporContent />
    </Suspense>
  )
}
