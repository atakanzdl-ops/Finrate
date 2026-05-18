'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'

import ReportV2 from '@/components/report/ReportV2'
import { mapToReportData, type AnalysisApiResponse } from '@/components/report/dataMapper'
import type { ReportData } from '@/types/report'
import { Logo } from '@/components/ui/Logo'
import { ROADMAP_MESSAGES } from '@/lib/constants/roadmapMessages'

// ─── Yükleme Ekranı ──────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0a192f] flex flex-col items-center justify-center gap-4">
      <Logo variant="light" size={56} showSubtext={false} />
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
  // compareIds: manuel seçim (null = otomatik mod, boş string bile manuel mod)
  const compareIds = params.get('compareIds')

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
        const apiUrl = compareIds !== null
          ? `/api/analyses/${id}?compareIds=${encodeURIComponent(compareIds)}`
          : `/api/analyses/${id}`
        const res = await fetch(apiUrl)
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
  }, [id, compareIds])

  if (loading)        return <LoadingScreen />
  if (error || !reportData) return <ErrorScreen message={error ?? 'Veri alınamadı.'} />

  // === YENİ — Snapshot yoksa SAYFA İÇERİĞİNİ BLOKLA (Codex D12) ===
  const hasRoadmap = reportData.scenario != null
  if (!hasRoadmap) {
    return (
      <div style={{ maxWidth: '600px', margin: '60px auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
        <h2 style={{ marginBottom: '14px', color: '#1f2937' }}>Rapor Görüntülenemiyor</h2>
        <p style={{ color: '#4b5563', marginBottom: '24px', lineHeight: 1.6 }}>
          {ROADMAP_MESSAGES.ROADMAP_REQUIRED}
        </p>
        <button
          onClick={() => {
            window.location.href = `/dashboard/analiz${id ? `?id=${id}` : ''}`
          }}
          style={{
            background:   '#0f2942',
            color:        '#fff',
            padding:      '10px 24px',
            borderRadius: '6px',
            fontSize:     '14px',
            fontWeight:   500,
            border:       'none',
            cursor:       'pointer',
          }}
        >
          Analiz Sayfasına Dön
        </button>
      </div>
    )
  }

  const pdfUrl = compareIds !== null
    ? `/api/analyses/${id}/pdf?type=executive15&compareIds=${encodeURIComponent(compareIds)}`
    : `/api/analyses/${id}/pdf?type=executive15`

  return (
    <>
      {/* PDF İndir butonu — sadece web'de görünür, print'te gizli */}
      <div className="pdf-download-bar no-print">
        <button
          className="pdf-download-btn"
          onClick={() => window.open(pdfUrl, '_blank')}
        >
          📄 PDF Olarak İndir
        </button>
      </div>

      <div
        className="report-page-wrapper"
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
        <ReportV2 data={reportData} />
      </div>
    </>
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
