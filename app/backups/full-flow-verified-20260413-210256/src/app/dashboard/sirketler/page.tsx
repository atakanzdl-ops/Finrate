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
  STANDALONE: 'Bağımsız', PARENT: 'Ana Şirket', SUBSIDIARY: 'Bağlı Ortaklık', JV: 'Grup Şirketi',
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
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-6 pb-6 border-b border-white/5">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight font-display mb-2">Şirketler</h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">{entities.length} KAYITLI KURUMSAL VARLIK</p>
        </div>
        <Link href="/dashboard/sirketler/yeni"
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black btn-gradient shadow-lg">
          <Plus size={16} /> Yeni Şirket
        </Link>
      </div>

      <div className="relative group max-w-xl">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-cyan-400 transition-colors" />
        <input type="text" placeholder="Şirket adı, vergi no veya sektör ara..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-12 pr-6 py-4 rounded-2xl text-sm bg-white/5 border border-white/5 focus:border-cyan-500/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/10 text-white transition-all placeholder:text-slate-600" />
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 size={32} className="animate-spin text-cyan-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-16 text-center border-white/10">
          <Building2 size={48} className="mx-auto mb-6 text-slate-700" />
          <h3 className="text-lg font-bold text-white mb-2">{search ? 'Sonuç Bulunamadı' : 'Henüz Şirket Yok'}</h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto mb-8">
            {search ? 'Aramanızla eşleşen bir şirket bulunamadı. Lütfen farklı bir terim deneyin.' : 'Veri havuzuna henüz bir şirket eklenmemiş görünüyor.'}
          </p>
          {!search && (
            <p className="text-xs text-slate-600">Sağ üstteki <span className="text-cyan-400 font-bold">+ Yeni Şirket</span> butonunu kullanın.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(entity => (
            <div key={entity.id} className="relative group">
              <Link href={`/dashboard/sirketler/${entity.id}`}
                className="glass-card flex items-center gap-5 p-6 pr-24 transition-all border-white/10 hover:border-cyan-500/30 hover:-translate-y-1 block shadow-xl">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white/5 border border-white/10 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/20 transition-all">
                  <Building2 size={24} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                       <p className="text-base font-black text-white truncate font-display tracking-tight leading-tight">{entity.name}</p>
                       <span className="text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-widest bg-cyan-500/10 text-cyan-400 border border-cyan-400/20">
                         {ENTITY_TYPE_LABELS[entity.entityType] ?? entity.entityType}
                       </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      {entity.sector && <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">{entity.sector}</p>}
                      <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{entity._count.financialData} DÖNEM</p>
                    </div>
                  </div>
                </div>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-3">
                   {entity.group && (
                     <span className="hidden xl:inline-block text-[9px] font-black px-3 py-1 rounded-md bg-white/5 text-slate-500 border border-white/10 group-hover:border-white/20 transition-all uppercase tracking-widest">
                       {entity.group.name}
                     </span>
                   )}
                   <ChevronRight size={20} className="text-slate-700 group-hover:text-cyan-400 transition-all group-hover:translate-x-1" />
                </div>
              </Link>
              <div className="absolute right-16 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                {confirmId === entity.id ? (
                  <div className="flex gap-1">
                    <button onClick={() => deleteEntity(entity.id)} disabled={deleting === entity.id}
                      className="text-[9px] px-3 py-1.5 rounded-lg font-black uppercase tracking-widest bg-red-500/20 border border-red-500/30 text-red-500 hover:bg-red-500/30 transition-all">
                      {deleting === entity.id ? '...' : 'SİL'}
                    </button>
                    <button onClick={() => setConfirmId(null)} className="text-[9px] px-3 py-1.5 rounded-lg font-black uppercase tracking-widest bg-white/5 text-slate-500 hover:text-white transition-all">İPTAL</button>
                  </div>
                ) : (
                  <button onClick={e => { e.preventDefault(); setConfirmId(entity.id) }}
                    className="p-2 rounded-xl hover:bg-red-500/10 text-slate-700 hover:text-red-500 transition-all">
                    <Trash2 size={16} />
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
