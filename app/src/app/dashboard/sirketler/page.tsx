'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Building2, Plus, Search, ChevronRight, Loader2, Trash2, Pencil, Check, X } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'

interface Entity {
  id: string; name: string; taxNumber: string | null; sector: string | null
  entityType: string; createdAt: string
  group: { name: string } | null; _count: { financialData: number }
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  STANDALONE: 'Bağımsız', PARENT: 'Ana Şirket', SUBSIDIARY: 'Bağlı Ortaklık', JV: 'Grup Şirketi',
}

const ENTITY_TYPE_COLORS: Record<string, string> = {
  STANDALONE: 'bg-slate-100 text-[#5A7A96] border-slate-200',
  PARENT:     'bg-slate-100 text-[#5A7A96] border-slate-200',
  SUBSIDIARY: 'bg-slate-100 text-[#5A7A96] border-slate-200',
  JV:         'bg-slate-100 text-[#5A7A96] border-slate-200',
}

export default function SirketlerPage() {
  const [entities, setEntities]   = useState<Entity[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // İsim düzenleme state'i
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [saving,      setSaving]      = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/entities').then(r => r.json()).then(d => setEntities(d.entities ?? [])).finally(() => setLoading(false))
  }, [])

  function startEdit(e: React.MouseEvent, entity: Entity) {
    e.preventDefault()
    e.stopPropagation()
    setEditingId(entity.id)
    setEditingName(entity.name)
    setConfirmId(null)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 50)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingName('')
  }

  async function saveEdit(id: string) {
    const trimmed = editingName.trim()
    if (!trimmed) { cancelEdit(); return }
    const entity = entities.find(e => e.id === id)
    if (entity && trimmed === entity.name) { cancelEdit(); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/entities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        setEntities(prev => prev.map(e => e.id === id ? { ...e, name: trimmed } : e))
      }
    } finally {
      setSaving(false)
      cancelEdit()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter')  { e.preventDefault(); saveEdit(id) }
    if (e.key === 'Escape') { cancelEdit() }
  }

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
      <div className="space-y-6 max-w-5xl">

        {/* Başlık */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0B3C5D]">Şirketler</h1>
            <p className="text-xs text-gray-500 mt-0.5">{entities.length} kayıtlı kurumsal varlık</p>
          </div>
          <Link
            href="/dashboard/sirketler/yeni"
            className="flex items-center gap-2 px-4 py-2 bg-[#0B3C5D] hover:bg-[#0a3354] rounded-lg text-sm font-semibold text-white transition-colors shadow-sm"
          >
            <Plus size={15} />
            Yeni Şirket
          </Link>
        </div>

        {/* Arama */}
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Şirket adı, vergi no veya sektör ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* İçerik */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 size={28} className="animate-spin text-[#2EC4B6]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Building2 size={24} className="text-[#5A7A96]" />
            </div>
            <h3 className="text-base font-semibold text-[#0B3C5D] mb-1">
              {search ? 'Sonuç Bulunamadı' : 'Henüz Şirket Yok'}
            </h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
              {search ? 'Aramanızla eşleşen bir şirket bulunamadı.' : 'Veri havuzuna henüz bir şirket eklenmemiş.'}
            </p>
            {!search && (
              <Link
                href="/dashboard/sirketler/yeni"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B3C5D] hover:bg-[#0a3354] rounded-lg text-sm font-semibold text-white transition-colors"
              >
                <Plus size={14} /> Şirket Ekle
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(entity => {
              const isEditing = editingId === entity.id
              return (
                <div key={entity.id} className="relative group">
                  <Link
                    href={isEditing ? '#' : `/dashboard/sirketler/${entity.id}`}
                    onClick={isEditing ? e => e.preventDefault() : undefined}
                    className="glass-card flex items-center gap-4 p-4 pr-20 hover:border-cyan-300 hover:shadow-md transition-all block"
                  >
                    {/* İkon */}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-100 group-hover:bg-cyan-50 transition-colors">
                      <Building2 size={20} className="text-[#5A7A96] group-hover:text-[#2EC4B6] transition-colors" />
                    </div>

                    {/* Bilgi */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">

                        {/* İsim — düzenleme modu */}
                        {isEditing ? (
                          <div className="flex items-center gap-1.5" onClick={e => e.preventDefault()}>
                            <input
                              ref={inputRef}
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              onKeyDown={e => handleKeyDown(e, entity.id)}
                              disabled={saving}
                              className="text-sm font-semibold text-[#0B3C5D] border-b-2 border-cyan-500 bg-transparent focus:outline-none w-48"
                            />
                            <button
                              onClick={() => saveEdit(entity.id)}
                              disabled={saving}
                              className="p-1 rounded hover:bg-cyan-50 text-cyan-600 transition-colors"
                            >
                              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-[#0B3C5D] truncate">{entity.name}</p>
                            {/* Kalem ikonu — hover'da görünür */}
                            <button
                              onClick={e => startEdit(e, entity)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-100 text-gray-400 hover:text-[#0B3C5D] transition-all"
                              title="İsmi düzenle"
                            >
                              <Pencil size={12} />
                            </button>
                          </>
                        )}

                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${ENTITY_TYPE_COLORS[entity.entityType] ?? 'bg-slate-100 text-gray-500 border-slate-200'}`}>
                          {ENTITY_TYPE_LABELS[entity.entityType] ?? entity.entityType}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        {entity.sector && <span className="text-xs text-gray-500">{entity.sector}</span>}
                        {entity.sector && <span className="w-1 h-1 rounded-full bg-gray-300" />}
                        <span className="text-xs text-gray-400">{entity._count.financialData} dönem</span>
                        {entity.group && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-gray-300" />
                            <span className="text-xs text-gray-400">{entity.group.name}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Ok */}
                    {!isEditing && (
                      <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-[#2EC4B6] transition-colors" />
                    )}
                  </Link>

                  {/* Sil butonu */}
                  {!isEditing && (
                    <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all">
                      {confirmId === entity.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => deleteEntity(entity.id)}
                            disabled={deleting === entity.id}
                            className="text-[10px] px-2 py-1 rounded font-semibold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all"
                          >
                            {deleting === entity.id ? '...' : 'Sil'}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="text-[10px] px-2 py-1 rounded font-semibold bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 transition-all"
                          >
                            İptal
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.preventDefault(); setConfirmId(entity.id) }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
