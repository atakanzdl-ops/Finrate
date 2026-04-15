'use client'
export { default } from './multi-year-page'
/*

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Upload } from 'lucide-react'
import FinrateShell from '@/components/layout/FinrateShell'

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

const PERIODS = [
  { value: 'ANNUAL', label: 'Kesin Beyan (Tam Yıl)' },
  { value: 'Q1', label: '1. Geçici Vergi (Oca-Mar)' },
  { value: 'Q2', label: '2. Geçici Vergi (Oca-Haz)' },
  { value: 'Q3', label: '3. Geçici Vergi (Oca-Eyl)' },
  { value: 'Q4', label: '4. Geçici Vergi (Oca-Ara)' },
]

export default function UploadPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const entityId = String(params.id ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [year, setYear] = useState<number>(new Date().getFullYear() - 1)
  const [period, setPeriod] = useState<string>('ANNUAL')
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [error, setError] = useState('')

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)

  const onSubmit = async () => {
    if (!files.length) {
      setError('Lütfen en az bir dosya seçin.')
      return
    }

    setError('')
    setStatus('uploading')

    try {
      let successCount = 0
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('year', String(year))
        fd.append('period', period)

        const res = await fetch(`/api/entities/${entityId}/upload`, {
          method: 'POST',
          body: fd,
        })
        if (res.ok) successCount += 1
      }

      if (!successCount) {
        setStatus('error')
        setError('Yükleme tamamlanamadı. Dosya formatını kontrol edin.')
        return
      }

      setStatus('done')
      router.push(`/dashboard/analiz?entityId=${entityId}`)
    } catch {
      setStatus('error')
      setError('Bağlantı hatası oluştu. Lütfen tekrar deneyin.')
    }
  }

  return (
    <FinrateShell>
      <div className="dashboard-content">
        <div className="max-w-3xl">
          <button
            type="button"
            className="btn btn-secondary mb-4"
            onClick={() => router.push('/dashboard')}
          >
            <ArrowLeft size={16} />
            Kontrol Paneline Dön
          </button>

          <section className="card p-6 sm:p-8">
            <h1 className="text-2xl font-bold text-[#0B3C5D]">Mizan Yükleme</h1>
            <p className="text-sm text-slate-500 mt-2">
              Dosyanızı yükleyin, analiz otomatik olarak oluşturulsun.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Yıl</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm outline-none focus:border-[#0B3C5D] bg-white"
                >
                  {years.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Dönem</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full h-11 rounded-lg border border-[#E5E9F0] px-3 text-sm outline-none focus:border-[#0B3C5D] bg-white"
                >
                  {PERIODS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">Mizan Dosyası</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#0B3C5D] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#0A3552]"
              />
              <p className="text-xs text-slate-500 mt-2">
                Desteklenen formatlar: .xlsx, .xls, .csv, .pdf
              </p>
            </div>

            {files.length > 0 && (
              <div className="mt-4 rounded-lg border border-[#E5E9F0] bg-[#F8FAFC] p-3 text-sm text-[#1E293B]">
                {files.length} dosya seçildi.
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={status === 'uploading'}
              className="mt-5 btn btn-primary"
            >
              {status === 'uploading' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {status === 'uploading' ? 'Yükleniyor...' : 'Yükle ve Analiz Et'}
            </button>
          </section>
        </div>
      </div>
    </FinrateShell>
  )
}
*/
