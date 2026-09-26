import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { PACKAGES } from '@/lib/entitlements'
import { isIyzicoConfigured } from '@/lib/payments/iyzico'

/**
 * GET /api/payments/config — kart ile ödeme açık mı + paket listesi (fiyatlar KDV dahil).
 * Gizli değer içermez; ayarlar sayfası "Kartla Satın Al" düğmesini buna göre gösterir.
 */
export async function GET() {
  return jsonUtf8({
    enabled: isIyzicoConfigured(),
    packages: Object.entries(PACKAGES).map(([key, p]) => ({
      key, label: p.label, credits: p.credits, plan: p.plan, priceTRY: p.priceTRY,
    })),
  })
}
