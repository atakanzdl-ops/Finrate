/**
 * ASSET PRODUCTIVITY (V3-8) — ECONOMIC ASSET PRODUCTIVITY LAYER
 *
 * Bu katman TEK BİR SORUYU cevaplar:
 *   "Bu firma aktiflerini gerçekten verimli kullanıyor mu,
 *    yoksa bilanço büyüklüğü operasyon tarafından taşınmıyor mu?"
 *
 * V3-6 (sectorIntelligence) ile SINIR:
 *   V3-6 = Sektörde normallik → "Sektör normuna göre bu değer nerede?"
 *   V3-8 = Ekonomik üretkenlik → "Bu aktif yapısı gelir ve nakit üretiyor mu?"
 *
 * Aynı metriğe farklı soru sorarlar, double penalty YOK.
 *
 * BU KATMAN RATING CEILING KOYMAZ.
 *   - V3-5 sustainability ceiling koyar
 *   - V3-9 rating reasoning final yorumlayıcı
 *   - V3-8 sadece güçlü sinyal + productivity score + narrative üretir
 *
 * ÇIKTI (Model C — score + bileşen + narrative):
 *   - productivityScore: 0..1
 *   - componentScores: 5 bileşen
 *   - inefficiencyFlags: tespit edilen kilitlenmeler
 *   - actionRepairAssessment: hangi aksiyon bu verimsizliği onarır
 *   - repairPriorityAreas: öncelikli onarım alanları
 *   - narrative: banker narrative (V3-9 için)
 *
 * SEKTÖRE DUYARLI DESIGN (ChatGPT review sonrası):
 *   - expectedOperatingMargin: her sektör için kendi marj beklentisi
 *   - inventoryLockThreshold: her sektör için stok kilitlenme eşiği
 */

import type {
  SectorCode,
  ActionTemplateV3,
} from './contracts'

// ActionTemplateV3 repair profilleri için interface belgesi — import kullanılıyor
void 0 as unknown as ActionTemplateV3

// ─── GİRDİ TİPLERİ ───────────────────────────────────────────────────────────

/**
 * Firma bilançosu ve gelir tablosu özeti — V3-8'in girdi şekli.
 * Bu değerler V3 orchestrator (V3-10) tarafından hesap bakiyelerinden türetilecek.
 */
export interface ProductivityInput {
  sector: SectorCode

  /** Aktif kalemleri */
  totalAssets:          number
  cashAndEquivalents:   number       // 100, 101, 102, 108
  tradeReceivables:     number       // 120, 121
  inventory:            number       // 150, 151, 152, 153
  workInProgress:       number       // 350-358 (YYİ)
  advancesGiven:        number       // 159, 179, 259 (verilen sipariş avansları)
  prepaidExpenses:      number       // 180
  fixedAssetsNet:       number       // 25x (birikmiş amortisman sonrası)

  /** Gelir tablosu */
  netSales:          number          // 600 net
  costOfGoodsSold:   number          // 621
  grossProfit:       number          // 690
  operatingProfit:   number          // EBIT (faiz öncesi faaliyet kârı)
  operatingCashFlow?: number         // Opsiyonel — varsa kullan

  /** Önerilen aksiyon portföyü (opsiyonel — actionRepairAssessment için) */
  proposedActions?: Array<{
    actionId:  string
    amountTRY: number
  }>
}

// ─── ÇEKİRDEK METRİK HESAPLARI ───────────────────────────────────────────────

/**
 * 8 çekirdek productivity metriği.
 * Hepsi oran — firma büyüklüğünden bağımsız.
 */
export interface ProductivityMetrics {
  // Aktif üretkenliği
  salesToAssets:                 number
  operatingProfitToAssets:       number
  cashFromOperationsToAssets:    number | null

  // Aktif kilitlenmesi (trapped assets)
  inventoryToAssets:             number
  workInProgressToAssets:        number
  advancesGivenToAssets:         number

  // Dönüşüm kalitesi
  receivablesToSales:            number
  fixedAssetToSales:             number

  // Türetilmiş yorumlayıcı metrikler
  workingCapitalLockRatio:       number
  trappedAssetsShare:            number
  productiveAssetsShare:         number
  salesCarryCoverage:            number   // actualSales / expectedSectorSales — 1.0 = sektör normu
}

export function calculateProductivityMetrics(
  input: ProductivityInput,
): ProductivityMetrics {
  const assets = input.totalAssets || 1  // sıfıra bölmeyi önle
  const sales  = input.netSales    || 1

  const inventoryToAssets       = input.inventory    / assets
  const workInProgressToAssets  = input.workInProgress / assets
  const advancesGivenToAssets   = input.advancesGiven  / assets
  const receivablesShare        = input.tradeReceivables / assets

  const workingCapitalLock = inventoryToAssets + workInProgressToAssets + advancesGivenToAssets
  const trapped            = workingCapitalLock + receivablesShare

  return {
    salesToAssets:              input.netSales      / assets,
    operatingProfitToAssets:    input.operatingProfit / assets,
    cashFromOperationsToAssets: input.operatingCashFlow != null
      ? input.operatingCashFlow / assets
      : null,

    inventoryToAssets,
    workInProgressToAssets,
    advancesGivenToAssets,
    receivablesToSales:   input.tradeReceivables / sales,
    fixedAssetToSales:    input.fixedAssetsNet   / sales,

    workingCapitalLockRatio: workingCapitalLock,
    trappedAssetsShare:      trapped,
    productiveAssetsShare:   1 - trapped,
    salesCarryCoverage:      0,  // analyzeAssetProductivity'de sektör beklentisine göre set edilir
  }
}

