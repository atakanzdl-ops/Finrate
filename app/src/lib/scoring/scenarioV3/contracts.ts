/**
 * SCENARIO ENGINE V3 — Economically-Aware Rating Engine
 *
 * V2'den farkı: Ratio optimization değil, economic reality okuma.
 *
 * Layer 1 — Ledger (multi-leg accounting transactions)
 * Layer 2 — Economic Reality (is this real improvement?)
 * Layer 3 — Ratios (measurement only, not decision maker)
 * Layer 4 — Sustainability (recurring vs one-off)
 * Layer 5 — Sector Intelligence
 * Layer 6 — Rating Reasoning (final narrative)
 */

import type { SectorBenchmark } from '../benchmarks'

// ============ RATIO TRANSPARENCY ============

export type AttributionSource =
  | 'TCMB_DIRECT'
  | 'FINRATE_ESTIMATE'
  | 'FALLBACK'

export interface RatioTransparency {
  currentBalance: number
  realisticTarget: number      // Math.max(currentBalance - capped, 0)
  sectorMedian: number
  capPercent: number

  formula: {
    targetLabel: string         // 'Hedef Alacak'
    basisLabel: string          // 'Net Satış'
    basisValue: number
    targetDays: number
    periodDays: number
  }

  attribution: {
    sourceType: AttributionSource
    sectorLabel: string         // 'İnşaat'
    year: number
  }

  method: 'period-end-balance'
}

// ============ TEMEL TANIMLAR ============

export type SectorCode =
  | 'CONSTRUCTION'
  | 'MANUFACTURING'
  | 'TRADE'
  | 'RETAIL'
  | 'SERVICES'
  | 'IT'

export type HorizonKey = 'short' | 'medium' | 'long'

export type ActionFamily =
  | 'WC_COMPOSITION'      // Çalışma sermayesi (A05/A06/A07 gibi)
  | 'DEBT_STRUCTURE'      // Borç yapısı (A01/A02/A03 gibi)
  | 'EQUITY_PNL'          // Özkaynak/kârlılık (A10/A11/A12 gibi)
  | 'TAX_QUALITY'         // Vergi/KKEG (A17 gibi)
  | 'INDUSTRY_SPECIFIC'   // Sektöre özel (A15 YYİ gibi)

// ============ LAYER 1 — LEDGER ============

/**
 * Tek bir muhasebe fişi bacağı.
 * Çift taraflı kayıt: her transaction en az 1 debit + 1 credit.
 */
export interface AccountingLeg {
  accountCode: string      // TDHP kodu: "102", "500", "340" vb.
  accountName?: string     // Okunabilirlik için
  side: 'DEBIT' | 'CREDIT'
  amount: number           // TL cinsinden pozitif tutar
  description?: string     // "Banka hesabına nakit girişi"
}

/**
 * Bir aksiyonu oluşturan muhasebe hareketi.
 * Birden fazla leg içerebilir (çok ayaklı fiş).
 */
export interface AccountingTransaction {
  transactionId: string
  description: string
  legs: AccountingLeg[]    // debit toplamı = credit toplamı olmalı
  semanticType: SemanticType
  timestamp?: 'T0' | 'T30' | 'T90' | 'T180' | 'T365'  // zamanlama
}

/**
 * Muhasebe hareketinin ekonomik anlamı.
 * Rating motoru bu tipe göre kalite katsayısı uygular.
 */
