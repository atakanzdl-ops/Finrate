'use client'
import type { ReportData, ActionPlanItem } from '@/types/report'

interface Props {
  data: Pick<ReportData, 'companyName' | 'reportNo' | 'actionPlan'>
  sector?: string
}

function ActionCard({ item }: { item: ActionPlanItem }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px', marginBottom: '12px', position: 'relative', overflow: 'hidden' }}>
      {/* Sol renkli çizgi */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: item.categoryColor }} />

      <div style={{ paddingLeft: '10px' }}>
        {/* Başlık */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '22px', height: '22px', background: '#0a192f', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: 'white', flexShrink: 0 }}>
              {item.number}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0a192f' }}>{item.title}</div>
          </div>
          <span style={{ background: item.categoryBg, color: item.categoryColor, border: `1px solid ${item.categoryBorder}`, padding: '2px 8px', borderRadius: '4px', fontSize: '7.5px', fontWeight: 800, whiteSpace: 'nowrap', marginLeft: '8px' }}>
            {item.category}
          </span>
        </div>

        {/* İçerik Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '8px', color: '#64748b', marginBottom: '4px' }}>{item.description}</div>
            <div style={{ fontSize: '8px', color: '#334155', background: '#f8fafc', borderRadius: '6px', padding: '6px 8px', marginTop: '6px' }}>
              <span style={{ fontWeight: 700, color: '#0a192f' }}>Banka Etkisi: </span>{item.bankImpact}
            </div>
          </div>
          <div>
            {/* Metrik değişim */}
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px' }}>
              <div style={{ fontSize: '7.5px', color: '#166534', fontWeight: 700, marginBottom: '4px' }}>Hedef Değişim</div>
              <div className="mono" style={{ fontSize: '11px', fontWeight: 800, color: '#0a192f' }}>{item.currentToTarget}</div>
            </div>
            {/* Meta bilgiler */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 7px', textAlign: 'center' }}>
                <div style={{ fontSize: '7px', color: '#64748b' }}>Puan</div>
                <div className="outfit" style={{ fontSize: '13px', fontWeight: 800, color: '#0284c7' }}>+{item.scoreContribution}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 7px', textAlign: 'center' }}>
                <div style={{ fontSize: '7px', color: '#64748b' }}>Süre</div>
                <div style={{ fontSize: '8px', fontWeight: 700, color: '#0a192f' }}>{item.duration}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 7px', textAlign: 'center' }}>
                <div style={{ fontSize: '7px', color: '#64748b' }}>Güçlük</div>
                <div style={{ fontSize: '8px', fontWeight: 700, color: item.difficulty === 'Yüksek' ? '#dc2626' : '#0369a1' }}>{item.difficulty}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ActionPlanPage({ data, sector }: Props) {
  const { companyName, reportNo, actionPlan } = data

  const totalScore = actionPlan.reduce((s, a) => s + a.scoreContribution, 0)

  return (
    <div className="pdf-page">
      <div className="wm">AKSİYON</div>
      <div className="ph">
        <div><div className="ph-sec">Bölüm 11</div><div className="ph-title">Detaylı Aksiyon Planı</div></div>
        <div className="ph-right"><div className="ph-ent">{companyName}</div>{sector && <div className="ph-sector">{sector}</div>}<div className="ph-pg">Sayfa 12</div></div>
      </div>
      <div className="pc">

        {/* Özet satır */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', marginBottom: '14px', display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Toplam Aksiyon</span>
            <div className="outfit" style={{ fontSize: '20px', fontWeight: 800, color: '#0a192f' }}>{actionPlan.length}</div>
          </div>
          <div style={{ width: '1px', height: '36px', background: '#e2e8f0' }} />
          <div>
            <span style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Toplam Puan Katkısı</span>
            <div className="outfit" style={{ fontSize: '20px', fontWeight: 800, color: '#22c55e' }}>+{Math.round(totalScore * 10) / 10}</div>
          </div>
          <div style={{ width: '1px', height: '36px', background: '#e2e8f0' }} />
          <div style={{ flex: 1, fontSize: '8.5px', color: '#64748b', lineHeight: 1.6 }}>
            Aşağıdaki aksiyonlar senaryo motoru tarafından mevcut finansal yapı ve sektör karşılaştırmasına dayalı olarak önceliklendirilmiştir. Her aksiyon için tahmini skor katkısı ve süre belirtilmiştir.
          </div>
        </div>

        {actionPlan.length > 0
          ? actionPlan.map((item, i) => <ActionCard key={i} item={item} />)
          : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '10px' }}>
              Senaryo motoru henüz çalıştırılmamış. Analiz sayfasından senaryo oluşturun.
            </div>
          )
        }
      </div>
      <div className="pf">
        <span>Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu</span>
        <span>finrate.com.tr · {reportNo}</span>
      </div>
    </div>
  )
}