// ─── SEKTÖR BAZLI PRODUCTIVITY BEKLENTİLERİ ──────────────────────────────────

/**
 * Her sektör için productivity beklenti seviyeleri.
 * Bunlar V3-6'daki TCMB benchmark'tan bağımsız — V3-8'in kendi productivity normları.
 * V3-6 sektör normalliği, V3-8 ekonomik üretkenlik bekler.
 *
 * ChatGPT review eklemesi:
 *   - expectedOperatingMargin: sektöre göre marj doğru normalize edilir
 *     (retail %4, IT %22 aynı okunamaz)
 *   - inventoryLockThreshold: sektöre göre stok kilitlenme eşiği
 *     (hizmet/IT'de %5, perakende/inşaatta %45)
 */
export interface SectorProductivityExpectations {
  /** Beklenen sales/assets aralığı — sektör doğasına göre */
  salesToAssets: { expected: number; critical: number }
  /** Beklenen operasyonel marj — sektöre göre net değişir */
  expectedOperatingMargin: number
  /** Aktif kilitlenme için kabul edilebilir üst sınır */
  workingCapitalLockCeiling: number
  /** Trapped assets için kritik eşik */
  trappedAssetsCritical: number
  /** Sektöre özel stok kilitlenme eşiği (INVENTORY_LOCK flag için) */
  inventoryLockThreshold: number
  /** Sektöre özgü not */
  note: string
}

export const SECTOR_PRODUCTIVITY_EXPECTATIONS: Record<SectorCode, SectorProductivityExpectations> = {
  CONSTRUCTION: {
    salesToAssets:           { expected: 0.35, critical: 0.12 },
    expectedOperatingMargin: 0.09,     // İnşaat proje marjı tipik
    workingCapitalLockCeiling: 0.60,   // Proje stok/YYİ yüksek normal
    trappedAssetsCritical:   0.80,
    inventoryLockThreshold:  0.50,     // İnşaatta yüksek stok daha tolere
    note: 'Proje bazlı yapı yüksek WIP tolere eder ama nakde dönüş zorunlu',
  },
  MANUFACTURING: {
    salesToAssets:           { expected: 0.90, critical: 0.40 },
    expectedOperatingMargin: 0.10,
    workingCapitalLockCeiling: 0.40,
    trappedAssetsCritical:   0.65,
    inventoryLockThreshold:  0.35,
    note: 'Üretim döngüsü stok ve fiziksel aktif gerektirir',
  },
  TRADE: {
    salesToAssets:           { expected: 2.50, critical: 1.00 },
    expectedOperatingMargin: 0.05,     // Ticarette düşük marj + yüksek hacim
    workingCapitalLockCeiling: 0.50,
    trappedAssetsCritical:   0.70,
    inventoryLockThreshold:  0.40,
    note: 'Ticarette yüksek aktif devir bekleniyor',
  },
  RETAIL: {
    salesToAssets:           { expected: 3.00, critical: 1.20 },
    expectedOperatingMargin: 0.04,     // Perakende çok düşük marj
    workingCapitalLockCeiling: 0.50,
    trappedAssetsCritical:   0.70,
    inventoryLockThreshold:  0.45,     // Perakendede stok doğal
    note: 'Perakende hızlı stok devri gerektirir',
  },
  SERVICES: {
    salesToAssets:           { expected: 1.40, critical: 0.50 },
    expectedOperatingMargin: 0.15,     // Hizmet daha yüksek marj
    workingCapitalLockCeiling: 0.20,   // Hizmet az stok
    trappedAssetsCritical:   0.45,
    inventoryLockThreshold:  0.08,     // Hizmette stok olmamalı
    note: 'Hizmet firmalarında aktif ağırlıklı değil satışlar',
  },
  IT: {
    salesToAssets:           { expected: 1.20, critical: 0.45 },
    expectedOperatingMargin: 0.22,     // IT yüksek marj
    workingCapitalLockCeiling: 0.15,   // IT'de neredeyse stok yok
    trappedAssetsCritical:   0.40,
    inventoryLockThreshold:  0.05,     // IT'de stok neredeyse yok
    note: 'Bilişim firmalarında aktif üretkenliği operasyonel marj ile ölçülür',
  },
}

// ─── BİLEŞEN SKORLARI ─────────────────────────────────────────────────────────

export interface ComponentScores {
  /** Satış üretkenliği: aktif gelir üretiyor mu? */
  salesEfficiency:    number   // 0..1
  /** Operasyonel verim: aktif kâr üretiyor mu? */
  operatingYield:     number   // 0..1
  /** Çalışma sermayesi kilitlenmesi (ters skor: az kilit = yüksek skor) */
  workingCapitalLock: number   // 0..1 (1 = hiç kilit yok)
  /** Aktif dönüşümü: trapped asset oranı */
  assetConversion:    number   // 0..1
  /** Nakit üretim desteği */
  cashSupport:        number   // 0..1
}