export type SemanticType =
  | 'CASH_INFLOW'              // Gerçek nakit giriş (tahsilat, sermaye, satış)
  | 'CASH_OUTFLOW'             // Gerçek nakit çıkış (borç ödeme)
  | 'CASH_EQUITY'              // Nakit sermaye artırımı (en kaliteli)
  | 'NON_CASH_EQUITY'          // 331 → 500 gibi (sermaye artar ama nakit yok)
  | 'DEBT_RECLASSIFICATION'    // KV → UV (matematiksel iyileştirme, ekonomik değer zayıf)
  | 'DEBT_EXTENSION'           // Vade uzatma (geçici rahatlama)
  | 'DEBT_REPAYMENT'           // Gerçek borç ödeme (nakit ile)
  | 'DEBT_TO_EQUITY_SWAP'      // Ortak borcu sermayeye çevirme
  | 'INVENTORY_MONETIZATION'   // Stok → nakit (gerçek satış)
  | 'INVENTORY_RECLASS'        // Stok içi transfer (kalite düşük)
  | 'RECEIVABLE_COLLECTION'    // Alacak → nakit (gerçek)
  | 'PREPAID_RELEASE'          // Peşin gider çözülmesi
  | 'OPERATIONAL_REVENUE'      // Gerçek satış (recurring)
  | 'OPERATIONAL_MARGIN'       // Brüt kâr artışı
  | 'OPEX_REDUCTION'           // Gider düşürme
  | 'FINANCE_COST_REDUCTION'   // Finansman gideri azaltma
  | 'RETAINED_EARNINGS'        // Kâr tutma
  | 'ASSET_DISPOSAL'           // Atıl varlık satışı
  | 'SALE_LEASEBACK'           // Sat-geri kirala
  | 'ADVANCE_TO_REVENUE'       // Alınan avansı hasılata tanıma (teslim)
  | 'INFLATION_GAIN'           // Enflasyon düzeltmesi (neredeyse sıfır kalite)
  | 'EXTRAORDINARY_INCOME'     // Olağandışı gelir (düşük kalite)
  | 'KKEG_CLEANUP'             // Vergi dışı gider temizliği
  | 'YYI_MONETIZATION'         // Yıllara yaygın inşaat nakde dönme
  | 'ACCOUNTING_RECLASS'       // Saf reclass (gerçek ekonomik etki yok)

// ============ LAYER 2 — ECONOMIC REALITY ============

/**
 * Aksiyonun ekonomik gerçekliği.
 * "Bu hareket şirketi gerçekten güçlendiriyor mu?"
 */
export interface EconomicReality {
  /** Gerçek nakit girişi yarattı mı? */
  createsRealCash: boolean

  /** Operasyonel kapasiteyi artırıyor mu? */
  strengthensOperations: boolean

  /** Bilanço "gerçek" büyüyor mu (sadece reclass değil mi)? */
  realBalanceSheetGrowth: boolean

  /** Risk profili iyileşti mi? */
  reducesRisk: boolean

  /** Banka kredi komitesi perspektifi */
  creditCommitteeView: 'positive' | 'neutral' | 'skeptical' | 'negative'

  /** Gerekçe */
  reasoning: string
}

// ============ LAYER 3 — RATIOS (sadece ölçüm) ============

/**
 * Rasyo değişimleri — Layer 3.
 * V2'den farkı: Karar mekanizması değil, sadece ölçüm.
 */
export interface RatioSnapshot {
  currentRatio: number
  quickRatio: number
  cashRatio: number
  equityRatio: number
  debtToEquity: number
  interestCoverage: number
  // Asset productivity rasyoları (Layer 5 için)
  assetTurnover: number        // sales / assets
  inventoryToAssets: number
  operatingMargin: number      // operating profit / revenue
  roa: number                  // net income / assets
}

// ============ LAYER 4 — SUSTAINABILITY ============

/**
 * Sürdürülebilirlik etiketi.
 * Recurring gelir/aksiyon daha kaliteli sayılır.
 */
export type Sustainability =
  | 'RECURRING'        // Devamlı (operasyonel satış, sermaye)
  | 'SEMI_RECURRING'   // Kısmen devamlı
  | 'ONE_OFF'          // Tek seferlik (atıl varlık satışı)
  | 'NON_RECURRING'    // Olağandışı (enflasyon kaybı, olağandışı gelir)
  | 'ACCOUNTING_ONLY'  // Sadece muhasebe (reclass, vade uzatma)

/**
 * Hangi TDHP hesap kodları hangi sustainability'ye denk gelir?
 * (Gelir tablosu için özellikle önemli)
 */
export const ACCOUNT_SUSTAINABILITY_MAP: Record<string, Sustainability> = {
  // Recurring — ana faaliyet
  '600': 'RECURRING',  // Yurtiçi Satışlar
  '601': 'RECURRING',  // Yurtdışı Satışlar

  // Semi-recurring — olağan ama ana değil
  '640': 'SEMI_RECURRING',  // İştiraklerden Temettü
  '642': 'SEMI_RECURRING',  // Faiz Gelirleri
  '649': 'SEMI_RECURRING',  // Diğer Olağan Gelir

  // Non-recurring — olağandışı
  '671': 'NON_RECURRING',  // Önceki Dönem Geliri
  '679': 'NON_RECURRING',  // Diğer Olağandışı Gelir

  // Inflation accounting
  '655': 'NON_RECURRING',  // Enflasyon Düzeltme Kârı (koda göre değişir)
  '656': 'NON_RECURRING',
}

