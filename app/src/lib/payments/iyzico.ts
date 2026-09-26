/**
 * iyzico ödeme istemcisi — Checkout Form (Ödeme Formu) akışı.
 *
 * Akış:
 *   1. POST /api/payments/checkout  → initializeCheckoutForm() → kullanıcı iyzico sayfasına gider
 *   2. iyzico ödeme sonrası callbackUrl'e POST (token) → retrieveCheckoutForm(token) ile doğrulanır
 *   3. paymentStatus === 'SUCCESS' ise grantPackage() ile analiz hakkı yüklenir
 *
 * Kimlik doğrulama: IYZWSv2 (HMAC-SHA256). Bağımlılık yok, yalnızca fetch + crypto.
 * Ortam değişkenleri: IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL
 *   sandbox: https://sandbox-api.iyzipay.com   canlı: https://api.iyzipay.com
 */

import { createHmac, randomBytes } from 'crypto'

export interface IyzicoConfig { apiKey: string; secretKey: string; baseUrl: string }

export function getIyzicoConfig(): IyzicoConfig | null {
  const apiKey    = process.env.IYZICO_API_KEY?.trim()
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim()
  const baseUrl   = (process.env.IYZICO_BASE_URL?.trim() || 'https://sandbox-api.iyzipay.com').replace(/\/+$/, '')
  if (!apiKey || !secretKey) return null
  // .env.example'daki yer tutucular gerçek anahtar değildir
  if (/^sandbox-(api|secret)-key$/.test(apiKey) || /^sandbox-(api|secret)-key$/.test(secretKey)) return null
  return { apiKey, secretKey, baseUrl }
}

export const isIyzicoConfigured = (): boolean => getIyzicoConfig() !== null

export const IYZICO_NOT_CONFIGURED_MESSAGE =
  'Kart ile ödeme henüz aktif değil. Paket satın almak için info@finrate.com.tr adresine yazabilirsiniz.'

/** iyzico fiyat biçimi: ondalıklı string ("1999.0", "6999.5"). */
export function formatIyzicoPrice(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded)
}

/**
 * IYZWSv2 yetki başlıkları.
 *   signature = HMAC-SHA256(secretKey, randomKey + uriPath + requestBody) hex
 *   Authorization = "IYZWSv2 " + base64("apiKey:" + apiKey + "&randomKey:" + randomKey + "&signature:" + signature)
 * `randomKey` test için dışarıdan verilebilir.
 */
export function buildIyzicoAuthHeaders(
  cfg: IyzicoConfig,
  uriPath: string,
  requestBody: string,
  randomKey: string = `${Date.now()}${randomBytes(4).toString('hex')}`,
): Record<string, string> {
  const signature = createHmac('sha256', cfg.secretKey).update(randomKey + uriPath + requestBody).digest('hex')
  const authString = `apiKey:${cfg.apiKey}&randomKey:${randomKey}&signature:${signature}`
  return {
    'Authorization': `IYZWSv2 ${Buffer.from(authString).toString('base64')}`,
    'x-iyzi-rnd':    randomKey,
    'x-iyzi-client-version': 'finrate-web-1.0',
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  }
}

interface IyzicoBaseResponse {
  status: 'success' | 'failure'
  errorCode?: string
  errorMessage?: string
  conversationId?: string
  systemTime?: number
}

async function iyzicoPost<T extends IyzicoBaseResponse>(cfg: IyzicoConfig, uriPath: string, body: unknown): Promise<T> {
  const json = JSON.stringify(body)
  const res = await fetch(cfg.baseUrl + uriPath, {
    method: 'POST',
    headers: buildIyzicoAuthHeaders(cfg, uriPath, json),
    body: json,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => null) as T | null
  if (!data) throw new Error(`iyzico yanıtı okunamadı (HTTP ${res.status})`)
  return data
}

// ─── Checkout Form: başlat ────────────────────────────────────────────────────

export interface CheckoutBuyer {
  id: string
  name: string
  surname: string
  email: string
  identityNumber?: string   // TCKN/VKN; yoksa iyzico'nun kabul ettiği 11 haneli yer tutucu
  ip: string
  address?: string
  city?: string
}

export interface InitializeCheckoutParams {
  conversationId: string     // bizim referansımız (payment.id)
  basketId: string           // paket anahtarı
  price: number              // TL, KDV dahil
  itemName: string
  callbackUrl: string
  buyer: CheckoutBuyer
}

export interface InitializeCheckoutResult extends IyzicoBaseResponse {
  token?: string
  tokenExpireTime?: number
  checkoutFormContent?: string
  paymentPageUrl?: string
}

export async function initializeCheckoutForm(cfg: IyzicoConfig, p: InitializeCheckoutParams): Promise<InitializeCheckoutResult> {
  const price = formatIyzicoPrice(p.price)
  const address = {
    contactName: `${p.buyer.name} ${p.buyer.surname}`.trim(),
    city:        p.buyer.city ?? 'İstanbul',
    country:     'Türkiye',
    address:     p.buyer.address ?? 'Belirtilmedi',
  }
  const body = {
    locale: 'tr',
    conversationId: p.conversationId,
    price,
    paidPrice: price,
    currency: 'TRY',
    basketId: p.basketId,
    paymentGroup: 'PRODUCT',
    callbackUrl: p.callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id:                  p.buyer.id,
      name:                p.buyer.name || 'Ad',
      surname:             p.buyer.surname || 'Soyad',
      email:               p.buyer.email,
      identityNumber:      p.buyer.identityNumber ?? '11111111111',
      registrationAddress: address.address,
      ip:                  p.buyer.ip,
      city:                address.city,
      country:             address.country,
    },
    shippingAddress: address,
    billingAddress:  address,
    basketItems: [{
      id:        p.basketId,
      name:      p.itemName,
      category1: 'Finansal Analiz Paketi',
      itemType:  'VIRTUAL',
      price,
    }],
  }
  return iyzicoPost<InitializeCheckoutResult>(cfg, '/payment/iyzipos/checkoutform/initialize/auth/ecom', body)
}

// ─── Checkout Form: sonucu getir ──────────────────────────────────────────────

export interface RetrieveCheckoutResult extends IyzicoBaseResponse {
  token?: string
  paymentStatus?: 'SUCCESS' | 'FAILURE' | 'INIT_THREEDS' | 'CALLBACK_THREEDS' | string
  paymentId?: string
  price?: number | string
  paidPrice?: number | string
  basketId?: string
  fraudStatus?: number
}

export async function retrieveCheckoutForm(cfg: IyzicoConfig, token: string, conversationId?: string): Promise<RetrieveCheckoutResult> {
  return iyzicoPost<RetrieveCheckoutResult>(cfg, '/payment/iyzipos/checkoutform/auth/ecom/detail', {
    locale: 'tr',
    ...(conversationId ? { conversationId } : {}),
    token,
  })
}

/** Ad Soyad → { name, surname } (iyzico ikisini ayrı ister) */
export function splitFullName(fullName: string): { name: string; surname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { name: 'Ad', surname: 'Soyad' }
  if (parts.length === 1) return { name: parts[0], surname: parts[0] }
  return { name: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1] }
}