export function calculateComponentScores(
  metrics:      ProductivityMetrics,
  expectations: SectorProductivityExpectations,
): ComponentScores {
  // Sales Efficiency — expected'e yakınsa 1, critical'e yakınsa 0
  const salesEfficiency = clamp01(
    (metrics.salesToAssets - expectations.salesToAssets.critical) /
    (expectations.salesToAssets.expected - expectations.salesToAssets.critical)
  )

  // Operating Yield — sektöre özgü expected margin ile hesaplanır
  // ChatGPT review: retail %4 vs IT %22 aynı normalize edilemez
  const expectedOperatingYield =
    expectations.salesToAssets.expected * expectations.expectedOperatingMargin
  const operatingYield = clamp01(
    metrics.operatingProfitToAssets / expectedOperatingYield
  )

  // Working Capital Lock — ceiling'in altındaysa iyi
  // Lock ceiling altında = 1, ceiling'de = 0.5, çok üstündeyse 0
  const lockRatio        = metrics.workingCapitalLockRatio / expectations.workingCapitalLockCeiling
  const workingCapitalLock = clamp01(1 - (lockRatio - 0.5))

  // Asset Conversion — productive share
  const assetConversion = clamp01(
    metrics.productiveAssetsShare / (1 - expectations.trappedAssetsCritical)
  )

  // Cash Support — varsa kullan, yoksa operating yield proxy
  let cashSupport: number
  if (metrics.cashFromOperationsToAssets != null) {
    cashSupport = clamp01(
      metrics.cashFromOperationsToAssets / (expectedOperatingYield * 0.7)
    )
  } else {
    // Proxy: operating yield × 0.7 (gerçek nakit daha düşük olur)
    cashSupport = operatingYield * 0.7
  }

  return {
    salesEfficiency,
    operatingYield,
    workingCapitalLock,
    assetConversion,
    cashSupport,
  }
}

function clamp01(value: number): number {
  if (value < 0 || !Number.isFinite(value)) return 0
  if (value > 1) return 1
  return value
}

// ─── PRODUCTIVITY SCORE ───────────────────────────────────────────────────────

/**
 * 5 bileşenin ağırlıklı ortalaması.
 * Aktif dönüşümü ve satış üretkenliği en ağır.
 */
export function calculateProductivityScore(components: ComponentScores): number {
  const weights = {
    salesEfficiency:    0.30,
    operatingYield:     0.20,
    workingCapitalLock: 0.15,
    assetConversion:    0.25,
    cashSupport:        0.10,
  }

  return clamp01(
    components.salesEfficiency    * weights.salesEfficiency    +
    components.operatingYield     * weights.operatingYield     +
    components.workingCapitalLock * weights.workingCapitalLock +
    components.assetConversion    * weights.assetConversion    +
    components.cashSupport        * weights.cashSupport
  )
}

// ─── INEFFICIENCY FLAGS ───────────────────────────────────────────────────────

export type InefficiencySeverity = 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL'

export type InefficiencyType =
  | 'SALES_ASSET_MISMATCH'           // Aktif büyük, satış küçük
  | 'INVENTORY_LOCK'                 // Stok aşırı
  | 'WIP_LOCK'                       // YYİ aşırı
  | 'ADVANCES_LOCK'                  // Verilen avans aşırı
  | 'RECEIVABLE_SLOWDOWN'            // Alacak tahsili yavaş
  | 'FIXED_ASSET_UNDERUTILIZATION'   // Duran varlık gelir üretmiyor
  | 'OPERATING_YIELD_GAP'            // Faaliyet kârı aktif büyüklüğünü taşımıyor
  | 'CASH_GENERATION_GAP'            // Nakit üretimi aktife göre zayıf

export interface InefficiencyFlag {
  type:              InefficiencyType
  severity:          InefficiencySeverity
  metricValue:       number
  expectedThreshold: number
  description:       string
  /** Bu flag hangi aksiyonlar tarafından onarılabilir */
  repairableByActions: string[]
}