// ============ LAYER 5 — SECTOR INTELLIGENCE ============

/**
 * Sektörün kendine özgü finansal karakteristikleri.
 * Aynı rakam bir sektörde alarm, başka sektörde normal olabilir.
 */
export interface SectorProfile {
  sectorCode: SectorCode

  /** Tipik rasyolar (sektör medyanı) */
  typicalRatios: {
    currentRatio: { min: number; median: number; max: number }
    equityRatio: { min: number; median: number; max: number }
    debtToEquity: { min: number; median: number; max: number }
    assetTurnover: { min: number; median: number; max: number }
    operatingMargin: { min: number; median: number; max: number }
  }

  /** Sektörde "normal" olan bilanço özellikleri */
  normalCharacteristics: {
    highAdvancesReceived?: boolean      // İnşaat: 202M alınan avans normal
    longWorkInProgress?: boolean        // İnşaat: YYİ (350-358) normal
    highInventoryTurnover?: boolean     // Perakende
    lowPhysicalAssets?: boolean         // Bilişim
    [key: string]: boolean | undefined
  }

  /** Bu sektörde hangi aksiyonlar anlamlı, hangisi değil? */
  actionApplicability: Record<string, 'primary' | 'applicable' | 'not_applicable'>
}

// ============ LAYER 6 — RATING REASONING ============

/**
 * Son katman: rating kararının açıklaması.
 * Sadece sayı değil, CFO ve bankacıya anlatılabilir gerekçe.
 */
export interface RatingReasoning {
  /** Öncesi ve sonrası skor */
  scoreBefore: number
  scoreAfter: number

  /** Rating etiketleri */
  ratingBefore: string
  ratingAfter: string

  /** Kalite ağırlıklı etki (raw delta değil) */
  qualityAdjustedDelta: number

  /** Sürdürülebilirlik etiketi (bu yol haritasının kalitesi) */
  portfolioSustainability: Sustainability

  /** Bankacı perspektifi */
  creditCommitteeNarrative: string

  /** Güçlü yönler */
  strengths: string[]

  /** Zayıf yönler / riskler */
  weaknesses: string[]

  /** Gerçekçilik notu — motor kendi kendini eleştirir */
  realityCheck: string
}

// ============ FIRM CONTEXT (minimal tip — circular import önleme) ============

/**
 * engineV3.ts içindeki FirmContext'in contracts.ts'e taşınan minimal formu.
 * computeAmount fonksiyonunun imzasında parametre tipi olarak kullanılır.
 *
 * NOT: engineV3.ts'deki tam FirmContext buradan EXTEND etmez (circular import
 * riski), ancak aynı alanları içerir. İki tip arası uyumu TypeScript structural
 * typing garantiler.
 */
export interface FirmContext {
  sector:            SectorCode
  /** TDHP hesap kodu → tutar (TL) */
  accountBalances:   Record<string, number>
  totalAssets:       number
  totalEquity:       number
  totalRevenue:      number
  netIncome:         number
  netSales:          number
  operatingProfit:   number
  grossProfit:       number
  interestExpense:   number
  operatingCashFlow: number | null
  /** Finansal dönem tipi — computeAmount period-day hesabı için */
  period?:           string
}

// ============ ACTION TEMPLATE V3 ============

/**
 * V3 aksiyon şablonu.
 * V2'den farkları:
 * - sourceGroup/targetGroup YOK — yerine AccountingTransaction[]
 * - qualityCoefficient var
 * - sustainability var
 * - semanticType var
 * - sectorCompatibility detaylı
 * - repeatDecay var
 */
export interface ActionTemplateV3 {
  id: string                     // "A01_ST_FIN_DEBT_TO_LT" veya "A15_YYI_TO_CASH"
  name: string                   // Türkçe ad
  family: ActionFamily
  semanticType: SemanticType

  /** Muhasebe fişi(leri) — aksiyon uygulandığında oluşacak transaction'lar */
  buildTransactions: (context: ActionBuildContext) => AccountingTransaction[]

  /** Hangi ufuklarda geçerli */
  horizons: HorizonKey[]

  /** Precondition — bu aksiyon ne zaman uygulanabilir */
  preconditions: {
    requiredAccountCodes?: string[]        // Bu hesapların sıfırdan büyük olması gerekli
    minSourceAmountTRY?: number            // Minimum kaynak tutar
    sectorMustInclude?: SectorCode[]       // Sadece bu sektörlerde
    sectorMustExclude?: SectorCode[]       // Bu sektörlerde YOK
    customCheck?: (analysis: unknown) => { pass: boolean; reason?: string }
  }

