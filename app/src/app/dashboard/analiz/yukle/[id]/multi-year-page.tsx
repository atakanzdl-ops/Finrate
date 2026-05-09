'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Loader2, Upload } from 'lucide-react'
import FinrateShell from '@/components/layout/FinrateShell'

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

type YearUploadState = {
  file: File | null
  status: UploadStatus
  error?: string
  uploaded: boolean
}

type ConflictModal = {
  year:      number
  conflicts: Array<{
    year:               number
    period:             string
    existingSource:     string
    incomingSource:     string
    existingUploadDate: string
  }>
}

type MismatchModal = {
  message:  string
}

type DetectionMissingModal = {
  year:    number
  message: string
}

type EntityHardModal = {
  message: string
}

type EntitySoftModal = {
  year:    number
  error:   'ENTITY_TAX_UNVERIFIED_CONFIRM' | 'ENTITY_TC_UNVERIFIED_CONFIRM' | 'ENTITY_TITLE_MISMATCH_CONFIRM' | 'ENTITY_UNVERIFIED_CONFIRM'
  message: string
}

// Upload options object — replaces positional boolean params
interface UploadYearOptions {
  overwrite?:               boolean
  confirmDetectionMissing?: boolean
  confirmEntityUnverified?: boolean
}

const PERIODS = [
  { value: 'ANNUAL', label: 'Kesin Beyan (Tam Yıl)' },
  { value: 'Q1', label: '1. Geçici Vergi (Oca-Mar)' },
  { value: 'Q2', label: '2. Geçici Vergi (Oca-Haz)' },
  { value: 'Q3', label: '3. Geçici Vergi (Oca-Eyl)' },
  { value: 'Q4', label: '4. Geçici Vergi (Oca-Ara)' },
]

const YEARS = [2021, 2022, 2023, 2024, 2025]