export function detectInefficiencies(
  metrics:      ProductivityMetrics,
  expectations: SectorProductivityExpectations,
  input:        ProductivityInput,
): InefficiencyFlag[] {
  const flags: InefficiencyFlag[] = []

  // 1. Sales-Asset Mismatch
  if (metrics.salesToAssets < expectations.salesToAssets.critical) {
    const ratio = metrics.salesToAssets / expectations.salesToAssets.expected
    flags.push({
      type:     'SALES_ASSET_MISMATCH',
      severity: ratio < 0.20 ? 'CRITICAL' : ratio < 0.40 ? 'SEVERE' : 'MODERATE',
      metricValue:       metrics.salesToAssets,
      expectedThreshold: expectations.salesToAssets.expected,
      description:
        `Satış/aktif oranı sektör beklentisinin çok altında ` +
        `(${(metrics.salesToAssets * 100).toFixed(1)}% vs ${(expectations.salesToAssets.expected * 100).toFixed(0)}% beklenen)`,
      repairableByActions: [
        'A18_NET_SALES_GROWTH', 'A08_FIXED_ASSET_DISPOSAL',
        'A06_INVENTORY_MONETIZATION', 'A20_YYI_MONETIZATION',
      ],
    })
  }

  // 2. Inventory Lock — SEKTÖRE DUYARLI (ChatGPT review)
  if (metrics.inventoryToAssets > expectations.inventoryLockThreshold && input.inventory > 0) {
    const isSevere = metrics.inventoryToAssets > expectations.inventoryLockThreshold * 1.5
    flags.push({
      type:     'INVENTORY_LOCK',
      severity: isSevere ? 'SEVERE' : 'MODERATE',
      metricValue:       metrics.inventoryToAssets,
      expectedThreshold: expectations.inventoryLockThreshold,
      description:
        `Stok aktifin ${(metrics.inventoryToAssets * 100).toFixed(1)}%'ini bağlıyor ` +
        `(sektör eşiği: ${(expectations.inventoryLockThreshold * 100).toFixed(0)}%)`,
      repairableByActions: ['A06_INVENTORY_MONETIZATION', 'A18_NET_SALES_GROWTH'],
    })
  }

  // 3. WIP Lock (özellikle inşaat için kritik)
  if (metrics.workInProgressToAssets > 0.20 && input.workInProgress > 0) {
    flags.push({
      type:     'WIP_LOCK',
      severity: metrics.workInProgressToAssets > 0.40 ? 'SEVERE' : 'MODERATE',
      metricValue:       metrics.workInProgressToAssets,
      expectedThreshold: 0.20,
      description:
        `Yarı mamul/YYİ aktifin ${(metrics.workInProgressToAssets * 100).toFixed(1)}%'ini bağlıyor, nakde dönüş gerekli`,
      repairableByActions: ['A20_YYI_MONETIZATION', 'A18_NET_SALES_GROWTH'],
    })
  }

  // 4. Advances Lock
  if (metrics.advancesGivenToAssets > 0.10 && input.advancesGiven > 0) {
    flags.push({
      type:     'ADVANCES_LOCK',
      severity: metrics.advancesGivenToAssets > 0.25 ? 'SEVERE' : 'MODERATE',
      metricValue:       metrics.advancesGivenToAssets,
      expectedThreshold: 0.10,
      description:
        `Verilen avanslar aktifin ${(metrics.advancesGivenToAssets * 100).toFixed(1)}%'ini oluşturuyor, tedarikçi riski`,
      repairableByActions: ['A05_RECEIVABLE_COLLECTION', 'A18_NET_SALES_GROWTH'],
    })
  }

  // 5. Receivable Slowdown
  if (metrics.receivablesToSales > 0.50) {
    flags.push({
      type:     'RECEIVABLE_SLOWDOWN',
      severity: metrics.receivablesToSales > 1.00 ? 'SEVERE' : 'MODERATE',
      metricValue:       metrics.receivablesToSales,
      expectedThreshold: 0.50,
      description:
        `Alacaklar satışın ${(metrics.receivablesToSales * 100).toFixed(0)}%'i kadar — tahsilat süresi uzun`,
      repairableByActions: ['A05_RECEIVABLE_COLLECTION'],
    })
  }

  // 6. Fixed Asset Underutilization
  if (metrics.fixedAssetToSales > 2.0 && input.fixedAssetsNet > 0) {
    flags.push({
      type:     'FIXED_ASSET_UNDERUTILIZATION',
      severity: metrics.fixedAssetToSales > 5.0 ? 'CRITICAL'
        : metrics.fixedAssetToSales > 3.0 ? 'SEVERE'
        : 'MODERATE',
      metricValue:       metrics.fixedAssetToSales,
      expectedThreshold: 2.0,
      description:
        `Duran varlık satışın ${metrics.fixedAssetToSales.toFixed(1)} katı — atıl varlık göstergesi`,
      repairableByActions: [
        'A08_FIXED_ASSET_DISPOSAL', 'A09_SALE_LEASEBACK', 'A18_NET_SALES_GROWTH',
      ],
    })
  }

  // 7. Operating Yield Gap — SEKTÖRE DUYARLI (ChatGPT review)
  const expectedOperatingYield =
    expectations.salesToAssets.expected * expectations.expectedOperatingMargin
  if (metrics.operatingProfitToAssets < expectedOperatingYield * 0.3) {
    flags.push({
      type:     'OPERATING_YIELD_GAP',
      severity: metrics.operatingProfitToAssets < 0
        ? 'CRITICAL'
        : metrics.operatingProfitToAssets < expectedOperatingYield * 0.1
          ? 'SEVERE'
          : 'MODERATE',
      metricValue:       metrics.operatingProfitToAssets,
      expectedThreshold: expectedOperatingYield,
      description:
        `Faaliyet kârı / aktif oranı aktif büyüklüğünü taşımıyor ` +
        `(${(metrics.operatingProfitToAssets * 100).toFixed(2)}% vs ${(expectedOperatingYield * 100).toFixed(2)}% beklenen)`,
      repairableByActions: [
        'A12_GROSS_MARGIN_IMPROVEMENT', 'A13_OPEX_OPTIMIZATION', 'A18_NET_SALES_GROWTH',
      ],
    })
  }

  // 8. Cash Generation Gap (varsa)
  if (metrics.cashFromOperationsToAssets != null && metrics.cashFromOperationsToAssets < 0.02) {
    flags.push({
      type:     'CASH_GENERATION_GAP',
      severity: metrics.cashFromOperationsToAssets < 0 ? 'CRITICAL' : 'SEVERE',
      metricValue:       metrics.cashFromOperationsToAssets,
      expectedThreshold: 0.05,
      description: 'Operasyonel nakit üretimi aktif büyüklüğünü desteklemiyor',
      repairableByActions: [
        'A05_RECEIVABLE_COLLECTION', 'A06_INVENTORY_MONETIZATION', 'A12_GROSS_MARGIN_IMPROVEMENT',
      ],
    })
  }

  return flags
}