  /** Kalite katsayısı (0-1, 1 en kaliteli) */
  qualityCoefficient: number

  /** Sürdürülebilirlik etiketi */
  sustainability: Sustainability

  /** Tekrar kullanım cezası (aynı aksiyon birden fazla kez önerilirse) */
  repeatDecay: {
    first: number      // 1.00
    second: number     // 0.65
    third: number      // 0.35
    maxRepeats: number // 3
  }

  /** Aksiyon tutarı önerisi */
  suggestedAmount: {
    basis: 'source_account' | 'target_group' | 'assets' | 'revenue' | 'equity'
    minPctOfBasis: number
    typicalPctOfBasis: number
    maxPctOfBasis: number
    absoluteMinTRY: number
    absoluteMaxTRY?: number
  }

  /** Sektör uyumluluğu */
  sectorCompatibility: Record<SectorCode, 'primary' | 'applicable' | 'not_applicable'>

  /** Ekonomik etki tahmini */
  expectedEconomicImpact: {
    createsRealCash: boolean
    strengthensOperations: boolean
    realBalanceSheetGrowth: boolean
    reducesRisk: boolean
  }

  /** CFO/bankacı için gerekçe */
  description: string
  cfoRationale: string           // Neden bu aksiyonu önerdik?
  bankerPerspective: string      // Banka bunu nasıl değerlendirir?

  /**
   * Opsiyonel rasyo-tabanlı tutar override.
   * Tanımlanırsa engine bu fonksiyonu çağırarak aksiyon tutarını üretir.
   * null dönerse engine eski yüzde mantığına fallback yapar.
   * Henüz hiçbir aksiyonda kullanılmıyor — Faz 4'te A05 pilotunda devreye girer.
   */
  computeAmount?: (ctx: FirmContext) => number | null

  /**
   * Opsiyonel TCMB benchmark hedef metadata.
   * UI transparency bloğunda "Hedef rasyo X gün, kaynak Y" gösterimi için.
   */
  targetRatio?: {
    /** İnsan-okunur metrik adı: 'DSO', 'DIO', 'GROSS_MARGIN' */
    metric: string
    /** benchmarks.ts SectorBenchmark içindeki alan adı */
    benchmarkField: keyof SectorBenchmark
    /** Hangi gelir/aktif kalemine oranlanacak */
    basis: 'netSales' | 'cogs' | 'totalAssets'
    /** TCMB hedef gün sayısı */
    targetDays?: number
    /** Benchmark bulunamazsa kullanılacak default */
    fallback?: number
    /** Veri güvenilirliği */
    reliability?: 'TCMB_DIRECT' | 'FINRATE_ESTIMATE'
  }
}

/**
 * Aksiyon yapısı kurulurken kullanılan context.
 * Motor buildTransactions'a bu objeyi verir.
 */
export interface ActionBuildContext {
  sector: SectorCode
  horizon: HorizonKey
  analysis: unknown              // Layer 1'de bilanço durumu (V3 analyzer tipi gelince daraltılacak)
  amount: number                 // Aksiyon tutarı (TL)
  previousActions: string[]      // Aynı scenario'da önceki aksiyonların id'leri
}

// ============ ENGINE OUTPUT ============

export interface ActionEffectV3 {
  actionId: string
  actionName: string
  transactions: AccountingTransaction[]
  amountApplied: number

  /** Layer 2 — ekonomik gerçeklik */
  economicReality: EconomicReality

  /** Layer 3 — rasyo etkileri */
  ratiosBefore: RatioSnapshot
  ratiosAfter: RatioSnapshot

  /** Layer 4 — sürdürülebilirlik */
  sustainability: Sustainability

  /** Kalite katsayısı uygulandıktan sonra efektif skor etkisi */
  rawScoreDelta: number
  qualityAdjustedScoreDelta: number

  /** Eligibility bilgileri */
  status: 'SELECTED' | 'ELIGIBLE' | 'REJECTED' | 'NOT_EVALUABLE'
  rejectionReasons: string[]
}

export interface ScenarioV3Output {
  horizon: HorizonKey
  horizonLabel: string

  scoreBefore: number
  scoreAfter: number
  ratingBefore: string
  ratingAfter: string

  actions: ActionEffectV3[]

  /** Layer 6 — rating reasoning */
  reasoning: RatingReasoning

  /** Tüm aksiyonların eligibility raporu */
  eligibilityReport: ActionEffectV3[]

