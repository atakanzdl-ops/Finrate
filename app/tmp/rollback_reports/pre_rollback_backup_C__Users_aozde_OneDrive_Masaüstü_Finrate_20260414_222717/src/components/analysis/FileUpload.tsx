'use client'

import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
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
  { value: '',       label: '— Dönem seçin —' },
  { value: 'ANNUAL', label: 'Kesin Beyan (Tam Yıl)' },
  { value: 'Q1',     label: '1. Geçici Vergi (Oca–Mar)' },
  { value: 'Q2',     label: '2. Geçici Vergi (Oca–Haz)' },
  { value: 'Q3',     label: '3. Geçici Vergi (Oca–Eyl)' },
  { value: 'Q4',     label: '4. Geçici Vergi (Oca–Ara)' },
]

const PERIOD_LABELS: Record<string, string> = {
  ANNUAL: 'Yıllık', Q1: '1Ç', Q2: '2Ç', Q3: '3Ç', Q4: '4Ç',
}

/** Dosya adından dönem tespit et (client-side, addFiles sırasında çalışır). */
function detectPeriodFromFilename(fileName: string): string {
  const n = fileName
    .replace(/İ/g, 'i').replace(/I/g, 'i')
    .replace(/Ğ/g, 'g').replace(/Ş/g, 's')
    .replace(/Ö/g, 'o').replace(/Ü/g, 'u').replace(/Ç/g, 'c')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g')
    .replace(/ş/g, 's').replace(/ö/g, 'o')
    .replace(/ü/g, 'u').replace(/ç/g, 'c')

  // PDF'e özel: kurumlar/gelir vergisi → yıllık
  if (/kurumlar\s*vergisi|gelir\s*vergisi/.test(n)) return 'ANNUAL'

  // Dönem numarası veya ay aralığı
  if (/(?:^|[^0-9])1[\s.]*donem|ocak[\s-]*mart/.test(n))    return 'Q1'
  if (/(?:^|[^0-9])2[\s.]*donem|ocak[\s-]*haziran/.test(n)) return 'Q2'
  if (/(?:^|[^0-9])3[\s.]*donem|ocak[\s-]*eylul/.test(n))   return 'Q3'
  if (/(?:^|[^0-9])4[\s.]*donem|ocak[\s-]*aralik/.test(n))  return 'Q4'

  // Yıllık/annual
  if (/yillik|annual/.test(n)) return 'ANNUAL'

  return '' // tespit yok — boş bırak
}

function fileIcon(name: string) {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return <FileText size={14} className="flex-shrink-0" style={{ color: '#0B3C5D' }} />
  return <FileSpreadsheet size={14} className="flex-shrink-0 text-emerald-600" />
}

