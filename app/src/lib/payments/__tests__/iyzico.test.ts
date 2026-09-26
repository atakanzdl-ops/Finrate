import { createHmac } from 'crypto'
import {
  buildIyzicoAuthHeaders, formatIyzicoPrice, splitFullName, getIyzicoConfig,
} from '../iyzico'
import { PACKAGES } from '@/lib/entitlements'

jest.mock('@/lib/db', () => ({ prisma: {} }))

describe('iyzico yetki başlığı (IYZWSv2)', () => {
  const cfg = { apiKey: 'api-1', secretKey: 'secret-1', baseUrl: 'https://sandbox-api.iyzipay.com' }
  it('imza = HMAC-SHA256(secret, randomKey + uriPath + body), base64 authorization', () => {
    const uri  = '/payment/iyzipos/checkoutform/initialize/auth/ecom'
    const body = '{"locale":"tr"}'
    const rnd  = '1700000000000abcd'
    const h = buildIyzicoAuthHeaders(cfg, uri, body, rnd)
    const expectedSig = createHmac('sha256', cfg.secretKey).update(rnd + uri + body).digest('hex')
    const decoded = Buffer.from(h.Authorization.replace('IYZWSv2 ', ''), 'base64').toString()
    expect(decoded).toBe(`apiKey:api-1&randomKey:${rnd}&signature:${expectedSig}`)
    expect(h['x-iyzi-rnd']).toBe(rnd)
    expect(h['Content-Type']).toBe('application/json')
  })
})

describe('formatIyzicoPrice', () => {
  it('tam sayı → ".0" ekler, kuruş varsa korur', () => {
    expect(formatIyzicoPrice(1999)).toBe('1999.0')
    expect(formatIyzicoPrice(6999.5)).toBe('6999.5')
    expect(formatIyzicoPrice(10.005)).toBe('10.01')
  })
})

describe('splitFullName', () => {
  it('son kelime soyad, kalanı ad', () => {
    expect(splitFullName('Atakan Özdel')).toEqual({ name: 'Atakan', surname: 'Özdel' })
    expect(splitFullName('Ali Veli Kaya')).toEqual({ name: 'Ali Veli', surname: 'Kaya' })
    expect(splitFullName('Tek')).toEqual({ name: 'Tek', surname: 'Tek' })
    expect(splitFullName('  ')).toEqual({ name: 'Ad', surname: 'Soyad' })
  })
})

describe('getIyzicoConfig', () => {
  const env = process.env
  afterEach(() => { process.env = env })
  it('anahtar yoksa veya yer tutucuysa null', () => {
    process.env = { ...env, IYZICO_API_KEY: '', IYZICO_SECRET_KEY: '' }
    expect(getIyzicoConfig()).toBeNull()
    process.env = { ...env, IYZICO_API_KEY: 'sandbox-api-key', IYZICO_SECRET_KEY: 'sandbox-secret-key' }
    expect(getIyzicoConfig()).toBeNull()
  })
  it('gerçek anahtarlarla config döner, base url sondaki / temizlenir', () => {
    process.env = { ...env, IYZICO_API_KEY: 'k', IYZICO_SECRET_KEY: 's', IYZICO_BASE_URL: 'https://api.iyzipay.com/' }
    expect(getIyzicoConfig()).toEqual({ apiKey: 'k', secretKey: 's', baseUrl: 'https://api.iyzipay.com' })
  })
})

describe('paket fiyatları', () => {
  it('landing ile aynı (KDV dahil)', () => {
    expect(PACKAGES.BASLANGIC.priceTRY).toBe(1999)
    expect(PACKAGES.SMMM.priceTRY).toBe(6999)
    expect(PACKAGES.PROFESYONEL.priceTRY).toBe(29999)
  })
})
