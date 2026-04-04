'use client'

import { useState, useEffect } from 'react'
import { Sliders, Plus, ToggleLeft, ToggleRight, Trash2, Loader2, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import DashboardShell from '@/components/layout/DashboardShell'

interface TenzilatEntry {
  id: string
  year: number
  period: string
  adjustmentType: string
  adjustmentAmount: number
  description: string
  scope: string
  isActive: boolean
  createdAt: string
  entity: { name: string } | null
}

const ADJ_TYPE_LABELS: Record<string, string> = {
  REVENUE:       'Ciro',
  COGS:          'SMM',
  EBITDA:        'FAVÖK',
  NET_PROFIT:    'Net Kar',
  DEBT_SHORT:    'KV Borç',
  DEBT_LONG:     'UV Borç',
  EQUITY:        'Öz Kaynak',
  CASH:          'Nakit',
  RECEIVABLES:   'Alacaklar',
  PAYABLES:      'Borçlar',
  OTHER_INCOME:  'Diğer Gelir',
  OTHER_EXPENSE: 'Diğer Gider',
}

const ADJ_TYPES = Object.entries(ADJ_TYPE_LABELS)

function fmt(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : '+'
  return sign + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(abs)
}

export default function TenzilatPage() {
  const [entries, setEntries] = useState<TenzilatEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const res = await fetch('/api/tenzilat')
    const d = await res.json()
    setEntries(d.entries ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function toggleActive(id: string, current: boolean) {
    await fetch(`/api/tenzilat/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    })
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, isActive: !current } : e))
  }

  async function deleteEntry(id: string) {
    if (!confirm('Bu tenzilat kaydını silmek istediğinizden emin misiniz?')) return
    await fetch(`/api/tenzilat/${id}`, { method: 'DELETE' })
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <DashboardShell>
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Manuel Tenzilat</h1>
          <p className="text-white/50 text-sm mt-0.5">Analist düzeltme katmanı — tüm işlemler denetim kaydına yazılır</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white"
        >
          <Plus size={16} />
          Yeni Tenzilat
          <ChevronDown size={14} className={clsx('transition-transform', showForm && 'rotate-180')} />
        </button>
      </div>

      {/* Bilgi kutusu */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
        <Sliders size={16} className="text-cyan-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-white/60 leading-relaxed">
          Manuel tenzilat, analistin sistematik olmayan kalemleri (tek seferlik giderler, olağandışı gelirler vb.)
          düzeltmesine olanak tanır. Her düzeltme denetim izli olarak kaydedilir.
          Pasif tenzilatlar skor hesabını etkilemez.
        </p>
      </div>

      {/* Form */}
      {showForm && (
        <TenzilatForm onSaved={(e) => { setEntries((prev) => [e, ...prev]); setShowForm(false) }} />
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center">
          <Sliders size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Henüz tenzilat kaydı yok.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={clsx(
                'glass-card p-4 rounded-xl flex items-center gap-4 transition-all',
                !entry.isActive && 'opacity-50',
              )}
            >
              {/* Tür rozeti */}
              <div className="flex-shrink-0 text-center min-w-[72px]">
                <span className="text-xs px-2 py-1 rounded-lg bg-white/10 text-white/60 font-medium">
                  {ADJ_TYPE_LABELS[entry.adjustmentType] ?? entry.adjustmentType}
                </span>
              </div>

              {/* Detay */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{entry.description}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {entry.entity?.name ?? 'Grup geneli'} · {entry.year}
                  {entry.period !== 'ANNUAL' && ` ${entry.period}`}
                </p>
              </div>

              {/* Tutar */}
              <div className={clsx(
                'text-sm font-bold flex-shrink-0',
                Number(entry.adjustmentAmount) >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}>
                {fmt(Number(entry.adjustmentAmount))}
              </div>

              {/* Aksiyon butonları */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleActive(entry.id, entry.isActive)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  title={entry.isActive ? 'Pasif yap' : 'Aktif yap'}
                >
                  {entry.isActive
                    ? <ToggleRight size={18} className="text-cyan-400" />
                    : <ToggleLeft  size={18} className="text-white/30" />
                  }
                </button>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
                  title="Sil"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </DashboardShell>
  )
}

// ─── Tenzilat Formu ───────────────────────────────────────
interface FormProps {
  onSaved: (entry: TenzilatEntry) => void
}

function TenzilatForm({ onSaved }: FormProps) {
  const [form, setForm] = useState({
    year:             String(new Date().getFullYear()),
    period:           'ANNUAL',
    adjustmentType:   'REVENUE',
    adjustmentAmount: '',
    description:      '',
    scope:            'ENTITY',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  async function handleSave() {
    setError('')
    if (!form.description || form.description.trim().length < 10) {
      setError('Açıklama en az 10 karakter olmalıdır.')
      return
    }
    if (!form.adjustmentAmount || isNaN(Number(form.adjustmentAmount))) {
      setError('Geçerli bir tutar girin.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/tenzilat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year:             Number(form.year),
          period:           form.period,
          adjustmentType:   form.adjustmentType,
          adjustmentAmount: Number(form.adjustmentAmount),
          description:      form.description.trim(),
          scope:            form.scope,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Hata oluştu.'); return }
      onSaved(data.entry)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Yıl */}
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1">Yıl</label>
          <input
            type="number"
            value={form.year}
            onChange={(e) => set('year', e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        {/* Dönem */}
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1">Dönem</label>
          <select value={form.period} onChange={(e) => set('period', e.target.value)}
            className="w-full px-3 py-2 bg-navy-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
          >
            <option value="ANNUAL">Yıllık</option>
            <option value="Q1">1. Çeyrek</option>
            <option value="Q2">2. Çeyrek</option>
            <option value="Q3">3. Çeyrek</option>
            <option value="Q4">4. Çeyrek</option>
          </select>
        </div>
        {/* Kalem */}
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1">Düzeltme Kalemi</label>
          <select value={form.adjustmentType} onChange={(e) => set('adjustmentType', e.target.value)}
            className="w-full px-3 py-2 bg-navy-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
          >
            {ADJ_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {/* Tutar */}
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1">Tutar (+ artış / - azalış)</label>
          <input
            type="number"
            value={form.adjustmentAmount}
            onChange={(e) => set('adjustmentAmount', e.target.value)}
            placeholder="Örn: -500000"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Açıklama */}
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1">
          Açıklama <span className="text-white/30">(en az 10 karakter)</span>
        </label>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={2}
          placeholder="Örn: 2023 Q4 tek seferlik hukuki dava karşılığı gideri normalleştiriliyor..."
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50 resize-none"
        />
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 btn-gradient rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          Tenzilat Ekle
        </button>
      </div>
    </div>
  )
}
