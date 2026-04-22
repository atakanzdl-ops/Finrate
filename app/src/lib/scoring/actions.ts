/**
 * Finrate — Aksiyon Kataloğu
 *
 * 14 finansal iyileştirme aksiyonu:
 *   - mutate()          : TL tutarını alır, BalanceSheet'e uygulanacak DELTA döner
 *                         (artış = pozitif, azalış = negatif)
 *   - calcRange()       : Gerçek bilanço verilerinden min/max/suggested TL aralığını hesaplar
 *   - sectorFeasibility : Sektör yapılabilirlik katsayısı (0–1, <0.3 önerilmez)
 */

import type { BalanceSheet } from './mutation'
import type { AccountBalanceSheet, AccountMutation } from './simulator'

// ─── TİPLER ──────────────────────────────────────────────────────────────────

export type ActionId =
  | 'kv_to_uv'             // KV borcu UV'ye çevir
  | 'collect_receivables'  // Vadesi geçmiş alacak tahsil et
  | 'liquidate_inventory'  // Atıl stok erit
  | 'repay_kv_debt'        // Fazla nakitle KV borç öde
  | 'reduce_opex'          // Faaliyet gideri azalt
  | 'improve_margin'       // Brüt marj iyileştir
  | 'refinance'            // Yüksek faizli krediyi refinanse et
  | 'capital_increase'     // Sermaye artışı
  | 'retain_profit'        // Kâr dağıtımı durdur
  | 'sell_asset'           // Atıl duran varlık sat
  | 'shorten_dso'          // Alacak vadesini kısalt
  | 'extend_dpo'           // Tedarikçi vadesi uzat
  | 'increase_revenue'     // Kapasite kullanımı artır
  | 'close_credit'         // Kredi kapatma

export type TimeHorizon = 'short' | 'medium' | 'long'
export type Difficulty  = 'easy' | 'medium' | 'hard' | 'very_hard'

export interface Action {
  id:          ActionId
  label:       string         // Türkçe aksiyon adı
  description: string         // Kısa açıklama
  timeHorizon: TimeHorizon
  difficulty:  Difficulty
  /** TL tutarını alır, BalanceSheet'e uygulanacak DELTA değerlerini döner */
  mutate: (sheet: BalanceSheet, amount: number) => Partial<BalanceSheet>
  /** Bilançodan min/max/suggested TL aralığını hesaplar */
  calcRange: (sheet: BalanceSheet) => { min: number; max: number; suggested: number }
  /** Sektör yapılabilirlik katsayısı — 0.3 altı önerilmez */
  sectorFeasibility: Record<string, number>
  /** Firma bilançosundan türetilmiş somut uygulama notu */
  howTo: (sheet: BalanceSheet, amount: number) => string
}

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

function nn(v: number | null | undefined): number {
  return v ?? 0
}

/** TL tutarını okunabilir formata çevirir: 1M+ → "X.XM TL", 1K+ → "XXK TL", altı → "X TL" */
function formatTL(n: number | null | undefined): string {
  const v = n ?? 0
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M TL`
  if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}K TL`
  return `${v.toFixed(0)} TL`
}

/** Pozitif sayıdan min/max/suggested üretir; kaynak 0 veya null ise hepsini 0 döner */
function pctRange(
  base: number | null | undefined,
  minPct: number,
  maxPct: number,
  sugPct: number,
): { min: number; max: number; suggested: number } {
  const b = Math.max(0, nn(base))
  if (b === 0) return { min: 0, max: 0, suggested: 0 }
  return {
    min:       Math.round(b * minPct),
    max:       Math.round(b * maxPct),
    suggested: Math.round(b * sugPct),
  }
}

// ─── SEKTÖR FEASİBİLİTY HARİTASI ─────────────────────────────────────────────
// Anahtarlar: 'İnşaat' | 'İmalat' | 'Ticaret' | 'Hizmet' | 'Perakende' |
//             'Tarım' | 'Enerji' | 'Ulaştırma' | 'Sağlık' | 'Bilişim' | 'Turizm'
// Değer < 0.3 → aksiyon o sektörde önerilmez

// ─── AKSİYON KATALOĞU ─────────────────────────────────────────────────────────

