'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'

import ReportV2 from '@/components/report/ReportV2'
import { mapToReportData, type AnalysisApiResponse } from '@/components/report/dataMapper'
import type { ReportData } from '@/types/report'

// ─── Yükleme Ekranı ──────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0a192f] flex flex-col items-center justify-center gap-4">
      <div
        style={{
          width: 56,
          height: 56,
          background: 'linear-gradient(135deg,#2dd4bf,#0284c7)',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 800,
          color: 'white',
        }}
      >
        F
      </div>
      <Loader2 className="w-6 h-6 text-[#2dd4bf] animate-spin" />
      <p className="text-sm text-[#64748b] tracking-widest uppercase">Rapor Hazırlanıyor</p>
    </div>
  )
}

// ─── Hata Ekranı ─────────────────────────────────────────────────────────────
function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center gap-4 p-8">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="text-lg font-semibold text-[#0a192f]">Rapor yüklenemedi</p>
      <p className="text-sm text-gray-500 text-center max-w-sm">{message}</p>
    </div>
  )
}

// ─── Asıl İçerik (useSearchParams ihtiyacı Suspense ile korunur) ──────────────
function RaporContent() {
  const params = useSearchParams()
  const id = params.get('id')

  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (!id) {
      setError('URL parametresi eksik: ?id=<analiz_id> şeklinde belirtin.')
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        const res = await fetch(`/api/analyses/${id}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        const api: AnalysisApiResponse = await res.json()
        setReportData(mapToReportData(api))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Bilinmeyen hata')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  if (loading)        return <LoadingScreen />
  if (error || !reportData) return <ErrorScreen message={error ?? 'Veri alınamadı.'} />

  return (
    <div
      style={{
        background: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 40,
        padding: 40,
        minHeight: '100vh',
      }}
    >
      {/* Yazdırma stili */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #report-wrapper { background: white !important; padding: 0 !important; gap: 0 !important; }
          .pdf-page { box-shadow: none !important; border-radius: 0 !important; }
        }
      `}</style>

      <div id="report-wrapper" style={{ width: '100%', display: 'contents' }}>
        <ReportV2 data={reportData} />
      </div>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default function RaporPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <RaporContent />
    </Suspense>
  )
}
