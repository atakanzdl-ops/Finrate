// ─── FİNRATE RAPOR FORMATLAYICILAR ───────────────────────────────────────────
// Sayısal değerleri V2 rapor sayfaları için hazır string'e dönüştürür.
// "—" döndürülen tüm yerler eksik/null veri anlamına gelir.

// ─── PARA BİRİMİ ──────────────────────────────────────────────────────────────

/**
 * Milyon/Milyar kısaltmalı TL formatı.
 * Örn: 52_300_000 → "52.3M TL"  |  1_250_000_000 → "1.3Mr TL"
 * NOT: ₺ (U+20BA) Headless Chromium PDF'inde render edilmiyor —
 *      "TL" son eki garantili çalışır.
 */
export function fmtCurrency(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null || isNaN(value)) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000)
    return `${sign}${(abs / 1_000_000_000).toFixed(decimals)}Mr TL`
  if (abs >= 1_000_000)
    return `${sign}${(abs / 1_000_000).toFixed(decimals)}M TL`
  if (abs >= 1_000)
    return `${sign}${(abs / 1_000).toFixed(decimals)}B TL`
  return `${sign}${abs.toFixed(0)} TL`
}

// ─── YÜZDE ────────────────────────────────────────────────────────────────────

/**
 * 0.248 → "%24.8"  |  null → "—"
 * compact: true → "25%" (0 ondalık)
 */
export function fmtPct(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null || isNaN(value)) return '—'
  return `%${(value * 100).toFixed(decimals)}`
}

/**
 * Büyüme farkı için işaretli yüzde.
 * 0.257 → "+25.7%"  |  -0.12 → "-12.0%"
 */
export function fmtPctSigned(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—'
  const pct = (value * 100).toFixed(1)
  return value >= 0 ? `+${pct}%` : `${pct}%`
}

// ─── ÇARPAN / ORAN ────────────────────────────────────────────────────────────

/**
 * 1.82 → "1.82x"  |  null → "—"
 */
export function fmtRatio(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value == null || isNaN(value)) return '—'
  return `${value.toFixed(decimals)}x`
}

// ─── GÜN ──────────────────────────────────────────────────────────────────────

/**
 * 58.4 → "58 gün"  |  null → "—"
 */
export function fmtDays(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—'
  return `${Math.round(value)} gün`
}

// ─── TARİH ────────────────────────────────────────────────────────────────────

/**
 * Date veya ISO string → "15.05.2026"
 */
export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Bugünün tarihine n yıl ekler, string döner.
 */
export function addYears(date: Date, years: number): Date {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + years)
  return d
}

// ─── SKOR ─────────────────────────────────────────────────────────────────────

/**
 * 52, 70 → "52/70"
 */
export function fmtScore(value: number, max: number): string {
  return `${Math.round(value)}/${max}`
}

// ─── BAR DOLUM & SEKTÖR ÇENTİK ────────────────────────────────────────────────

/**
 * Oran değerini 0–100 bar dolum yüzdesine çevirir.
 * direction: 'up' → yüksek iyi  |  'down' → düşük iyi (ters normalize)
 * maxVal: barın 100% noktası
 */
export function toBarFill(
  value: number | null | undefined,
  maxVal: number,
  direction: 'up' | 'down' = 'up',
): number {
  if (value == null || isNaN(value)) return 0
  const raw = direction === 'up'
    ? (value / maxVal) * 100
    : ((maxVal - Math.min(value, maxVal)) / maxVal) * 100
  return Math.round(Math.max(0, Math.min(100, raw)))
}

// ─── DURUM BANDİ ──────────────────────────────────────────────────────────────

/**
 * companyFill ve sectorFill arasındaki farka göre 'iyi'|'uyari'|'risk' döner.
 * direction: 'up' → şirket yüksek = iyi  |  'down' → şirket yüksek = kötü
 */
export function ratioStatus(
  value: number | null | undefined,
  sectorValue: number | null | undefined,
  direction: 'up' | 'down' = 'up',
): 'iyi' | 'uyari' | 'risk' {
  if (value == null || sectorValue == null || sectorValue === 0) return 'uyari'

  const ratio = direction === 'up'
    ? value / sectorValue
    : sectorValue / value   // ters — düşük değer için "ne kadar iyi"

  if (ratio >= 1.10) return 'iyi'
  if (ratio >= 0.75) return 'uyari'
  return 'risk'
}

// ─── BAR RENGİ ────────────────────────────────────────────────────────────────

export const BAR_COLOR: Record<'iyi' | 'uyari' | 'risk', string> = {
  iyi:   'linear-gradient(90deg,#2dd4bf,#0ea5e9)',
  uyari: 'linear-gradient(90deg,#f59e0b,#fb923c)',
  risk:  'linear-gradient(90deg,#ef4444,#dc2626)',
}

// ─── DÖNEM ETİKETİ ────────────────────────────────────────────────────────────