// ─── ACTION REPAIR ASSESSMENT ─────────────────────────────────────────────────

/**
 * Bir aksiyon aktif verimliliğini ne kadar onarıyor?
 * Hard-coded expert knowledge — her aksiyonun hangi productivity bileşenini
 * etkilediği ve ne kadar güçlü.
 */
export type RepairStrength = 'NONE' | 'WEAK' | 'MODERATE' | 'STRONG' | 'PRIMARY'

export interface ActionRepairProfile {
  /** Hangi inefficiency tiplerini onarır */
  repairs: Partial<Record<InefficiencyType, RepairStrength>>
  /** Aksiyon tarafından etkilenen component */
  affectedComponents: Array<keyof ComponentScores>
  /** Banker yorumu */
  productivityNote: string
}

export const ACTION_REPAIR_PROFILES: Record<string, ActionRepairProfile> = {
  A01_ST_FIN_DEBT_TO_LT: {
    repairs: {},
    affectedComponents: [],
    productivityNote: 'Reclass — aktif verimliliğini değiştirmez, sadece yükümlülük yapısı',
  },
  A02_TRADE_PAYABLE_TO_LT: {
    repairs: {},
    affectedComponents: [],
    productivityNote: 'Reclass — aktif verimliliğine katkısı yok',
  },
  A03_ADVANCE_TO_LT: {
    repairs: {},
    affectedComponents: [],
    productivityNote: 'Reclass — aktif verimliliğine katkısı yok',
  },
  A04_CASH_PAYDOWN_ST: {
    repairs: {},
    affectedComponents: ['cashSupport'],
    productivityNote: 'Borç ödeme nakit tüketir — productivity onarımı değil',
  },
  A05_RECEIVABLE_COLLECTION: {
    repairs: {
      RECEIVABLE_SLOWDOWN:  'PRIMARY',
      CASH_GENERATION_GAP:  'STRONG',
    },
    affectedComponents: ['assetConversion', 'cashSupport'],
    productivityNote: 'Alacakları nakde çevirir — aktif dönüşümü ve nakit üretimi iyileşir',
  },
  A06_INVENTORY_MONETIZATION: {
    repairs: {
      INVENTORY_LOCK:       'PRIMARY',
      CASH_GENERATION_GAP:  'STRONG',
      SALES_ASSET_MISMATCH: 'MODERATE',
    },
    affectedComponents: ['workingCapitalLock', 'assetConversion', 'cashSupport'],
    productivityNote: 'Stoğu satışa/nakde çevirir — aktif kilitlenmesini doğrudan azaltır',
  },
  A08_FIXED_ASSET_DISPOSAL: {
    repairs: {
      FIXED_ASSET_UNDERUTILIZATION: 'PRIMARY',
      SALES_ASSET_MISMATCH:         'STRONG',
      CASH_GENERATION_GAP:          'MODERATE',
    },
    affectedComponents: ['salesEfficiency', 'assetConversion', 'cashSupport'],
    productivityNote: 'Atıl duran varlığı nakde çevirir — aktif büyüklüğünü operasyonla hizalar',
  },
  A09_SALE_LEASEBACK: {
    repairs: {
      FIXED_ASSET_UNDERUTILIZATION: 'MODERATE',
      CASH_GENERATION_GAP:          'MODERATE',
    },
    affectedComponents: ['cashSupport', 'assetConversion'],
    productivityNote: 'Sat-geri kirala nakit üretir ama operasyonel kullanım korunur — kısmi onarım',
  },
  A10_CASH_EQUITY_INJECTION: {
    repairs: {
      CASH_GENERATION_GAP: 'WEAK',
    },
    affectedComponents: ['cashSupport'],
    productivityNote: 'Sermaye artışı likiditeyi düzeltir AMA aktif verimsizliğini tek başına çözmez',
  },
  A10B_PROMISSORY_NOTE_EQUITY_INJECTION: {
    repairs: {
      CASH_GENERATION_GAP: 'WEAK',
    },
    affectedComponents: ['cashSupport'],
    productivityNote: 'Senetli sermaye artışı nakit yaratmaz; alacak senedi kalitesi onarım etkisini sınırlar',
  },
  A11_RETAIN_EARNINGS: {
    repairs: {},
    affectedComponents: [],
    productivityNote: 'Kâr tutma özkaynak artırır — productivity onarımı değil',
  },
  A12_GROSS_MARGIN_IMPROVEMENT: {
    repairs: {
      OPERATING_YIELD_GAP: 'PRIMARY',
      CASH_GENERATION_GAP: 'STRONG',
    },
    affectedComponents: ['operatingYield', 'cashSupport'],
    productivityNote: 'Brüt marj iyileşmesi aktif verimini doğrudan artırır',
  },
  A13_OPEX_OPTIMIZATION: {
    repairs: {
      OPERATING_YIELD_GAP: 'STRONG',
    },
    affectedComponents: ['operatingYield'],
    productivityNote: 'Faaliyet gideri azalması faaliyet kârını artırır',
  },
  A14_FINANCE_COST_REDUCTION: {
    repairs: {},
    affectedComponents: [],
    productivityNote: 'Finansman gideri azalması faaliyet dışı — productivity etkisi yok',
  },
  A15_DEBT_TO_EQUITY_SWAP: {
    repairs: {},
    affectedComponents: [],
    productivityNote: 'Reclass — aktif verimliliğini değiştirmez',
  },
  A15B_SHAREHOLDER_DEBT_TO_LT: {
    repairs: {},
    affectedComponents: [],
    productivityNote: 'Vade uzatımı — aktif yapısını değiştirmez, sadece pasif vade sınıflaması',
  },
  A18_NET_SALES_GROWTH: {
    repairs: {
      SALES_ASSET_MISMATCH: 'PRIMARY',
      OPERATING_YIELD_GAP:  'STRONG',
      INVENTORY_LOCK:       'MODERATE',
    },
    affectedComponents: ['salesEfficiency', 'operatingYield', 'cashSupport'],
    productivityNote: 'Net satış artışı aktif verimliliğinin en güçlü onarıcısıdır',
  },
  A19_ADVANCE_TO_REVENUE: {
    repairs: {
      SALES_ASSET_MISMATCH: 'MODERATE',
    },
    affectedComponents: ['salesEfficiency'],
    productivityNote: 'Avansın hasılata dönüşmesi satış/aktif oranını iyileştirir',
  },
  A20_YYI_MONETIZATION: {
    repairs: {
      WIP_LOCK:             'PRIMARY',
      SALES_ASSET_MISMATCH: 'STRONG',
      CASH_GENERATION_GAP:  'STRONG',
    },
    affectedComponents: ['workingCapitalLock', 'assetConversion', 'salesEfficiency', 'cashSupport'],
    productivityNote: 'YYİ hakediş tahsilatı inşaat firmasında aktif kilitlenmesini anlamlı ölçüde çözebilir',
  },
}

