'use client'

import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  entityId: string
  onImported: () => void
}

interface ImportResult {
  year: number
  period: string
  rating: string
  score: number
  unmapped: string[]
}

export function FileUpload({ entityId, onImported }: Props) {
  const inputRef            = useRef<HTMLInputElement>(null)
  const [dragging, setDrag] = useState(false)
  const [file, setFile]     = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [error, setError]   = useState('')

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  function pickFile(f: File) {
    const ok = /\.(xlsx|xls|csv)$/i.test(f.name)
    if (!ok) { setError('Yalnızca .xlsx, .xls veya .csv dosyası yükleyebilirsiniz.'); return }
    setFile(f)
    setError('')
    setResults(null)
  }

  async function upload() {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/entities/${entityId}/upload`, { method: 'POST', body: fd })
      const d   = await res.json()
      if (!res.ok) { setError(d.error ?? 'Yükleme başarısız.'); return }
      setResults(d.results)
      onImported()
    } finally {
      setLoading(false)
    }
  }

  const PERIOD_LABELS: Record<string, string> = {
    ANNUAL: 'Yıllık', Q1: '1Ç', Q2: '2Ç', Q3: '3Ç', Q4: '4Ç',
  }

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      {!results && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
            dragging
              ? 'border-cyan-500/60 bg-cyan-500/5'
              : 'border-white/10 hover:border-white/20 hover:bg-white/3',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileSpreadsheet size={24} className="text-cyan-400" />
              <div className="text-left">
                <p className="text-sm font-medium text-white">{file.name}</p>
                <p className="text-xs text-white/40">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <Upload size={28} className="text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/50">Excel veya CSV dosyanızı buraya sürükleyin</p>
              <p className="text-xs text-white/30 mt-1">.xlsx · .xls · .csv — maks. 10 MB</p>
            </>
          )}
        </div>
      )}

      {/* Yükle butonu */}
      {file && !results && (
        <button
          onClick={upload}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 btn-gradient rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {loading ? 'Yükleniyor...' : 'Veriyi İçe Aktar'}
        </button>
      )}

      {/* Hata */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Sonuçlar */}
      {results && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={16} />
            <p className="text-sm font-medium">{results.length} dönem başarıyla içe aktarıldı.</p>
          </div>
          <div className="space-y-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg">
                <p className="text-xs text-white/70">{r.year} · {PERIOD_LABELS[r.period] ?? r.period}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-cyan-400">{r.rating}</span>
                  <span className="text-xs text-white/40">{r.score.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
          {results.some((r) => r.unmapped.length > 0) && (
            <p className="text-xs text-yellow-400/70">
              Bazı sütunlar eşlenemedi: {[...new Set(results.flatMap((r) => r.unmapped))].join(', ')}
            </p>
          )}
          <button
            onClick={() => { setFile(null); setResults(null) }}
            className="text-xs text-white/40 hover:text-white/60 transition-colors underline"
          >
            Yeni dosya yükle
          </button>
        </div>
      )}

      {/* Şablon linki */}
      {!results && (
        <p className="text-xs text-white/30 text-center">
          Şablon indirmek için{' '}
          <a href="/api/template/excel" className="text-cyan-400/70 hover:text-cyan-400 underline">
            buraya tıklayın
          </a>
        </p>
      )}
    </div>
  )
}