const PERIOD_LABEL: Record<string, string> = {
  ANNUAL: 'Yıllık',
  Q1: '1. Çeyrek',
  Q2: '2. Çeyrek',
  Q3: '3. Çeyrek',
  Q4: '4. Çeyrek',
  H1: '1. Yarıyıl',
  H2: '2. Yarıyıl',
}

export function fmtPeriod(year: number, period: string): string {
  return `${year} · ${PERIOD_LABEL[period] ?? period}`
}

// ─── ÖLÇEK ETİKETİ ────────────────────────────────────────────────────────────

/**
 * Ciro + aktif büyüklüğüne göre KOBİ/Büyük ölçek etiketi üretir.
 * Türkiye KOBİ Yönetmeliği (2023 güncel) — 4 bant:
 *   Mikro   ≤  10M TL net satış/aktif
 *   Küçük   ≤ 100M TL
 *   Orta    ≤ 500M TL
 *   Büyük   >  500M TL (KOBİ dışı)
 * (çalışan bilgisi yok → sadece ciro/aktif kullanılır;
 *  ikisinden büyük olanı esas alınır)
 */
export function getScaleLabel(
  revenue: number | null | undefined,
  totalAssets: number | null | undefined,
): string {
  const rev = revenue ?? 0
  const assets = totalAssets ?? 0
  const max = Math.max(rev, assets)

  if (max <= 0)              return '—'
  if (max >= 500_000_000)    return 'Büyük İşletme'
  if (max >= 100_000_000)    return 'Orta Ölçekli KOBİ'
  if (max >= 10_000_000)     return 'Küçük Ölçekli KOBİ'
  return 'Mikro İşletme'
}

// ─── RATING BAND ─────────────────────────────────────────────────────────────
// 14-MethodologyPage.tsx rating tablosuna birebir hizalıdır.
// Exact match — startsWith('A') gibi pattern kullanılmaz (AA/AAA çakışması önlenir).
// 7 farklı bant, dereceli renk: yeşil → mavi → turuncu → kırmızı.

export function getRatingBand(
  rating: string,
): { label: string; bg: string; border: string; text: string } {
  const r = (rating || '').toUpperCase().replace(/[+-]$/, '')

  // AAA / AA / A / BBB — Yatırım Yapılabilir (yeşil)
  if (r === 'AAA' || r === 'AA' || r === 'A' || r === 'BBB') {
    return { label: 'Yatırım Yapılabilir', bg: 'rgba(34,197,94,.10)', border: 'rgba(34,197,94,.30)', text: '#16a34a' }
  }
  // BB — Yatırım Yapılabilir Alt (mavi)
  if (r === 'BB') {
    return { label: 'Yatırım Yapılabilir Alt', bg: 'rgba(59,130,246,.10)', border: 'rgba(59,130,246,.30)', text: '#3b82f6' }
  }
  // B — Spekülatif (turuncu)
  if (r === 'B') {
    return { label: 'Spekülatif', bg: 'rgba(249,115,22,.10)', border: 'rgba(249,115,22,.30)', text: '#f97316' }
  }
  // CCC — Spekülatif Alt (koyu turuncu)
  if (r === 'CCC') {
    return { label: 'Spekülatif Alt', bg: 'rgba(234,88,12,.10)', border: 'rgba(234,88,12,.30)', text: '#ea580c' }
  }
  // CC — Yüksek Risk (koyu turuncu-kırmızı)
  if (r === 'CC') {
    return { label: 'Yüksek Risk', bg: 'rgba(220,38,38,.10)', border: 'rgba(220,38,38,.30)', text: '#dc2626' }
  }
  // C — Çok Yüksek Risk (kırmızı)
  if (r === 'C') {
    return { label: 'Çok Yüksek Risk', bg: 'rgba(239,68,68,.10)', border: 'rgba(239,68,68,.30)', text: '#ef4444' }
  }
  // D — Temerrüt Riski (koyu kırmızı)
  if (r === 'D') {
    return { label: 'Temerrüt Riski', bg: 'rgba(153,27,27,.10)', border: 'rgba(153,27,27,.30)', text: '#991b1b' }
  }
  // Bilinmeyen / fallback (gri)
  return { label: 'Değerlendirilmemiş', bg: 'rgba(107,114,128,.10)', border: 'rgba(107,114,128,.30)', text: '#6b7280' }
}

// ─── ENTİTE TİPİ ETİKETİ ─────────────────────────────────────────────────────

export function getEntityTypeLabel(entityType: string | null | undefined): string {
  const map: Record<string, string> = {
    STANDALONE:   'Bağımsız Şirket',
    SUBSIDIARY:   'Bağlı Ortaklık',
    PARENT:       'Ana Şirket',
    CONSOLIDATED: 'Konsolide Grup',
  }
  return map[entityType ?? ''] ?? 'Anonim/Limited Şirket'
}

// ─── İŞARETLİ SAYI FORMATI ───────────────────────────────────────────────────
// "+5.2" veya "-3.1" — asla "+-5" olmaz

export function fmtSigned(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}`   // zaten - işareti taşıyor
  return '0'
}