export interface ActionRepairAssessment {
  actionId:              string
  amountTRY:             number
  repairStrength:        RepairStrength
  repairsInefficiencies: InefficiencyType[]
  productivityNote:      string
}

export function assessActionRepairs(
  proposedActions: Array<{ actionId: string; amountTRY: number }>,
  flags:           InefficiencyFlag[],
): ActionRepairAssessment[] {
  const flagTypes = new Set(flags.map(f => f.type))
  const results: ActionRepairAssessment[] = []

  for (const action of proposedActions) {
    const profile = ACTION_REPAIR_PROFILES[action.actionId]
    if (!profile) continue

    const repairsInefficiencies: InefficiencyType[] = []
    let strongest: RepairStrength = 'NONE'

    for (const [type, strength] of Object.entries(profile.repairs)) {
      if (flagTypes.has(type as InefficiencyType)) {
        repairsInefficiencies.push(type as InefficiencyType)
        if (rankStrength(strength as RepairStrength) > rankStrength(strongest)) {
          strongest = strength as RepairStrength
        }
      }
    }

    results.push({
      actionId:              action.actionId,
      amountTRY:             action.amountTRY,
      repairStrength:        strongest,
      repairsInefficiencies,
      productivityNote:      profile.productivityNote,
    })
  }

  return results
}

function rankStrength(s: RepairStrength): number {
  const ranks: Record<RepairStrength, number> = {
    NONE: 0, WEAK: 1, MODERATE: 2, STRONG: 3, PRIMARY: 4,
  }
  return ranks[s]
}

// ─── REPAIR PRIORITY ──────────────────────────────────────────────────────────

export interface RepairPriorityArea {
  inefficiencyType:   InefficiencyType
  severity:           InefficiencySeverity
  priority:           'HIGH' | 'MEDIUM' | 'LOW'
  recommendedActions: string[]
  portfolioCoverage:  'ADDRESSED' | 'PARTIALLY_ADDRESSED' | 'NOT_ADDRESSED'
}

