'use client'
import type { ReportData, SubjectiveCard } from '@/types/report'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'subjective'>
}

function SubjCard({ card }: { card: SubjectiveCard }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', overflow: 'hidden', position: 'relative' }}>
      {/* Başlık */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#0a192f' }}>{card.title}</div>
          <div style={{ fontSize: '7.5px', color: '#94a3b8', marginTop: '2px' }}>{card.subtitle}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="outfit" style={{ fontSize: '20px', fontWeight: 900, color: '#0a192f' }}>{card.score}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>/{card.maxScore}</span>
          <div style={{ fontSize: '8px', marginTop: '2px', padding: '2px 7px', background: '#f1f5f9', borderRadius: '4px', display: 'inline-block' }}>
            <span style={{ color: card.statusColor, fontWeight: 700 }}>{card.status}</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="prt" style={{ marginBottom: '10px' }}>
        <div style={{ height: '100%', borderRadius: '999px', background: card.barColor, width: `${card.percent}%` }} />
      </div>

      {/* Satır listesi */}
      {!card.isEmpty && card.rows.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          {card.rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: i < card.rows.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span style={{ fontSize: '8.5px', color: '#64748b' }}>{row.label}</span>
              <span style={{ fontSize: '8.5px', fontWeight: 700, color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Özet kutusu */}
      <div style={{ background: card.summaryBg, borderRadius: '8px', padding: '8px 10px', fontSize: '7.5px', color: card.summaryColor, lineHeight: 1.6 }}>
        {card.summary}
      </div>
    </div>
  )
}

export default function SubjectivePage({ data }: Props) {
  const { companyName, reportNo, subjective: sub } = data

  return (
    <div className="pdf-page">
      <div className="wm">SUBJEKTİF</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 12</div><div className="ph-title">Subjektif Faktörler</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div><div className="ph-pg">Sayfa 13</div></div>
      </div>
      <div className="pc">

        {/* Özet */}
        <div style={{ background: '#0a192f', borderRadius: '12px', padding: '14px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>Toplam Subjektif Skor</div>
            <div className="outfit" style={{ fontSize: '36px', fontWeight: 900, color: '#2dd4bf', lineHeight: 1 }}>
              {sub.totalScore}<span style={{ fontSize: '18px', color: '#475569' }}>/30</span>
            </div>
          </div>
          <div style={{ fontSize: '8.5px', color: '#94a3b8', maxWidth: '380px', lineHeight: 1.7 }}>
            Subjektif skor; KKB kredi sicili, banka ilişkileri, kurumsal yapı ve uyum profili baz alınarak hesaplanmıştır. Toplam 30 puan üzerinden değerlendirilen bu faktörler nihai rating'e doğrudan etki eder.
          </div>
          {/* Bileşen özeti */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {[
              { label: 'KKB', score: sub.kkb.score, max: 10 },
              { label: 'Banka', score: sub.bank.score, max: 10 },
              { label: 'Kurumsal', score: sub.corporate.score, max: 5 },
              { label: 'Uyum', score: sub.compliance.score, max: 5 },
            ].map((c, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div className="outfit" style={{ fontSize: '16px', fontWeight: 800, color: 'white', lineHeight: 1 }}>{c.score}</div>
                <div style={{ fontSize: '7px', color: '#475569' }}>/{c.max}</div>
                <div style={{ fontSize: '7px', color: '#64748b', marginTop: '2px' }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 4 Kart grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <SubjCard card={sub.kkb} />
          <SubjCard card={sub.bank} />
          <SubjCard card={sub.corporate} />
          <SubjCard card={sub.compliance} />
        </div>
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com · {reportNo}</span>
      </div>
    </div>
  )
}