export const ACTIONS: Record<ActionId, Action> = {

  // ── 1. KV BORCU UV'YE ÇEVİR ─────────────────────────────────────────────────
  kv_to_uv: {
    id:          'kv_to_uv',
    label:       'KV Borcu UV\'ye Çevir',
    description: 'Kısa vadeli finansal borçların bir kısmını uzun vadeye yeniden yapılandır.',
    timeHorizon: 'medium',
    difficulty:  'medium',

    mutate: (_s, amount) => ({
      shortTermFinancialDebt: -amount,
      longTermFinancialDebt:  +amount,
    }),

    calcRange: (s) => pctRange(s.shortTermFinancialDebt, 0.10, 0.60, 0.30),

    howTo: (s, amount) =>
      `Kısa vadeli finansal borcunuz ${formatTL(s.shortTermFinancialDebt)}. `
      + `Bunun ${formatTL(amount)}'sini uzun vadeye çevirirseniz cari oran iyileşir, `
      + `kısa vadeli yükümlülükleriniz hafifler. Bankanızla yeniden yapılandırma müzakeresi başlatın.`,

    sectorFeasibility: {
      İnşaat: 0.75, İmalat: 0.70, Ticaret: 0.55, Hizmet: 0.65,
      Perakende: 0.50, Tarım: 0.60, Enerji: 0.90, Ulaştırma: 0.70,
      Sağlık: 0.65, Bilişim: 0.55, Turizm: 0.70,
    },
  },

  // ── 2. VADESİ GEÇMİŞ ALACAK TAHSİL ET ──────────────────────────────────────
  collect_receivables: {
    id:          'collect_receivables',
    label:       'Alacak Tahsilatı Hızlandır',
    description: 'Vadesi geçmiş ticari alacakların tahsilini hızlandırarak nakit girişi sağla.',
    timeHorizon: 'short',
    difficulty:  'medium',

    mutate: (_s, amount) => ({
      tradeReceivables: -amount,
      cash:             +amount,
    }),

    calcRange: (s) => pctRange(s.tradeReceivables, 0.10, 0.50, 0.25),

    howTo: (s, amount) =>
      `Ticari alacak bakiyeniz ${formatTL(s.tradeReceivables)}. `
      + `${formatTL(amount)} tahsil edilirse kasanız bu kadar güçlenir, DSO düşer. `
      + `90+ gün gecikmiş alacaklara ihtar gönderin; erken ödeme için %2–3 iskonto teklif edin.`,

    sectorFeasibility: {
      İnşaat: 0.35, İmalat: 0.70, Ticaret: 0.75, Hizmet: 0.80,
      Perakende: 0.90, Tarım: 0.45, Enerji: 0.55, Ulaştırma: 0.65,
      Sağlık: 0.75, Bilişim: 0.80, Turizm: 0.60,
    },
  },

  // ── 3. ATIL STOK ERİT ────────────────────────────────────────────────────────
  // Muhafazakâr: maliyetinde satış → bilanço etkisi stok ↓, kasa ↑, kâr değişmez
  liquidate_inventory: {
    id:          'liquidate_inventory',
    label:       'Atıl Stok Eritme',
    description: 'Hareketsiz veya yavaş dönen stokları maliyetinde satarak nakde çevir.',
    timeHorizon: 'short',
    difficulty:  'medium',

    mutate: (_s, amount) => ({
      inventory: -amount,
      cash:      +amount,
      // netProfit değişmez — satış = maliyet fiyatı
    }),

    calcRange: (s) => pctRange(s.inventory, 0.05, 0.30, 0.15),

    howTo: (s, amount) =>
      `Stok bakiyeniz ${formatTL(s.inventory)}. `
      + `${formatTL(amount)}'lik hareketsiz stok maliyetinde satılırsa kasanız güçlenir, nakit döngüsü hızlanır. `
      + `En az 6 aydır hareket görmeyen kalemleri belirleyip indirimli satışa açın.`,

    sectorFeasibility: {
      İnşaat: 0.15, İmalat: 0.55, Ticaret: 0.85, Hizmet: 0.10,
      Perakende: 0.85, Tarım: 0.50, Enerji: 0.20, Ulaştırma: 0.10,
      Sağlık: 0.45, Bilişim: 0.40, Turizm: 0.10,
    },
  },

  // ── 4. FAZLA NAKİTLE KV BORÇ ÖDE ─────────────────────────────────────────────
  repay_kv_debt: {
    id:          'repay_kv_debt',
    label:       'KV Borç Ödemesi',
    description: 'Atıl nakit kullanarak kısa vadeli finansal borç erken kapat.',
    timeHorizon: 'short',
    difficulty:  'easy',

    mutate: (_s, amount) => ({
      cash:                   -amount,
      shortTermFinancialDebt: -amount,
    }),

    // Kasa sıfıra düşmemeli; KV borç üst sınırı da geçilemez
    calcRange: (s) => {
      const base = Math.min(nn(s.cash), nn(s.shortTermFinancialDebt))
      return pctRange(base, 0.10, 0.50, 0.25)
    },

    howTo: (s, amount) =>
      `Kasanız ${formatTL(s.cash)}, kısa vadeli finansal borcunuz ${formatTL(s.shortTermFinancialDebt)}. `
      + `${formatTL(amount)} ile KV kredi erken kapatılırsa kaldıraç ve faiz yükü azalır. `
      + `Kapatma işlemi öncesi bankayla erken kapama maliyetini sorgulayın.`,

    sectorFeasibility: {
      İnşaat: 0.70, İmalat: 0.75, Ticaret: 0.85, Hizmet: 0.85,
      Perakende: 0.80, Tarım: 0.65, Enerji: 0.80, Ulaştırma: 0.75,
      Sağlık: 0.85, Bilişim: 0.90, Turizm: 0.65,
    },
  },

  // ── 5. FAALİYET GİDERİ AZALT ─────────────────────────────────────────────────
  // Gider tasarrufu kâra yansır; nakit çıkışı olmaz (gider henüz ödenmemişti)
  // Vergi koşulu: zararda firma (%100), kârlı firma (%75 vergi sonrası)
  reduce_opex: {
    id:          'reduce_opex',
    label:       'Faaliyet Gideri Azalt',
    description: 'Genel yönetim, pazarlama veya idari giderlerde tasarruf yaparak FVÖK\'ü iyileştir.',
    timeHorizon: 'medium',
    difficulty:  'hard',

    mutate: (s, amount) => ({
      operatingExpenses: -amount,
      netProfit:         +amount * (nn(s.netProfit) > 0 ? 0.75 : 1.0),
      // cash değişmez
    }),

    calcRange: (s) => pctRange(s.operatingExpenses, 0.03, 0.15, 0.08),

    howTo: (s, amount) =>
      `Faaliyet giderleriniz ${formatTL(s.operatingExpenses)}. `
      + `${formatTL(amount)} kısılırsa net kâra yaklaşık ${formatTL(amount * 0.75)} yansır. `
      + `Genel yönetim, pazarlama ve idari gider kalemlerini tek tek gözden geçirin; `
      + `ertelenebilir veya dışarıdan alınan hizmet maliyetlerini hedefleyin.`,

    sectorFeasibility: {
      İnşaat: 0.45, İmalat: 0.55, Ticaret: 0.70, Hizmet: 0.35,
      Perakende: 0.65, Tarım: 0.50, Enerji: 0.55, Ulaştırma: 0.45,
      Sağlık: 0.25, Bilişim: 0.30, Turizm: 0.50,
    },
  },

  // ── 6. BRÜT MARJ İYİLEŞTİR ───────────────────────────────────────────────────
  // Vergi koşulu: zararda firma tam geçer, kârlı firma %75
  improve_margin: {
    id:          'improve_margin',
    label:       'Brüt Marj İyileştir',
    description: 'Satın alma optimizasyonu veya fiyatlandırma gücüyle satışların maliyetini düşür.',
    timeHorizon: 'medium',
    difficulty:  'hard',

    mutate: (s, amount) => ({
      costOfSales: -amount,
      netProfit:   +amount * (nn(s.netProfit) > 0 ? 0.75 : 1.0),
    }),

    calcRange: (s) => pctRange(s.costOfSales, 0.02, 0.10, 0.05),

    howTo: (s, amount) => {
      const grossProfit = nn(s.revenue) - nn(s.costOfSales)
      if (grossProfit < 0) {
        return `Satışların maliyetiniz ${formatTL(s.costOfSales)}, geliriniz ${formatTL(s.revenue)} — `
          + `brüt zarar ${formatTL(-grossProfit)}. `
          + `${formatTL(amount)} maliyet düşüşü sağlanırsa brüt zarar ${formatTL(-grossProfit - amount)}'e iner. `
          + `Maliyet kalemlerinizi inceleyin: işçilik, hammadde, taşeron giderleri. `
          + `Hangi kalemde en fazla tasarruf mümkün?`
      }
      return `Satışların maliyetiniz ${formatTL(s.costOfSales)}, geliriniz ${formatTL(s.revenue)}. `
        + `${formatTL(amount)} maliyet düşüşü brüt kârınızı ${formatTL(grossProfit + amount)}'e yükseltir. `
        + `Tedarikçi fiyat müzakeresi, toplu alım indirimi veya süreç verimliliği öncelikli hedef olmalı.`
    },

    sectorFeasibility: {
      İnşaat: 0.40, İmalat: 0.65, Ticaret: 0.55, Hizmet: 0.80,
      Perakende: 0.55, Tarım: 0.35, Enerji: 0.55, Ulaştırma: 0.55,
      Sağlık: 0.70, Bilişim: 0.85, Turizm: 0.60,
    },
  },

  // ── 7. REFİNANSE ET ───────────────────────────────────────────────────────────
  // amount = yıllık faiz TASARRUFU (toplam borç × faiz farkı × refinanse oranı)
  // Bilanço değişmez; sadece gelir tablosu iyileşir
  refinance: {
    id:          'refinance',
    label:       'Kredi Refinansmanı',
    description: 'Yüksek faizli kredileri daha düşük maliyetli yapıya taşı; yıllık faiz tasarrufu sağla.',
    timeHorizon: 'medium',
    difficulty:  'medium',

    // amount = faiz tasarrufu (nakit), anapara değil
    mutate: (s, amount) => ({
      interestExpense: -amount,
      netProfit:       +amount * (nn(s.netProfit) > 0 ? 0.75 : 1.0),
      // Bilanço değişmez
    }),

    // suggested = toplam borcun %20'sini %14 faiz farkıyla refinanse etmenin yıllık tasarrufu
    calcRange: (s) => {
      const totalDebt = nn(s.shortTermFinancialDebt) + nn(s.longTermFinancialDebt)
      const suggested = Math.round(totalDebt * 0.20 * 0.14)
      const min       = Math.round(totalDebt * 0.10 * 0.14)
      const max       = Math.round(totalDebt * 0.50 * 0.14)
      return { min, max, suggested }
    },

    howTo: (s, amount) => {
      const totalDebt = nn(s.shortTermFinancialDebt) + nn(s.longTermFinancialDebt)
      return `Toplam finansal borcunuz ${formatTL(totalDebt)}, mevcut faiz gideriniz ${formatTL(s.interestExpense)}. `
        + `${formatTL(amount)} yıllık faiz tasarrufu için alternatif banka teklifleri alın. `
        + `Özellikle KV kredilerin bir kısmını daha düşük faizli UV yapıya çekmeyi hedefleyin.`
    },

    sectorFeasibility: {
      İnşaat: 0.65, İmalat: 0.75, Ticaret: 0.65, Hizmet: 0.70,
      Perakende: 0.55, Tarım: 0.50, Enerji: 0.90, Ulaştırma: 0.65,
      Sağlık: 0.75, Bilişim: 0.70, Turizm: 0.60,
    },
  },

  // ── 8. SERMAYE ARTIŞI ─────────────────────────────────────────────────────────
  capital_increase: {
    id:          'capital_increase',
    label:       'Sermaye Artışı',
    description: 'Mevcut ortaklar veya yeni yatırımcılardan nakit sermaye girişi sağla.',
    timeHorizon: 'long',
    difficulty:  'very_hard',

    mutate: (_s, amount) => ({
      cash:          +amount,
      paidInCapital: +amount,
    }),

    calcRange: (s) => {
      const equity = nn(s.paidInCapital) + nn(s.retainedEarnings) + nn(s.netProfit)
      return pctRange(Math.max(equity, 0), 0.10, 0.50, 0.25)
    },

    howTo: (s, amount) => {
      const equity = nn(s.paidInCapital) + nn(s.retainedEarnings) + nn(s.netProfit)
      return `Mevcut özkaynak tabanınız yaklaşık ${formatTL(equity)}. `
        + `${formatTL(amount)} nakit sermaye girişi kasanızı ve özkaynağınızı doğrudan artırır, özkaynak oranı iyileşir. `
        + `Mevcut ortakların sermaye koyması en hızlı yol; yeni yatırımcı süreci 3–6 ay alır.`
    },

    sectorFeasibility: {
      İnşaat: 0.55, İmalat: 0.65, Ticaret: 0.60, Hizmet: 0.65,
      Perakende: 0.50, Tarım: 0.35, Enerji: 0.85, Ulaştırma: 0.55,
      Sağlık: 0.70, Bilişim: 0.80, Turizm: 0.45,
    },
  },

  // ── 9. KÂR DAĞITIMINI DURDUR ──────────────────────────────────────────────────
  // Kâr dağıtım kararı alınmış ama ödeme iptal → özkaynak güçlenir
  // netProfit değişmez (kâr zaten kazanıldı), cash değişmez (ödeme yapılmadı)
  retain_profit: {
    id:          'retain_profit',
    label:       'Kâr Dağıtımını Durdur',
    description: 'Dönem kârını dağıtmak yerine birikmiş kârlara aktar; özkaynak tabanını güçlendir.',
    timeHorizon: 'short',
    difficulty:  'easy',

    mutate: (_s, amount) => ({
      retainedEarnings: +amount,
      // netProfit değişmez — kâr zaten mevcut
      // cash değişmez — ödeme iptal edildi
    }),

    calcRange: (s) => {
      const profit = nn(s.netProfit)
      if (profit <= 0) return { min: 0, max: 0, suggested: 0 }
      return pctRange(profit, 0.50, 1.00, 0.80)
    },

    howTo: (s, amount) =>
      `Dönem net kârınız ${formatTL(s.netProfit)}. `
      + `${formatTL(amount)} kâr dağıtılmazsa bu tutar birikmiş kârlara aktarılır, özkaynak güçlenir. `
      + `Genel Kurul kararıyla kâr dağıtımı bu yıl ertelenebilir veya iptal edilebilir.`,

    sectorFeasibility: {
      İnşaat: 0.60, İmalat: 0.65, Ticaret: 0.75, Hizmet: 0.80,
      Perakende: 0.70, Tarım: 0.55, Enerji: 0.70, Ulaştırma: 0.65,
      Sağlık: 0.80, Bilişim: 0.90, Turizm: 0.55,
    },
  },

  // ── 10. ATIL DURAN VARLIK SAT ────────────────────────────────────────────────
  // Muhafazakâr: defter değerinden satış → kâr/zarar yok, vergi yok
  sell_asset: {
    id:          'sell_asset',
    label:       'Atıl Duran Varlık Sat',
    description: 'Kullanılmayan maddi duran varlıkları defter değerinden sat ve nakde çevir.',
    timeHorizon: 'medium',
    difficulty:  'hard',

    mutate: (_s, amount) => ({
      tangibleAssets: -amount,
      cash:           +amount,
      // netProfit değişmez — satış = defter değeri
    }),

    calcRange: (s) => pctRange(s.tangibleAssets, 0.05, 0.25, 0.10),

    howTo: (s, amount) =>
      `Maddi duran varlık bakiyeniz ${formatTL(s.tangibleAssets)}. `
      + `${formatTL(amount)} değerinde atıl makine, araç veya gayrimenkul satışı kasanızı doğrudan güçlendirir. `
      + `Aktif kullanım oranı düşük varlıkları tespit edin; değerleme için bağımsız ekspertiz alın.`,

    sectorFeasibility: {
      İnşaat: 0.50, İmalat: 0.55, Ticaret: 0.40, Hizmet: 0.45,
      Perakende: 0.35, Tarım: 0.30, Enerji: 0.45, Ulaştırma: 0.55,
      Sağlık: 0.35, Bilişim: 0.60, Turizm: 0.40,
    },
  },

  // ── 11. ALACAK VADESİNİ KISALT (DSO) ────────────────────────────────────────
  shorten_dso: {
    id:          'shorten_dso',
    label:       'Alacak Tahsil Süresini Kısalt',
    description: 'Erken ödeme indirimi veya sıkı kredi politikasıyla alacak tahsil süresini azalt.',
    timeHorizon: 'short',
    difficulty:  'medium',

    mutate: (_s, amount) => ({
      tradeReceivables: -amount,
      cash:             +amount,
    }),

    calcRange: (s) => pctRange(s.tradeReceivables, 0.10, 0.40, 0.20),

    howTo: (s, amount) =>
      `Ticari alacak bakiyeniz ${formatTL(s.tradeReceivables)}. `
      + `${formatTL(amount)} daha hızlı tahsil edilirse kasa bu kadar güçlenir, nakit döngüsü kısalır. `
      + `Müşteri ödeme vadelerini kısaltın; peşin veya erken ödemeye %1–2 iskonto sunun.`,

    sectorFeasibility: {
      İnşaat: 0.25, İmalat: 0.65, Ticaret: 0.70, Hizmet: 0.75,
      Perakende: 0.90, Tarım: 0.45, Enerji: 0.50, Ulaştırma: 0.65,
      Sağlık: 0.70, Bilişim: 0.80, Turizm: 0.65,
    },
  },

  // ── 12. TEDARİKÇİ VADESİNİ UZAT (DPO) ──────────────────────────────────────
  // Vade uzatma = nakit çıkışı ertelendi. Ticari borç artar, kasa değişmez.
  // Rasyo etkisi: DPO ↑, cari oran iyileşir (dönen varlıklar / kısa vade borç)
  extend_dpo: {
    id:          'extend_dpo',
    label:       'Tedarikçi Vadesi Uzat',
    description: 'Tedarikçilerle vade müzakeresiyle borç ödeme süresini uzatarak nakit döngüsünü iyileştir.',
    timeHorizon: 'short',
    difficulty:  'medium',

    mutate: (_s, amount) => ({
      tradePayables: +amount,
      // cash değişmez — nakit çıkışı ertelendi
    }),

    calcRange: (s) => pctRange(s.tradePayables, 0.05, 0.20, 0.10),

    howTo: (s, amount) =>
      `Ticari borç bakiyeniz ${formatTL(s.tradePayables)}. `
      + `${formatTL(amount)}'lik ödemeyi erteleyerek kasanızda bu tutar daha uzun kalır, nakit döngünüz iyileşir. `
      + `Ana tedarikçilerinizle vade uzatma müzakeresine girin; karşılıklı hacim taahhüdü önerebilirsiniz.`,

    sectorFeasibility: {
      İnşaat: 0.40, İmalat: 0.70, Ticaret: 0.75, Hizmet: 0.45,
      Perakende: 0.80, Tarım: 0.35, Enerji: 0.50, Ulaştırma: 0.45,
      Sağlık: 0.50, Bilişim: 0.55, Turizm: 0.45,
    },
  },

  // ── 13. CİRO ARTIR ──────────────────────────────────────────────────────────
  // COGS gross marjdan türetilir; alacaklar DSO varsayımıyla artar
  // Vergi koşulu: zararda firma tam geçer
  increase_revenue: {
    id:          'increase_revenue',
    label:       'Ciro Artışı',
    description: 'Atıl kapasite devreye alınarak veya yeni müşteri kazanımıyla net satışları artır.',
    timeHorizon: 'medium',
    difficulty:  'hard',

    mutate: (s, amount) => {
      const grossMargin = nn(s.revenue) > 0
        ? (nn(s.revenue) - nn(s.costOfSales)) / nn(s.revenue)
        : 0.25
      const taxFactor = nn(s.netProfit) > 0 ? 0.75 : 1.0
      return {
        revenue:          +amount,
        costOfSales:      +(amount * (1 - grossMargin)),
        netProfit:        +(amount * grossMargin * taxFactor),
        tradeReceivables: +(amount * 0.164),   // ~60 gün DSO varsayımı
      }
    },

    calcRange: (s) => pctRange(s.revenue, 0.03, 0.15, 0.08),

    howTo: (s, amount) => {
      const netMarginPct = nn(s.revenue) > 0
        ? Math.max(0, nn(s.netProfit) / nn(s.revenue))
        : 0.08
      const netGain = amount * netMarginPct
      return `Mevcut cironuz ${formatTL(s.revenue)}. `
        + `${formatTL(amount)} ek gelir, mevcut net marj varsayımıyla ${formatTL(netGain)} net kâra dönüşür. `
        + `Atıl kapasite için yeni müşteri veya sözleşme arayışına girin; mevcut müşterilere çapraz satış yapın.`
    },

    sectorFeasibility: {
      İnşaat: 0.50, İmalat: 0.70, Ticaret: 0.70, Hizmet: 0.65,
      Perakende: 0.60, Tarım: 0.45, Enerji: 0.55, Ulaştırma: 0.65,
      Sağlık: 0.60, Bilişim: 0.80, Turizm: 0.50,
    },
  },

  // ── 14. KREDİ KAPATMA ────────────────────────────────────────────────────────
  close_credit: {
    id:          'close_credit',
    label:       'Kredi Kapatma',
    description: 'Mevcut nakit ile KV kredi limitini kapat; likidite maliyetini azalt.',
    timeHorizon: 'short',
    difficulty:  'easy',

    mutate: (_s, amount) => ({
      cash:                   -amount,
      shortTermFinancialDebt: -amount,
    }),

    calcRange: (s) => {
      const base = Math.min(nn(s.cash), nn(s.shortTermFinancialDebt))
      return pctRange(base, 0.10, 0.40, 0.20)
    },

    howTo: (s, amount) =>
      `Kasanız ${formatTL(s.cash)}, kısa vadeli finansal borcunuz ${formatTL(s.shortTermFinancialDebt)}. `
      + `${formatTL(amount)} ile mevcut kredi kapatılırsa yıllık faiz yükü ve kaldıraç azalır. `
      + `Kullanılmayan kredi limitlerini öncelikle hedefleyin; erken kapatma komisyonunu önceden sorgulayın.`,

    sectorFeasibility: {
      İnşaat: 0.65, İmalat: 0.70, Ticaret: 0.75, Hizmet: 0.85,
      Perakende: 0.70, Tarım: 0.60, Enerji: 0.65, Ulaştırma: 0.65,
      Sağlık: 0.80, Bilişim: 0.85, Turizm: 0.60,
    },
  },
}