  /** Motor stop gerekçesi */
  stopReason: string
}

export interface EngineV3Output {
  scenarios: ScenarioV3Output[]
  initialScore: number
  initialRating: string
  targetScore: number
  targetRating: string
  sector: SectorCode
  sectorProfile: SectorProfile

  /** Motor meta bilgileri (debug) */
  engineVersion: 'v3'
  generatedAt: string
}

// ============ QUALITY COEFFICIENT LOOKUP ============

/**
 * Semantic type'a göre temel kalite katsayısı.
 * ActionTemplate kendi qualityCoefficient'ini override edebilir.
 */
export const SEMANTIC_QUALITY_MAP: Record<SemanticType, number> = {
  CASH_EQUITY: 1.00,               // Nakit sermaye artırımı — en güçlü
  OPERATIONAL_REVENUE: 0.95,       // Gerçek satış artışı
  OPERATIONAL_MARGIN: 0.90,        // Brüt marj iyileşmesi
  RECEIVABLE_COLLECTION: 0.85,     // Alacak tahsili (gerçek nakit)
  INVENTORY_MONETIZATION: 0.85,    // Stok → nakit
  ASSET_DISPOSAL: 0.75,            // Atıl varlık satışı (one-off)
  PREPAID_RELEASE: 0.70,           // Peşin gider çözülmesi
  OPEX_REDUCTION: 0.70,            // Gider düşürme
  FINANCE_COST_REDUCTION: 0.70,    // Finansman gideri
  ADVANCE_TO_REVENUE: 0.75,        // Avans → gelir (proje teslim)
  RETAINED_EARNINGS: 0.65,         // Kâr tutma
  CASH_INFLOW: 0.80,
  CASH_OUTFLOW: 0.60,              // Borç ödeme (gerçek ama nakdi azaltır)
  DEBT_REPAYMENT: 0.65,
  SALE_LEASEBACK: 0.50,            // Varlık satıp kiralamak (zayıf sinyal)
  DEBT_TO_EQUITY_SWAP: 0.40,       // Ortak borcu sermayeye (muhasebe)
  DEBT_RECLASSIFICATION: 0.30,     // KV → UV (vade uzatma)
  DEBT_EXTENSION: 0.25,            // Vade uzatma
  NON_CASH_EQUITY: 0.35,           // Sermaye arttı ama nakit yok
  KKEG_CLEANUP: 0.45,              // Vergi kalitesi
  YYI_MONETIZATION: 0.80,          // YYİ gerçek nakde dönüyorsa güçlü
  ACCOUNTING_RECLASS: 0.15,        // Saf reclass
  INVENTORY_RECLASS: 0.20,         // Stok içi transfer
  INFLATION_GAIN: 0.10,            // Neredeyse değersiz
  EXTRAORDINARY_INCOME: 0.15,      // Olağandışı
}

// ============ SUSTAINABILITY QUALITY MAP ============

export const SUSTAINABILITY_MULTIPLIER: Record<Sustainability, number> = {
  RECURRING: 1.00,
  SEMI_RECURRING: 0.80,
  ONE_OFF: 0.50,
  NON_RECURRING: 0.30,
  ACCOUNTING_ONLY: 0.15,
}

// ============ REPEAT DECAY DEFAULTS ============

export const DEFAULT_REPEAT_DECAY = {
  first: 1.00,
  second: 0.65,
  third: 0.35,
  maxRepeats: 3,
}

// ============ MATERIALITY THRESHOLDS ============

/**
 * Mutlak ciddiyet filtresi.
 * Aktif büyüklüğüne göre minimum anlamlı tutar.
 */
export interface MaterialityThreshold {
  minAmountPctOfAssets: number
  minAbsoluteAmountTRY: number
  minScoreDelta: number
}

export const MATERIALITY_BY_HORIZON: Record<HorizonKey, MaterialityThreshold> = {
  short: {
    minAmountPctOfAssets: 0.003,    // %0.3 (Acil'de daha küçük kabul edilebilir)
    minAbsoluteAmountTRY: 1_500_000,
    minScoreDelta: 0.5,
  },
  medium: {
    minAmountPctOfAssets: 0.004,
    minAbsoluteAmountTRY: 2_500_000,
    minScoreDelta: 0.8,
  },
  long: {
    minAmountPctOfAssets: 0.006,
    minAbsoluteAmountTRY: 4_000_000,
    minScoreDelta: 1.2,
  },
}

