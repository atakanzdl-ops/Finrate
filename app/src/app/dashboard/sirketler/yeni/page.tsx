'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'

const ENTITY_TYPES = [
  { value: 'STANDALONE', label: 'Bağımsız Şirket' },
  { value: 'PARENT',     label: 'Ana Şirket' },
  { value: 'SUBSIDIARY', label: 'Bağlı Ortaklık' },
  { value: 'JV',         label: 'Grup Şirketi' },
]

const SECTORS = [
  'Üretim', 'Ticaret', 'Hizmet', 'İnşaat', 'Turizm', 'Tarım',
  'Enerji', 'Sağlık', 'Eğitim', 'Finans', 'Teknoloji', 'Diğer',
]

export default function YeniSirketPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm] = useState({
    name:       '',
    taxNumber:  '',
    sector:     '',
    entityType: 'STANDALONE',
  })

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Şirket adı zorunludur.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Hata oluştu.'); return }
      router.push(`/dashboard/sirketler/${data.entity.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardShell>
      <div className="max-w-lg space-y-6">

        {/* Başlık */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/sirketler"
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-[#5A7A96] hover:text-[#0B3C5D]"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#0B3C5D]">Yeni Şirket</h1>
            <p className="text-sm text-gray-500">Şirket bilgilerini girin</p>
          </div>
        </div>

        {/* Form kartı */}
        <div className="glass-card rounded-xl p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Şirket Adı */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Şirket Adı <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Örn: ABC Tekstil A.Ş."
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Vergi Kimlik No */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Vergi Kimlik No
              </label>
              <input
                type="text"
                value={form.taxNumber}
                onChange={(e) => set('taxNumber', e.target.value)}
                placeholder="10 haneli VKN"
                maxLength={11}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Sektör */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Sektör</label>
              <select
                value={form.sector}
                onChange={(e) => set('sector', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-[#1E293B] focus:outline-none focus:border-cyan-500 transition-colors"
              >
                <option value="">— Seçiniz —</option>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Şirket Tipi */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Şirket Tipi</label>
              <div className="grid grid-cols-2 gap-2">
                {ENTITY_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('entityType', value)}
                    className={`px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-all border ${
                      form.entityType === value
                        ? 'border-cyan-500 bg-cyan-50 text-[#0B3C5D]'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-[#0B3C5D]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hata */}
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Gönder */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0B3C5D] hover:bg-[#0a3354] rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Şirket Oluştur
            </button>
          </form>
        </div>

      </div>
    </DashboardShell>
  )
}
