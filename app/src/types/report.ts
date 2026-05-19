// ═══════════════════════════════════════════════════════════════════════
// FINRATE V2 RAPOR TİPLERİ
// Faz 7.3.54 — 15 sayfa (Sayfa 13 Makroekonomik kaldırıldı)
// Codex audit düzeltmeleri gömülü:
//   - financialScore / subjectiveScore → ratios.__financialScore / __subjectiveTotal
//   - SubjectiveInput → entityId @unique (analysisId değil)
//   - totalLiabilities hesaplanır (totalAssets - totalEquity)
//   - benchmark alan isimleri benchmarks.ts'e göre (receivablesDays, inventoryDays, vb.)
// ═══════════════════════════════════════════════════════════════════════

// ─── ANA REPORT DATA ────────────────────────────────────────────────────

export interface ReportData {
  // Sayfa 1 & 15 ortak
  reportNo: string          // "FNR-2024-A3F92"
  companyName: string
  vkn: string
  rating: string            // "BBB+"
  totalScore: number        // 74
  financialScore: number    // 52  (ratios.__financialScore'dan)
  subjectiveScore: number   // 22  (ratios.__subjectiveTotal'dan)
  analysisPeriod: string    // "2024 · Yıllık"
  reportDate: string        // "15.05.2026"
  validUntil: string        // "15.05.2027"

  // Sayfa 2 — Yönetici Özeti
  executive: ExecutiveSummary

  // Sayfa 3 — Firma & Sektör
  companyInfo: CompanyInfo

  // Sayfa 4 — Finansal Skor Detayı
  financialDetail: FinancialDetail

  // Sayfa 5 — Likidite & Borçlanma Oranları
  liquidityRatios: RatioRow[]

  // Sayfa 6 — Kârlılık & Faaliyet Oranları
  profitabilityRatios: RatioRow[]

  // Sayfa 7 — Trend Analizi
  trends: TrendData

  // Sayfa 8 — Bilanço Analizi
  balanceSheet: BalanceSheet

  // Sayfa 9 — Gelir Tablosu
  incomeStatement: IncomeStatement

  // Sayfa 10 — Nakit Akış & Çalışma Sermayesi
  cashFlow: CashFlowData

  // Sayfa 11 — Senaryo Analizi (opsiyonel — snapshot backend'de kontrol edilir)
  scenario?: ScenarioData

  // Sayfa 12+13 — Aksiyon Planı V3 (opsiyonel — snapshot backend'de kontrol edilir)
  actionPlan?: ActionPlanV3

  // Sayfa 13 — Subjektif Faktörler (orijinal Sayfa 14)
  subjective: SubjectiveData

  // Sayfa 14 — Metodoloji (statik, prop gerektirmez)
  // Sayfa 15 — Kapanış (üstteki ortak alanları kullanır)
}

// ─── YÖNETİCİ ÖZETİ ─────────────────────────────────────────────────────

export interface ExecutiveSummary {
  categories: {
    liquidity:     CategoryScore
    profitability: CategoryScore
    leverage:      CategoryScore
    activity:      CategoryScore
  }
  kpis: {
    netSales:              number
    netSalesYoY:           number | null   // oran: 0.257 = %25.7
    ebitda:                number
    ebitdaMargin:          number          // 0.138 = %13.8
    currentRatio:          number
    sectorCurrentRatio:    number
    debtToEquity:          number
    sectorDebtToEquity:    number
    interestCoverage:      number
    sectorInterestCoverage: number
    equity:                number
    equityYoY:             number | null
  }
  strengths:            string[]          // dinamik üretilen template metinler
  watchAreas:           string[]          // dinamik üretilen template metinler
  conclusion:           string            // genel değerlendirme metni
  riskClassification:   RiskClassification  // Ö9: Finrate Risk Klasmanı
  missingFields:        string[]            // Ö8: eksik finansal kalemler
}

export interface CategoryScore {
  score:          number   // 0–100
  referenceScore: number   // performans referansı (50 = nötr)
  weight:         number   // 0–1 (örn: 0.35 = %35)
}