// ============ MULTI-SENARYO MOTORU — SKOR KONTRATLARI (FAZ 1) ============
// Bu tipler Faz 2+'de tüketilecek. Mevcut kod etkilenmez.

// ============ FAZ 5.1 — MULTI-SCENARIO GENERATOR TİPLERİ ============

import type { SupportedActionId } from '../actionEffects'
import type { ScoreCategory } from '../scoreImpactProfile'
import type { ScoreAttribution } from '../scoreAttribution'
import type { EligibilityRule } from '../sectorStrategy/eligibilityMatrix'
import type { ExpectedSpillover } from '../sectorStrategy/expectedSpillovers'
import type { ValidationResult } from '../sectorStrategy/entityValidation'

export type { SupportedActionId as ActionId }

export interface AppliedAction {
  actionId:          SupportedActionId
  narrativeCategory: ScoreCategory
  expectedSpillover?: ExpectedSpillover  // SADECE rapor için
  attribution:       ScoreAttribution
  eligibility:       EligibilityRule
}

/**
 * Bir senaryonun skor durumu — before veya after.
 * objective: ObjectiveScoreBreakdown (flat: liquidity, profitability, leverage, activity, total)
 * combined: number (combineScores() çıktısı)
 */
export interface ScoreState {
  ratios:    unknown  // RatioResult
  objective: ObjectiveScoreBreakdown
  combined:  number   // combined score (0–100)
}

export interface ScenarioV3 {
  id:            string
  label:         string
  targetRating?: string
  targetReached: boolean
  actions:       AppliedAction[]
  beforeState:   ScoreState
  afterState:    ScoreState
  combinedDelta: number
  objectiveDelta: number
  rating: { before: string; after: string }
  warnings:      string[]
  strategyVersions: {
    narrative:   string
    eligibility: string
    threshold:   string
    spillover:   string
    validation:  string
  }
}

// Validation tipi re-export (test ve generator tarafından kullanılır)
export type { ValidationResult }

/**
 * Objektif skor: rasyolardan hesaplanan finansal skor (0–100).
 * calculateScore() tarafından üretilir. Aksiyonlar bunu doğrudan etkiler.
 */
export interface ObjectiveScoreBreakdown {
  liquidity:     number  // 0–100
  profitability: number  // 0–100
  leverage:      number  // 0–100
  activity:      number  // 0–100
  total:         number  // ağırlıklı toplam, 0–100
}

/**
 * Subjektif skor: mali müşavirin doldurduğu kart (0–30 puan).
 * 4 kategori: KKB, Banka İlişkileri, Kurumsal Yapı, Uyum & Risk.
 * Aksiyonlardan ETKİLENMEZ — sabit girdi.
 */
export interface SubjectiveScoreBreakdown {
  kkb:         number  // 0–10
  bankRelations: number  // 0–10
  corporate:   number  // 0–5
  compliance:  number  // 0–5
  total:       number  // 0–30
}

/**
 * Birleşik skor: rating eşiklerine karşılaştırılan değer.
 * Formül (gap hesabında): combinedScore = (objectiveScore × 0.70) + subjectiveTotal
 * Not: combineScores() ceiling/floor uyguladığı için bu formül
 * invertible gap hesabına özgüdür.
 */
export interface CombinedScore {
  objectiveScore:  number  // 0–100
  subjectiveTotal: number  // 0–30
  combined:        number  // 0–100, rating eşiği için kullanılan
  rating:          string  // 'AAA' | 'AA' | 'A' | ... | 'D'
}

/**
 * Hedef rating için boşluk hesabı.
 * Multi-senaryo motoru bunu kullanarak senaryolar üretir.
 *
 * Formül:
 *   combinedScore = (objectiveScore × 0.70) + subjectiveTotal
 *   requiredObjectiveScore = (targetCombinedScore − subjectiveTotal) / 0.70
 *   requiredObjectiveImprovement = requiredObjectiveScore − currentObjectiveScore
 */
export interface TargetGap {
  currentRating:  string
  targetRating:   string

  currentObjectiveScore:  number
  currentSubjectiveTotal: number
  currentCombinedScore:   number

  targetCombinedScore:            number  // hedef rating eşiği
  requiredObjectiveScore:         number  // hedef için gereken objektif skor
  requiredObjectiveImprovement:   number  // mevcut → hedef boşluk

  isReachable: boolean   // false: hedef gerçekçi değil
  reason?:     string    // isReachable false veya zaten üstündeyse açıklama
}
