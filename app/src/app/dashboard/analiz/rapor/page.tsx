'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'

import ReportV2 from '@/components/report/ReportV2'
import { mapToReportData, type AnalysisApiResponse } from '@/components/report/dataMapper'
import type { ReportData } from '@/types/report'
import { Logo } from '@/components/ui/Logo'
import { ROADMAP_MESSAGES } from '@/lib/constants/roadmapMessages'

const RATING_ORDER = ['D', 'C', 'CC', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA']
function nextGrade(current: string): string {
  const i = RATING_ORDER.indexOf((current || '').toUpperCase().replace(/[+-]$/, ''))
  if (i < 0) return 'BBB'
  return RATING_ORDER[Math.min(i + 1, RATING_ORDER.length - 1)]
}

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
  const [subjectiveMissing, setSubjectiveMissing] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError]     = useState<string | null>(null)

  // Snapshot subjektif/veri değişince geçersiz olur; rapor tekrar açılabilsin diye
  // yol haritası buradan yeniden üretilir (hedef: mevcut notun bir üstü).
  async function regenerateRoadmap(currentRating: string) {
    if (!id) return
    setRegenerating(true)
    setRegenError(null)
    try {
      const res = await fetch('/api/scenarios/v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: id, targetGrade: nextGrade(currentRating), currentGrade: currentRating }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      window.location.reload()
    } catch (err: unknown) {
      setRegenError(err instanceof Error ? err.message : 'Yol haritası oluşturulamadı')
      setRegenerating(false)
    }
  }

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
        setSubjectiveMissing(api.subjectiveInput == null)
        setReportData(mapToReportData(api))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Bilinmeyen hata')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, compareIds])

  // Yol haritası yoksa (ilk rapor ya da yeni yükleme sonrası) kullanıcıya iş vermeden otomatik üret.
  // Aynı analiz için 2 dakikada bir kez denenir (üretim başarısız olursa döngüye girmesin).
  useEffect(() => {
    if (loading || error || !reportData || subjectiveMissing || reportData.scenario != null || !id) return
    const key = `finrate_rapor_autogen_${id}`
    let last = 0
    try { last = Number(sessionStorage.getItem(key) ?? 0) } catch { /* özel pencere vb. */ }
    if (Date.now() - last < 120_000) return
    try { sessionStorage.setItem(key, String(Date.now())) } catch { /* yoksay */ }
    regenerateRoadmap(reportData.rating)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, reportData, subjectiveMissing, id])

  if (loading)        return <LoadingScreen />
  if (error || !reportData) return <ErrorScreen message={error ?? 'Veri alınamadı.'} />
  if (regenerating) {
    return (
      <div className="min-h-screen bg-[#0a192f] flex flex-col items-center justify-center gap-4">
        <Logo variant="light" size={56} showSubtext={false} />
        <Loader2 className="w-6 h-6 text-[#2dd4bf] animate-spin" />
        <p className="text-sm text-[#64748b] tracking-widest uppercase">Rapor Hazırlanıyor</p>
        <p className="text-xs text-[#94a3b8]">Yol haritası ve aksiyon planı üretiliyor, birkaç saniye sürebilir…</p>
      </div>
    )
  }

  // Subjektif faktörler girilmeden rapor oluşmaz (nihai skor 70 finansal + 30 subjektif)
  if (subjectiveMissing) {
    return (
      <div style={{ maxWidth: '600px', margin: '60px auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
        <h2 style={{ marginBottom: '14px', color: '#1f2937' }}>Rapor Görüntülenemiyor</h2>
        <p style={{ color: '#4b5563', marginBottom: '24px', lineHeight: 1.6 }}>
          {ROADMAP_MESSAGES.SUBJECTIVE_REQUIRED}
        </p>
        <button
          onClick={() => { window.location.href = '/dashboard/analiz' }}
          style={{
            background: '#0B3C5D', color: '#fff', padding: '10px 24px', borderRadius: '6px',
            fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer',
          }}
        >
          Analiz Sayfasına Dön
        </button>
      </div>
    )
  }

  // === YENİ — Snapshot yoksa SAYFA İÇERİĞİNİ BLOKLA (Codex D12) ===
  const hasRoadmap = reportData.scenario != null
  if (!hasRoadmap) {
    return (
      <div style={{ maxWidth: '600px', margin: '60px auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
        <h2 style={{ marginBottom: '14px', color: '#1f2937' }}>Rapor Hazırlanamadı</h2>
        <p style={{ color: '#4b5563', marginBottom: '24px', lineHeight: 1.6 }}>
          {regenError
            ? `Yol haritası üretilemedi: ${regenError}`
            : 'Yol haritası otomatik üretilemedi. Tekrar deneyin; sorun sürerse Senaryo sekmesinden "Yol Haritası Oluştur" ile üretebilirsiniz.'}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => regenerateRoadmap(reportData.rating)}
            disabled={regenerating}
            style={{
              background:   '#0B3C5D',
              color:        '#fff',
              padding:      '10px 24px',
              borderRadius: '6px',
              fontSize:     '14px',
              fontWeight:   600,
              border:       'none',
              cursor:       regenerating ? 'wait' : 'pointer',
              opacity:      regenerating ? 0.6 : 1,
            }}
          >
            {regenerating ? 'Oluşturuluyor…' : 'Tekrar Dene'}
          </button>
          <button
            onClick={() => { window.location.href = '/dashboard/analiz' }}
            style={{
              background:   '#fff',
              color:        '#0B3C5D',
              padding:      '10px 24px',
              borderRadius: '6px',
              fontSize:     '14px',
              fontWeight:   500,
              border:       '1px solid #d7e4ee',
              cursor:       'pointer',
            }}
          >
            Analiz Sayfasına Dön
          </button>
        </div>
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
          onClick={async () => {
            // Ücretsiz planda (402) veya eksik yol haritasında (409) JSON hata döner → kullanıcıya mesaj göster
            try {
              const res = await fetch(pdfUrl)
              if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                window.alert(body?.error ?? 'PDF oluşturulamadı.')
                return
              }
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `Finrate_Rapor_${id}.pdf`; a.click()
              setTimeout(() => URL.revokeObjectURL(url), 10_000)
            } catch {
              window.alert('PDF indirilemedi. Lütfen tekrar deneyin.')
            }
          }}
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
