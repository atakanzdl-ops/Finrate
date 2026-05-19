'use client'
import type { ReportData, SubjectiveCard } from '@/types/report'
import { getSubjectiveStatus } from '../templates'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'subjective'>
  sector?: string
}

function SubjCard({ card }: { card: SubjectiveCard }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Lacivert üst başlık bandı */}
      <div style={{ background: '#0a192f', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '11px' }}>{card.title}</div>
          {card.subtitle && (
            <div style={{ color: '#cbd5e1', fontSize: '8px', marginTop: '2px' }}>{card.subtitle}</div>
          )}
        </div>
        <div style={{ color: card.statusColor, fontWeight: 700, fontSize: '14px' }}>
          {card.score}/{card.maxScore}
        </div>
      </div>

      {/* Beyaz gövde */}
      <div style={{ background: '#ffffff', padding: '10px 14px' }}>
        {/* Satır listesi */}
        {!card.isEmpty && card.rows.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            {card.rows.map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: i < card.rows.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                <span style={{ fontSize: '8.5px', color: '#475569' }}>{row.label}</span>
                <span style={{ fontSize: '8.5px', fontWeight: 600, color: row.color || '#0f172a' }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Özet kutusu */}
        {card.summary && (
          <div style={{ background: card.summaryBg, borderRadius: '4px', padding: '6px 8px', fontSize: '8px', color: card.summaryColor, lineHeight: 1.6, fontStyle: 'italic' }}>
            {card.summary}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SubjectivePage({ data, sector }: Props) {
  const { companyName, reportNo, subjective: sub } = data

  return (
    <div className="pdf-page">
      <div className="wm">SUBJEKTİF</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 13</div><div className="ph-title">Subjektif Faktörler</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 14</div></div>
      </div>
      <div className="pc">

        {/* Özet */}
        <div style={{ background: '#0a192f', borderRadius: '12px', padding: '14px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>Toplam Subjektif Skor</div>
            <div className="outfit" style={{ fontSize: '36px', fontWeight: 900, color: '#2dd4bf', lineHeight: 1 }}>
              {sub.totalScore}<span style={{ fontSize: '18px', color: '#475569' }}>/{sub.maxScore}</span>
            </div>
          </div>
          <div style={{ fontSize: '8.5px', color: '#94a3b8', maxWidth: '480px', lineHeight: 1.7 }}>
            Subjektif skor; KKB kredi sicili, banka ilişkileri, kurumsal yapı ve uyum profili baz alınarak hesaplanmıştır. Toplam 30 puan üzerinden değerlendirilen bu faktörler nihai rating'e doğrudan etki eder.
          </div>
        </div>

        {/* 4 Kart grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <SubjCard card={sub.kkb} />
          <SubjCard card={sub.bank} />
          <SubjCard card={sub.corporate} />
          <SubjCard card={sub.compliance} />
        </div>

        {/* 5 KPI özet kutusu */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginTop: '12px' }}>
          {[
            { label: 'KKB',      value: sub.kkb.score,        max: sub.kkb.maxScore },
            { label: 'Banka',    value: sub.bank.score,       max: sub.bank.maxScore },
            { label: 'Kurumsal', value: sub.corporate.score,  max: sub.corporate.maxScore },
            { label: 'Uyum',     value: sub.compliance.score, max: sub.compliance.maxScore },
            { label: 'Toplam',   value: sub.totalScore,       max: sub.maxScore },
          ].map((kpi, i) => {
            const st = getSubjectiveStatus(kpi.value, kpi.max)
            return (
              <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{kpi.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: st.statusColor }}>
                  {kpi.value}/{kpi.max}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com.tr · {reportNo}</span>
      </div>
    </div>
  )
}