// ─── YARDIMCI FONKSİYONLAR ───────────────────────────────────────────────────

/** Sektör için önerilen (feasibility ≥ 0.3) aksiyonları döner */
export function getFeasibleActions(sector: string): Action[] {
  return Object.values(ACTIONS).filter(
    (a) => (a.sectorFeasibility[sector] ?? 0.5) >= 0.3,
  )
}

/** Tek bir aksiyon getir (id'den) */
export function getAction(id: ActionId): Action {
  return ACTIONS[id]
}

// ─── HESAP KODU BAZLI AKSİYON TİPİ ──────────────────────────────────────────

export interface AccountAction {
  id:          ActionId
  label:       string
  description: string
  timeHorizon: TimeHorizon
  difficulty:  Difficulty
  /** TDHP hesap kodu bazlı mutasyon (delta operasyonları) */
  mutate:      (sheet: AccountBalanceSheet, amount: number) => AccountMutation
  /** Bilançodan min/max/suggested TL aralığını hesaplar */
  calcRange:   (sheet: AccountBalanceSheet) => { min: number; max: number; suggested: number }
  /** Sektör yapılabilirlik katsayısı — 0.2 altı havuzdan çıkar */
  sectorFeasibility: Record<string, number>
  /** Firma bakiyelerinden türetilmiş somut uygulama notu */
  howTo:       (sheet: AccountBalanceSheet, amount: number) => string
}

