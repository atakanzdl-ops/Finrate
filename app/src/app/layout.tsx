import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Finrate — Bankacılık Standartlarında Finansal Rating',
  description: 'KOBİ\'ler ve mali müşavirler için bankacılık kalitesinde finansal analiz ve kredi rating platformu. 25 metrik, TCMB benchmark, senaryo motoru.',
  keywords: 'kredi skoru, finansal analiz, kredi rating, konsolide analiz, finans',
  metadataBase: new URL('https://www.finrate.com.tr'),
  openGraph: {
    title: 'Finrate — Bankacılık Standartlarında Finansal Rating',
    description: 'Bankaya gitmeden önce kredi notunuzu öğrenin. KOBİ\'ler ve mali müşavirler için finansal analiz platformu.',
    url: 'https://www.finrate.com.tr',
    siteName: 'Finrate',
    locale: 'tr_TR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Finrate — Bankacılık Standartlarında Finansal Rating',
    description: 'Bankaya gitmeden önce kredi notunuzu öğrenin.',
  },
  robots: { index: true, follow: true },
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
