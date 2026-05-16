'use client'

export function RatioTableLegend() {
  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      padding: '6px 0',
      fontSize: '8.5px',
      color: '#475569',
      borderTop: '1px solid #e2e8f0',
      marginTop: '6px',
      alignItems: 'center',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{
          display: 'inline-block',
          width: '14px',
          height: '6px',
          background: 'linear-gradient(90deg,#2dd4bf,#0ea5e9)',
          borderRadius: '2px',
        }} />
        Firma değeri (bar)
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{
          display: 'inline-block',
          width: '2px',
          height: '10px',
          background: '#0a192f',
        }} />
        Sektör ortalaması (çizgi)
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{
          display: 'inline-block',
          width: '14px',
          height: '6px',
          background: 'linear-gradient(90deg,#f59e0b,#fcd34d)',
          borderRadius: '2px',
        }} />
        Dikkat gerektiren
      </span>
    </div>
  )
}