export function FileUpload({ entityId, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDrag] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [globalYear, setGlobalYear] = useState(CURRENT_YEAR - 1)
  const [globalPeriod, setGlobalPeriod] = useState('')

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    const valid = arr.filter(f => /\.(xlsx|xls|csv|pdf)$/i.test(f.name))
    if (valid.length === 0) return
    setEntries(prev => {
      const existing = new Set(prev.map(e => e.file.name + e.file.size))
      const newEntries: FileEntry[] = valid
        .filter(f => !existing.has(f.name + f.size))
        .map(f => {
          // Dosya adından otomatik dönem tespit et; yoksa global seçime düş
          const detectedPeriod = detectPeriodFromFilename(f.name)
          console.log('[FileUpload] Dosya adı normalize:', f.name.replace(/İ/g,'i').replace(/I/g,'i').replace(/Ğ/g,'g').replace(/Ş/g,'s').replace(/Ö/g,'o').replace(/Ü/g,'u').replace(/Ç/g,'c').toLowerCase().replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ç/g,'c'))
          console.log('[FileUpload] Tespit edilen dönem:', detectedPeriod || '(yok - global kullanılacak: ' + globalPeriod + ')')
          return { file: f, year: globalYear, period: detectedPeriod || globalPeriod, status: 'pending' as const }
        })
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
  const hasUnselectedPeriod = entries.some(e => e.status === 'pending' && e.period === '')

  const selectClass = 'px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-slate-400'

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
          dragging ? 'border-[#0B3C5D]/40 bg-[#0B3C5D]/5' : 'border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-white',
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
        <Upload size={24} className="text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Dosyaları buraya sürükleyin veya tıklayın</p>
        <p className="text-xs text-slate-400 mt-1">.xlsx · .xls · .csv · .pdf — birden fazla dosya seçilebilir</p>
      </div>

      {/* Global yıl/dönem */}
      {entries.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <p className="text-xs text-slate-400">Varsayılan dönem (her dosya için ayrıca değiştirilebilir)</p>
          <div className="flex gap-2 flex-wrap">
            <select value={globalYear} onChange={(e) => setGlobalYear(Number(e.target.value))} className={selectClass}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={globalPeriod} onChange={(e) => setGlobalPeriod(e.target.value)} className={`flex-1 min-w-[140px] ${selectClass}`}>
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
              entry.status === 'done' ? 'border-emerald-200 bg-emerald-50' :
                entry.status === 'error' ? 'border-red-200 bg-red-50' :
                  entry.status === 'uploading' ? 'border-slate-300 bg-slate-50' :
                    'border-slate-200 bg-white'
            )}>
              <div className="mt-0.5">
                {entry.status === 'done' && <CheckCircle2 size={14} className="text-emerald-500" />}
                {entry.status === 'error' && <AlertCircle size={14} className="text-red-500" />}
                {entry.status === 'uploading' && <Loader2 size={14} className="animate-spin" style={{ color: '#0B3C5D' }} />}
                {entry.status === 'pending' && fileIcon(entry.file.name)}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs text-slate-700 truncate">{entry.file.name}</p>
                  <span className="text-slate-400 text-xs shrink-0">
                    {(entry.file.size / 1024).toFixed(0)}KB
                  </span>
                </div>

                {entry.status === 'done' && entry.rating && (
                  <p className="text-xs text-emerald-600">
                    {entry.year} · {PERIOD_LABELS[entry.period] ?? entry.period} &nbsp;·&nbsp;
                    <span className="font-bold">{entry.rating}</span>
                    <span className="text-slate-400 ml-1">({entry.score?.toFixed(1)})</span>
                  </p>
                )}
                {entry.status === 'error' && (
                  <p className="text-xs text-red-500">{entry.error}</p>
                )}

                {entry.status === 'pending' && (
                  <div className="flex gap-1.5 mt-1">
                    <select value={entry.year} onChange={(e) => updateEntry(idx, { year: Number(e.target.value) })} className={selectClass}>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={entry.period} onChange={(e) => updateEntry(idx, { period: e.target.value })} className={`flex-1 ${selectClass}`}>
                      {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {(entry.status === 'pending' || entry.status === 'error') && (
                <button onClick={() => removeEntry(idx)} className="text-slate-300 hover:text-slate-500 transition-colors mt-0.5 shrink-0">
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
          disabled={isUploading || hasUnselectedPeriod}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          style={{ background: '#0B3C5D' }}
        >
          {isUploading
            ? <><Loader2 size={15} className="animate-spin" /> İşleniyor...</>
            : hasUnselectedPeriod
              ? <><Upload size={15} /> Dönem seçilmeden yükleme yapılamaz</>
              : <><Upload size={15} /> {entries.filter(e => e.status === 'pending').length} dosyayı yükle ve analiz et</>
          }
        </button>
      )}

      {/* Şablon linki */}
      {entries.length === 0 && (
        <p className="text-xs text-slate-400 text-center">
          Excel şablonu indirmek için{' '}
          <a href="/api/template/excel" className="underline hover:text-slate-600 transition-colors" style={{ color: '#0B3C5D' }}>
            buraya tıklayın
          </a>
        </p>
      )}

      {/* Tümü tamamlandıysa yeni yükleme butonu */}
      {entries.length > 0 && !hasPending && !isUploading && (
        <button onClick={() => setEntries([])} className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline w-full text-center">
          Yeni dosya yükle
        </button>
      )}
    </div>
  )
}