export default function MultiYearUploadPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const entityId = String(params.id ?? '')

  const [uploads, setUploads] = useState<Record<number, YearUploadState>>(
    YEARS.reduce((acc, year) => {
      acc[year] = { file: null, status: 'idle', uploaded: false }
      return acc
    }, {} as Record<number, YearUploadState>),
  )
  const [period, setPeriod] = useState<string>('ANNUAL')
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState('')
  const [conflictModal, setConflictModal] = useState<ConflictModal | null>(null)
  const [mismatchModal, setMismatchModal] = useState<MismatchModal | null>(null)
  const [detectionMissingModal, setDetectionMissingModal] = useState<DetectionMissingModal | null>(null)
  const [entityHardModal, setEntityHardModal] = useState<EntityHardModal | null>(null)
  const [entitySoftModal, setEntitySoftModal] = useState<EntitySoftModal | null>(null)

  const hasAtLeastOneUploadedYear = YEARS.some((year) => uploads[year]?.uploaded)

  const setYearUpload = (year: number, patch: Partial<YearUploadState>) => {
    setUploads((prev) => ({ ...prev, [year]: { ...prev[year], ...patch } }))
  }

  const onFileSelect = (year: number, file: File | null) => {
    setYearUpload(year, { file, status: 'idle', error: undefined })
  }

  const uploadYear = async (year: number, opts: UploadYearOptions = {}) => {
    const selectedFile = uploads[year]?.file
    if (!selectedFile) {
      setYearUpload(year, { error: 'Önce dosya seçin.', status: 'error' })
      return
    }

    setError('')
    setYearUpload(year, { status: 'uploading', error: undefined })

    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      fd.append('year', String(year))
      fd.append('period', period)
      if (opts.overwrite)               fd.append('overwrite', 'true')
      if (opts.confirmDetectionMissing) fd.append('confirmDetectionMissing', 'true')
      if (opts.confirmEntityUnverified) fd.append('confirmEntityUnverified', 'true')

      const res = await fetch(`/api/entities/${entityId}/upload`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        // 409 — Parser yıl tespit edemedi → soft warning onay modalı
        if (res.status === 409 && data.error === 'DETECTED_YEAR_MISSING_CONFIRM') {
          setDetectionMissingModal({ year, message: data.message ?? 'Dosyada yıl bulunamadı. Formda seçilen yıla kaydedilecek. Onaylıyor musunuz?' })
          setYearUpload(year, { status: 'idle', error: undefined })
          return
        }
        // 409 — Aynı kaynaktan veri zaten var → onay modalı
        if (res.status === 409 && data.error === 'DUPLICATE_DATA') {
          setConflictModal({ year, conflicts: data.conflicts ?? [] })
          setYearUpload(year, { status: 'idle', error: undefined })
          return
        }
        // 422 — Yıl/dönem uyuşmazlığı → bilgi modalı
        if (res.status === 422 && (data.error === 'YEAR_MISMATCH' || data.error === 'PERIOD_MISMATCH')) {
          setMismatchModal({ message: data.message ?? 'Dosya yılı/dönemi formda seçilenle uyuşmuyor.' })
          setYearUpload(year, { status: 'error', error: data.message })
          return
        }
        // 400 MISSING_YEAR_CONTEXT — yıl bulunamadı
        if (res.status === 400 && data.error === 'MISSING_YEAR_CONTEXT') {
          setYearUpload(year, { status: 'error', error: data.message ?? 'Dosyada yıl bulunamadı.' })
          return
        }
        // 422 — ENTITY_TAX_NUMBER_MISMATCH (HARD — bypass YOK)
        if (res.status === 422 && data.error === 'ENTITY_TAX_NUMBER_MISMATCH') {
          setEntityHardModal({ message: data.message ?? 'Dosya farklı bir firmaya ait.' })
          setYearUpload(year, { status: 'error', error: data.message })
          return
        }
        // 409 — ENTITY soft senaryolar (CASE 2-5)
        if (
          res.status === 409 &&
          (
            data.error === 'ENTITY_TAX_UNVERIFIED_CONFIRM' ||
            data.error === 'ENTITY_TC_UNVERIFIED_CONFIRM'  ||
            data.error === 'ENTITY_TITLE_MISMATCH_CONFIRM' ||
            data.error === 'ENTITY_UNVERIFIED_CONFIRM'
          )
        ) {
          setEntitySoftModal({ year, error: data.error, message: data.message ?? 'Firma kimliği doğrulanamadı. Devam etmek ister misiniz?' })
          setYearUpload(year, { status: 'idle', error: undefined })
          return
        }
        setYearUpload(year, {
          status:   'error',
          uploaded: false,
          error:    data.error ?? 'Yükleme başarısız.',
        })
        return
      }

      setYearUpload(year, { status: 'done', uploaded: true, error: undefined })
    } catch {
      setYearUpload(year, { status: 'error', uploaded: false, error: 'Bağlantı hatası oluştu.' })
    }
  }

  const onOverwriteConfirm = () => {
    if (!conflictModal) return
    const year = conflictModal.year
    setConflictModal(null)
    uploadYear(year, { overwrite: true })
  }

  const onDetectionMissingConfirm = () => {
    if (!detectionMissingModal) return
    const year = detectionMissingModal.year
    setDetectionMissingModal(null)
    uploadYear(year, { confirmDetectionMissing: true })
  }

  const onEntityUnverifiedConfirm = () => {
    if (!entitySoftModal) return
    const year = entitySoftModal.year
    setEntitySoftModal(null)
    uploadYear(year, { confirmEntityUnverified: true })
  }

  const onAnalyze = async () => {
    if (!hasAtLeastOneUploadedYear) return
    setError('')
    setAnalysing(true)
    try {
      router.push(`/dashboard/analiz?entityId=${entityId}`)
    } finally {
      setAnalysing(false)
    }
  }

  return (
    <>
    {/* 409 — DUPLICATE_DATA: Üzerine yaz onay modalı */}
    {conflictModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-base font-bold text-[#0B3C5D] mb-2">Veri Zaten Mevcut</h3>
          <p className="text-sm text-slate-600 mb-4">
            {conflictModal.conflicts.length} dönem için aynı kaynaktan veri zaten var.
            Üzerine yazmak ister misiniz?
          </p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setConflictModal(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              İptal
            </button>
            <button type="button" onClick={onOverwriteConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#0B3C5D' }}>
              Üzerine Yaz
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 422 — YEAR/PERIOD_MISMATCH: Bilgi modalı */}
    {mismatchModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-base font-bold text-[#0B3C5D] mb-2">Yıl / Dönem Uyuşmazlığı</h3>
          <p className="text-sm text-slate-600 mb-4">{mismatchModal.message}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setMismatchModal(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Dosyayı Değiştir
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 409 — DETECTED_YEAR_MISSING_CONFIRM: Soft warning onay modalı */}
    {detectionMissingModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-base font-bold text-[#0B3C5D] mb-2">Yıl Bilgisi Bulunamadı</h3>
          <p className="text-sm text-slate-600 mb-4">{detectionMissingModal.message}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setDetectionMissingModal(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              İptal
            </button>
            <button type="button" onClick={onDetectionMissingConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#0B3C5D' }}>
              Onayla
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 422 — ENTITY_TAX_NUMBER_MISMATCH: Hard hata — sadece kapat */}
    {entityHardModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-base font-bold text-[#0B3C5D] mb-2">Firma Uyuşmazlığı</h3>
          <p className="text-sm text-slate-600 mb-4">{entityHardModal.message}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setEntityHardModal(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Kapat
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 409 — ENTITY soft senaryolar (CASE 2-5): Onay modalı */}
    {entitySoftModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-base font-bold text-[#0B3C5D] mb-2">Firma Kimliği Doğrulanamadı</h3>
          <p className="text-sm text-slate-600 mb-4">{entitySoftModal.message}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setEntitySoftModal(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              İptal
            </button>
            <button type="button" onClick={onEntityUnverifiedConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#0B3C5D' }}>
              Yine de Devam Et
            </button>
          </div>
        </div>
      </div>
    )}

    <FinrateShell>
      <div className="dashboard-content">
        <div className="max-w-5xl">
          <button type="button" className="btn btn-secondary mb-4" onClick={() => router.push('/dashboard')}>
            <ArrowLeft size={16} />
            Kontrol Paneline Dön
          </button>

          <section className="card p-6 sm:p-8">
            <h1 className="text-2xl font-bold text-[#0B3C5D]">Mali Veri Yükleme</h1>
            <p className="text-sm text-slate-500 mt-2">
              2021–2025 yılları için dosya yükleyin. En az bir yıl yüklendiğinde analiz başlatabilirsiniz.
            </p>

            <div className="mt-6">
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Dönem</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full sm:w-[360px] h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm outline-none focus:border-[#0B3C5D] bg-white"
              >
                {PERIODS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {YEARS.map((year) => {
                const item = uploads[year]
                return (
                  <article key={year} className="rounded-xl border border-[#E5E9F0] bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold text-[#0B3C5D]">{year}</h2>
                      {item.uploaded ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1">
                          <CheckCircle2 size={14} />
                          Yüklendi
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">Bekleniyor</span>
                      )}
                    </div>

                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.pdf"
                      onChange={(e) => onFileSelect(year, e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#EDF4F8] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#0B3C5D] hover:file:bg-[#DFEBF2]"
                    />

                    {item.file && <p className="mt-2 text-xs text-slate-600 truncate">{item.file.name}</p>}
                    {item.error && <p className="mt-2 text-xs text-red-600">{item.error}</p>}

                    <button
                      type="button"
                      className="mt-3 btn btn-secondary w-full"
                      onClick={() => uploadYear(year)}
                      disabled={item.status === 'uploading'}
                    >
                      {item.status === 'uploading' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {item.status === 'uploading' ? 'Yükleniyor...' : 'Dosya Yükle'}
                    </button>
                  </article>
                )
              })}
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onAnalyze}
              disabled={!hasAtLeastOneUploadedYear || analysing}
              className="mt-5 btn btn-primary"
            >
              {analysing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {analysing ? 'Yönlendiriliyor...' : 'Analiz Et'}
            </button>

            {!hasAtLeastOneUploadedYear && (
              <p className="mt-2 text-xs text-slate-500">Analiz başlatmak için en az 1 yıl dosyası yükleyin.</p>
            )}
          </section>
        </div>
      </div>
    </FinrateShell>
    </>
  )
}
