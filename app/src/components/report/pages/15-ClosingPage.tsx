'use client'
import type { ReportData } from '@/types/report'
import { Logo } from '@/components/ui/Logo'
import { getRatingBand } from '../formatters'

interface Props {
  data: Pick<ReportData, 'companyName' | 'rating' | 'totalScore' | 'reportNo' | 'reportDate' | 'validUntil' | 'analysisPeriod'>
}

export default function ClosingPage({ data }: Props) {
  const { companyName, rating, totalScore, reportNo, reportDate, validUntil, analysisPeriod } = data

  const ratingUpper = rating.replace(/[+-]$/, '').toUpperCase()
  const isInvestment = ['AAA', 'AA', 'A', 'BBB'].includes(ratingUpper)
  const ratingColor = isInvestment ? '#2dd4bf' : '#f59e0b'   // büyük rating rakamı rengi
  const band = getRatingBand(ratingUpper)                     // F8: badge için dinamik bant

  return (
    <div className="pdf-page">
      <div style={{ background: '#0a192f', height: '100%', position: 'relative', overflow: 'hidden' }}>

        {/* Dekoratif arka plan */}
        <div className="glow" style={{ width: '600px', height: '600px', background: 'radial-gradient(circle,rgba(45,212,191,.1) 0%,transparent 70%)', top: '-100px', right: '-100px' }} />
        <div className="glow" style={{ width: '800px', height: '800px', background: 'radial-gradient(circle,rgba(14,165,233,.08) 0%,transparent 70%)', bottom: '-200px', left: '-200px' }} />
        <div style={{ position: 'absolute', top: 0, right: '64px', width: '1px', height: '100%', background: 'rgba(255,255,255,.04)' }} />

        <div style={{ position: 'absolute', inset: 0, zIndex: 10, padding: '52px 58px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

          {/* Üst: Logo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Logo variant="light" size={42} showSubtext={false} />
            <div style={{ fontSize: '8.5px', color: '#475569' }}>Rapor No: {reportNo}</div>
          </div>

          {/* Orta: Ana içerik */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#2dd4bf', textTransform: 'uppercase', letterSpacing: '4px', fontWeight: 600, marginBottom: '20px' }}>Derecelendirme Sonucu</div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '32px', fontWeight: 300, lineHeight: 1.2, color: 'white', letterSpacing: '-0.5px', marginBottom: '32px' }}>
              {companyName}
            </h2>

            {/* Rating badge */}
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '22px', padding: '28px 48px' }}>
              <div style={{ fontSize: '8.5px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '8px' }}>Final Rating</div>
              <div className="outfit" style={{ fontSize: '80px', fontWeight: 900, lineHeight: 1, color: ratingColor, textShadow: `0 0 50px ${ratingColor}40` }}>
                {rating.replace(/[+-]$/, '')}
                {(rating.endsWith('+') || rating.endsWith('-')) && (
                  <span style={{ fontSize: '52px' }}>{rating.slice(-1)}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Toplam Skor</div>
                  <div className="outfit" style={{ fontSize: '28px', fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{totalScore}<span style={{ fontSize: '14px', color: '#475569' }}>/100</span></div>
                </div>
                <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,.1)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Dönem</div>
                  <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'white', lineHeight: 1.4 }}>{analysisPeriod}</div>
                </div>
                <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,.1)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Geçerlilik</div>
                  <div className="mono" style={{ fontSize: '12px', fontWeight: 700, color: 'white', lineHeight: 1.4 }}>{validUntil}</div>
                </div>
              </div>
              {/* Segment rozeti — F8: kutu içinde, getRatingBand ile dinamik renk */}
              <div style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: band.bg, border: `1px solid ${band.border}`, borderRadius: '999px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: band.text, boxShadow: `0 0 7px ${band.text}` }} />
                <span style={{ fontSize: '9px', color: band.text, fontWeight: 600 }}>{band.label}</span>
              </div>
            </div>
          </div>

          {/* Alt */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '8.5px', color: '#334155', lineHeight: 1.7, maxWidth: '340px' }}>
              Bu rapor, Finrate Finansal Derecelendirme Platformu tarafından {reportDate} tarihinde otomatik olarak üretilmiştir. {validUntil} tarihine kadar geçerlidir. Raporun tamamı gizlidir; yetkisiz kişilerle paylaşılamaz.
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="outfit" style={{ fontSize: '14px', color: '#475569', letterSpacing: '3px', fontWeight: 700 }}>FINRATE.COM.TR</div>
              <div style={{ fontSize: '8px', color: '#334155', marginTop: '5px' }}>
                Bankacılık Standartlarında Finansal Derecelendirme
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
