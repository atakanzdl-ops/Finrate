/**
 * Finrate — Aksiyon Kataloğu
 *
 * 14 finansal iyileştirme aksiyonu:
 *   - mutate()       : TL tutarını alır, BalanceSheet üzerindeki delta'yı döner
 *   - calcRange()    : Gerçek bilanço verilerinden min/max/suggested hesaplar
 *   - sectorFeasibility : Sektör yapılabilirlik katsayısı (0–1, <0.3 önerilmez)
 */

import type { BalanceSheet } from './mutation'

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
  /** TL tutarı alır, BalanceSheet'te değişecek alanların YENİ değerlerini döner */
  mutate: (sheet: BalanceSheet, amount: number) => Partial<BalanceSheet>
  /** Bilançodan min/max/suggested TL aralığını hesaplar */
  calcRange: (sheet: BalanceSheet) => { min: number; max: number; suggested: number }
  /** Sektör yapılabilirlik katsayısı — 0.3 altı önerilmez */
  sectorFeasibility: Record<string, number>
}

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

function nn(v: number | null | undefined): number {
  return v ?? 0
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

    mutate: (s, amount) => ({
      shortTermFinancialDebt: nn(s.shortTermFinancialDebt) - amount,
      longTermFinancialDebt:  nn(s.longTermFinancialDebt)  + amount,
    }),

    calcRange: (s) => pctRange(s.shortTermFinancialDebt, 0.10, 0.60, 0.30),

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

    mutate: (s, amount) => ({
      tradeReceivables: nn(s.tradeReceivables) - amount,
      cash:             nn(s.cash)             + amount,
    }),

    calcRange: (s) => pctRange(s.tradeReceivables, 0.10, 0.50, 0.25),

    sectorFeasibility: {
      İnşaat: 0.35, İmalat: 0.70, Ticaret: 0.75, Hizmet: 0.80,
      Perakende: 0.90, Tarım: 0.45, Enerji: 0.55, Ulaştırma: 0.65,
      Sağlık: 0.75, Bilişim: 0.80, Turizm: 0.60,
    },
  },

  // ── 3. ATIL STOK ERİT ────────────────────────────────────────────────────────
  liquidate_inventory: {
    id:          'liquidate_inventory',
    label:       'Atıl Stok Eritme',
    description: 'Hareketsiz veya yavaş dönen stokları piyasa değerinin altında satarak nakde çevir.',
    timeHorizon: 'short',
    difficulty:  'medium',

    mutate: (s, amount) => ({
      inventory: nn(s.inventory) - amount,
      cash:      nn(s.cash)      + amount,
    }),

    calcRange: (s) => pctRange(s.inventory, 0.05, 0.30, 0.15),

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

    mutate: (s, amount) => ({
      cash:                  nn(s.cash)                  - amount,
      shortTermFinancialDebt: nn(s.shortTermFinancialDebt) - amount,
    }),

    // Kasa sıfıra düşmemeli; ayrıca KV borç üst sınırı da geçilemez
    calcRange: (s) => {
      const base = Math.min(nn(s.cash), nn(s.shortTermFinancialDebt))
      return pctRange(base, 0.10, 0.50, 0.25)
    },

    sectorFeasibility: {
      İnşaat: 0.70, İmalat: 0.75, Ticaret: 0.85, Hizmet: 0.85,
      Perakende: 0.80, Tarım: 0.65, Enerji: 0.80, Ulaştırma: 0.75,
      Sağlık: 0.85, Bilişim: 0.90, Turizm: 0.65,
    },
  },

  // ── 5. FAALİYET GİDERİ AZALT ─────────────────────────────────────────────────
  reduce_opex: {
    id:          'reduce_opex',
    label:       'Faaliyet Gideri Azalt',
    description: 'Genel yönetim, pazarlama veya idari giderlerde tasarruf yaparak FVÖK\'ü iyileştir.',
    timeHorizon: 'medium',
    difficulty:  'hard',

    mutate: (s, amount) => ({
      operatingExpenses: nn(s.operatingExpenses) - amount,
    }),

    calcRange: (s) => pctRange(s.operatingExpenses, 0.03, 0.15, 0.08),

    sectorFeasibility: {
      İnşaat: 0.45, İmalat: 0.55, Ticaret: 0.70, Hizmet: 0.35,
      Perakende: 0.65, Tarım: 0.50, Enerji: 0.55, Ulaştırma: 0.45,
      Sağlık: 0.25, Bilişim: 0.30, Turizm: 0.50,
    },
  },

  // ── 6. BRÜT MARJ İYİLEŞTİR ───────────────────────────────────────────────────
  improve_margin: {
    id:          'improve_margin',
    label:       'Brüt Marj İyileştir',
    description: 'Satın alma optimizasyonu veya fiyatlandırma gücüyle satışların maliyetini düşür.',
    timeHorizon: 'medium',
    difficulty:  'hard',

    mutate: (s, amount) => ({
      costOfSales: nn(s.costOfSales) - amount,
      netProfit:   nn(s.netProfit)   + amount,
    }),

    calcRange: (s) => pctRange(s.costOfSales, 0.02, 0.10, 0.05),

    sectorFeasibility: {
      İnşaat: 0.40, İmalat: 0.65, Ticaret: 0.55, Hizmet: 0.80,
      Perakende: 0.55, Tarım: 0.35, Enerji: 0.55, Ulaştırma: 0.55,
      Sağlık: 0.70, Bilişim: 0.85, Turizm: 0.60,
    },
  },

  // ── 7. REFİNANSE ET ───────────────────────────────────────────────────────────
  refinance: {
    id:          'refinance',
    label:       'Kredi Refinansmanı',
    description: 'Yüksek faizli kredileri daha düşük maliyetli yapıya taşı; yıllık faiz tasarrufu %14 varsayımıyla hesaplanır.',
    timeHorizon: 'medium',
    difficulty:  'medium',

    // amount = refinanse edilen anapara; faiz tasarrufu = amount × 0.14 (yıllık)
    mutate: (s, amount) => ({
      interestExpense: nn(s.interestExpense) - amount * 0.14,
      netProfit:       nn(s.netProfit)       + amount * 0.14,
    }),

    calcRange: (s) => {
      const totalDebt = nn(s.shortTermFinancialDebt) + nn(s.longTermFinancialDebt)
      return pctRange(totalDebt, 0.10, 0.40, 0.20)
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

    mutate: (s, amount) => ({
      cash:         nn(s.cash)         + amount,
      paidInCapital: nn(s.paidInCapital) + amount,
    }),

    calcRange: (s) => {
      // Mevcut özkaynak tabanına göre makul artış aralığı
      const equity = nn(s.paidInCapital) + nn(s.retainedEarnings) + nn(s.netProfit)
      return pctRange(Math.max(equity, 0), 0.10, 0.50, 0.25)
    },

    sectorFeasibility: {
      İnşaat: 0.55, İmalat: 0.65, Ticaret: 0.60, Hizmet: 0.65,
      Perakende: 0.50, Tarım: 0.35, Enerji: 0.85, Ulaştırma: 0.55,
      Sağlık: 0.70, Bilişim: 0.80, Turizm: 0.45,
    },
  },

  // ── 9. KÂR DAĞITIMINI DURDUR ──────────────────────────────────────────────────
  retain_profit: {
    id:          'retain_profit',
    label:       'Kâr Dağıtımını Durdur',
    description: 'Dönem kârını dağıtmak yerine birikmiş kârlara aktar; özkaynak tabanını güçlendir.',
    timeHorizon: 'short',
    difficulty:  'easy',

    mutate: (s, amount) => ({
      retainedEarnings: nn(s.retainedEarnings) + amount,
      netProfit:        nn(s.netProfit)        - amount,
    }),

    calcRange: (s) => {
      const profit = nn(s.netProfit)
      if (profit <= 0) return { min: 0, max: 0, suggested: 0 }
      return pctRange(profit, 0.50, 1.00, 0.80)
    },

    sectorFeasibility: {
      İnşaat: 0.60, İmalat: 0.65, Ticaret: 0.75, Hizmet: 0.80,
      Perakende: 0.70, Tarım: 0.55, Enerji: 0.70, Ulaştırma: 0.65,
      Sağlık: 0.80, Bilişim: 0.90, Turizm: 0.55,
    },
  },

  // ── 10. ATIL DURAN VARLIK SAT ────────────────────────────────────────────────
  sell_asset: {
    id:          'sell_asset',
    label:       'Atıl Duran Varlık Sat',
    description: 'Kullanılmayan maddi duran varlıkları defter değerinden sat ve nakde çevir.',
    timeHorizon: 'medium',
    difficulty:  'hard',

    mutate: (s, amount) => ({
      tangibleAssets: nn(s.tangibleAssets) - amount,
      cash:           nn(s.cash)           + amount,
    }),

    calcRange: (s) => pctRange(s.tangibleAssets, 0.05, 0.25, 0.10),

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

    mutate: (s, amount) => ({
      tradeReceivables: nn(s.tradeReceivables) - amount,
      cash:             nn(s.cash)             + amount,
    }),

    calcRange: (s) => pctRange(s.tradeReceivables, 0.10, 0.40, 0.20),

    sectorFeasibility: {
      İnşaat: 0.25, İmalat: 0.65, Ticaret: 0.70, Hizmet: 0.75,
      Perakende: 0.90, Tarım: 0.45, Enerji: 0.50, Ulaştırma: 0.65,
      Sağlık: 0.70, Bilişim: 0.80, Turizm: 0.65,
    },
  },

  // ── 12. TEDARİKÇİ VADESİNİ UZAT (DPO) ──────────────────────────────────────
  extend_dpo: {
    id:          'extend_dpo',
    label:       'Tedarikçi Vadesi Uzat',
    description: 'Tedarikçilerle vade müzakeresiyle borç ödeme süresini uzatarak nakit döngüsünü iyileştir.',
    timeHorizon: 'short',
    difficulty:  'medium',

    mutate: (s, amount) => ({
      tradePayables: nn(s.tradePayables) + amount,
    }),

    calcRange: (s) => pctRange(s.tradePayables, 0.05, 0.20, 0.10),

    sectorFeasibility: {
      İnşaat: 0.40, İmalat: 0.70, Ticaret: 0.75, Hizmet: 0.45,
      Perakende: 0.80, Tarım: 0.35, Enerji: 0.50, Ulaştırma: 0.45,
      Sağlık: 0.50, Bilişim: 0.55, Turizm: 0.45,
    },
  },

  // ── 13. CİRO ARTIR ──────────────────────────────────────────────────────────
  increase_revenue: {
    id:          'increase_revenue',
    label:       'Ciro Artışı',
    description: 'Atıl kapasite devreye alınarak veya yeni müşteri kazanımıyla net satışları artır. Net kâr katkısı %8 alınmıştır.',
    timeHorizon: 'medium',
    difficulty:  'hard',

    // Ek gelirin %8'i net kâra dönüşür (ortalama katkı marjı varsayımı)
    mutate: (s, amount) => ({
      revenue:   nn(s.revenue)   + amount,
      netProfit: nn(s.netProfit) + amount * 0.08,
    }),

    calcRange: (s) => pctRange(s.revenue, 0.03, 0.15, 0.08),

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

    mutate: (s, amount) => ({
      cash:                  nn(s.cash)                  - amount,
      shortTermFinancialDebt: nn(s.shortTermFinancialDebt) - amount,
    }),

    calcRange: (s) => {
      const base = Math.min(nn(s.cash), nn(s.shortTermFinancialDebt))
      return pctRange(base, 0.10, 0.40, 0.20)
    },

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
