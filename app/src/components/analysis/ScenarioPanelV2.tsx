'use client'

import { useState } from 'react'

interface Props {
  analysisId: string
  currentScore: number
  currentGrade: string
}

type ActionFamilyTR = 'Çalışma Sermayesi' | 'Borç Yapısı' | 'Özkaynak / Gelir Tablosu'

const FAMILY_LABELS: Record<string, ActionFamilyTR> = {
  WC_COMPOSITION: 'Çalışma Sermayesi',
  DEBT_STRUCTURE:  'Borç Yapısı',
  EQUITY_PNL:      'Özkaynak / Gelir Tablosu',
}

const ACTION_NAMES: Record<string, string> = {
  A01_ST_FIN_DEBT_TO_LT:         'Kısa Vadeli Finansal Borcu Uzun Vadeye Çevir',
  A02_TRADE_PAYABLE_TO_LT:       'Ticari Borcu Uzun Vadeye Yeniden Sınıfla',
  A03_ADVANCE_TO_LT:             'Alınan Avansları Uzun Vadeye Çevir',
  A04_CASH_PAYDOWN_ST:           'Nakit ile KV Borç Kapat',
  A05_RECEIVABLE_COLLECTION:     'Alacak Tahsili Hızlandır',
  A06_INVENTORY_OPTIMIZATION:    'Stok Optimizasyonu',
  A07_PREPAID_EXPENSE_RELEASE:   'Peşin Giderleri Serbest Bırak',
  A08_FIXED_ASSET_DISPOSAL:      'Atıl Maddi Duran Varlık Satışı',
  A09_SALE_LEASEBACK:            'Sat-Geri Kirala',
  A10_EQUITY_INJECTION:          'Sermaye Artırımı',
  A11_EARNINGS_RETENTION:        'Kârı Şirkette Tut',
  A12_GROSS_MARGIN_IMPROVEMENT:  'Brüt Kâr Marjı İyileştir',
  A13_OPEX_OPTIMIZATION:         'Faaliyet Giderlerini Düşür',
  A14_FINANCE_COST_OPTIMIZATION: 'Finansman Giderini Düşür',
}

// actionFamilies.ts ile birebir uyumlu
const ACTION_FAMILY: Record<string, string> = {
  A04_CASH_PAYDOWN_ST:           'WC_COMPOSITION',
  A05_RECEIVABLE_COLLECTION:     'WC_COMPOSITION',
  A06_INVENTORY_OPTIMIZATION:    'WC_COMPOSITION',
  A07_PREPAID_EXPENSE_RELEASE:   'WC_COMPOSITION',
  A01_ST_FIN_DEBT_TO_LT:         'DEBT_STRUCTURE',
  A02_TRADE_PAYABLE_TO_LT:       'DEBT_STRUCTURE',
  A03_ADVANCE_TO_LT:             'DEBT_STRUCTURE',
  A08_FIXED_ASSET_DISPOSAL:      'DEBT_STRUCTURE',
  A09_SALE_LEASEBACK:            'DEBT_STRUCTURE',
  A10_EQUITY_INJECTION:          'EQUITY_PNL',
  A11_EARNINGS_RETENTION:        'EQUITY_PNL',
  A12_GROSS_MARGIN_IMPROVEMENT:  'EQUITY_PNL',
  A13_OPEX_OPTIMIZATION:         'EQUITY_PNL',
  A14_FINANCE_COST_OPTIMIZATION: 'EQUITY_PNL',
}

function formatTL(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M TL`
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}K TL`
  return `${n.toFixed(0)} TL`
}

