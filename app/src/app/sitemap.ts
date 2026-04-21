import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://www.finrate.com.tr',        lastModified: new Date(), changeFrequency: 'weekly',  priority: 1   },
    { url: 'https://www.finrate.com.tr/giris',  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://www.finrate.com.tr/kayit',  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://www.finrate.com.tr/yasal',  lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
  ]
}
