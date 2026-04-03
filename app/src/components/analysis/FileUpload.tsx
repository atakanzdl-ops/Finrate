'use client'

import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, Loader2, X, Clock } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  entityId: string
  onImported: () => void
}

interface FileEntry {
  file: File
  year: number
  period: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  rating?: string
  score?: number
  error?: string
  unmapped?: string[]
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const PERIODS = [
  { value: 'ANNUAL', label: 'Kesin Beyan (Tam Yıl)' },
  { value: 'Q1', label: '1. Geçici Vergi (Oca–Mar)' },
  { value: 'Q2', label: '2. Geçici Vergi (Oca–Haz)' },
  { value: 'Q3', label: '3. Geçici Vergi (Oca–Eyl)' },
  { value: 'Q4', label: '4. Geçici Vergi (Oca–Ara)' },
]

const PERIOD_LABELS: Record<string, string> = {
  ANNUAL: 'Yıllık', Q1: '1Ç', Q2: '2Ç', Q3: '3Ç', Q4: '4Ç',
}

function fileIcon(name: string) {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return <FileText size={14} className="text-[#40E0D0] flex-shrink-0" />
  return <FileSpreadsheet size={14} className="text-[#003153] flex-shrink-0" />
}

export function FileUpload({ entityId, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDrag] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [globalYear, setGlobalYear] = useState(CURRENT_YEAR - 1)
  const [globalPeriod, setGlobalPeriod] = useState('ANNUAL')

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    const valid = arr.filter(f => /\.(xlsx|xls|csv|pdf)$/i.test(f.name))
    if (valid.length === 0) return
    setEntries(prev => {
      const existing = new Set(prev.map(e => e.file.name + e.file.size))
      const newEntries: FileEntry[] = valid
        .filter(f => !existing.has(f.name + f.size))
        .map(f => ({ file: f, year: globalYear, period: globalPeriod, status: 'pending' }))
      return [...prev, ...newEntries]
    })
  }

  function removeEntry(idx: number) {
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }

