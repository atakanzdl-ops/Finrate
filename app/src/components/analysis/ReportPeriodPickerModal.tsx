'use client'
import { useEffect, useState } from 'react'
import { formatReportPeriodLabel } from '@/lib/periods'

interface PeriodOption {
  id:     string
  year:   number
  period: string
}

interface ComparisonOptionsResponse {
  current: PeriodOption
  options: PeriodOption[]
}

interface Props {
  analysisId: string
  onConfirm: (selectedIds: string[]) => void
  onClose: () => void
}

const MAX_SELECTION = 6

export default function ReportPeriodPickerModal({ analysisId, onConfirm, onClose }: Props) {
  const [data, setData] = useState<ComparisonOptionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/analyses/${analysisId}/comparison-options`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: ComparisonOptionsResponse) => {
        setData(d)
        // Varsayılan: mevcut + mevcuttan önceki 3 dönem
        const opts = d.options
        const currentIdx = opts.findIndex(
          (o: PeriodOption) => o.id === d.current.id
        )
        const defaultSet = new Set<string>()
        defaultSet.add(d.current.id)
        let count = 0
        for (let i = currentIdx - 1; i >= 0 && count < 3; i--) {
          defaultSet.add(opts[i].id)
          count++
        }
        setSelected(defaultSet)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [analysisId])

  function toggle(id: string) {
    if (!data) return
    if (id === data.current.id) return // mevcut kilitli
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= MAX_SELECTION) {
          alert('En fazla 6 dönem seçebilirsiniz.')
          return prev // CODEX D2: updater içinde return prev
        }
        next.add(id)
      }
      return next
    })
  }

  function handleConfirm() {
    if (!data) return
    // Mevcut her zaman dahil
    const ids = Array.from(selected)
    if (!ids.includes(data.current.id)) ids.unshift(data.current.id)
    onConfirm(ids)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(10,25,47,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: '16px', width: '460px', maxWidth: '96vw',
        boxShadow: '0 24px 64px rgba(10,25,47,0.18)',
        padding: '28px 28px 24px',
      }}>
        {/* Başlık */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0a192f' }}>Dönem Seçimi</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
              Raporda karşılaştırılacak dönemleri seçin (maks {MAX_SELECTION})
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '20px', lineHeight: 1 }}
            aria-label="Kapat"
          >×</button>
        </div>

        {/* İçerik */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: '13px' }}>
            Dönemler yükleniyor…
          </div>
        )}
        {error && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#ef4444', fontSize: '13px' }}>
            Dönemler yüklenemedi: {error}
          </div>
        )}
        {!loading && !error && data && (
          <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px' }}>
            {data.options.map(opt => {
              const isCurrent = opt.id === data.current.id
              const isChecked = selected.has(opt.id)
              const isDisabled = isCurrent

              return (
                <label
                  key={opt.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px', borderRadius: '10px', cursor: isDisabled ? 'default' : 'pointer',
                    background: isChecked ? '#f0f9ff' : 'transparent',
                    border: `1px solid ${isChecked ? '#bae6fd' : '#f1f5f9'}`,
                    marginBottom: '6px', transition: 'background 0.15s',
                  }}
                  onClick={() => toggle(opt.id)}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    disabled={isDisabled}
                    style={{ width: '16px', height: '16px', accentColor: '#0284c7', cursor: isDisabled ? 'default' : 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0a192f' }}>
                      {formatReportPeriodLabel(opt.year, opt.period)}
                    </span>
                    {isCurrent && (
                      <span style={{
                        marginLeft: '8px', fontSize: '10px', fontWeight: 700,
                        background: '#0a192f', color: '#fff',
                        padding: '2px 6px', borderRadius: '4px',
                      }}>
                        Mevcut
                      </span>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {/* Alt bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {selected.size} / {MAX_SELECTION} dönem seçildi
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0',
                background: '#fff', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              İptal
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !!error || selected.size === 0}
              style={{
                padding: '9px 22px', borderRadius: '8px', border: 'none',
                background: '#0B3C5D', color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: loading || !!error || selected.size === 0 ? 'not-allowed' : 'pointer',
                opacity: loading || !!error || selected.size === 0 ? 0.6 : 1,
              }}
            >
              Raporu Oluştur
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