// ─── HESAP KODU YARDIMCILARI ──────────────────────────────────────────────────

const getAccount = (sheet: AccountBalanceSheet, code: string): number =>
  sheet.accounts.get(code) ?? 0

const sumAccounts = (sheet: AccountBalanceSheet, codes: string[]): number =>
  codes.reduce((sum, code) => sum + getAccount(sheet, code), 0)

function pctRangeAcc(
  base: number,
  minPct: number,
  maxPct: number,
  sugPct: number,
): { min: number; max: number; suggested: number } {
  const b = Math.max(0, base)
  if (b === 0) return { min: 0, max: 0, suggested: 0 }
  return {
    min:       Math.round(b * minPct),
    max:       Math.round(b * maxPct),
    suggested: Math.round(b * sugPct),
  }
}

// ─── HESAP KODU BAZLI AKSİYON KATALOĞU ──────────────────────────────────────

export const ACCOUNT_ACTIONS: Record<ActionId, AccountAction> = {

  // ── 1. KV BORCU UV'YE ÇEVİR ─────────────────────────────────────────────────
  kv_to_uv: {
    id:          'kv_to_uv',
    label:       ACTIONS.kv_to_uv.label,
    description: ACTIONS.kv_to_uv.description,
    timeHorizon: ACTIONS.kv_to_uv.timeHorizon,
    difficulty:  ACTIONS.kv_to_uv.difficulty,
    sectorFeasibility: ACTIONS.kv_to_uv.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'kv_to_uv',
      operations: [
        { code: '300', delta: -amount },   // KV Banka Kredileri azalır
        { code: '400', delta: +amount },   // UV Banka Kredileri artar
      ],
    }),

    calcRange: (sheet) => {
      const kvDebt = sumAccounts(sheet, ['300','301','303','304','305','306','309'])
      return pctRangeAcc(kvDebt, 0.10, 0.60, 0.30)
    },

    howTo: (sheet, amount) => {
      const kvDebt = sumAccounts(sheet, ['300','301','303','304','305','306','309'])
      return `Kısa vadeli finansal borcunuz ${formatTL(kvDebt)}. `
        + `Bunun ${formatTL(amount)}'sini uzun vadeye çevirirseniz cari oran iyileşir, `
        + `kısa vadeli yükümlülükleriniz hafifler. Bankanızla yeniden yapılandırma müzakeresi başlatın.`
    },
  },

  // ── 2. VADESİ GEÇMİŞ ALACAK TAHSİL ET ──────────────────────────────────────
  collect_receivables: {
    id:          'collect_receivables',
    label:       ACTIONS.collect_receivables.label,
    description: ACTIONS.collect_receivables.description,
    timeHorizon: ACTIONS.collect_receivables.timeHorizon,
    difficulty:  ACTIONS.collect_receivables.difficulty,
    sectorFeasibility: ACTIONS.collect_receivables.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'collect_receivables',
      operations: [
        { code: '120', delta: -amount },   // Ticari Alacaklar azalır
        { code: '102', delta: +amount },   // Bankalar (nakit) artar
      ],
    }),

    calcRange: (sheet) => {
      const receivables = sumAccounts(sheet, ['120','121','126','127','128'])
      return pctRangeAcc(receivables, 0.10, 0.50, 0.25)
    },

    howTo: (sheet, amount) => {
      const receivables = sumAccounts(sheet, ['120','121','126','127','128'])
      return `Ticari alacak bakiyeniz ${formatTL(receivables)}. `
        + `${formatTL(amount)} tahsil edilirse kasanız bu kadar güçlenir, DSO düşer. `
        + `90+ gün gecikmiş alacaklara ihtar gönderin; erken ödeme için %2–3 iskonto teklif edin.`
    },
  },

  // ── 3. ATIL STOK ERİT ────────────────────────────────────────────────────────
  liquidate_inventory: {
    id:          'liquidate_inventory',
    label:       ACTIONS.liquidate_inventory.label,
    description: ACTIONS.liquidate_inventory.description,
    timeHorizon: ACTIONS.liquidate_inventory.timeHorizon,
    difficulty:  ACTIONS.liquidate_inventory.difficulty,
    sectorFeasibility: ACTIONS.liquidate_inventory.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'liquidate_inventory',
      operations: [
        { code: '153', delta: -amount },   // Ticari Mallar stoku azalır
        { code: '102', delta: +amount },   // Nakit artar (maliyetinde satış)
      ],
    }),

    calcRange: (sheet) => {
      const inventory = sumAccounts(sheet, ['150','151','152','153','157'])
      return pctRangeAcc(inventory, 0.05, 0.30, 0.15)
    },

    howTo: (sheet, amount) => {
      const inventory = sumAccounts(sheet, ['150','151','152','153','157'])
      return `Stok bakiyeniz ${formatTL(inventory)}. `
        + `${formatTL(amount)}'lik hareketsiz stok maliyetinde satılırsa kasanız güçlenir, nakit döngüsü hızlanır. `
        + `En az 6 aydır hareket görmeyen kalemleri belirleyip indirimli satışa açın.`
    },
  },

  // ── 4. FAZLA NAKİTLE KV BORÇ ÖDE ─────────────────────────────────────────────
  repay_kv_debt: {
    id:          'repay_kv_debt',
    label:       ACTIONS.repay_kv_debt.label,
    description: ACTIONS.repay_kv_debt.description,
    timeHorizon: ACTIONS.repay_kv_debt.timeHorizon,
    difficulty:  ACTIONS.repay_kv_debt.difficulty,
    sectorFeasibility: ACTIONS.repay_kv_debt.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'repay_kv_debt',
      operations: [
        { code: '102', delta: -amount },   // Nakit azalır
        { code: '300', delta: -amount },   // KV Banka Kredileri azalır
      ],
    }),

    calcRange: (sheet) => {
      const cash   = getAccount(sheet, '102')
      const kvDebt = sumAccounts(sheet, ['300','301'])
      return pctRangeAcc(Math.min(cash, kvDebt), 0.10, 0.50, 0.25)
    },

    howTo: (sheet, amount) => {
      const cash   = getAccount(sheet, '102')
      const kvDebt = sumAccounts(sheet, ['300','301','303','304'])
      return `Kasanız ${formatTL(cash)}, kısa vadeli finansal borcunuz ${formatTL(kvDebt)}. `
        + `${formatTL(amount)} ile KV kredi erken kapatılırsa kaldıraç ve faiz yükü azalır. `
        + `Kapatma işlemi öncesi bankayla erken kapama maliyetini sorgulayın.`
    },
  },

  // ── 5. FAALİYET GİDERİ AZALT ─────────────────────────────────────────────────
  reduce_opex: {
    id:          'reduce_opex',
    label:       ACTIONS.reduce_opex.label,
    description: ACTIONS.reduce_opex.description,
    timeHorizon: ACTIONS.reduce_opex.timeHorizon,
    difficulty:  ACTIONS.reduce_opex.difficulty,
    sectorFeasibility: ACTIONS.reduce_opex.sectorFeasibility,

    mutate: (sheet, amount) => {
      const netProfit = getAccount(sheet, '590') - getAccount(sheet, '591')
      const taxFactor = netProfit > 0 ? 0.75 : 1.0
      return {
        actionId: 'reduce_opex',
        operations: [
          { code: '632', delta: -amount },             // Genel Yönetim Giderleri azalır
          { code: '590', delta: +(amount * taxFactor) }, // Net kâr artar
        ],
      }
    },

    calcRange: (sheet) => {
      const opex = sumAccounts(sheet, ['630','631','632'])
      return pctRangeAcc(opex, 0.03, 0.15, 0.08)
    },

    howTo: (sheet, amount) => {
      const opex = sumAccounts(sheet, ['630','631','632'])
      return `Faaliyet giderleriniz ${formatTL(opex)}. `
        + `${formatTL(amount)} kısılırsa net kâra yaklaşık ${formatTL(amount * 0.75)} yansır. `
        + `Genel yönetim, pazarlama ve idari gider kalemlerini tek tek gözden geçirin; `
        + `ertelenebilir veya dışarıdan alınan hizmet maliyetlerini hedefleyin.`
    },
  },

  // ── 6. BRÜT MARJ İYİLEŞTİR ───────────────────────────────────────────────────
  improve_margin: {
    id:          'improve_margin',
    label:       ACTIONS.improve_margin.label,
    description: ACTIONS.improve_margin.description,
    timeHorizon: ACTIONS.improve_margin.timeHorizon,
    difficulty:  ACTIONS.improve_margin.difficulty,
    sectorFeasibility: ACTIONS.improve_margin.sectorFeasibility,

    mutate: (sheet, amount) => {
      const netProfit = getAccount(sheet, '590') - getAccount(sheet, '591')
      const taxFactor = netProfit > 0 ? 0.75 : 1.0
      return {
        actionId: 'improve_margin',
        operations: [
          { code: '621', delta: -amount },             // Satılan Ticari Mal Maliyeti azalır
          { code: '590', delta: +(amount * taxFactor) }, // Net kâr artar
        ],
      }
    },

    calcRange: (sheet) => {
      const cogs = sumAccounts(sheet, ['620','621','622','623'])
      return pctRangeAcc(cogs, 0.02, 0.10, 0.05)
    },

    howTo: (sheet, amount) => {
      const revenue    = sumAccounts(sheet, ['600','601','602'])
      const cogs       = sumAccounts(sheet, ['620','621','622','623'])
      const grossProfit = revenue - cogs
      if (grossProfit < 0) {
        return `Satışların maliyetiniz ${formatTL(cogs)}, geliriniz ${formatTL(revenue)} — `
          + `brüt zarar ${formatTL(-grossProfit)}. `
          + `${formatTL(amount)} maliyet düşüşü sağlanırsa brüt zarar ${formatTL(-grossProfit - amount)}'e iner. `
          + `Maliyet kalemlerinizi inceleyin: işçilik, hammadde, taşeron giderleri.`
      }
      return `Satışların maliyetiniz ${formatTL(cogs)}, geliriniz ${formatTL(revenue)}. `
        + `${formatTL(amount)} maliyet düşüşü brüt kârınızı ${formatTL(grossProfit + amount)}'e yükseltir. `
        + `Tedarikçi fiyat müzakeresi, toplu alım indirimi veya süreç verimliliği öncelikli hedef olmalı.`
    },
  },

  // ── 7. REFİNANSE ET ───────────────────────────────────────────────────────────
  refinance: {
    id:          'refinance',
    label:       ACTIONS.refinance.label,
    description: ACTIONS.refinance.description,
    timeHorizon: ACTIONS.refinance.timeHorizon,
    difficulty:  ACTIONS.refinance.difficulty,
    sectorFeasibility: ACTIONS.refinance.sectorFeasibility,

    mutate: (sheet, amount) => {
      const netProfit = getAccount(sheet, '590') - getAccount(sheet, '591')
      const taxFactor = netProfit > 0 ? 0.75 : 1.0
      return {
        actionId: 'refinance',
        operations: [
          { code: '660', delta: -amount },             // Faiz gideri azalır
          { code: '590', delta: +(amount * taxFactor) }, // Net kâr artar (anapara değişmez)
        ],
      }
    },

    calcRange: (sheet) => {
      const totalDebt = sumAccounts(sheet, ['300','301','400','401'])
      const suggested = Math.round(totalDebt * 0.20 * 0.14)
      const min       = Math.round(totalDebt * 0.10 * 0.14)
      const max       = Math.round(totalDebt * 0.50 * 0.14)
      return { min, max, suggested }
    },

    howTo: (sheet, amount) => {
      const totalDebt   = sumAccounts(sheet, ['300','301','400','401'])
      const interestExp = getAccount(sheet, '660')
      return `Toplam finansal borcunuz ${formatTL(totalDebt)}, mevcut faiz gideriniz ${formatTL(interestExp)}. `
        + `${formatTL(amount)} yıllık faiz tasarrufu için alternatif banka teklifleri alın. `
        + `Özellikle KV kredilerin bir kısmını daha düşük faizli UV yapıya çekmeyi hedefleyin.`
    },
  },

  // ── 8. SERMAYE ARTIŞI ─────────────────────────────────────────────────────────
  capital_increase: {
    id:          'capital_increase',
    label:       ACTIONS.capital_increase.label,
    description: ACTIONS.capital_increase.description,
    timeHorizon: ACTIONS.capital_increase.timeHorizon,
    difficulty:  ACTIONS.capital_increase.difficulty,
    sectorFeasibility: ACTIONS.capital_increase.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'capital_increase',
      operations: [
        { code: '102', delta: +amount },   // Nakit artar
        { code: '500', delta: +amount },   // Ödenmiş Sermaye artar
      ],
    }),

    calcRange: (sheet) => {
      const equity =
        sumAccounts(sheet, ['500','502']) - sumAccounts(sheet, ['501','503'])
        + getAccount(sheet, '570') - getAccount(sheet, '580')
        + getAccount(sheet, '590') - getAccount(sheet, '591')
      return pctRangeAcc(Math.max(0, equity), 0.10, 0.50, 0.25)
    },

    howTo: (sheet, amount) => {
      const equity =
        sumAccounts(sheet, ['500','502']) - sumAccounts(sheet, ['501','503'])
        + getAccount(sheet, '570') - getAccount(sheet, '580')
        + getAccount(sheet, '590') - getAccount(sheet, '591')
      return `Mevcut özkaynak tabanınız yaklaşık ${formatTL(equity)}. `
        + `${formatTL(amount)} nakit sermaye girişi kasanızı ve özkaynağınızı doğrudan artırır. `
        + `Mevcut ortakların sermaye koyması en hızlı yol; yeni yatırımcı süreci 3–6 ay alır.`
    },
  },

  // ── 9. KÂR DAĞITIMINI DURDUR ─────────────────────────────────────────────────
  retain_profit: {
    id:          'retain_profit',
    label:       ACTIONS.retain_profit.label,
    description: ACTIONS.retain_profit.description,
    timeHorizon: ACTIONS.retain_profit.timeHorizon,
    difficulty:  ACTIONS.retain_profit.difficulty,
    sectorFeasibility: ACTIONS.retain_profit.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'retain_profit',
      operations: [
        { code: '570', delta: +amount },   // Geçmiş Yıl Kârları artar
        { code: '590', delta: -amount },   // Dönem Net Kârı azalır (transfer)
      ],
    }),

    calcRange: (sheet) => {
      const profit = getAccount(sheet, '590') - getAccount(sheet, '591')
      if (profit <= 0) return { min: 0, max: 0, suggested: 0 }
      return pctRangeAcc(profit, 0.50, 1.00, 0.80)
    },

    howTo: (sheet, amount) => {
      const profit = getAccount(sheet, '590') - getAccount(sheet, '591')
      return `Dönem net kârınız ${formatTL(profit)}. `
        + `${formatTL(amount)} kâr dağıtılmazsa bu tutar birikmiş kârlara aktarılır, özkaynak güçlenir. `
        + `Genel Kurul kararıyla kâr dağıtımı bu yıl ertelenebilir veya iptal edilebilir.`
    },
  },

  // ── 10. ATIL DURAN VARLIK SAT ────────────────────────────────────────────────
  sell_asset: {
    id:          'sell_asset',
    label:       ACTIONS.sell_asset.label,
    description: ACTIONS.sell_asset.description,
    timeHorizon: ACTIONS.sell_asset.timeHorizon,
    difficulty:  ACTIONS.sell_asset.difficulty,
    sectorFeasibility: ACTIONS.sell_asset.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'sell_asset',
      operations: [
        { code: '252', delta: -amount },   // Maddi Duran Varlık (Binalar) azalır
        { code: '102', delta: +amount },   // Nakit artar
      ],
    }),

    calcRange: (sheet) => {
      const tangible = sumAccounts(sheet, ['250','251','252','253','254','255','256','258','259'])
      return pctRangeAcc(tangible, 0.05, 0.25, 0.10)
    },

    howTo: (sheet, amount) => {
      const tangible = sumAccounts(sheet, ['250','251','252','253','254','255','256','258','259'])
      return `Maddi duran varlık bakiyeniz ${formatTL(tangible)}. `
        + `${formatTL(amount)} değerinde atıl makine, araç veya gayrimenkul satışı kasanızı doğrudan güçlendirir. `
        + `Aktif kullanım oranı düşük varlıkları tespit edin; değerleme için bağımsız ekspertiz alın.`
    },
  },

  // ── 11. ALACAK VADESİNİ KISALT (DSO) ────────────────────────────────────────
  shorten_dso: {
    id:          'shorten_dso',
    label:       ACTIONS.shorten_dso.label,
    description: ACTIONS.shorten_dso.description,
    timeHorizon: ACTIONS.shorten_dso.timeHorizon,
    difficulty:  ACTIONS.shorten_dso.difficulty,
    sectorFeasibility: ACTIONS.shorten_dso.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'shorten_dso',
      operations: [
        { code: '120', delta: -amount },   // Ticari Alacaklar azalır
        { code: '102', delta: +amount },   // Nakit artar
      ],
    }),

    calcRange: (sheet) => {
      const receivables = sumAccounts(sheet, ['120','121'])
      return pctRangeAcc(receivables, 0.10, 0.40, 0.20)
    },

    howTo: (sheet, amount) => {
      const receivables = sumAccounts(sheet, ['120','121'])
      return `Ticari alacak bakiyeniz ${formatTL(receivables)}. `
        + `${formatTL(amount)} daha hızlı tahsil edilirse kasa bu kadar güçlenir, nakit döngüsü kısalır. `
        + `Müşteri ödeme vadelerini kısaltın; peşin veya erken ödemeye %1–2 iskonto sunun.`
    },
  },

  // ── 12. TEDARİKÇİ VADESİNİ UZAT (DPO) ──────────────────────────────────────
  extend_dpo: {
    id:          'extend_dpo',
    label:       ACTIONS.extend_dpo.label,
    description: ACTIONS.extend_dpo.description,
    timeHorizon: ACTIONS.extend_dpo.timeHorizon,
    difficulty:  ACTIONS.extend_dpo.difficulty,
    sectorFeasibility: ACTIONS.extend_dpo.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'extend_dpo',
      operations: [
        { code: '320', delta: +amount },   // Ticari Borçlar artar (nakit çıkışı ertelendi)
      ],
    }),

    calcRange: (sheet) => {
      const payables = sumAccounts(sheet, ['320','321','326','329'])
      return pctRangeAcc(payables, 0.05, 0.20, 0.10)
    },

    howTo: (sheet, amount) => {
      const payables = sumAccounts(sheet, ['320','321','326','329'])
      return `Ticari borç bakiyeniz ${formatTL(payables)}. `
        + `${formatTL(amount)}'lik ödemeyi erteleyerek kasanızda bu tutar daha uzun kalır, nakit döngünüz iyileşir. `
        + `Ana tedarikçilerinizle vade uzatma müzakeresine girin; karşılıklı hacim taahhüdü önerebilirsiniz.`
    },
  },

  // ── 13. CİRO ARTIR ───────────────────────────────────────────────────────────
  increase_revenue: {
    id:          'increase_revenue',
    label:       ACTIONS.increase_revenue.label,
    description: ACTIONS.increase_revenue.description,
    timeHorizon: ACTIONS.increase_revenue.timeHorizon,
    difficulty:  ACTIONS.increase_revenue.difficulty,
    sectorFeasibility: ACTIONS.increase_revenue.sectorFeasibility,

    mutate: (sheet, amount) => {
      const revenue    = sumAccounts(sheet, ['600','601','602'])
      const cogs       = sumAccounts(sheet, ['620','621','622','623'])
      const grossMargin = revenue > 0 ? (revenue - cogs) / revenue : 0.25
      const netProfit   = getAccount(sheet, '590') - getAccount(sheet, '591')
      const taxFactor   = netProfit > 0 ? 0.75 : 1.0
      const cogsIncrease   = amount * (1 - grossMargin)
      const profitIncrease = amount * grossMargin * taxFactor
      const dsoIncrease    = amount * 0.164   // ~60 gün DSO
      return {
        actionId: 'increase_revenue',
        operations: [
          { code: '600', delta: +amount },           // Yurtiçi Satışlar artar
          { code: '621', delta: +cogsIncrease },     // Satış Maliyeti artar
          { code: '120', delta: +dsoIncrease },      // Ticari Alacaklar artar (60 gün DSO)
          { code: '590', delta: +profitIncrease },   // Net Kâr artar
        ],
      }
    },

    calcRange: (sheet) => {
      const revenue = sumAccounts(sheet, ['600','601','602'])
      return pctRangeAcc(revenue, 0.03, 0.15, 0.08)
    },

    howTo: (sheet, amount) => {
      const revenue     = sumAccounts(sheet, ['600','601','602'])
      const netProfitAmt = getAccount(sheet, '590') - getAccount(sheet, '591')
      const margin = revenue > 0 ? Math.max(0, netProfitAmt / revenue) : 0.08
      return `Mevcut cironuz ${formatTL(revenue)}. `
        + `${formatTL(amount)} ek gelir, mevcut net marj varsayımıyla ${formatTL(amount * margin)} net kâra dönüşür. `
        + `Atıl kapasite için yeni müşteri veya sözleşme arayışına girin; mevcut müşterilere çapraz satış yapın.`
    },
  },

  // ── 14. KREDİ KAPATMA ────────────────────────────────────────────────────────
  close_credit: {
    id:          'close_credit',
    label:       ACTIONS.close_credit.label,
    description: ACTIONS.close_credit.description,
    timeHorizon: ACTIONS.close_credit.timeHorizon,
    difficulty:  ACTIONS.close_credit.difficulty,
    sectorFeasibility: ACTIONS.close_credit.sectorFeasibility,

    mutate: (_sheet, amount) => ({
      actionId: 'close_credit',
      operations: [
        { code: '102', delta: -amount },   // Nakit azalır
        { code: '300', delta: -amount },   // KV Banka Kredileri azalır
      ],
    }),

    calcRange: (sheet) => {
      const cash   = getAccount(sheet, '102')
      const kvDebt = sumAccounts(sheet, ['300','301'])
      return pctRangeAcc(Math.min(cash, kvDebt), 0.10, 0.40, 0.20)
    },

    howTo: (sheet, amount) => {
      const cash   = getAccount(sheet, '102')
      const kvDebt = sumAccounts(sheet, ['300','301','303','304'])
      return `Kasanız ${formatTL(cash)}, kısa vadeli finansal borcunuz ${formatTL(kvDebt)}. `
        + `${formatTL(amount)} ile mevcut kredi kapatılırsa yıllık faiz yükü ve kaldıraç azalır. `
        + `Kullanılmayan kredi limitlerini öncelikle hedefleyin; erken kapatma komisyonunu önceden sorgulayın.`
    },
  },
}

