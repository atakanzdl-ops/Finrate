'use client'
import type { ReportData, ActionPlanV3, ActionPlanItemV3, AccountMovement, RatioImpact } from '@/types/report'

function formatTRYLocal(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}₺${(abs / 1_000_000_000).toFixed(1)}Mr`
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}₺${(abs / 1_000).toFixed(0)}K`
  return `${sign}₺${abs.toFixed(0)}`
}

function ratioRowColor(c: 'navy' | 'teal'): string {
  if (c === 'teal') return '#2EC4B6'
  return '#0B3C5D'
}

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'actionPlan'>
  sector?: string
  /**
   * Sayfa varyantı:
   * - primary: Sayfa 12, ilk 4 aksiyon
   * - overflow: Sayfa 13, kalan + Sermaye kutusu
   */
  pageVariant: 'primary' | 'overflow'
}

// ============= LOCAL HELPERS =============

function HorizonBadge({ horizon }: { horizon: string }) {
  return (
    <span style={{
      background:   '#E5E9F0',
      color:        '#0B3C5D',
      padding:      '2px 8px',
      borderRadius: '4px',
      fontSize:     '8px',
      fontWeight:   500,
      whiteSpace:   'nowrap',
    }}>
      {horizon}
    </span>
  )
}

function AccountMovementsTable({ movements }: { movements: AccountMovement[] }) {
  if (movements.length === 0) return null
  return (
    <div style={{ marginTop: '8px', marginBottom: '8px' }}>
      <div style={{ fontSize: '7px', color: '#0B3C5D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
        HESAP HAREKETLERİ
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 56px 56px 50px', gap: '4px', padding: '3px 6px', fontSize: '6.5px', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        <span>Kod</span>
        <span>Hesap</span>
        <span style={{ textAlign: 'right' }}>Mevcut</span>
        <span style={{ textAlign: 'right' }}>Önerilen</span>
        <span style={{ textAlign: 'right' }}>Δ</span>
      </div>
      {movements.map((m, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 56px 56px 50px', gap: '4px', padding: '4px 6px', marginBottom: '2px', borderRadius: '4px', background: m.isIncrease ? '#F0FDFA' : '#FEF2F2', fontSize: '7.5px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', color: '#94A3B8' }}>{m.accountCode}</span>
          <span style={{ color: '#1E293B', fontWeight: 500 }}>{m.accountName}</span>
          <span style={{ textAlign: 'right', color: '#64748B' }}>{formatTRYLocal(m.currentTRY)}</span>
          <span style={{ textAlign: 'right', color: '#1E293B', fontWeight: 600 }}>{formatTRYLocal(m.proposedTRY)}</span>
          <span style={{ textAlign: 'right', fontWeight: 700, color: m.isIncrease ? '#0F766E' : '#B91C1C' }}>
            {m.isIncrease ? '+' : ''}{formatTRYLocal(m.deltaTRY)}
          </span>
        </div>
      ))}
    </div>
  )
}

function RatioImpactBlock({ ratio }: { ratio: RatioImpact }) {
  return (
    <div style={{ marginTop: '8px', marginBottom: '8px' }}>
      <div style={{ fontSize: '7px', color: '#0B3C5D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
        RASYO ETKİSİ
      </div>
      <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px 10px' }}>
        <div style={{ fontSize: '8px', fontWeight: 700, color: '#0B3C5D', marginBottom: '5px' }}>
          {ratio.title}
        </div>
        {ratio.rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8px', marginBottom: '2px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748B' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: ratioRowColor(row.color), flexShrink: 0 }} />
              {row.label}
            </span>
            <span style={{ color: ratioRowColor(row.color), fontWeight: 500 }}>{row.value}</span>
          </div>
        ))}
        {ratio.formula && (
          <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px dashed #cbd5e1', fontSize: '7px', color: '#94A3B8', fontStyle: 'italic' }}>
            {ratio.formula}
          </div>
        )}
      </div>
    </div>
  )
}

function ActionCard({ action }: { action: ActionPlanItemV3 }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', marginBottom: '10px', background: '#ffffff' }}>
      {/* Üst satır: sıra + ad + horizon + tutar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <div style={{ width: '20px', height: '20px', background: '#0a192f', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800, color: '#ffffff', flexShrink: 0 }}>
            {action.rank}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#0a192f', lineHeight: 1.3 }}>
            {action.actionName}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <HorizonBadge horizon={action.horizonLabel} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#1E293B', minWidth: '50px', textAlign: 'right' }}>
            {action.amountFormatted}
          </span>
        </div>
      </div>

      {/* Hesap Hareketleri (varsa) */}
      <AccountMovementsTable movements={action.accountMovements} />

      {/* Rasyo Etkisi (opsiyonel) */}
      {action.ratioImpact && <RatioImpactBlock ratio={action.ratioImpact} />}

      {/* Finrate Yorumu */}
      {action.bankerPerspective && (
        <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '6px 8px', marginTop: '4px' }}>
          <div style={{ fontSize: '6.5px', color: '#0B3C5D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
            FİNRATE YORUMU
          </div>
          <div style={{ fontSize: '8px', color: '#334155', lineHeight: 1.4 }}>
            {action.bankerPerspective}
          </div>
        </div>
      )}
    </div>
  )
}

function WhyCapitalBox({ text }: { text: string }) {
  return (
    <div style={{
      background:   '#fef3c7',
      border:       '1px solid #fcd34d',
      borderRadius: '10px',
      padding:      '14px 16px',
      marginTop:    '14px',
    }}>
      <div style={{
        fontSize:     '11px',
        fontWeight:   700,
        color:        '#7c2d12',
        marginBottom: '6px',
      }}>
        Neden Sadece Sermaye Yetmez?
      </div>
      <div style={{
        fontSize:   '9px',
        color:      '#451a03',
        lineHeight: 1.55,
      }}>
        {text}
      </div>
    </div>
  )
}

// ============= MAIN COMPONENT =============

export default function ActionPlanPage({ data, sector, pageVariant }: Props) {
  const { companyName, reportNo, actionPlan } = data

  // Snapshot backend'de valide edildi (Faz 7.3.60.2)
  if (!actionPlan) {
    return null
  }

  // 4+2 bölüştürme
  const allActions  = actionPlan.actions
  const pageActions = pageVariant === 'primary'
    ? allActions.slice(0, 4)
    : allActions.slice(4)

  // Sayfa numarası (Faz 7.3.60.3 — Sayfa 12 ve Sayfa 13)
  const pageNumber = pageVariant === 'primary' ? 12 : 13

  return (
    <div className="pdf-page">
      <div className="wm">AKSİYON</div>
      <div className="ph">
        <div>
          <div className="ph-sec">Bölüm 11</div>
          <div className="ph-title">Aksiyon Planı</div>
          <div style={{
            fontSize:   '11px',
            color:      '#64748b',
            marginTop:  '4px',
            fontWeight: 500,
          }}>
            {actionPlan.pageTitle}
          </div>
        </div>
        <div className="ph-right">
          <div className="ph-ent">{companyName}</div>
          {sector && <div className="ph-sector">{sector}</div>}
          <div className="ph-pg">Sayfa {pageNumber}</div>
        </div>
      </div>

      <div className="pc">
        {pageVariant === 'primary' && (
          <div style={{
            background:    '#f8fafc',
            border:        '1px solid #e2e8f0',
            borderRadius:  '8px',
            padding:       '10px 14px',
            marginBottom:  '14px',
            fontSize:      '9px',
            color:         '#64748b',
            lineHeight:    1.55,
          }}>
            {actionPlan.pageSubtitle}
          </div>
        )}

        {pageActions.length > 0
          ? pageActions.map((action) => (
              <ActionCard key={action.rank} action={action} />
            ))
          : pageVariant === 'overflow' && (
              <div style={{
                textAlign:  'center',
                padding:    '20px',
                color:      '#94a3b8',
                fontSize:   '10px',
                fontStyle:  'italic',
              }}>
                {/* 4 veya daha az aksiyon varsa burası boş, sadece Sermaye kutusu */}
              </div>
            )
        }

        {/* Sermaye kutusu SADECE Sayfa 13'te */}
        {pageVariant === 'overflow' && actionPlan.whyCapitalAloneNotEnough && (
          <WhyCapitalBox text={actionPlan.whyCapitalAloneNotEnough} />
        )}
      </div>

      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com.tr · {reportNo}</span>
      </div>
    </div>
  )
}
