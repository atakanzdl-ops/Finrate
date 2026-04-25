'use client'

import type { RatioTransparency, AttributionSource } from '@/lib/scoring/scenarioV3/contracts'

type Props = {
  data: RatioTransparency
}

export function RatioTransparencyBlock({ data }: Props) {
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mn TL`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)} K TL`
    return `${n.toFixed(0)} TL`
  }
  const capPct = Math.round(data.capPercent * 100)

  return (
    <div style={{ borderTop: '1px solid rgba(11,60,93,0.08)', marginTop: 16, paddingTop: 16 }}>

      {/* ÜÇ SEVİYELİ HEDEF */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Satır 1: BUGÜNKÜ SEVİYE */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.5px', color: '#1E293B', textTransform: 'uppercase' as const }}>
            BUGÜNKÜ SEVİYE
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1E293B' }}>
            {fmt(data.currentBalance)}
          </span>
        </div>

        {/* Ok 1 */}
        <div style={{ textAlign: 'center', fontSize: 16, color: '#94A3B8', padding: '2px 0' }} aria-hidden="true">↓</div>

        {/* Satır 2: REALİSTİK 12 AY */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.5px', color: '#0B3C5D', textTransform: 'uppercase' as const }}>
            REALİSTİK 12 AY
            <span style={{ fontSize: 11, fontWeight: 400, color: '#5A7A96', marginLeft: 6, textTransform: 'none' as const }}>
              (uygulanabilir hedef)
            </span>
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0B3C5D', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {fmt(data.realisticTarget)}
            <span style={{ background: '#EFF6FF', color: '#3B82F6', fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
              -{capPct}%
            </span>
          </span>
        </div>

        {/* Ok 2 — orta-uzun vade notu */}
        <div style={{ textAlign: 'center', fontSize: 16, color: '#94A3B8', padding: '2px 0' }} aria-hidden="true">
          ↓{' '}
          <span style={{ fontSize: 10, fontWeight: 400, color: '#94A3B8', marginLeft: 4 }}>
            orta-uzun vade
          </span>
        </div>

        {/* Satır 3: UZUN VADELİ REFERANS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.5px', color: '#5A7A96', textTransform: 'uppercase' as const }}>
            UZUN VADELİ REFERANS
            <span style={{ fontSize: 11, fontWeight: 400, color: '#5A7A96', marginLeft: 6, textTransform: 'none' as const }}>
              (TCMB sektör medyanı)
            </span>
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#5A7A96', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {fmt(data.sectorMedian)}
            <AttributionBadge source={data.attribution.sourceType} />
          </span>
        </div>
      </div>

      {/* AÇIKLAYICI NOT */}
      <div style={{ margin: '12px 0', padding: '10px 12px', background: '#F0F9FF', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#5A7A96', lineHeight: 1.5 }}>
        <span style={{ flexShrink: 0 }} aria-hidden="true">ℹ️</span>
        <span>
          Realistik hedef, 12 ay içinde uygulanabilir görülen iyileştirme seviyesidir.
          Uzun vadeli referans ise sektör ortalamasına uzanan yön gösterici seviyedir.
        </span>
      </div>

      {/* METADATA */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(11,60,93,0.06)', fontSize: 12 }}>
        <MetaLine label="Formül">
          {/* overflow-x: auto — mobile'da uzun formül taşmasın */}
          <code style={{ fontFamily: 'monospace', background: '#F8FAFC', padding: '4px 8px', borderRadius: 4, display: 'inline-block', maxWidth: '100%', overflowX: 'auto' as const, whiteSpace: 'nowrap' as const, fontSize: 12 }}>
            {data.formula.targetLabel} = ({data.formula.basisLabel} × {data.formula.targetDays} gün) / {data.formula.periodDays}
          </code>
        </MetaLine>
        <MetaLine label="Kaynak">
          <span>{attributionText(data.attribution)}</span>
        </MetaLine>
        <MetaLine label="Yöntem">
          <span>Dönem sonu bakiye</span>
        </MetaLine>
      </div>
    </div>
  )
}

function MetaLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
      <span style={{ color: '#5A7A96', fontWeight: 500, minWidth: 70 }}>{label}:</span>
      <span style={{ color: '#1E293B' }}>{children}</span>
    </div>
  )
}

function AttributionBadge({ source }: { source: AttributionSource }) {
  if (source === 'TCMB_DIRECT') {
    return (
      // white-space: nowrap — mobile'da "resmi"/"veri" ayrılmasın
      <span style={{ display: 'inline-flex', flexDirection: 'column' as const, alignItems: 'center', whiteSpace: 'nowrap' as const, lineHeight: 1.1, border: '1px solid rgba(11,60,93,0.15)', padding: '4px 8px', borderRadius: 4, background: '#F0F4F8' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#0B3C5D' }}>TCMB</span>
        <span style={{ fontSize: 9, opacity: 0.8, color: '#0B3C5D' }}>resmi veri</span>
      </span>
    )
  }
  if (source === 'FINRATE_ESTIMATE') {
    return <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#FFF7ED', color: '#C2410C', border: '1px solid rgba(194,65,12,0.2)' }}>Tahmini</span>
  }
  return <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>Fallback</span>
}

function attributionText(att: RatioTransparency['attribution']): string {
  if (att.sourceType === 'TCMB_DIRECT') {
    return `TCMB resmi verisi · ${att.sectorLabel} sektörü · ${att.year} medyanı`
  }
  if (att.sourceType === 'FINRATE_ESTIMATE') {
    return `Finrate sektör tahmini · ${att.sectorLabel} · ${att.year}`
  }
  return 'Sektör verisi bulunamadı, varsayılan hedef'
}