// ─── RİSK KLASMANI (Ö9) ──────────────────────────────────────────────────────

export type RiskOverallLevel = 'Düşük' | 'Orta' | 'Yüksek' | 'Çok Yüksek'
export type RiskMetricStatus = 'Güçlü' | 'Orta' | 'Zayıf'

export interface RiskClassification {
  overallLevel: RiskOverallLevel
  overallColor: string
  metrics: Array<{
    label:  string
    status: RiskMetricStatus
    color:  string
  }>
}

// ─── FİRMA & SEKTÖR BİLGİSİ ─────────────────────────────────────────────

export interface CompanyInfo {
  vkn:         string
  sector:      string
  naceCode:    string         // naceMap'ten — örn: "C.28 — Makine İmalatı"
  entityType:  string         // "Anonim Şirket", "Limited Şirket" vb.
  foundedYear: number | null  // analysis.year - subj.companyAgeYears
  activityYears: number | null // analysis.year - foundedYear
  scale:       string         // "Orta Ölçekli KOBİ", "Büyük İşletme" vb.
  sectorBenchmarks: SectorBenchmarkRow[]
  sectorWeightProfile: {
    liquidity:     number   // 0.35
    profitability: number   // 0.20
    leverage:      number   // 0.30
    activity:      number   // 0.15
  }
}

export interface SectorBenchmarkRow {
  label:        string    // "Cari Oran"
  companyValue: string    // "1.82x"
  sectorValue:  string    // "1.73x"
}

// ─── FİNANSAL SKOR DETAYI ────────────────────────────────────────────────

export interface FinancialDetail {
  kpis: FinancialKpi[]
  categoryBars: CategoryBar[]
  strengths:   string[]
  watchAreas:  string[]
  conclusion:  string
}

export interface FinancialKpi {
  label: string
  value: string
  sub:   string    // örn: "+25.7% YoY"
  color?: string   // "#0284c7" gibi — opsiyonel vurgu
}

export interface CategoryBar {
  name:           string   // "Likidite"
  score:          number   // 0–100
  referenceScore: number   // performans referansı (50 = nötr)
  weight:         number   // 0–1
  fillColor:      string   // "linear-gradient(90deg,#0ea5e9,#2dd4bf)"
  subMetrics:     string   // "Cari, Hızlı, Nakit Oranı · NÇS/Aktif · CCC"
}

// ─── ORAN SATIRI ─────────────────────────────────────────────────────────

export interface RatioRow {
  group:        'Likidite' | 'Borçlanma' | 'Kârlılık' | 'Faaliyet'
  name:         string       // "Cari Oran"
  description?: string
  companyValue: string       // "1.82x" veya "%24.8"
  sectorValue:  string       // "1.73x" veya "—"
  barFill:      number       // 0–100, progress bar dolum yüzdesi
  sectorMark:   number | null // 0–100, sektör çentik pozisyonu (yoksa null)
  barColor:     string       // CSS gradient string
  status:       'iyi' | 'uyari' | 'risk'
}

// ─── TREND ANALİZİ ───────────────────────────────────────────────────────

export interface TrendData {
  // 4 mini bar chart için (Cari Oran, Net Kâr Marjı, Borç/ÖzK, Satış Büyümesi)
  charts: TrendChart[]
  // Alt büyüme tablosu
  growthTable: GrowthTableRow[]
}

export interface TrendChart {
  title:    string          // "Cari Oran Trendi"
  subtitle: string          // "Firma vs Sektör · 2021–2024"
  maxValue: number          // bar ölçeği için
  bars: TrendBar[]
  legendItems: { label: string; color: string }[]
}

export interface TrendBar {
  year:        number
  period:      string          // 'ANNUAL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
  isCurrent:   boolean        // en son yıl → koyu renk
  columns: {
    value:   number
    color:   string           // "#2dd4bf" veya "#94a3b8"
    label:   string           // "1.82" veya "6.8%"
    isMain:  boolean          // firma mı sektör mü
  }[]
}