export function identifyRepairPriorities(
  flags:           InefficiencyFlag[],
  repairAssessments: ActionRepairAssessment[],
): RepairPriorityArea[] {
  const addressedTypes  = new Set<InefficiencyType>()
  const partiallyTypes  = new Set<InefficiencyType>()

  for (const repair of repairAssessments) {
    for (const type of repair.repairsInefficiencies) {
      if (repair.repairStrength === 'PRIMARY' || repair.repairStrength === 'STRONG') {
        addressedTypes.add(type)
      } else {
        partiallyTypes.add(type)
      }
    }
  }

  const areas: RepairPriorityArea[] = flags.map(flag => {
    const priority: RepairPriorityArea['priority'] =
      (flag.severity === 'CRITICAL' || flag.severity === 'SEVERE') ? 'HIGH'
      : flag.severity === 'MODERATE' ? 'MEDIUM'
      : 'LOW'

    const coverage: RepairPriorityArea['portfolioCoverage'] =
      addressedTypes.has(flag.type)  ? 'ADDRESSED'
      : partiallyTypes.has(flag.type) ? 'PARTIALLY_ADDRESSED'
      : 'NOT_ADDRESSED'

    return {
      inefficiencyType:   flag.type,
      severity:           flag.severity,
      priority,
      recommendedActions: flag.repairableByActions,
      portfolioCoverage:  coverage,
    }
  })

  return areas.sort((a, b) => {
    const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return order[a.priority] - order[b.priority]
  })
}

// ─── NARRATIVE ────────────────────────────────────────────────────────────────

export interface ProductivityNarrative {
  mainFinding:           string
  trappedAssetsAnalysis: string
  salesCarryAssessment:  string
  repairOutlook:         string
  bankerSummary:         string
}

export function buildProductivityNarrative(
  input:        ProductivityInput,
  metrics:      ProductivityMetrics,
  _components:  ComponentScores,
  score:        number,
  flags:        InefficiencyFlag[],
  repairs:      ActionRepairAssessment[],
  expectations: SectorProductivityExpectations,
): ProductivityNarrative {
  const scorePercent = (score * 100).toFixed(0)
  const sectorName   = getSectorTurkishName(input.sector)

  // Main finding
  const salesGap = metrics.salesToAssets / expectations.salesToAssets.expected
  let mainFinding: string
  if (salesGap < 0.3) {
    mainFinding =
      `Aktif büyüklüğü (${(input.totalAssets / 1e6).toFixed(0)}M TL) ile satış hacmi ` +
      `(${(input.netSales / 1e6).toFixed(0)}M TL) arasında ciddi uyumsuzluk var. ` +
      `Firma aktiflerinin sadece %${scorePercent}'si üretken.`
  } else if (salesGap < 0.6) {
    mainFinding =
      `Aktif büyüklüğü operasyon tarafından kısmen taşınıyor. Productivity skoru %${scorePercent}.`
  } else {
    mainFinding =
      `Aktif yapısı operasyonla genel olarak uyumlu. Productivity skoru %${scorePercent}.`
  }

  // Trapped assets
  const trapped = metrics.trappedAssetsShare
  const trappedAssetsAnalysis =
    `Stok, yarı mamul, verilen avans ve alacaklar aktifin %${(trapped * 100).toFixed(1)}'ini bağlıyor. ` +
    `${sectorName} sektör beklentisi: %${(expectations.trappedAssetsCritical * 100).toFixed(0)} kritik eşik.`

  // Sales carry
  const carry = metrics.salesToAssets
  const salesCarryAssessment =
    `Satış/aktif oranı ${(carry * 100).toFixed(1)}%. ` +
    `Sektör beklentisi ${(expectations.salesToAssets.expected * 100).toFixed(0)}%, ` +
    `kritik eşik ${(expectations.salesToAssets.critical * 100).toFixed(0)}%.`

  // Repair outlook
  const strongRepairs = repairs.filter(
    r => r.repairStrength === 'PRIMARY' || r.repairStrength === 'STRONG'
  )
  let repairOutlook: string
  if (strongRepairs.length === 0) {
    repairOutlook =
      'Önerilen portföyde aktif verimliliğini güçlü şekilde onaran aksiyon yok — portföy daha çok likidite/kaldıraç odaklı.'
  } else {
    const actionList = strongRepairs.map(r => r.actionId).join(', ')
    repairOutlook = `${strongRepairs.length} aksiyon aktif verimliliğini güçlü şekilde onarıyor: ${actionList}.`
  }

  // Banker summary
  const criticalFlags = flags.filter(
    f => f.severity === 'CRITICAL' || f.severity === 'SEVERE'
  ).length
  let bankerSummary: string
  if (score < 0.3) {
    bankerSummary =
      `Aktif verimliliği kritik — ${criticalFlags} ciddi kilitlenme tespit edildi. ` +
      `Rating iyileşmesi için aktif dönüşümü zorunlu, tek başına sermaye/likidite yetmez.`
  } else if (score < 0.5) {
    bankerSummary =
      `Aktif verimliliği zayıf. Portföyde operasyonel dönüşüm aksiyonları ` +
      `(satış büyümesi, stok nakde dönüşüm, YYİ hakediş tahsilatı) ağırlıklı olmalı.`
  } else if (score < 0.7) {
    bankerSummary =
      `Aktif verimliliği orta. Kısmi iyileştirme mümkün, operasyonel büyüme ile desteklenmeli.`
  } else {
    bankerSummary = `Aktif verimliliği güçlü. Operasyon aktif büyüklüğünü taşıyor.`
  }

  return {
    mainFinding,
    trappedAssetsAnalysis,
    salesCarryAssessment,
    repairOutlook,
    bankerSummary,
  }
}

