import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Finrate — Finansal Gücünüzü Veriye Dökün',
  description: 'Gelişmiş kredi skorlama ve finansal analiz platformu. 25 finansal oran, grup konsolide analiz ve senaryo simülasyonu.',
  keywords: 'kredi skoru, finansal analiz, kredi rating, konsolide analiz, finans',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr">
      <head>
        <meta charSet="UTF-8" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@400;500&family=Sora:wght@700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
