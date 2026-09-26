'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'

interface AdminUser {
  id: string; email: string; fullName: string; companyName: string | null; role: string
  isVerified: boolean; isActive: boolean; createdAt: string
  subscription: { plan: string; status: string; currentPeriodEnd: string; analysisCredits: number; creditsExpireAt: string | null; notes: string | null } | null
  _count: { entities: number; analyses: number }
}

const PLAN_LABEL: Record<string, string> = { DEMO: 'Ücretsiz', STANDART: 'Paket', PRO: 'Profesyonel' }
const fmtDate = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString('tr-TR') : '—'

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState<string | null>(null)
  const [note, setNote]   = useState<Record<string, string>>({})
  const [filter, setFilter] = useState('')

  const load = async () => {
    const res = await fetch('/api/admin/users')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Yüklenemedi.'); return }
    setUsers(data.users)
  }
  useEffect(() => { load() }, [])

  const act = async (u: AdminUser, body: Record<string, unknown>, confirmText: string) => {
    if (!window.confirm(`${u.email}\n\n${confirmText}`)) return
    setBusy(u.id); setError('')
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, note: note[u.id] || undefined }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'İşlem başarısız.'); return }
      setNote(n => ({ ...n, [u.id]: '' }))
      await load()
    } finally { setBusy(null) }
  }

  if (error && !users) {
    return <div className="p-6"><div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div></div>
  }
  if (!users) return <div className="p-6 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Yükleniyor…</div>

  const shown = users.filter(u => !filter || u.email.toLowerCase().includes(filter.toLowerCase()) || (u.fullName ?? '').toLowerCase().includes(filter.toLowerCase()) || (u.companyName ?? '').toLowerCase().includes(filter.toLowerCase()))
  const btn = 'h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-[#0B3C5D] hover:bg-slate-50 disabled:opacity-50'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3C5D] flex items-center gap-2"><ShieldCheck size={22} /> Yönetim — Kullanıcılar ve Haklar</h1>
          <p className="text-sm text-gray-500 mt-1">Ödeme alındıktan sonra paketi buradan tanımlayın. Ücretsiz süreyi uzatabilir, hak ekleyip çıkarabilirsiniz.</p>
        </div>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="E-posta / ad / şirket ara…"
          className="h-10 w-64 rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#1E293B] placeholder:text-slate-400 focus:outline-none focus:border-cyan-500" />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Kullanıcı</th>
              <th className="px-3 py-3">Plan</th>
              <th className="px-3 py-3">Ücretsiz bitiş</th>
              <th className="px-3 py-3">Hak</th>
              <th className="px-3 py-3">Paket bitiş</th>
              <th className="px-3 py-3">Firma / Analiz</th>
              <th className="px-3 py-3">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(u => {
              const s = u.subscription
              const isBusy = busy === u.id
              return (
                <tr key={u.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#1E293B]">{u.fullName} {u.role === 'ADMIN' && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 text-[#0B3C5D]">YÖNETİCİ</span>}{!u.isActive && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">KAPALI</span>}</div>
                    <div className="text-xs text-gray-500">{u.email}{u.companyName ? ` · ${u.companyName}` : ''}</div>
                    <div className="text-[11px] text-gray-400">Kayıt {fmtDate(u.createdAt)}{u.isVerified ? '' : ' · doğrulanmadı'}</div>
                    {s?.notes && <pre className="mt-1 text-[11px] text-gray-500 whitespace-pre-wrap font-sans">{s.notes}</pre>}
                  </td>
                  <td className="px-3 py-3 text-[#1E293B]">{s ? (PLAN_LABEL[s.plan] ?? s.plan) : '—'}</td>
                  <td className="px-3 py-3 text-[#1E293B]">{s?.plan === 'DEMO' ? fmtDate(s.currentPeriodEnd) : '—'}</td>
                  <td className="px-3 py-3 text-[#1E293B] font-semibold">{u.role === 'ADMIN' ? '∞' : (s?.analysisCredits ?? 0)}</td>
                  <td className="px-3 py-3 text-[#1E293B]">{fmtDate(s?.creditsExpireAt)}</td>
                  <td className="px-3 py-3 text-[#1E293B]">{u._count.entities} / {u._count.analyses}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5 max-w-[360px]">
                      <button className={btn} disabled={isBusy} onClick={() => act(u, { action: 'GRANT_PACKAGE', package: 'BASLANGIC' }, 'Başlangıç paketi (+4 hak, 12 ay) tanımlansın mı?')}>+ Başlangıç (4)</button>
                      <button className={btn} disabled={isBusy} onClick={() => act(u, { action: 'GRANT_PACKAGE', package: 'SMMM' }, 'S.M.M.M paketi (+20 hak, 12 ay) tanımlansın mı?')}>+ S.M.M.M (20)</button>
                      <button className={btn} disabled={isBusy} onClick={() => act(u, { action: 'GRANT_PACKAGE', package: 'PROFESYONEL' }, 'Profesyonel paket (+100 hak, 12 ay) tanımlansın mı?')}>+ Profesyonel (100)</button>
                      <button className={btn} disabled={isBusy} onClick={() => { const v = Number(window.prompt('Kaç hak eklensin? (eksi yazarsan düşer)', '1')); if (v) act(u, { action: 'ADD_CREDITS', credits: v }, `${v} hak eklensin mi?`) }}>± Hak</button>
                      <button className={btn} disabled={isBusy} onClick={() => { const v = Number(window.prompt('Ücretsiz süre kaç gün uzatılsın?', '14')); if (v > 0) act(u, { action: 'EXTEND_FREE', days: v }, `Ücretsiz süre ${v} gün uzatılsın mı?`) }}>Ücretsiz +gün</button>
                      <button className={btn} disabled={isBusy || u.role === 'ADMIN'} onClick={() => act(u, { action: 'SET_ACTIVE', isActive: !u.isActive }, u.isActive ? 'Hesap KAPATILSIN mı? (giriş yapamaz)' : 'Hesap yeniden açılsın mı?')}>{u.isActive ? 'Hesabı kapat' : 'Hesabı aç'}</button>
                    </div>
                    <input value={note[u.id] ?? ''} onChange={e => setNote(n => ({ ...n, [u.id]: e.target.value }))} placeholder="Not (ör. havale 26.09)"
                      className="mt-1.5 h-7 w-full rounded-md border border-gray-200 bg-white px-2 text-[11px] text-[#1E293B] placeholder:text-gray-400 focus:outline-none focus:border-cyan-500" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">Toplam {users.length} kullanıcı. Hak = kalan analiz hakkı; her yeni firma-dönem yüklemesi 1 hak düşer, aynı dönemi yeniden yüklemek düşmez.</p>
    </div>
  )
}
