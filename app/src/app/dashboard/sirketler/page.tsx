'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Building2, Plus, Search, ChevronRight, Loader2, Trash2 } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'

interface Entity {
  id: string; name: string; taxNumber: string | null; sector: string | null
  entityType: string; createdAt: string
  group: { name: string } | null; _count: { financialData: number }
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  STANDALONE: 'Bağımsız', PARENT: 'Ana Şirket', SUBSIDIARY: 'Bağlı Ortaklık', JV: 'Ortak Girişim',
}

const ENTITY_TYPE_COLORS: Record<string, string> = {
  STANDALONE: 'bg-slate-100 text-slate-500 border-slate-200',
  PARENT:     'bg-[#0B3C5D]/8 text-[#0B3C5D] border-[#0B3C5D]/20',
  SUBSIDIARY: 'bg-cyan-50 text-[#2EC4B6] border-cyan-200',
  JV:         'bg-amber-50 text-amber-600 border-amber-200',
}

export default function SirketlerPage() {
  const [entities, setEntities]   = useState<Entity[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/entities').then(r => r.json()).then(d => setEntities(d.entities ?? [])).finally(() => setLoading(false))
  }, [])

  async function deleteEntity(id: string) {
    setDeleting(id)
    try {
      await fetch(`/api/entities/${id}`, { method: 'DELETE' })
      setEntities(prev => prev.filter(e => e.id !== id))
    } finally { setDeleting(null); setConfirmId(null) }
  }

  const filtered = entities.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.taxNumber ?? '').includes(search) ||
    (e.sector ?? '').toLowerCase().includes(search.toLowerCase()))

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-5xl mx-auto px-1 py-2">

        {/* Başlık */}
        <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#0B3C5D' }}>Şirketler</h1>
            <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-widest font-medium">
              {entities.length} kayıtlı şirket
            </p>
          </div>
          <Link
            href="/dashboard/sirketler/yeni"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: '#0B3C5D' }}
          >
            <Plus size={15} /> Yeni Şirket
          </Link>
        </div>

        {/* Arama */}
        <div className="relative max-w-xl">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Şirket adı, vergi no veya sektör ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:border-slate-400 text-[#1E293B] placeholder:text-slate-400 transition-colors"
          />
        </div>

        {/* İçerik */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 size={28} className="animate-spin" style={{ color: '#0B3C5D' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <Building2 size={40} className="mx-auto mb-4 text-slate-300" />
            <h3 className="text-base font-semibold text-[#0B3C5D] mb-1.5">
              {search ? 'Sonuç Bulunamadı' : 'Henüz Şirket Yok'}
            </h3>
            <p className="text-sm text-slate-400 max-w-xs mx-auto mb-6">
              {search
                ? 'Aramanızla eşleşen bir şirket bulunamadı.'
                : 'Veri havuzuna henüz bir şirket eklenmemiş.'}
            </p>
            {!search && (
              <p className="text-xs text-slate-400">
                Sağ üstteki{' '}
                <span className="font-semibold" style={{ color: '#0B3C5D' }}>+ Yeni Şirket</span>{' '}
                butonunu kullanın.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(entity => (
              <div key={entity.id} className="relative group">
                <Link
                  href={`/dashboard/sirketler/${entity.id}`}
                  className="glass-card flex items-center gap-4 p-5 pr-20 hover:shadow-md transition-all block"
                  style={{ textDecoration: 'none' }}
                >
                  {/* İkon */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border border-slate-100"
                    style={{ background: 'rgba(11,60,93,0.05)' }}
                  >
                    <Building2 size={20} style={{ color: '#0B3C5D' }} />
                  </div>

                  {/* Bilgi */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-[#0B3C5D] truncate">{entity.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium border flex-shrink-0 ${ENTITY_TYPE_COLORS[entity.entityType] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {ENTITY_TYPE_LABELS[entity.entityType] ?? entity.entityType}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {entity.sector && (
                        <p className="text-xs text-slate-400 uppercase tracking-wide truncate">{entity.sector}</p>
                      )}
                      {entity.sector && <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />}
                      <p className="text-xs text-slate-400 flex-shrink-0">{entity._count.financialData} dönem</p>
                      {entity.group && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-500 font-medium flex-shrink-0 hidden sm:inline">
                          {entity.group.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ok */}
                  <div className="absolute right-5 top-1/2 -translate-y-1/2">
                    <ChevronRight size={18} className="text-slate-300 group-hover:text-[#0B3C5D] transition-colors" />
                  </div>
                </Link>

                {/* Sil butonu */}
                <div className="absolute right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {confirmId === entity.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => deleteEntity(entity.id)}
                        disabled={deleting === entity.id}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg font-semibold bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors"
                      >
                        {deleting === entity.id ? '...' : 'Sil'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg font-semibold bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                      >
                        İptal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.preventDefault(); setConfirmId(entity.id) }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