const GRADES = ['CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ScenarioPanelV2({ analysisId, currentScore, currentGrade }: Props) {
  const [targetGrade, setTargetGrade] = useState<string>('')
  const [loading, setLoading]         = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult]           = useState<any>(null)
  const [error, setError]             = useState<string | null>(null)

  const currentIdx       = GRADES.indexOf(currentGrade)
  const availableTargets = currentIdx >= 0 ? GRADES.slice(currentIdx + 1, currentIdx + 3) : []

  async function calculate() {
    if (!targetGrade) return
    setLoading(true)
    setError(null)

    try {
      const res  = await fetch('/api/scenarios/v2', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ analysisId, targetGrade }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Hesaplama başarısız')
        setResult(null)
      } else {
        setResult(data)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ağ hatası')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Hedef seçimi */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900">Hedef Not Belirle</h3>
        <p className="text-sm text-slate-600 mt-1">Hangi nota ulaşmak istiyorsunuz?</p>

        <div className="flex items-center gap-3 mt-4">
          <span className="text-sm text-slate-500">Mevcut:</span>
          <span className="px-3 py-1 bg-red-50 text-red-700 rounded-md font-semibold">
            {currentGrade}
          </span>
          <span className="text-slate-400">→</span>

          {availableTargets.map((g) => (
            <button
              key={g}
              onClick={() => setTargetGrade(g)}
              className={`px-4 py-2 rounded-md border transition-colors ${
                targetGrade === g
                  ? 'border-amber-500 bg-amber-50 text-amber-800'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {g} Hedefle
            </button>
          ))}

          <div className="ml-auto">
            <button
              onClick={calculate}
              disabled={!targetGrade || loading}
              className="px-6 py-2 bg-slate-900 text-white rounded-md disabled:opacity-50"
            >
              {loading ? 'Hesaplanıyor...' : 'Hesapla'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {error}
        </div>
      )}

      {result && result.scenarios && (
        <>
          {/* Stres seviyesi özet */}
          {result.stressLevel && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-600">Finansal Stres:</span>
                <span className={`px-3 py-1 rounded-md font-medium ${
                  result.stressLevel === 'SEVERE'    ? 'bg-red-100 text-red-800'      :
                  result.stressLevel === 'MODERATE'  ? 'bg-orange-100 text-orange-800' :
                  result.stressLevel === 'MILD'      ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {result.stressLevel === 'NO_STRESS'  ? 'Stres Yok'        :
                   result.stressLevel === 'MILD'       ? 'Hafif Stres'      :
                   result.stressLevel === 'MODERATE'   ? 'Orta Düzey Stres' :
                   'Yüksek Stres'}
                </span>
                {result.emergencyAssessment?.signals?.length > 0 && (
                  <span className="text-xs text-slate-500">
                    ({result.emergencyAssessment.signals.length} sinyal tespit edildi)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 3 senaryo kartı */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.scenarios.map((s: any) => (
              <ScenarioCard key={s.horizon} scenario={s} />
            ))}
          </div>

          {/* Aksiyon detayları */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result.scenarios.map((s: any) =>
            s.actions && s.actions.length > 0 ? (
              <div key={`detail-${s.horizon}`} className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  {s.horizonLabel} — Aksiyon Planı
                </h3>
                <div className="space-y-3 mt-4">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {s.actions.map((a: any, idx: number) => (
                    <ActionCard key={idx} action={a} index={idx + 1} />
                  ))}
                </div>
              </div>
            ) : null
          )}
        </>
      )}
    </div>
  )
}

// ─── ScenarioCard ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScenarioCard({ scenario }: { scenario: any }) {
  // Skipped (watchlist) path
  if (scenario.skipped) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h4 className="font-semibold text-slate-900">{scenario.horizonLabel}</h4>

        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
          Acil müdahale gerekmiyor
        </div>

        <p className="text-xs text-slate-500 mt-3">{scenario.skipReason}</p>

        {scenario.watchlist && scenario.watchlist.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-600 mb-2">İzleme Listesi:</p>
            <ul className="space-y-1">
              {scenario.watchlist.map((w: string, i: number) => (
                <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // Normal senaryo kartı
  const delta      = scenario.scoreAfter - scenario.scoreBefore
  const deltaColor = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-slate-400'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h4 className="font-semibold text-slate-900">{scenario.horizonLabel}</h4>

      <div className="flex items-baseline gap-2 mt-4">
        <span className="text-3xl font-bold text-slate-900">{scenario.scoreBefore.toFixed(1)}</span>
        <span className="text-slate-400">→</span>
        <span className={`text-3xl font-bold ${deltaColor}`}>{scenario.scoreAfter.toFixed(1)}</span>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded">
          {scenario.gradeBefore}
        </span>
        <span className="text-slate-400 text-xs">→</span>
        <span className={`px-2 py-0.5 text-xs rounded ${
          scenario.gradeAfter === scenario.gradeBefore
            ? 'bg-red-50 text-red-700'
            : 'bg-amber-50 text-amber-700'
        }`}>
          {scenario.gradeAfter}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {scenario.goalReached ? (
          <span className="text-xs text-emerald-700 flex items-center gap-1">
            <span>✓</span> Hedefe ulaşıldı
          </span>
        ) : (
          <span className="text-xs text-amber-700 flex items-center gap-1">
            <span>⚠</span> Kısmi iyileşme
          </span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
        <p>{scenario.actions?.length ?? 0} aksiyon önerisi</p>
        <p>{formatTL(scenario.totalTLMovement ?? 0)} toplam hareket</p>
      </div>
    </div>
  )
}

// ─── ActionCard ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActionCard({ action, index }: { action: any; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const name        = ACTION_NAMES[action.actionId] ?? action.actionId
  const family      = ACTION_FAMILY[action.actionId]
  const familyLabel = family ? FAMILY_LABELS[family] : ''

  return (
    <div className="border border-slate-200 rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">
          {index}
        </div>

        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h5 className="font-semibold text-slate-900">{name}</h5>
              {familyLabel && (
                <span className="text-xs text-slate-500 mt-0.5 inline-block">{familyLabel}</span>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-semibold text-slate-900">{formatTL(action.amountApplied)}</div>
              <div className="text-xs text-emerald-600">
                Skor katkısı: +{(action.actualScoreDelta ?? 0).toFixed(1)} puan
              </div>
              <div className="text-xs text-slate-400">
                Öncelik: {action.scoreBreakdown?.finalPriorityScore?.toFixed(0) ?? '-'}
              </div>
            </div>
          </div>
        </div>

        <span className="text-slate-400 ml-2">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
          {/* Hesap hareketleri */}
          {action.accountMovements && action.accountMovements.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Hesap Hareketleri:</p>
              <div className="space-y-1">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {action.accountMovements.map((m: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-600">Hesap {m.accountCode}</span>
                    <span className={m.delta > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {m.delta > 0 ? '+' : ''}{formatTL(m.delta)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rasyo etkileri */}
          {action.ratioDelta && (
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Rasyo Etkileri:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(Object.entries(action.ratioDelta) as [string, any][])
                  .filter(([, delta]) => Math.abs(delta) >= 0.001)
                  .slice(0, 6)
                  .map(([code, delta]) => (
                    <div key={code} className="flex justify-between">
                      <span className="text-slate-600">{code.replace(/_/g, ' ')}</span>
                      <span className={delta > 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(3)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Uyarılar */}
          {action.warnings && action.warnings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-700 mb-2">Uyarılar:</p>
              <ul className="space-y-1 text-xs text-amber-800">
                {(action.warnings as string[]).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
