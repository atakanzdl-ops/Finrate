'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="tr">
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, sans-serif',
          backgroundColor: '#F8FAFC',
        }}>
          <div style={{ maxWidth: '420px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '12px', color: '#0B3C5D' }}>
              Bir hata oluştu
            </h2>
            <p style={{ fontSize: '14px', color: '#475569', marginBottom: '24px' }}>
              Uygulama beklenmeyen bir sorunla karşılaştı.
            </p>
            {error.digest && (
              <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
                Hata kodu: {error.digest}
              </p>
            )}
            <button
              onClick={() => reset()}
              style={{
                padding: '8px 16px',
                background: '#0B3C5D',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Tekrar Dene
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