export interface GrowthTableRow {
  label:   string         // "Net Satışlar"
  years:   number[]       // [2021, 2022, 2023, 2024]
  periods: string[]       // ['ANNUAL','ANNUAL','ANNUAL','Q1'] — years[i] ile index eşleşir
  isCurrentFlags: boolean[] // years[i] için isCurrent bayrağı
  values:  string[]       // ["₺18.2M", "₺28.4M", "₺41.6M", "₺52.3M"]
  growth4y: string | null // "+187%" veya null (veri yoksa)
  growthColor?: string    // "#2dd4bf" yeşil için
}

// ─── BİLANÇO ANALİZİ ─────────────────────────────────────────────────────

export interface BalanceSheet {
  years:    { year: number; period: string; isCurrent: boolean }[]
  items:    BalanceSheetItem[]
  totalAssets:       number      // son yıl
  totalLiabilities:  number      // hesaplanan: totalAssets - totalEquity
  equityRatio:       number      // totalEquity / totalAssets
  comment:           string      // template metin
}

export interface BalanceSheetItem {
  label:       string
  values:      (number | null)[]  // her yıl için (null = veri yok → "—")
  isTotal?:    boolean            // TOPLAM satırları → .tr CSS sınıfı
  isMain?:     boolean            // AKTİF/PASİF TOPLAMİ → .mr CSS sınıfı
}

// ─── GELİR TABLOSU ───────────────────────────────────────────────────────

export interface IncomeStatement {
  years:  { year: number; period: string; isCurrent: boolean }[]
  items:  IncomeStatementItem[]
}

export interface IncomeStatementItem {
  label:         string
  values:        (number | null)[]
  margin2024?:   number | null     // sadece son yıl marj yüzdesi (örn: 0.248)
  isTotal?:      boolean           // .tr CSS sınıfı
  isMain?:       boolean           // .mr CSS sınıfı (DÖNEM NET KÂRI)
}

// ─── NAKİT AKIŞ & ÇALIŞMA SERMAYESİ ─────────────────────────────────────

export interface CashFlowData {
  ccc: CccMetrics
  workingCapitalTable: WorkingCapitalRow[]
  positives:    string[]   // "✓ ..." satırları
  improvements: string[]   // "⚠ ..." satırları
  conclusion:   string     // ev bloğu metni
}

export interface CccMetrics {
  dso:       number        // Alacak tahsil süresi (gün)
  dio:       number        // Stok devir süresi (gün)
  dpo:       number        // Borç ödeme süresi (gün)
  ccc:       number        // = dso + dio - dpo
  sectorDso: number | null
  sectorDio: number | null
  sectorDpo: number | null
  sectorCcc: number | null
  comment:   string        // "CCC = 58 + 62 − 72 = 48 gün · ..."
}

export interface WorkingCapitalRow {
  label:  string
  values: (number | null)[]  // 2 yıl (önceki + son)
  years:  { year: number; period: string; isCurrent: boolean }[]
}

// ─── SENARYO ANALİZİ V3 ──────────────────────────────────────────────────────
// Legacy ScenarioData kaldırıldı (Codex S6=A)

export type IssueSeverity = 'KRİTİK' | 'CİDDİ' | 'ORTA' | 'HAFİF'

export type PerspectiveLevel = 'İyi' | 'Orta' | 'Zayıf' | 'Yüksek' | 'Düşük'

export interface RoadmapHero {
  currentRating:     string
  targetRating:      string
  reachable:         boolean
  reachabilityLabel: string
  confidence:        PerspectiveLevel
  summaryText:       string
}

export interface RoadmapIssue {
  title:          string
  severity:       IssueSeverity
  description:    string
  evidence:       string
  ifNotAddressed: string
}

export interface RoadmapConsultant {
  problem:           string
  coreIssue:         string
  shortTermPriority: string
  structuralNeed:    string
  finrateComment:    string
}

