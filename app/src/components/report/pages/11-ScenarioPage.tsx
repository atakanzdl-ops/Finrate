'use client'
import React from 'react'
import type {
  ScenarioDataV3,
  RoadmapHero,
  RoadmapIssue,
  RoadmapConsultant,
  RoadmapPerspective,
  RoadmapIfNotDone,
} from '@/types/report'

interface Props {
  data: {
    companyName: string
    reportNo:    string
    scenario?:   ScenarioDataV3
  }
  sector?: string
}

export default function ScenarioPage({ data, sector }: Props) {
  // Snapshot backend'de valide edildi; burada scenario null gelirse teknik hata anlamına gelir
  if (!data.scenario) {
    return null
  }

  const s = data.scenario

  return (
    <div className="pdf-page">
      <div className="wm">SENARYO</div>
      <div className="ph">
        <div>
          <div className="ph-sec">Bölüm 10</div>
          <div className="ph-title">Senaryo Analizi</div>
        </div>
        <div className="ph-right">
          <div className="ph-ent">{data.companyName}</div>
          {sector && <div className="ph-sector">{sector}</div>}
          <div className="ph-pg">Sayfa 11</div>
        </div>
      </div>

      <div className="pc">
        <HeroBanner hero={s.hero} />

        <div style={{
          display: 'grid',
          gridTemplateColumns: '64% 36%',
          gap: '16px',
          marginTop: '16px',
        }}>
          <ConsultantBlock consultant={s.consultant} issues={s.issues} />
          <PerspectiveBlock perspective={s.perspective} />
        </div>

        <IfNotDoneBox ifNotDone={s.ifNotDone} style={{ marginTop: '16px' }} />
      </div>

      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com.tr · {data.reportNo}</span>
      </div>
    </div>
  )
}

// === LOCAL HELPER COMPONENTS ===

function HeroBanner({ hero }: { hero: RoadmapHero }) {
  return (
    <div style={{
      background:   '#0f2942',
      color:        '#ffffff',
      padding:      '16px 20px',
      borderRadius: '6px',
    }}>
      <div style={{ fontSize: '11px', opacity: 0.85 }}>
        Mevcut: {hero.currentRating} → Hedef: {hero.targetRating}
      </div>

      <div style={{
        fontSize:   '14px',
        fontWeight: 600,
        marginTop:  '6px',
        lineHeight: 1.4,
      }}>
        {hero.summaryText}
      </div>

      <div style={{
        marginTop:   '10px',
        display:     'flex',
        gap:         '14px',
        fontSize:    '10px',
        alignItems:  'center',
      }}>
        <span style={{
          background:   hero.reachable ? '#10b981' : '#f59e0b',
          padding:      '3px 9px',
          borderRadius: '4px',
          fontWeight:   500,
        }}>
          {hero.reachabilityLabel}
        </span>
        <span style={{ opacity: 0.9 }}>
          Güven: <strong>{hero.confidence}</strong>
        </span>
      </div>
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize:       '7.5px',
      textTransform:  'uppercase',
      letterSpacing:  '0.5px',
      color:          '#0891b2',
      marginTop:      '10px',
      marginBottom:   '2px',
      fontWeight:     600,
    }}>
      {children}
    </div>
  )
}

function severityBg(sev: string): string {
  if (sev === 'KRİTİK') return '#dc2626'
  if (sev === 'CİDDİ')  return '#f59e0b'
  if (sev === 'ORTA')   return '#6b7280'
  return '#9ca3af'
}

function ConsultantBlock({ consultant, issues }: { consultant: RoadmapConsultant; issues: RoadmapIssue[] }) {
  return (
    <div style={{
      background:   '#ffffff',
      border:       '1px solid #e5e7eb',
      borderRadius: '6px',
      padding:      '14px',
      fontSize:     '9px',
      lineHeight:   1.5,
    }}>
      <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '10px' }}>
        Danışman Yorumu
      </div>

      <SubLabel>Temel Problem</SubLabel>
      <p style={{ margin: 0, marginBottom: '6px', whiteSpace: 'pre-line' }}>{consultant.problem}</p>

      <SubLabel>Çekirdek Mesele</SubLabel>
      <p style={{ margin: 0, marginBottom: '6px', whiteSpace: 'pre-line' }}>{consultant.coreIssue}</p>

      <SubLabel>Kısa Vadede Öncelik</SubLabel>
      <p style={{ margin: 0, marginBottom: '6px', whiteSpace: 'pre-line' }}>{consultant.shortTermPriority}</p>

      <SubLabel>Yapısal İhtiyaç</SubLabel>
      <p style={{ margin: 0, marginBottom: '6px', whiteSpace: 'pre-line' }}>{consultant.structuralNeed}</p>

      <SubLabel>Finrate Yorumu</SubLabel>
      <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{consultant.finrateComment}</p>
    </div>
  )
}

function perspectiveBg(level: string): string {
  // İyi göstergeler yeşil, orta turuncu, zayıf gri
  // Düşük = Yapısal Risk Düşük = iyi → yeşil
  if (level === 'İyi' || level === 'Düşük') return '#10b981'
  // Yüksek = Yapısal Risk Yüksek = kötü → kırmızı (Codex: kırmızı sınırlı kullanım)
  if (level === 'Yüksek') return '#dc2626'
  if (level === 'Orta')   return '#f59e0b'
  return '#9ca3af'
}

function PerspectiveBlock({ perspective }: { perspective: RoadmapPerspective }) {
  const rows = [
    { label: 'Likidite',          value: perspective.likidite },
    { label: 'Yapısal Risk',      value: perspective.yapisalRisk },
    { label: 'Aktif Verimliliği', value: perspective.aktifVerimliligi },
    { label: 'Rating Güveni',     value: perspective.ratingGuveni },
  ]

  return (
    <div style={{
      background:   '#ffffff',
      border:       '1px solid #e5e7eb',
      borderRadius: '6px',
      padding:      '14px',
      fontSize:     '9px',
    }}>
      <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '12px' }}>
        Finrate Perspektifi
      </div>

      {rows.map((r, idx) => (
        <div key={idx} style={{
          display:         'flex',
          justifyContent:  'space-between',
          alignItems:      'center',
          padding:         '7px 0',
          borderBottom:    idx < rows.length - 1 ? '1px dashed #e5e7eb' : 'none',
        }}>
          <span>{r.label}</span>
          <span style={{
            fontSize:     '8px',
            background:   perspectiveBg(r.value),
            color:        '#fff',
            padding:      '3px 9px',
            borderRadius: '12px',
            fontWeight:   500,
          }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function IfNotDoneBox({ ifNotDone, style }: { ifNotDone: RoadmapIfNotDone; style?: React.CSSProperties }) {
  return (
    <div style={{
      background:   '#fef2f2',
      border:       '1px solid #fecaca',
      borderRadius: '6px',
      padding:      '12px',
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
        <WarnIcon color="#dc2626" />
        <span style={{
          fontWeight:  600,
          fontSize:    '11px',
          marginLeft:  '5px',
          color:       '#7f1d1d',
        }}>
          Aksiyon Alınmazsa
        </span>
      </div>

      <p style={{
        fontSize:     '9px',
        lineHeight:   1.5,
        margin:       0,
        color:        '#374151',
        whiteSpace:   'pre-line',
      }}>
        {ifNotDone.generalWarning}
      </p>
    </div>
  )
}

// WarnIcon — sayfa 2, 4, 10 ile aynı pattern. Inline tanım:
function WarnIcon({ color = '#dc2626', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h17a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