  function updateEntry(idx: number, patch: Partial<FileEntry>) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }

  async function uploadOne(entry: FileEntry, idx: number): Promise<boolean> {
    updateEntry(idx, { status: 'uploading' })
    try {
      const fd = new FormData()
      fd.append('file', entry.file)
      fd.append('year', String(entry.year))
      fd.append('period', entry.period)
      const res = await fetch(`/api/entities/${entityId}/upload`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) {
        updateEntry(idx, { status: 'error', error: d.error ?? 'Yükleme başarısız.' })
        return false
      }
      const first = d.results?.[0]
      updateEntry(idx, {
        status: 'done',
        rating: first?.rating,
        score: first?.score,
        unmapped: first?.unmapped ?? [],
      })
      return true
    } catch {
      updateEntry(idx, { status: 'error', error: 'Bağlantı hatası.' })
      return false
    }
  }

  async function uploadAll() {
    const pending = entries.map((e, i) => ({ e, i })).filter(x => x.e.status === 'pending')
    let anyOk = false
    for (const { e, i } of pending) {
      const ok = await uploadOne(e, i)
      if (ok) anyOk = true
    }
    if (anyOk) onImported()
  }

  const hasPending = entries.some(e => e.status === 'pending')
  const isUploading = entries.some(e => e.status === 'uploading')

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
          dragging ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-white/10 hover:border-white/20',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <Upload size={24} className="text-white/20 mx-auto mb-2" />
        <p className="text-sm text-white/50">Dosyaları buraya sürükleyin veya tıklayın</p>
        <p className="text-xs text-white/30 mt-1">.xlsx · .xls · .csv · .pdf — birden fazla dosya seçilebilir</p>
      </div>

      {/* Global yıl/dönem — tüm yeni dosyalar için default */}
      {entries.length > 0 && (
        <div className="glass-card rounded-xl p-3 space-y-2">
          <p className="text-xs text-white/40">Varsayılan dönem (her dosya için ayrıca değiştirilebilir)</p>
          <div className="flex gap-2 flex-wrap">
            <select
              value={globalYear}
              onChange={(e) => setGlobalYear(Number(e.target.value))}
              className="px-2 py-1.5 bg-[#0a1628] border border-white/10 rounded-lg text-xs text-white [&>option]:bg-[#0a1628] focus:outline-none focus:border-cyan-500/50"
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={globalPeriod}
              onChange={(e) => setGlobalPeriod(e.target.value)}
              className="flex-1 min-w-[140px] px-2 py-1.5 bg-[#0a1628] border border-white/10 rounded-lg text-xs text-white [&>option]:bg-[#0a1628] focus:outline-none focus:border-cyan-500/50"
            >
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Dosya listesi */}
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry, idx) => (
            <div key={idx} className={clsx(
              'rounded-lg border px-3 py-2 flex items-start gap-2 transition-all',
              entry.status === 'done' ? 'border-emerald-500/30 bg-emerald-500/5' :
                entry.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
                  entry.status === 'uploading' ? 'border-cyan-500/30 bg-cyan-500/5' :
                    'border-white/10 bg-white/3'
            )}>
              {/* İkon durumu */}
              <div className="mt-0.5">
                {entry.status === 'done' && <CheckCircle2 size={14} className="text-emerald-400" />}
                {entry.status === 'error' && <AlertCircle size={14} className="text-red-400" />}
                {entry.status === 'uploading' && <Loader2 size={14} className="text-cyan-400 animate-spin" />}
                {entry.status === 'pending' && fileIcon(entry.file.name)}
              </div>

              {/* İçerik */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs text-white/80 truncate">{entry.file.name}</p>
                  <span className="text-white/20 text-xs shrink-0">
                    {(entry.file.size / 1024).toFixed(0)}KB
                  </span>
                </div>

                {/* Sonuç */}
                {entry.status === 'done' && entry.rating && (
                  <p className="text-xs text-emerald-400">
                    {entry.year} · {PERIOD_LABELS[entry.period] ?? entry.period} &nbsp;·&nbsp;
                    <span className="font-bold">{entry.rating}</span>
                    <span className="text-white/40 ml-1">({entry.score?.toFixed(1)})</span>
                  </p>
                )}
                {entry.status === 'error' && (
                  <p className="text-xs text-red-400">{entry.error}</p>
                )}

                {/* Dönem seçici — sadece pending durumda */}
                {entry.status === 'pending' && (
                  <div className="flex gap-1.5 mt-1">
                    <select
                      value={entry.year}
                      onChange={(e) => updateEntry(idx, { year: Number(e.target.value) })}
                      className="px-1.5 py-1 bg-[#0a1628] border border-white/10 rounded text-xs text-white [&>option]:bg-[#0a1628] focus:outline-none"
                    >
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select
                      value={entry.period}
                      onChange={(e) => updateEntry(idx, { period: e.target.value })}
                      className="flex-1 px-1.5 py-1 bg-[#0a1628] border border-white/10 rounded text-xs text-white [&>option]:bg-[#0a1628] focus:outline-none"
                    >
                      {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Sil (sadece pending veya error) */}
              {(entry.status === 'pending' || entry.status === 'error') && (
                <button
                  onClick={() => removeEntry(idx)}
                  className="text-white/20 hover:text-white/50 transition-colors mt-0.5 shrink-0"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Yükle butonu */}
      {hasPending && (
        <button
          onClick={uploadAll}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-2 py-2.5 btn-gradient rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        >
          {isUploading
            ? <><Loader2 size={15} className="animate-spin" /> İşleniyor...</>
            : <><Upload size={15} /> {entries.filter(e => e.status === 'pending').length} dosyayı yükle ve analiz et</>
          }
        </button>
      )}

      {/* Şablon linki */}
      {entries.length === 0 && (
        <p className="text-xs text-white/30 text-center">
          Excel şablonu indirmek için{' '}
          <a href="/api/template/excel" className="text-cyan-400/70 hover:text-cyan-400 underline">
            buraya tıklayın
          </a>
        </p>
      )}

      {/* Tümü tamamlandıysa yeni yükleme butonu */}
      {entries.length > 0 && !hasPending && !isUploading && (
        <button
          onClick={() => setEntries([])}
          className="text-xs text-white/40 hover:text-white/60 transition-colors underline w-full text-center"
        >
          Yeni dosya yükle
        </button>
      )}
    </div>
  )
}