function getSectorTurkishName(sector: SectorCode): string {
  const names: Record<SectorCode, string> = {
    CONSTRUCTION:  'İnşaat',
    MANUFACTURING: 'İmalat',
    TRADE:         'Toptan Ticaret',
    RETAIL:        'Perakende',
    SERVICES:      'Hizmet',
    IT:            'Bilişim',
  }
  return names[sector]
}

// ─── ANA API ──────────────────────────────────────────────────────────────────

export interface AssetProductivityResult {
  productivityScore:        number
  componentScores:          ComponentScores
  metrics:                  ProductivityMetrics
  inefficiencyFlags:        InefficiencyFlag[]
  actionRepairAssessment:   ActionRepairAssessment[]
  repairPriorityAreas:      RepairPriorityArea[]
  narrative:                ProductivityNarrative
  sectorExpectations:       SectorProductivityExpectations
}

export function analyzeAssetProductivity(
  input: ProductivityInput,
): AssetProductivityResult {
  const expectations = SECTOR_PRODUCTIVITY_EXPECTATIONS[input.sector]
  const metrics      = calculateProductivityMetrics(input)

  // salesCarryCoverage — sektör medyanına göre
  // 1.0 = sektör normu, <1.0 = altında, >1.0 = üstünde
  const expectedSales = input.totalAssets * expectations.salesToAssets.expected
  metrics.salesCarryCoverage = expectedSales > 0 ? input.netSales / expectedSales : 0

  const componentScores     = calculateComponentScores(metrics, expectations)
  const productivityScore   = calculateProductivityScore(componentScores)
  const inefficiencyFlags   = detectInefficiencies(metrics, expectations, input)

  const actionRepairAssessment = input.proposedActions
    ? assessActionRepairs(input.proposedActions, inefficiencyFlags)
    : []

  const repairPriorityAreas = identifyRepairPriorities(inefficiencyFlags, actionRepairAssessment)

  const narrative = buildProductivityNarrative(
    input, metrics, componentScores, productivityScore,
    inefficiencyFlags, actionRepairAssessment, expectations,
  )

  return {
    productivityScore,
    componentScores,
    metrics,
    inefficiencyFlags,
    actionRepairAssessment,
    repairPriorityAreas,
    narrative,
    sectorExpectations: expectations,
  }
}

/**
 * GELECEKTEKİ İYİLEŞTİRMELER (ChatGPT review önerileri):
 *
 * 1. NONLINEAR WORKING CAPITAL LOCK — workingCapitalLock formülü şu an lineer
 *    (1 - (lockRatio - 0.5)). Gerçekte kritik eşikten sonra hızla kötüleşen
 *    sigmoid/logistic bir yapı daha doğru. V3 sonrası iyileştirme.
 *
 * 2. FIXED ASSET SECTOR-AWARE THRESHOLD — fixedAssetToSales > 2.0 sektör bağımsız.
 *    Enerji, ağır sanayi, proje üretimi için farklı eşikler gerekir.
 *
 * 3. AMOUNT-SENSITIVE REPAIR STRENGTH — repairStrength şu an aksiyon miktarından
 *    bağımsız. 1M stok çözümü ile 100M stok çözümü aynı PRIMARY görünüyor.
 *    V3-10 orchestrator'da repair coverage ratio kullanılmalı.
 *
 * 4. PRODUCTIVE VS TRAPPED DECOMPOSITION — productiveAssetsShare = 1 - trapped
 *    biraz agresif. Bazı stoklar canlı, bazı alacaklar sağlıklı olabilir.
 *    V3 sonrası aktif kalite ayrıştırması.
 *
 * 5. PRODUCTIVITY TREND — Şu an snapshot. İleride geçen yılla karşılaştırma:
 *    "trapped assets büyüyor mu, aktif şişmesi artıyor mu?" gibi trend analizi.
 *
 * 6. OPERATING CASH FLOW ZORUNLULUĞU — Şu an opsiyonel; veri yoksa operating
 *    yield proxy kullanıyor. İleride V3 bilanço+gelir tablosu dışında nakit
 *    akış tablosu da ingestion edebilirse kalite artar.
 *
 * 7. SECTOR PRODUCTIVITY EXPECTATIONS CALIBRATION — SECTOR_PRODUCTIVITY_EXPECTATIONS
 *    şu an expert heuristic. İleride TCMB mikro veri setinden gerçek hesapla.
 *
 * 8. COMPONENT WEIGHTS — salesEfficiency 0.30, assetConversion 0.25 vb. statik.
 *    Sektöre göre değişmeli: IT'de operatingYield daha ağır, inşaatta
 *    workingCapitalLock daha kritik.
 *
 * 9. ACTION REPAIR PROFILES — 20 aksiyon için repair gücü hardcoded. İleride
 *    firma bazlı kalibrasyon — aynı aksiyon farklı firmada farklı onarım gücü.
 *
 * 10. INDUSTRY LIFECYCLE ADJUSTMENT — Büyüyen sektörde productivity beklentileri
 *     farklı, olgun sektörde farklı. Şu an tek seviye.
 *
 * 11. PEER GROUP COMPARISON — Sektör ortalaması yerine benzer büyüklükte peer
 *     firma grubuyla karşılaştırma.
 */
