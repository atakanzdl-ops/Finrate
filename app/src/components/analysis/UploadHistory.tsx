'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, RefreshCw, Loader2 } from 'lucide-react'
import { PERIOD_LABEL_SHORT } from '@/lib/periods'

interface UploadRow {
  id: string; year: number; period: string; source: string; fileName: string
  parsedFieldCount: number; createdAt: string; stored: boolean; fileSize: number | null
}

const fmtSize = (n: number | null) => n == null ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`

/** Firmanın yükleme geçmişi + saklanan dosyayı yeniden işleme */
export function UploadHistory({ entityId, onReprocessed }: { entityId: string; onReprocessed?: () => void }) {
  const [rows, setRows] = useState<UploadRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg]   = useState<{ id: string; ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/entities/${entityId}/uploads`)
    const d = await res.json().catch(() => ({}))
    setRows(res.ok ? (d.uploads ?? []) : [])
  }, [entityId])
  useEffect(() => { load() }, [load])

  const reprocess = async (r: UploadRow) => {
    if (!window.confirm(`${r.fileName} (${r.year} ${PERIOD_LABEL_SHORT[r.period] ?? r.period}) yeniden işlensin mi? Dönem verisi güncel okuma kurallarıyla yenilenir, skor yeniden hesaplanır.`)) return
    setBusy(r.id); setMsg(null)
    try {
      const res = await fetch(`/api/entities/${entityId}/uploads/${r.id}/reprocess`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ id: r.id, ok: false, text: d.message ?? d.error ?? 'Yeniden işleme başarısız.' }); return }
      const first = (d.results ?? [])[0]
      setMsg({ id: r.id, ok: true, text: first ? `Yeniden işlendi: ${first.score} / ${first.rating}` : 'Yeniden işlendi.' })
      await load()
      onReprocessed?.()
    } catch {
      setMsg({ id: r.id, ok: false, text: 'Bağlantı hatası.' })
    } finally { setBusy(null) }
  }

  if (!rows || rows.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Yüklenen Dosyalar</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Saklanan dosyalar okuma kuralları güncellendiğinde yeniden işlenebilir; aynı dönem olduğu için analiz hakkı düşmez.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500">
              <th className="text-left px-4 py-2 font-medium">Dosya</th>
              <th className="text-left px-3 py-2 font-medium">Dönem</th>
              <th className="text-left px-3 py-2 font-medium">Kaynak</th>
              <th className="text-left px-3 py-2 font-medium">Tarih</th>
              <th className="text-right px-3 py-2 font-medium">Alan</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-[#1E293B]">
                  <span className="inline-flex items-center gap-1.5"><FileText size={13} className="text-slate-400" />{r.fileName}</span>
                  {r.stored && <span className="ml-2 text-[10px] text-slate-400">{fmtSize(r.fileSize)}</span>}
                  {!r.stored && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">dosya saklanmadı</span>}
                  {msg?.id === r.id && <div className={`text-[11px] mt-0.5 ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</div>}
                </td>
                <td className="px-3 py-2 text-[#1E293B]">{r.year} {PERIOD_LABEL_SHORT[r.period] ?? r.period}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{r.source}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{new Date(r.createdAt).toLocaleDateString('tr-TR')}</td>
                <td className="px-3 py-2 text-right text-slate-500 text-xs">{r.parsedFieldCount}</td>
                <td className="px-3 py-2 text-right">
                  {r.stored && (
                    <button onClick={() => reprocess(r)} disabled={busy === r.id}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 bg-white text-[#0B3C5D] hover:bg-slate-50 disabled:opacity-50">
                      {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Yeniden işle
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