export interface RoadmapPerspective {
  likidite:         PerspectiveLevel
  yapisalRisk:      PerspectiveLevel
  aktifVerimliligi: PerspectiveLevel
  ratingGuveni:     PerspectiveLevel
}

export interface RoadmapIfNotDone {
  generalWarning: string
  issueRisks: Array<{
    title: string
    risk:  string
  }>
}

export interface ScenarioDataV3 {
  kind:        'v3-summary'
  hero:        RoadmapHero
  consultant:  RoadmapConsultant
  issues:      RoadmapIssue[]
  perspective: RoadmapPerspective
  ifNotDone:   RoadmapIfNotDone
}

// Legacy kaldırıldı (Codex S6=A)
export type ScenarioData = ScenarioDataV3

// ─── AKSİYON PLANI V3 ────────────────────────────────────────────────────

// ActionHorizon = string (V3 motoru 'Kısa Vade (0-6 ay)' gibi
// uzun string'ler döndürüyor — Codex teyitli)
export type ActionHorizon = string

// Bilanço hareketi — ASSET/LIABILITY/EQUITY hesaplar için
export interface AccountMovement {
  accountCode: string
  accountName: string
  currentTRY: number
  proposedTRY: number
  deltaTRY: number
  isIncrease: boolean
}

// Rasyo etkisi satırı
export interface RatioImpactRow {
  label: string
  value: string
  color: 'navy' | 'teal'
}

// Rasyo etkisi blok
export interface RatioImpact {
  title: string
  rows: RatioImpactRow[]
  formula: string
}

export interface ActionPlanItemV3 {
  rank: number
  actionName: string
  horizonLabel: ActionHorizon
  amountFormatted: string
  bankerPerspective: string
  accountMovements: AccountMovement[]
  ratioImpact?: RatioImpact
}

export interface ActionPlanV3 {
  kind: 'v3-actions'
  isFeasible: boolean
  pageTitle: string
  pageSubtitle: string
  actions: ActionPlanItemV3[]
  whyCapitalAloneNotEnough: string
}

// ─── SUBJEKTİF FAKTÖRLER ─────────────────────────────────────────────────

export interface SubjectiveData {
  totalScore: number         // 22
  maxScore:   number         // 30
  kkb:        SubjectiveCard
  bank:       SubjectiveCard
  corporate:  SubjectiveCard
  compliance: SubjectiveCard
}

export interface SubjectiveCard {
  title:    string           // "Kredi Sicili (KKB)"
  subtitle: string           // "Kredi Kayıt Bürosu verisi"
  score:    number           // 8
  maxScore: number           // 10
  percent:  number           // 80 (0-100)
  status:   string           // "İyi", "Orta-İyi", "Orta"
  statusColor: string        // "#22c55e", "#2dd4bf", "#f59e0b"
  barColor: string           // "linear-gradient(90deg,#2dd4bf,#0891b2)" veya warning
  rows: SubjectiveRow[]
  summary: string            // özet metin (template)
  summaryBg: string          // "#f0fdf4", "#fefce8"
  summaryColor: string       // "#16a34a", "#92400e"
  isEmpty: boolean           // SubjectiveInput hiç yoksa true
}

export interface SubjectiveRow {
  label:  string             // "Gecikme/Takip kaydı"
  value:  string             // "Yok", "Düzenli", "Temiz"
  color:  string             // "#22c55e", "#0a192f", "#f59e0b", "#ef4444"
}

// ─── YARDIMCI TİPLER ─────────────────────────────────────────────────────

/** Sayfa footer'ı için ortak veri */
export interface PageFooter {
  left:  string   // "Bu rapor gizlidir · Finrate Finansal Derecelendirme Platformu"
  right: string   // "finrate.com · FNR-2024-08841"
}

/** Sayfa header'ı için ortak veri */
export interface PageHeader {
  section:    string   // "Bölüm 01"
  title:      string   // "Yönetici Özeti"
  entityName: string   // "ATLAS MAKİNA SANAYİ A.Ş."
  pageNum:    string   // "Sayfa 2"
}
