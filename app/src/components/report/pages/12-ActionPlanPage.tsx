'use client'
import type { ReportData, ActionPlanV3, ActionPlanItemV3 } from '@/types/report'

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

function ActionCard({ action }: { action: ActionPlanItemV3 }) {
  return (
    <div style={{
      border:        '1px solid #e2e8f0',
      borderRadius:  '10px',
      padding:       '12px 14px',
      marginBottom:  '10px',
      background:    '#ffffff',
    }}>
      {/* Üst satır: sıra + ad + horizon + tutar */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'flex-start',
        marginBottom:   '8px',
        gap:            '12px',
      }}>
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        '10px',
          flex:       1,
          minWidth:   0,
        }}>
          <div style={{
            width:           '22px',
            height:          '22px',
            background:      '#0a192f',
            borderRadius:    '50%',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            fontSize:        '10px',
            fontWeight:      800,
            color:           '#ffffff',
            flexShrink:      0,
          }}>
            {action.rank}
          </div>
          <div style={{
            fontSize:   '11px',
            fontWeight: 600,
            color:      '#0a192f',
            lineHeight: 1.3,
          }}>
            {action.actionName}
          </div>
        </div>

        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        '8px',
          flexShrink: 0,
        }}>
          <HorizonBadge horizon={action.horizonLabel} />
          <span style={{
            fontSize:   '11px',
            fontWeight: 700,
            color:      '#1E293B',
            minWidth:   '60px',
            textAlign:  'right',
          }}>
            {action.amountFormatted}
          </span>
        </div>
      </div>

      {/* Banker Perspective (Finrate Yorumu) */}
      {action.bankerPerspective && (
        <div style={{
          background:   '#f8fafc',
          borderRadius: '6px',
          padding:      '8px 10px',
          marginTop:    '4px',
        }}>
          <div style={{
            fontSize:       '7px',
            color:          '#0B3C5D',
            fontWeight:     600,
            textTransform:  'uppercase',
            letterSpacing:  '0.5px',
            marginBottom:   '3px',
          }}>
            FİNRATE YORUMU
          </div>
          <div style={{
            fontSize:   '8.5px',
            color:      '#334155',
            lineHeight: 1.5,
          }}>
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
