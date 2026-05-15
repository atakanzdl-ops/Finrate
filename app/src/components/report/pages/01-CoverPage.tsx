'use client'
import type { ReportData } from '@/types/report'
import { Logo } from '@/components/ui/Logo'
import { getRatingBand } from '../formatters'

interface Props {
  data: Pick<ReportData, 'companyName' | 'rating' | 'totalScore' | 'financialScore' | 'subjectiveScore' | 'analysisPeriod' | 'reportDate' | 'validUntil' | 'reportNo'>
}

export default function CoverPage({ data }: Props) {
  const { companyName, rating, totalScore, financialScore, subjectiveScore, analysisPeriod, reportDate, reportNo } = data

  // Gauge hesabı: totalScore / 100 → dashoffset
  // çevre = 2π×45 ≈ 282.7
  const circumference = 282.7
  const filled = (totalScore / 100) * circumference
  const offset = circumference - filled

  // Rating bant — F8: getRatingBand exact match (metodoloji tablosuyla uyumlu)
  const ratingUpper = rating.replace(/[+-]$/, '').toUpperCase()
  const band = getRatingBand(ratingUpper)

  // Firma adını iki satıra böl (boşluk varsa)
  const nameParts = companyName.split(' ')
  const firstLine = nameParts.slice(0, Math.ceil(nameParts.length / 2)).join(' ')
  const secondLine = nameParts.slice(Math.ceil(nameParts.length / 2)).join(' ')

  return (
    <div className="pdf-page">
      <div style={{ background: '#0a192f', height: '100%', position: 'relative', overflow: 'hidden' }}>
        {/* Dekoratif ışık efektleri */}
        <div className="glow" style={{ width: '700px', height: '700px', background: 'radial-gradient(circle,rgba(45,212,191,.14) 0%,transparent 70%)', top: '-200px', left: '-200px' }} />
        <div className="glow" style={{ width: '900px', height: '900px', background: 'radial-gradient(circle,rgba(14,165,233,.14) 0%,transparent 70%)', bottom: '-300px', right: '-300px' }} />
        <div style={{ position: 'absolute', top: 0, left: '64px', width: '1px', height: '100%', background: 'rgba(255,255,255,.04)' }} />
        <div style={{ position: 'absolute', top: '64px', left: 0, width: '100%', height: '1px', background: 'rgba(255,255,255,.04)' }} />

        <div style={{ position: 'absolute', inset: 0, zIndex: 10, padding: '52px 58px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

          {/* Logo & Rapor Türü */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Logo variant="light" size={46} showSubtext={false} />
            <div style={{ textAlign: 'right' }}>
              <div className="outfit" style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px' }}>Finansal Analiz Raporu</div>
              <div style={{ fontSize: '9.5px', color: '#475569', marginTop: '5px' }}>Erişim: Yönetim Kurulu · Kredi Komitesi</div>
            </div>
          </div>

          {/* Firma Adı & Skor Paneli */}
          <div style={{ marginTop: '-50px' }}>
            <div className="outfit" style={{ fontSize: '10px', color: '#2dd4bf', textTransform: 'uppercase', letterSpacing: '4px', fontWeight: 600, marginBottom: '26px' }}>Özel Döküman</div>
            <h1 style={{ fontSize: '58px', fontWeight: 300, lineHeight: 1.1, color: 'white', letterSpacing: '-1px', marginBottom: '44px', fontFamily: "'Outfit',sans-serif" }}>
              {firstLine}<br /><strong style={{ fontWeight: 900 }}>{secondLine || ''}</strong>
            </h1>

            {/* Skor paneli */}
            <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(20px)', borderRadius: '26px', padding: '32px 38px', gap: '44px', boxShadow: '0 24px 48px rgba(0,0,0,.4)' }}>

              {/* SVG Gauge — Ö4: 180px, skor 68px bold */}
              <div style={{ position: 'relative', width: '180px', height: '180px' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#2dd4bf', filter: 'blur(26px)', opacity: 0.11 }} />
                <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', position: 'relative', zIndex: 5, transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="url(#cg1)" strokeWidth="8"
                    strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                  <defs>
                    <linearGradient id="cg1" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#2dd4bf" />
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                  <div className="outfit" style={{ fontSize: '68px', fontWeight: 700, lineHeight: 1, color: 'white' }}>{totalScore}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', letterSpacing: '1px' }}>/100</div>
                </div>
              </div>

              {/* Rating — Ö4: daha küçük (36px), skor gauge öne çıktı */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '9.5px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '7px' }}>Derecelendirme Notu</div>
                <div className="outfit" style={{ fontSize: '36px', fontWeight: 900, lineHeight: 1, color: '#2dd4bf', textShadow: '0 0 28px rgba(45,212,191,.4)' }}>
                  {rating.replace(/[+-]$/, '')}
                  {rating.endsWith('+') && <span style={{ fontSize: '24px' }}>+</span>}
                  {rating.endsWith('-') && <span style={{ fontSize: '24px' }}>-</span>}
                </div>
                <div style={{ marginTop: '12px', padding: '5px 13px', background: band.bg, border: `1px solid ${band.border}`, borderRadius: '999px', fontSize: '9px', color: band.text, display: 'inline-flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                  <div style={{ width: '6px', height: '6px', background: band.text, borderRadius: '50%', boxShadow: `0 0 7px ${band.text}` }} />
                  {band.label}
                </div>
              </div>

              {/* Meta bilgi */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '11px', borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: '36px' }}>
                <div>
                  <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '3px' }}>Analiz Dönemi</div>
                  <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>{analysisPeriod}</div>
                </div>
                <div>
                  <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '3px' }}>Fin. / Subjektif</div>
                  <div className="mono" style={{ fontSize: '12px', fontWeight: 700, color: 'white' }}>{financialScore}/70 · {subjectiveScore}/30</div>
                </div>
                <div>
                  <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '3px' }}>Rapor Tarihi</div>
                  <div className="mono" style={{ fontSize: '11px', fontWeight: 700, color: 'white' }}>{reportDate}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Alt bilgi */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '9px', color: '#475569', lineHeight: 1.7, maxWidth: '360px' }}>
              Bu rapor TCMB 2024 sektör kıyaslama verileri kullanılarak bankacılık metodolojisi ile üretilmiştir. Gizlidir; yetkisiz kişilerle paylaşılamaz. KVKK kapsamında kişisel veri içermektedir.
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="outfit" style={{ fontSize: '11px', color: '#475569', letterSpacing: '2px', fontWeight: 700 }}>FINRATE.COM.TR</div>
              <div style={{ fontSize: '8.5px', color: '#334155', marginTop: '3px' }}>Rapor No: {reportNo}</div>
              <div style={{ fontSize: '8.5px', color: '#334155', marginTop: '2px' }}>Geçerlilik: {data.validUntil}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
