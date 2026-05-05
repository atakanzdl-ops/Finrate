/**
 * DECISION LAYER (V3-10b) — BANKER DECISION ANSWER FORMATTER
 *
 * Bu dosya PURE FORMATTER'dir. Yeni hesaplama yapmaz.
 * engineV3.ts ciktisini UI-ready banker cevabina donusturur.
 *
 * SORUMLULUKLARI:
 *   - ExecutiveAnswer: Yonetici ozeti (rating gecisi + feasibility + guven)
 *   - ActionPlanRow[]: "Sirket ne yapmali?" - horizon bazli aksiyon plani
 *   - NotchPlan x2: 1 not ve 2 not iyilesme plani
 *   - AccountingImpactTable: Muhasebe etki tablosu (borclar/alacaklar)
 *   - WhyCapitalAloneNotEnough: "Sermaye yetmez" aciklamasi
 *   - TargetFeasibilityExplanation: Hedef ulasilabilirlik aciklamasi
 *   - IfNotDoneRisk: Yapilmazsa risk
 *   - UiReadyRows: Duz tablo satirlari (frontend render icin)
 *   - RejectedInsights: Neden reddedildi
 *   - ConsultantNarrative: CFO/banker dili (v4 yeni eklenti)
 *   - ComparisonWithV2: V2 vs V3 karsilastirma (opsiyonel)
 *
 * KRITIK KURALLAR:
 *   - leg.amount kullanilir (leg.amountTRY DEGIL — AccountingLeg interface)
 *   - ACTION_CATALOG_V3[id] kullanilir (Record, .find() degil)
 *   - dedupeActions: ayni actionId+amountTRY combination portfoyler arasi tekrar etmez
 *   - Yeni matematik/skor hesabi YAPILMAZ — sadece engineResult verisi formatlanir
 */

import type { AccountingLeg, DecisionInsight, BalanceRatioTransparency } from './contracts'
import type { ActualRatingValidation } from './postActionRating'
import { buildDiagnostics, type DiagnosticsPayload } from './instrumentation'
import {
  selectTargetPackage,
  type TargetPackageMeta,
} from './targetPackage'
import type {
  EngineResult,
  SelectedAction,
  FeasibilityAssessment,
} from './engineV3'
import { buildMaturityMismatchInsight } from './insightCatalog'
import { ACTION_CATALOG_V3 } from './actionCatalogV3'
import type { RatingGrade } from './ratingReasoning'
import {
  ACTION_CATEGORY_MAP,
  RATING_ORDER,
  ratingToIndex,
} from './ratingReasoning'
import { ceilingTypeToDisplay, confidenceToDisplay, formatCeilingDisplay } from '../displayMaps'
import type {
  CeilingConstraint,
  DriverGroup,
  MissedOpportunity,
  NotchScenario,
} from './ratingReasoning'
import {
  INEFFICIENCY_NARRATIVES,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  VISIBLE_SEVERITIES,
} from './inefficiencyNarratives'

// Unused import guard
void 0 as unknown as AccountingLeg
void 0 as unknown as FeasibilityAssessment

// ─── EXECUTIVE ANSWER ────────────────────────────────────────────────────────

export interface ExecutiveAnswer {
  /** Mevcut rating */
  currentRating: RatingGrade
  /** Istenen hedef */
  requestedTarget: RatingGrade
  /** Motor'un hesapladigi ulasilabilir hedef */
  achievableTarget: RatingGrade
  /** Hedef istenen ile ayni mi? */
  targetMatchesRequest: boolean
  /** Guven seviyesi */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  /** Guven modifier (0.25-1.0) */
  confidenceModifier: number
  /** Kac not kazanildi */
  notchesGained: number
  /** Ust satir baslik (UI heading) */
  headline: string
  /** Alt baslik / aciklama (UI subtitle) */
  subtitle: string
  /** Ozet bir-iki cumle (CFO icin) */
  executiveSummary: string
  /** Ceiling aktif mi */
  hasCeiling: boolean
  /** Ceiling aciklamasi */
  ceilingNote?: string
}

// ─── ACTION PLAN ROW ─────────────────────────────────────────────────────────

export type ActionHorizonLabel = 'Kısa Vade (0-6 ay)' | 'Orta Vade (6-18 ay)' | 'Uzun Vade (18-36 ay)'

export interface ActionPlanRow {
  rank: number
  actionId: string
  actionName: string
  horizon: 'short' | 'medium' | 'long'
  horizonLabel: ActionHorizonLabel
  amountTRY: number
  amountFormatted: string
  category: 'STRUCTURAL' | 'COSMETIC' | 'HYBRID'
  categoryLabel: string
  sustainability: string
  qualityScore: number
  estimatedNotchContribution: number
  /** Neden secildi */
  whySelected: string
  /** Muhasebe etkisi ozeti (tek cumle) */
  accountingEffect: string
  /** CFO rationale (action template'den) */
  cfoRationale: string
  /** Banker perspective (action template'den) */
  bankerPerspective: string
  /** UI transparency bloku — sadece computeAmount aktif aksiyonlarda dolu */
  ratioTransparency?: import('./contracts').RatioTransparency
}

// ─── NOTCH PLAN ──────────────────────────────────────────────────────────────

export interface NotchPlan {
  targetNotches: number
  targetRating: RatingGrade
  requiredActionIds: string[]
  requiredActionNames: string[]
  totalAmountTRY: number
  totalAmountFormatted: string
  isAchievable: boolean
  blockedBy?: string
  keyAction?: string
  narrative: string
  /** Engine'in notch scenario'sundan alınan raw veri */
  engineScenario: NotchScenario
}

// ─── ACCOUNTING IMPACT TABLE ─────────────────────────────────────────────────

export interface AccountingImpactRow {
  rank: number
  horizon: 'short' | 'medium' | 'long'
  actionId: string
  actionName: string
  transactionId: string
  transactionDescription: string
  legSide: 'DEBIT' | 'CREDIT'
  accountCode: string
  accountName: string
  amountTRY: number
  amountFormatted: string
  semanticType: string
}

// ─── UI READY ROW ─────────────────────────────────────────────────────────────

export interface UiReadyRow {
  id: string
  horizon: 'short' | 'medium' | 'long'
  horizonLabel: ActionHorizonLabel
  rank: number
  actionId: string
  actionName: string
  amountTRY: number
  amountFormatted: string
  category: string
  categoryLabel: string
  qualityScore: number
  notchContribution: number
  sustainability: string
  whySelected: string
  cfoRationale: string
}

// ─── REJECTED INSIGHT ────────────────────────────────────────────────────────

export interface RejectedInsight {
  actionId: string
  actionName: string
  reason: string
  /** UI'da gösterilecek kullanıcı dostu açıklama (raw reason yerine) */
  reasonDisplay?: string | string[]
  /** Bu aksiyon kaç farklı değerlendirmede reddedildi (dedupe sonrası) */
  rejectionCount?: number
  /** Ham engine gerekçeleri (debug için) */
  rawReasons?: string[]
  estimatedNotchImpact: number
  category: string
  isFromMissedOpportunities: boolean
}

// ─── CONSULTANT NARRATIVE ─────────────────────────────────────────────────────

export interface ConsultantNarrative {
  /** "Şirketin temel sorunu nedir?" — kısa problem tanımı */
  problem: string
  /** "Neden bu rating seviyesindesiniz?" — kök neden */
  coreIssue: string
  /** "İlk 6 ayda ne yapmalısınız?" — acil adımlar */
  shortTermPriority: string
  /** "Kalıcı iyileşme için ne lazım?" — yapısal dönüşüm */
  structuralNeed: string
  /** "Finrate profesyonel değerlendirmesi" — şirket odaklı perspektif */
  bankerView: string
}

// ─── COMPARISON WITH V2 ──────────────────────────────────────────────────────

export interface ComparisonWithV2 {
  v2ActionCount: number
  v3ActionCount: number
  /** V3'te olup V2'de olmayan aksiyonlar */
  newActionsInV3: string[]
  /** V2'de olup V3'te olmayan aksiyonlar */
  removedFromV2: string[]
  /** V3'ün confidence'i V2'den yüksek mi? */
  v3HigherConfidence: boolean
  /** Fark açıklaması */
  diffNote: string
}

// ─── DATA QUALITY WARNING ─────────────────────────────────────────────────────

/** PATCH 1: Veri kalitesi uyarisi.
 *  Mizan az hesap iceriginde engine portfoy uretemiyor olabilir.
 *  UI bu uyariyi kirmizi banner olarak gostermeli.
 */
export interface DataQualityWarning {
  hasLimitedData:           boolean
  accountCount:             number
  rejectedCandidatesCount:  number
  portfolioSize:            number
  /** Kullaniciya gosterilecek kisa mesaj */
  message:                  string
  /** Nasil iyilestirilebilir */
  recommendation:           string
}

// ─── MAIN OUTPUT ─────────────────────────────────────────────────────────────

export interface DecisionAnswer {
  executiveAnswer: ExecutiveAnswer
  whatCompanyShouldDo: ActionPlanRow[]
  oneNotchPlan: NotchPlan
  twoNotchPlan: NotchPlan
  accountingImpactTable: AccountingImpactRow[]
  /** PATCH 2: actionId → { debits, credits } gruplu muhasebe arama tablosu */
  accountingLegsByAction: Record<string, { debits: AccountingImpactRow[]; credits: AccountingImpactRow[] }>
  whyCapitalAloneIsNotEnough: string
  targetFeasibilityExplanation: string
  ifNotDoneRisk: string
  uiReadyRows: UiReadyRow[]
  rejectedInsights: RejectedInsight[]
  consultantNarrative: ConsultantNarrative
  comparisonWithV2?: ComparisonWithV2
  /** PATCH 1: Veri kalitesi uyarisi — sparse mizan durumunda dolu */
  dataQualityWarning?: DataQualityWarning
  /** Faz 7.3.7: Yapısal risk uyarı kartları (aksiyon değil) */
  riskInsights: DecisionInsight[]
  /** Faz 7.3.8a: Gerçek post-action rating doğrulaması (opsiyonel) */
  actualRatingValidation?: ActualRatingValidation | null
  /** Faz 7.3.8d: Hedef rating'e göre filtreleme meta verisi (opsiyonel) */
  targetPackageMeta?: TargetPackageMeta
  /**
   * Faz 7.3.19: Engine'in seçtiği tam portföy aksiyon sayısı (targetPackage filtresi öncesi).
   * UI'da "X seçilen, Y seçilmeyen" ayrımı için kullanılır.
   */
  enginePortfolioCount: number
  /**
   * Faz 7.3.19: Engine tarafından reddedilen (portföye alınmayan) benzersiz aksiyon sayısı.
   * rejectedInsights.length ile eşdeğerdir; UI'da kolaylık için açık alan.
   */
  rejectedInsightCount: number
  /**
   * Faz 7.3.38: Opsiyonel observability payload — engine enstrümantasyon verisi.
   * route.ts'te ?diagnostics=1 flag ile response'a eklenir. Üretimde gizlidir.
   */
  diagnostics?: DiagnosticsPayload
}

// ─── TARGET PACKAGE CONTEXT (Faz 7.3.8d) ─────────────────────────────────────

/**
 * Faz 7.3.8d: selectTargetPackage'i çalıştırmak için route.ts'in
 * sağladığı bağlam. Yokluğunda filtreleme uygulanmaz, davranış geriye uyumlu.
 */
export interface TargetPackageContext {
  /** Firma sektörü — ham string (score.ts'e iletilir) */
  sector:                string
  /** Subjektif puan — sabit tutulur */
  subjectiveTotal:       number
  /** Mevcut objektif skor */
  currentObjectiveScore: number
  /** Mevcut kombine skor */
  currentCombinedScore:  number
  /** Mevcut gerçek rating (legacy notch'lu kabul edilir) */
  currentActualRating:   string
  /**
   * Faz 7.3.19: Erken çıkış kararı için kullanılan rating kaynağı (opsiyonel).
   * route.ts'den engineResult.currentRating olarak geçirilmeli.
   * selectTargetPackage'e doğrudan iletilir.
   */
  decisionCurrentRating?: string
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// ─── FAZ 7.3.13: INEFFICIENCY ENRICHMENT HELPERS ─────────────────────────────

type InefficiencyFlagLite = { type: string; severity: string; description: string }

/** Severity sıralama yardımcısı — bilinmeyen seviyeler sona gider */
function severityRank(sev: string): number {
  const idx = (SEVERITY_ORDER as readonly string[]).indexOf(sev)
  return idx === -1 ? 99 : idx
}

/**
 * "Temel Problem" için görünür (MODERATE+) verimsizlik bloğu üretir.
 * Sonuç string, `problem` prefix'ine eklenir.
 * Hiç visible flag yoksa null döner → çağıran fallback uygular.
 * @public — decisionLayer.test.ts tarafından doğrudan test edilir
 */
export function buildProblemInefficiencyBlock(
  flags: ReadonlyArray<InefficiencyFlagLite>,
): string | null {
  const visible = [...flags]
    .filter(f => (VISIBLE_SEVERITIES as ReadonlyArray<string>).includes(f.severity))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))

  if (visible.length === 0) return null

  const lines = visible
    .map(f => {
      const narr = INEFFICIENCY_NARRATIVES[f.type as keyof typeof INEFFICIENCY_NARRATIVES]
      if (!narr) return null
      const lbl = SEVERITY_LABELS[f.severity as keyof typeof SEVERITY_LABELS] ?? f.severity
      return `• ${narr.title} (${lbl})\n  ${narr.description}\n  Kanıt: ${f.description}`
    })
    .filter((l): l is string => l !== null)
    .join('\n\n')

  return `\n\nTespit edilen yapısal sorunlar:\n\n${lines}`
}

/**
 * "Aksiyon Alınmazsa" için görünür verimsizlik bloğu üretir.
 * Hiç visible flag yoksa null döner → çağıran drivers.negative fallback uygular.
 * @public — decisionLayer.test.ts tarafından doğrudan test edilir
 */
export function buildIfNotDoneInefficiencyBlock(
  flags: ReadonlyArray<InefficiencyFlagLite>,
): string | null {
  const visible = [...flags]
    .filter(f => (VISIBLE_SEVERITIES as ReadonlyArray<string>).includes(f.severity))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))

  if (visible.length === 0) return null

  const lines = visible
    .map(f => {
      const narr = INEFFICIENCY_NARRATIVES[f.type as keyof typeof INEFFICIENCY_NARRATIVES]
      if (!narr) return null
      return `• ${narr.title}: ${narr.ifNotAddressed}`
    })
    .filter((l): l is string => l !== null)
    .join('\n')

  return `Bu yapısal sorunlar çözülmezse:\n\n${lines}`
}

// ─── TDHP GRUP ADLARI ─────────────────────────────────────────────────────────

const TDHP_GROUP_NAMES: Record<string, string> = {
  '10': 'Hazır Değerler',
  '12': 'Ticari Alacaklar',
  '15': 'Stoklar',
  '18': 'Gelecek Aylara Ait Giderler',
  '25': 'Maddi Duran Varlıklar',
  '28': 'Birikmiş Amortismanlar',
  '30': 'Mali Borçlar',
  '32': 'Ticari Borçlar',
  '33': 'Diğer Borçlar',
  '34': 'Alınan Avanslar',
  '35': 'Borç Senetleri',
  '50': 'Ödenmiş Sermaye',
  '59': 'Dönem Net Kârı/Zararı',
  '60': 'Brüt Satışlar',
  '66': 'Finansman Giderleri',
  '69': 'Dönem Kârı/Zararı',
  '78': 'Gider Çeşitleri',
}

function formatTRY(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `₺${(amount / 1_000_000_000).toFixed(1)} Mrd`
  }
  if (amount >= 1_000_000) {
    return `₺${(amount / 1_000_000).toFixed(1)} Mn`
  }
  if (amount >= 1_000) {
    return `₺${(amount / 1_000).toFixed(0)} K`
  }
  return `₺${amount.toFixed(0)}`
}

function horizonLabel(h: 'short' | 'medium' | 'long'): ActionHorizonLabel {
  if (h === 'short')  return 'Kısa Vade (0-6 ay)'
  if (h === 'medium') return 'Orta Vade (6-18 ay)'
  return 'Uzun Vade (18-36 ay)'
}

function categoryLabel(cat: string): string {
  if (cat === 'STRUCTURAL') return 'Yapısal'
  if (cat === 'COSMETIC')   return 'Muhasebesel'
  if (cat === 'HYBRID')     return 'Karma'
  return cat
}

/**
 * ActionId'yi aksiyon kataloğundaki Türkçe adına çevirir.
 * UI-facing narrative'lerde raw actionId gösterilmemesi için kullanılır.
 */
function actionIdToLabel(actionId: string): string {
  return ACTION_CATALOG_V3[actionId]?.name ?? actionId
}

/**
 * Ayni actionId + amountTRY kombinasyonu portfoyler arasi tekrar etmez.
 * Cumulative horizon yapisi nedeniyle short aksiyonlar medium + long'da da gorunur.
 * dedupeActions yalnizca unique kombinasyonlari dondurur.
 */
export function dedupeActions(actions: SelectedAction[]): SelectedAction[] {
  const seen = new Set<string>()
  return actions.filter(a => {
    const key = `${a.actionId}::${a.amountTRY}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Engine ayni aksiyonu farkli tutarlarla birden fazla kez secebilir
 * (optimizer her iterasyonda farkli amount candidate secebilir).
 * Bu fonksiyon ayni actionId'li kayitlari TEK satirda birlestir:
 *   - amountTRY: toplanir
 *   - transactions: birlestir (tüm muhasebe bacaklari korunur)
 *   - estimatedNotchContribution: toplanir, max 2.0 ile sinirlanir
 *   - ratioTransparency: toplam tutarla yeniden hesaplanir (Faz 7.3.12-PRE-FIX)
 *   - Diger alanlar (horizon, narrative vb.) ilk kaydın degerini korur
 *
 * NOT: dedupeActions SONRASI cagirilir — onceden exact-duplicate'lar
 * zaten temizlenmis olur, sadece farkli-tutar parçalar kalir.
 */
export function consolidateByActionId(actions: SelectedAction[]): SelectedAction[] {
  const map          = new Map<string, SelectedAction>()
  const firstAmounts = new Map<string, number>()  // Faz 7.3.12-PRE-FIX: ilk parça tutarı

  for (const action of actions) {
    const existing = map.get(action.actionId)
    if (existing) {
      existing.amountTRY = (existing.amountTRY ?? 0) + (action.amountTRY ?? 0)
      existing.transactions = [...existing.transactions, ...action.transactions]
      existing.estimatedNotchContribution = Math.min(
        (existing.estimatedNotchContribution ?? 0) + (action.estimatedNotchContribution ?? 0),
        2.0,
      )
    } else {
      // Shallow copy + transactions deep-copy (mutation koruması)
      firstAmounts.set(action.actionId, action.amountTRY ?? 0)  // ilk parça tutarı kaydet
      map.set(action.actionId, { ...action, transactions: [...action.transactions] })
    }
  }

  // Faz 7.3.12-PRE-FIX: Çoklu parça aksiyonlarda realisticTarget'ı toplam tutarla yeniden hesapla.
  // İlk parçanın transparency'si tek parça tutarını yansıtır; consolidated kart toplam etkiyi göstermeli.
  // Tek parçalı aksiyonlar (a1 >= total) dokunulmaz — regresyon yok.
  for (const action of map.values()) {
    const a1    = firstAmounts.get(action.actionId) ?? action.amountTRY ?? 0
    const total = action.amountTRY ?? 0
    if (a1 >= total) continue  // tek parça veya degenerate

    const rt = action.ratioTransparency
    if (!rt) continue

    if (rt.kind === 'turnover') {
      // A18/A19: formula'da netSales ve totalAssets hazır
      const { netSales, totalAssets } = rt.formula
      if (netSales != null && totalAssets != null && totalAssets > 0) {
        action.ratioTransparency = { ...rt, realisticTarget: (netSales + total) / totalAssets }
      }
    } else if (rt.kind === 'margin') {
      // A10 özkaynak/aktif: current = E/A, rt1 = (E+a1)/(A+a1) → A ve E reverse-engineer
      const c   = rt.current
      const rt1 = rt.realisticTarget  // ilk parçanın rt'si
      if (rt1 > c && a1 > 0) {
        const A = a1 * (1 - rt1) / (rt1 - c)  // A = a1×(1-rt1)/(rt1-c)
        if (A > 0) {
          const E = c * A
          action.ratioTransparency = { ...rt, realisticTarget: (E + total) / (A + total) }
        }
      }
      // rt1 <= c veya A <= 0 → degenerate, ilk parçanın rt'si korunur
    } else {
      // balance kind — kural: Math.max(currentBalance - total, 0)
      // A05 normalde tek parça; bu branch multi-piece balance aksiyonlar için guard.
      const brt = rt as BalanceRatioTransparency
      action.ratioTransparency = { ...brt, realisticTarget: Math.max(brt.currentBalance - total, 0) }
    }
  }

  return Array.from(map.values())
}

// ─── Faz 7.3.32: Ceiling reason sızıntı filtresi ─────────────────────────────

/**
 * formatCeilingDisplay'e geçmeden önce ceiling.reason'ı sanitize eder.
 * displayMaps.ts yasak olduğundan filter burada uygulanır.
 */
export function cleanCeiling(ceiling: CeilingConstraint): CeilingConstraint {
  let reason = ceiling.reason
  if (
    !reason ||
    reason.includes('HARD_REJECT') ||
    reason.includes('REJECT') ||
    reason.includes('guardrail') ||
    reason.includes('semantic') ||
    reason.includes('iyilesmesi') ||
    reason.includes('gecersiz') ||
    reason.includes('guclenme') ||
    reason.includes('Portfoy')
  ) {
    reason = 'finansal yapı ve operasyonel verimliliğin henüz hedeflenen seviyeyi desteklememesi'
  }
  return { ...ceiling, reason }
}

// ─── BUILDER: EXECUTIVE ANSWER ───────────────────────────────────────────────

export function buildExecutiveAnswer(
  engineResult: EngineResult,
  requestedTarget: RatingGrade,
): ExecutiveAnswer {
  const {
    currentRating,
    finalTargetRating,
    notchesGained,
    confidence,
    confidenceModifier,
  } = engineResult

  // Faz 7.3.31: >= karşılaştırması — hedef aşıldığında da yeşil badge
  const targetMatchesRequest = ratingToIndex(finalTargetRating) >= ratingToIndex(requestedTarget)
  const achievedRequested    = targetMatchesRequest

  // Binding ceiling kontrolu
  const bindingCeiling = engineResult.reasoning.bindingCeiling as CeilingConstraint | null
  const hasCeiling     = bindingCeiling !== null && bindingCeiling !== undefined

  let headline: string
  let subtitle: string

  if (notchesGained === 0) {
    headline = `${currentRating} seviyesinde kalınıyor`
    subtitle  = 'Mevcut koşullar altında rating iyileşmesi sağlanamıyor'
  } else if (achievedRequested) {
    headline = `${currentRating} → ${finalTargetRating} iyileşme mümkün`
    subtitle  = `${notchesGained} kategori iyileşme — hedef ${requestedTarget} ulaşılabilir`
  } else {
    headline = `${currentRating} → ${finalTargetRating} (hedef ${requestedTarget} kısıtlı)`
    subtitle  = `${notchesGained} kategori iyileşme — tam hedef tavanı nedeniyle sınırlı`
  }

  let executiveSummary = engineResult.reasoning.bankerSummary as string
  // Faz 7.3.31: Teknik sızıntı veya bozuk Türkçe karakter tespiti → fallback
  if (
    !executiveSummary ||
    executiveSummary.includes('guardrail') ||
    executiveSummary.includes('HARD_REJECT') ||
    executiveSummary.includes('REJECT') ||
    executiveSummary.includes('iyilesmesi') ||
    executiveSummary.includes('gecersiz') ||
    executiveSummary.includes('guclenme')
  ) {
    if (notchesGained === 0) {
      if (hasCeiling) {
        executiveSummary = 'Mevcut yapısal limitler nedeniyle hedeflenen not artışı şu an desteklenmemektedir.'
      } else {
        executiveSummary = 'Mevcut finansal ve operasyonel yapı, hedeflenen not artışını desteklemek için yeterli değildir. Temel alanlarda yapısal iyileşme gerekiyor.'
      }
    } else if (targetMatchesRequest) {
      executiveSummary = 'Önerilen aksiyon planının tutarlı şekilde uygulanmasıyla hedeflenen seviyeye ulaşılması mümkün görünmektedir.'
    } else {
      executiveSummary = `Hedef seviye mevcut portföyle tam olarak desteklenmese de, finansal dayanıklılıkta ${notchesGained} kademe iyileşme sağlanabilir.`
    }
  }

  const ceilingNote = hasCeiling
    ? `${ceilingTypeToDisplay(bindingCeiling!.source)} tavanı aktif: ${bindingCeiling!.reason} (max ${bindingCeiling!.maxRating})`
    : undefined

  return {
    currentRating,
    requestedTarget,
    achievableTarget:    finalTargetRating,
    targetMatchesRequest,
    confidence,
    confidenceModifier,
    notchesGained,
    headline,
    subtitle,
    executiveSummary,
    hasCeiling,
    ceilingNote,
  }
}

// ─── BUILDER: ACTION PLAN ROWS ───────────────────────────────────────────────

function buildActionPlan(engineResult: EngineResult): ActionPlanRow[] {
  const deduped      = dedupeActions(engineResult.portfolio)
  const consolidated = consolidateByActionId(deduped)   // same-id parts → single row
  const rows: ActionPlanRow[] = []

  consolidated.forEach((action, idx) => {
    const template  = ACTION_CATALOG_V3[action.actionId]
    const cat       = ACTION_CATEGORY_MAP[action.actionId] ?? 'HYBRID'

    // Aksiyon'un muhasebe transaction'larindan kisa etki ozeti
    const txDesc = action.transactions[0]?.description ?? action.actionName

    rows.push({
      rank:                     idx + 1,
      actionId:                 action.actionId,
      actionName:               action.actionName,
      horizon:                  action.horizon,
      horizonLabel:             horizonLabel(action.horizon),
      amountTRY:                action.amountTRY,
      amountFormatted:          formatTRY(action.amountTRY),
      category:                 cat,
      categoryLabel:            categoryLabel(cat),
      sustainability:           action.sustainability,
      qualityScore:             action.qualityScore,
      estimatedNotchContribution: action.estimatedNotchContribution,
      // cfoRationale oncelikli (bankaci dili); action.narrative teknik scoring string iceriyor
      whySelected:              template?.cfoRationale ?? action.narrative,
      accountingEffect:         txDesc,
      cfoRationale:             template?.cfoRationale ?? action.narrative,
      bankerPerspective:        template?.bankerPerspective ?? '',
      ratioTransparency:        action.ratioTransparency,
    })
  })

  return rows
}

// ─── BUILDER: NOTCH PLANS ────────────────────────────────────────────────────

function buildOneNotchPlan(engineResult: EngineResult): NotchPlan {
  const scenario = engineResult.reasoning.oneNotchScenario as NotchScenario
  const currentIdx = ratingToIndex(engineResult.currentRating)
  const targetRating = (
    currentIdx + 1 < RATING_ORDER.length
      ? RATING_ORDER[currentIdx + 1]
      : 'AAA'
  ) as RatingGrade

  // Portfoyden 1 not icin gereken aksiyonlari al
  const requiredActions = scenario.requiredActions.slice(0, 3)
  const matchedInPortfolio = engineResult.portfolio.filter(
    a => requiredActions.includes(a.actionId)
  )

  const totalAmount = matchedInPortfolio.reduce((s, a) => s + a.amountTRY, 0)
  const keyAction   = requiredActions[0]
  const template    = keyAction ? ACTION_CATALOG_V3[keyAction] : undefined

  return {
    targetNotches:       1,
    targetRating,
    requiredActionIds:   requiredActions,
    requiredActionNames: requiredActions.map(
      id => ACTION_CATALOG_V3[id]?.name ?? id
    ),
    totalAmountTRY:       totalAmount,
    totalAmountFormatted: formatTRY(totalAmount),
    isAchievable:         scenario.isAchievable,
    blockedBy:            scenario.blockedBy,
    keyAction:            template?.name,
    narrative:            scenario.narrative,
    engineScenario:       scenario,
  }
}

function buildTwoNotchPlan(engineResult: EngineResult): NotchPlan {
  const scenario = engineResult.reasoning.twoNotchScenario as NotchScenario
  const currentIdx = ratingToIndex(engineResult.currentRating)
  const targetIdx  = Math.min(currentIdx + 2, RATING_ORDER.length - 1)
  const targetRating = RATING_ORDER[targetIdx] as RatingGrade

  const requiredActions = scenario.requiredActions.slice(0, 4)
  const matchedInPortfolio = engineResult.portfolio.filter(
    a => requiredActions.includes(a.actionId)
  )
  const totalAmount = matchedInPortfolio.reduce((s, a) => s + a.amountTRY, 0)
  const keyAction   = requiredActions[0]
  const template    = keyAction ? ACTION_CATALOG_V3[keyAction] : undefined

  return {
    targetNotches:       2,
    targetRating,
    requiredActionIds:   requiredActions,
    requiredActionNames: requiredActions.map(
      id => ACTION_CATALOG_V3[id]?.name ?? id
    ),
    totalAmountTRY:       totalAmount,
    totalAmountFormatted: formatTRY(totalAmount),
    isAchievable:         scenario.isAchievable,
    blockedBy:            scenario.blockedBy,
    keyAction:            template?.name,
    narrative:            scenario.narrative,
    engineScenario:       scenario,
  }
}

// ─── BUILDER: ACCOUNTING IMPACT TABLE ────────────────────────────────────────

function buildAccountingImpactTable(engineResult: EngineResult): AccountingImpactRow[] {
  const deduped      = dedupeActions(engineResult.portfolio)
  const consolidated = consolidateByActionId(deduped)   // same-id parts merged

  // Tüm bacakları düz liste olarak topla
  const rawRows: AccountingImpactRow[] = []
  let rawRank = 1

  for (const action of consolidated) {
    for (const tx of action.transactions) {
      for (const leg of tx.legs) {
        rawRows.push({
          rank:                   rawRank++,
          horizon:                action.horizon,
          actionId:               action.actionId,
          actionName:             action.actionName,
          transactionId:          tx.transactionId,
          transactionDescription: tx.description,
          legSide:                leg.side,
          accountCode:            leg.accountCode,
          accountName:            leg.accountName ?? '',
          // leg.amount — AccountingLeg interface kullanir .amount (NOT .amountTRY)
          amountTRY:              leg.amount,
          amountFormatted:        formatTRY(leg.amount),
          semanticType:           tx.semanticType,
        })
      }
    }
  }

  // Aynı (actionId, accountCode, legSide) kombinasyonunu birleştir
  // Örnek: "102 Bankalar DEBIT ₺2.1M + ₺1.8M + ₺2.5M" → "102 Bankalar DEBIT ₺6.4M"
  const mergedMap = new Map<string, AccountingImpactRow>()
  for (const row of rawRows) {
    const key = `${row.actionId}|${row.accountCode}|${row.legSide}`
    const existing = mergedMap.get(key)
    if (existing) {
      existing.amountTRY += row.amountTRY
      existing.amountFormatted = formatTRY(existing.amountTRY)
    } else {
      mergedMap.set(key, { ...row })
    }
  }

  // rank yeniden numaralandır
  return Array.from(mergedMap.values()).map((row, idx) => ({ ...row, rank: idx + 1 }))
}

// ─── BUILDER: WHY CAPITAL ALONE NOT ENOUGH ───────────────────────────────────

function buildWhyCapitalAloneNotEnough(engineResult: EngineResult): string {
  const productivity = engineResult.layerSummaries.productivity as {
    productivityScore: number
    metrics: { trappedAssetsShare: number }
    inefficiencyFlags: Array<{ type: string; severity: string; description: string }>
  } | null

  if (!productivity) {
    return 'Varlık verimliliği analizi mevcut değil.'
  }

  const score   = productivity.productivityScore
  const trapped = productivity.metrics.trappedAssetsShare
  const parts: string[] = []

  if (score < 0.30) {
    parts.push(
      `Varlık verimliliği %${(score * 100).toFixed(0)} seviyesinde — nakit enjeksiyonu tek başına ` +
      'rating iyileştirmez; aktif çalışmıyorsa yeni sermaye de işlevsiz kalır.'
    )
  } else if (score < 0.50) {
    parts.push(
      `Varlık verimliliği %${(score * 100).toFixed(0)} — sermaye gerekli ama yeterli değil; ` +
      'operasyonel dönüşüm eşlik etmezse etkisi sınırlı.'
    )
  } else {
    parts.push(
      `Varlık verimliliği %${(score * 100).toFixed(0)} — sermaye yapısal iyileşmeyi destekleyebilir.`
    )
  }

  if (trapped > 0.60) {
    parts.push(
      `Varlıkların %${(trapped * 100).toFixed(0)}'i atıl durumda — ` +
      'bu varlıklar nakde çevrilmeden nakit yaratma kapasitesi artmaz.'
    )
  }

  const criticalFlags = productivity.inefficiencyFlags.filter(f => f.severity === 'CRITICAL').slice(0, 2)
  for (const flag of criticalFlags) {
    // Faz 7.3.20: INEFFICIENCY_NARRATIVES'den profesyonel metin; ham flag.type basılmaz
    const narr = INEFFICIENCY_NARRATIVES[flag.type as keyof typeof INEFFICIENCY_NARRATIVES]
    parts.push(narr?.description ?? flag.description)
  }

  return parts.join(' ')
}

// ─── BUILDER: TARGET FEASIBILITY EXPLANATION ─────────────────────────────────

function buildTargetFeasibilityExplanation(
  engineResult: EngineResult,
  requestedTarget: RatingGrade,
): string {
  const {
    currentRating,
    finalTargetRating,
    notchesGained,
    confidence,
    confidenceModifier,
    feasibility,
  } = engineResult

  const bindingCeiling = engineResult.reasoning.bindingCeiling as CeilingConstraint | null
  const targetAchieved = ratingToIndex(finalTargetRating) >= ratingToIndex(requestedTarget)

  const parts: string[] = []

  if (targetAchieved) {
    parts.push(
      `${currentRating} → ${requestedTarget} geçişi mümkün görünüyor. ` +
      `${notchesGained} kategori iyileşme, güven: ${confidenceToDisplay(confidence)} ` +
      `(%${(confidenceModifier * 100).toFixed(0)}).`
    )
  } else {
    parts.push(
      `${requestedTarget} hedefine ulaşılamıyor — ulaşılabilir maksimum: ${finalTargetRating}. ` +
      `${notchesGained} kategori iyileşme mümkün.`
    )
  }

  if (bindingCeiling) {
    parts.push(`${formatCeilingDisplay(cleanCeiling(bindingCeiling))}.`)
  }

  if (feasibility) {
    if (!feasibility.isFeasible) {
      parts.push(`Fizibilite: ${feasibility.reason}`)
      if (feasibility.requirements.length > 0) {
        parts.push(`Gereksinimler: ${feasibility.requirements.join('; ')}.`)
      }
    }
  }

  return parts.join(' ')
}

// ─── BUILDER: IF NOT DONE RISK ────────────────────────────────────────────────

function buildIfNotDoneRisk(engineResult: EngineResult): string {
  const drivers         = engineResult.reasoning.drivers as DriverGroup | null
  const missed          = engineResult.reasoning.missedOpportunities as MissedOpportunity[] | null
  const bindingCeiling  = engineResult.reasoning.bindingCeiling as CeilingConstraint | null
  const productivity    = engineResult.layerSummaries.productivity as {
    inefficiencyFlags: Array<{ type: string; severity: string; description: string }>
  } | null

  const parts: string[] = []

  if (bindingCeiling) {
    // Faz 7.3.37: maxRating/tavan jargonu kaldırıldı — sade hedef mesajı
    parts.push(
      'Mevcut yapısal kısıtlar değişmediği sürece hedef seviyeye ulaşmak mümkün olmayacaktır.'
    )
  }

  // Faz 7.3.13: inefficiencyFlags-based enrichment (replaces drivers.negative when present)
  const ifNotDoneBlock = buildIfNotDoneInefficiencyBlock(
    productivity?.inefficiencyFlags ?? []
  )
  if (ifNotDoneBlock) {
    parts.push(ifNotDoneBlock)
  } else if (drivers && drivers.negative.length > 0) {
    parts.push(
      `Temel riskler çözülmezse: ${drivers.negative.slice(0, 2).join('; ')}.`
    )
  }

  if (missed && missed.length > 0) {
    const topMissed = missed.slice(0, 2)
    const topLabels = topMissed.map(m => actionIdToLabel(m.actionId)).join(', ')
    parts.push(
      `Adreslenmeyen kritik alanlar: ${topLabels} ` +
      `— bu aksiyonlar yapılmazsa ${topMissed[0].estimatedNotchImpact > 0
        ? `yaklaşık ${topMissed[0].estimatedNotchImpact} kategori gerileme riski var`
        : 'iyileşme sınırlı kalır'}.`
    )
  }

  if (parts.length === 0) {
    parts.push('Önerilen aksiyonlar uygulanmazsa mevcut rating seviyesi korunur, iyileşme gerçekleşmez.')
  }

  return parts.join('\n\n')
}

// ─── BUILDER: UI READY ROWS ──────────────────────────────────────────────────

function buildUiReadyRows(engineResult: EngineResult): UiReadyRow[] {
  const deduped      = dedupeActions(engineResult.portfolio)
  const consolidated = consolidateByActionId(deduped)   // same-id parts merged

  return consolidated.map((action, idx) => {
    const cat     = ACTION_CATEGORY_MAP[action.actionId] ?? 'HYBRID'
    const template = ACTION_CATALOG_V3[action.actionId]

    return {
      id:               `${action.actionId}-${action.horizon}-${idx}`,
      horizon:          action.horizon,
      horizonLabel:     horizonLabel(action.horizon),
      rank:             idx + 1,
      actionId:         action.actionId,
      actionName:       action.actionName,
      amountTRY:        action.amountTRY,
      amountFormatted:  formatTRY(action.amountTRY),
      category:         cat,
      categoryLabel:    categoryLabel(cat),
      qualityScore:     action.qualityScore,
      notchContribution: action.estimatedNotchContribution,
      sustainability:   action.sustainability,
      whySelected:      template?.cfoRationale ?? action.narrative,
      cfoRationale:     template?.cfoRationale ?? action.narrative,
    }
  })
}

// ─── HELPER: FRIENDLY REJECT REASON ─────────────────────────────────────────

export function toFriendlyRejectReason(rawReason: string): string {
  if (rawReason.includes('Horizon') && rawReason.includes('desteklenmiyor')) {
    return 'Bu vade için uygun değil.'
  }
  if (rawReason.includes('Kaynak hesap') && rawReason.includes('bakiyesi yok')) {
    return 'Gerekli kaynak hesap bakiyesi bulunmuyor.'
  }
  if (rawReason.includes('Kaynak bakiye yetersiz')) {
    return 'Kaynak hesap bakiyesi yetersiz.'
  }
  if (rawReason.includes('sektoru icin uygulanamaz') || rawReason.toLowerCase().includes('sektör')) {
    return 'Sektör koşulu sağlanmadı.'
  }
  if (rawReason.includes('customCheck basarisiz')) {
    const match = rawReason.match(/customCheck basarisiz: (.+)/)
    return match ? match[1] : 'Aksiyon koşulu sağlanmadı.'
  }
  if (rawReason.includes('no valid amount candidates')) {
    return 'Uygulanabilir tutar üretilemedi.'
  }
  if (rawReason.includes('Aggregate guardrail')) {
    return 'Toplu kural nedeniyle uygun değil.'
  }
  return 'Bu aksiyon mevcut veriyle uygun görülmedi.'
}

// ─── BUILDER: REJECTED INSIGHTS ──────────────────────────────────────────────

function buildRejectedInsights(engineResult: EngineResult): RejectedInsight[] {
  const portfolioIds = new Set(engineResult.portfolio.map(a => a.actionId))

  // ── 1. Engine rejectedCandidates → dedupe by actionId ────────────────────
  const grouped = new Map<string, {
    actionId:       string
    reasons:        Set<string>   // friendly
    rawReasons:     Set<string>   // raw
    rejectionCount: number
  }>()

  const rejectedCandidates = engineResult.debug?.rejectedCandidates ?? []
  for (const rc of rejectedCandidates) {
    if (portfolioIds.has(rc.actionId)) continue

    const existing = grouped.get(rc.actionId) ?? {
      actionId:       rc.actionId,
      reasons:        new Set<string>(),
      rawReasons:     new Set<string>(),
      rejectionCount: 0,
    }
    existing.rejectionCount += 1
    existing.rawReasons.add(rc.reason)
    existing.reasons.add(toFriendlyRejectReason(rc.reason))
    grouped.set(rc.actionId, existing)
  }

  const insights: RejectedInsight[] = []

  for (const g of grouped.values()) {
    const template = ACTION_CATALOG_V3[g.actionId]
    const cat      = ACTION_CATEGORY_MAP[g.actionId] ?? 'HYBRID'
    const reasonArr = Array.from(g.reasons)
    insights.push({
      actionId:                  g.actionId,
      actionName:                template?.name ?? g.actionId,
      reason:                    Array.from(g.rawReasons)[0] ?? '',
      reasonDisplay:             reasonArr.length === 1 ? reasonArr[0] : reasonArr,
      rejectionCount:            g.rejectionCount,
      rawReasons:                Array.from(g.rawReasons),
      estimatedNotchImpact:      0,
      category:                  cat,
      isFromMissedOpportunities: false,
    })
  }

  // ── 2. missedOpportunities — portföyden kaçan kritik fırsatlar ───────────
  const missed = engineResult.reasoning.missedOpportunities as MissedOpportunity[] | null
  if (missed) {
    for (const m of missed) {
      if (portfolioIds.has(m.actionId)) continue
      if (insights.some(i => i.actionId === m.actionId)) continue
      const template = ACTION_CATALOG_V3[m.actionId]
      insights.push({
        actionId:                  m.actionId,
        actionName:                template?.name ?? m.actionId,
        reason:                    m.reason,
        reasonDisplay:             m.reasonDisplay ?? `${template?.name ?? m.actionId} aksiyonu için gerekli koşullar mevcut bilanço yapısında karşılanmıyor.`,
        rejectionCount:            1,
        rawReasons:                [m.reason],
        estimatedNotchImpact:      m.estimatedNotchImpact,
        category:                  m.category,
        isFromMissedOpportunities: true,
      })
    }
  }

  // Tahmini not etkisine göre sırala (yüksekten düşüğe)
  insights.sort((a, b) => b.estimatedNotchImpact - a.estimatedNotchImpact)

  return insights
}

// ─── BUILDER: CONSULTANT NARRATIVE ───────────────────────────────────────────

function buildConsultantNarrative(
  engineResult: EngineResult,
  requestedTarget?: RatingGrade,
): ConsultantNarrative {
  const drivers        = engineResult.reasoning.drivers as DriverGroup | null
  const bindingCeiling = engineResult.reasoning.bindingCeiling as CeilingConstraint | null
  const productivity   = engineResult.layerSummaries.productivity as {
    productivityScore: number
    metrics: { trappedAssetsShare: number }
    inefficiencyFlags: Array<{ type: string; severity: string; description: string }>
  } | null

  const sustainability = engineResult.layerSummaries.sustainability as {
    constraints?: { hasCeiling?: boolean; ceilingReasons?: string[] }
  } | null

  const composition = engineResult.reasoning as {
    drivers?: { structural?: string[]; cosmetic?: string[] }
  }
  void composition  // kullanilmayacak, dogrudan drivers kullanilacak

  // ── problem ──────────────────────────────────────────────────────────────
  // Faz 7.3.13: visible inefficiency flags varsa profesyonel dil; yoksa mevcut fallback.
  let problem = `Şirket ${engineResult.currentRating} rating seviyesinde.`

  const problemBlock = buildProblemInefficiencyBlock(productivity?.inefficiencyFlags ?? [])
  if (problemBlock) {
    problem += problemBlock
  } else if (drivers && drivers.negative.length > 0) {
    problem += ` Temel sorunlar: ${drivers.negative.slice(0, 2).join('; ')}.`
  } else if (productivity && productivity.productivityScore < 0.40) {
    problem += ` Varlık verimliliği düşük (%${(productivity.productivityScore * 100).toFixed(0)}).`
  }

  // ── coreIssue ─────────────────────────────────────────────────────────────
  let coreIssue = ''

  if (bindingCeiling) {
    // Faz 7.3.37: maxRating/tavan jargonu kaldırıldı — sade hedef mesajı
    coreIssue = 'Rating iyileşmesinin önündeki temel engel: yapısal finansal verimlilik mevcut seviyeyi ' +
      'korumaya katkı sağlasa da hedef not artışını henüz desteklemiyor. Bu kısıt çözülmeden hedeflenen seviyeye ulaşmak mümkün değil.'
  } else if (sustainability?.constraints?.hasCeiling) {
    const reason = sustainability.constraints.ceilingReasons?.[0] ?? 'gelir kalitesi düşük'
    coreIssue = `Gelir kalitesi sorunu: ${reason}. Sürdürülebilir gelir tabanı oluşturulmadan rating iyileşmesi kalıcı olmaz.`
  } else if (productivity && productivity.productivityScore < 0.30) {
    coreIssue = `Kritik varlık kilitlenmesi — aktiflerinizin önemli bir kısmı değer üretmiyor. ` +
      `Bu sorunu çözmeden sadece bilanço düzenlemeleri yeterli olmaz.`
  } else {
    coreIssue = `Mevcut rating seviyesinin temel nedeni finansal yapı ve operasyonel verimlilik dengesidir.`
  }

  // ── shortTermPriority ─────────────────────────────────────────────────────
  const shortActions = engineResult.horizons.short.actions.slice(0, 2)
  let shortTermPriority = ''

  if (shortActions.length > 0) {
    const actionNames = shortActions.map(a => ACTION_CATALOG_V3[a.actionId]?.name ?? a.actionName)
    shortTermPriority =
      `İlk 6 ayda öncelikli adımlar: ${actionNames.join(' ve ')}. ` +
      `Toplam tutar: ${formatTRY(shortActions.reduce((s, a) => s + a.amountTRY, 0))}.`
  } else {
    shortTermPriority = 'Kısa vadeli aksiyon planı oluşturulmadı — önce operasyonel hazırlık gerekiyor.'
  }

  // ── structuralNeed ────────────────────────────────────────────────────────
  const longActions    = engineResult.horizons.long.actions
  const missedOpps     = engineResult.reasoning.missedOpportunities as MissedOpportunity[] | null
  let structuralNeed   = ''

  // Cross-section dedupe: drivers + longActions + missedOpps aynı id iki kez yazılmaz
  const shownStructuralIds = new Set<string>()

  if (drivers && drivers.structural.length > 0) {
    // Önce unique (sırayı koruyarak), sonra slice(0,3) — üçüncü benzersiz aksiyon kaybolmasın
    const uniqueInSection = new Set<string>()
    const deduped: string[] = []
    for (const id of drivers.structural) {
      if (!uniqueInSection.has(id)) {
        uniqueInSection.add(id)
        deduped.push(id)
      }
    }
    const structuralLabels = deduped
      .slice(0, 3)
      .filter(id => {
        if (shownStructuralIds.has(id)) return false
        shownStructuralIds.add(id)
        return true
      })
      .map(actionIdToLabel)
    if (structuralLabels.length > 0) {
      structuralNeed = `Kalıcı iyileşme için yapısal dönüşüm şart: ${structuralLabels.join(', ')}. `
    }
  }

  if (longActions.length > 0) {
    const longNames = longActions
      .slice(0, 2)
      .filter(a => {
        if (shownStructuralIds.has(a.actionId)) return false
        shownStructuralIds.add(a.actionId)
        return true
      })
      .map(a => ACTION_CATALOG_V3[a.actionId]?.name ?? a.actionName)
    if (longNames.length > 0) {
      structuralNeed += `Uzun vadede: ${longNames.join(' ve ')}.`
    }
  } else if (missedOpps && missedOpps.length > 0) {
    const topMissed = missedOpps[0]
    if (!shownStructuralIds.has(topMissed.actionId)) {
      const name = ACTION_CATALOG_V3[topMissed.actionId]?.name ?? topMissed.actionId
      structuralNeed += `Kritik eksik: ${name} uygulanmadan hedef rating'e ulaşmak zorlaşıyor.`
    }
  }

  if (!structuralNeed) {
    structuralNeed = 'Mevcut portföy yapısal dönüşümü kapsıyor — tutarlı uygulama yeterli.'
  }

  // ── bankerView — PATCH 1: portfolio capacity farkindaliği ──────────────────
  const { confidence, confidenceModifier, finalTargetRating, notchesGained } = engineResult

  // RatingTransition'dan portfolio capacity bilgisi
  const transition = engineResult.reasoning.transition as {
    blockedByPortfolioCapacity?: boolean
    achievableByPortfolio?: number
    portfolioNotchCapacity?: number
  } | null

  const blockedByCapacity  = transition?.blockedByPortfolioCapacity ?? false
  const capacityNotches    = transition?.achievableByPortfolio ?? notchesGained
  const rawCapacity        = transition?.portfolioNotchCapacity ?? Infinity
  const confidenceLabel    = confidence === 'HIGH' ? 'yüksek güvenle' : confidence === 'MEDIUM' ? 'orta güvenle' : 'düşük güvenle'

  let bankerView: string

  if (blockedByCapacity) {
    // Portfoy kapasitesi istenen hedefin altinda — asil kritik mesaj
    bankerView =
      `${requestedTarget ?? finalTargetRating} hedefi teorik olarak tavan içinde görünüyor, ` +
      `ancak önerilen portföy en fazla ${capacityNotches} kategori iyileşme sağlıyor. ` +
      `Mevcut portföyle ulaşılabilir seviye: ${finalTargetRating}. ` +
      `Daha yüksek bir hedefe ulaşmak için portföyün yapısal aksiyonlarla genişletilmesi gerekiyor. ` +
      `Likidite iyileşmesi tek başına yeterli değildir; aktif verimlilik ve gelir kalitesinin de güçlenmesi gerekir.`
  } else if (notchesGained === 0) {
    // Faz 7.3.31: bankerSummary referansı kaldırıldı (teknik sızıntı riski)
    bankerView =
      `Mevcut yapıda anlamlı rating iyileşmesi sağlanamıyor. ` +
      `Köklü operasyonel değişim ve finansal yeniden yapılandırma gerekiyor.`
  } else {
    bankerView =
      `${engineResult.currentRating} seviyesinden ${finalTargetRating} seviyesine iyileşme ` +
      `${confidenceLabel} destekleniyor. `

    if (confidence === 'HIGH') {
      bankerView += 'Bu yol haritası tutarlı biçimde uygulanırsa iyileşme kalıcı olur.'
    } else if (confidence === 'MEDIUM') {
      bankerView += 'Orta güven — uygulama riski var, ilerlemenin düzenli izlenmesi önemli.'
    } else {
      bankerView +=
        'Düşük güven — bilanço düzenlemeleri tek başına yeterli değil, kalıcı operasyonel dönüşüm gerekiyor. ' +
        'Teminat yapısı ve nakit üretim kapasitesi finansal sağlığın temel göstergeleridir.'
    }
  }

  return {
    problem,
    coreIssue,
    shortTermPriority,
    structuralNeed,
    bankerView,
  }
}

// ─── BUILDER: COMPARISON WITH V2 ─────────────────────────────────────────────

function buildComparisonWithV2(
  engineResult: EngineResult,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  v2Result: any,
): ComparisonWithV2 {
  const v3ActionIds = new Set(engineResult.portfolio.map(a => a.actionId))

  // V2 action id'leri
  const v2ActionIds: string[] = Array.isArray(v2Result?.scenarios)
    ? v2Result.scenarios.flatMap(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => Array.isArray(s.actions) ? s.actions.map((a: any) => a.actionId ?? a.id ?? '') : []
      ).filter(Boolean)
    : []

  const v2Set = new Set<string>(v2ActionIds)

  const newActionsInV3    = [...v3ActionIds].filter(id => !v2Set.has(id))
  const removedFromV2     = [...v2Set].filter(id => !v3ActionIds.has(id))

  const v2Confidence      = v2Result?.confidence ?? 0
  const v3HigherConfidence = engineResult.confidenceModifier > (v2Confidence / 100)

  const diffNote = newActionsInV3.length === 0 && removedFromV2.length === 0
    ? 'V3 portföyü V2 ile büyük ölçüde örtüşüyor.'
    : `V3'te ${newActionsInV3.length} yeni aksiyon eklendi, ` +
      `V2'den ${removedFromV2.length} aksiyon çıkarıldı. ` +
      'V3 ekonomik gerçeklik ve varlık verimliliği katmanları ekliyor.'

  return {
    v2ActionCount:       v2Set.size,
    v3ActionCount:       v3ActionIds.size,
    newActionsInV3,
    removedFromV2,
    v3HigherConfidence,
    diffNote,
  }
}

// ─── BUILDER: DATA QUALITY WARNING ───────────────────────────────────────────

/**
 * PATCH 2: Coverage-tabanlı veri kalitesi uyarısı.
 * Sabit hesap sayısı eşiği (< 30) yerine action catalog'un
 * gerektirdiği hesap gruplarının kaçının mizanda mevcut olduğunu ölçer.
 *
 * coverage = mevcut_grup / gerekli_grup < 0.5 → uyarı tetiklenir.
 * Sadece pure numeric ve sıfırdan büyük bakiyeli kodlar sayılır.
 */
function buildDataQualityWarning(
  engineResult:     EngineResult,
  accountBalances?: Record<string, number>,
): DataQualityWarning | undefined {
  const accountCount  = accountBalances ? Object.keys(accountBalances).length : 0
  const rejectedCount = engineResult.debug?.rejectedCandidates?.length ?? 0
  const portfolioSize = engineResult.portfolio.length

  // Action catalog'daki benzersiz hesap grubu kodlarını topla (2 hane)
  const requiredGroups = new Set<string>()
  for (const action of Object.values(ACTION_CATALOG_V3)) {
    for (const code of action.preconditions?.requiredAccountCodes ?? []) {
      requiredGroups.add(code.slice(0, 2))
    }
  }

  // Mizanda mevcut olan gruplar (pure numeric, bakiye > 0)
  const presentGroups = new Set<string>()
  if (accountBalances) {
    for (const [code, bal] of Object.entries(accountBalances)) {
      if (/^\d+$/.test(code) && Math.abs(bal) > 0) {
        presentGroups.add(code.slice(0, 2))
      }
    }
  }

  const missingGroups = [...requiredGroups].filter(g => !presentGroups.has(g))
  const coverage = requiredGroups.size > 0
    ? (requiredGroups.size - missingGroups.length) / requiredGroups.size
    : 1

  const hasLimitedData = coverage < 0.5 || portfolioSize <= 1

  if (!hasLimitedData) return undefined

  // Mesaj: hangi gruplar eksik
  let message: string
  if (missingGroups.length > 0) {
    const missingLabels = missingGroups
      .map(g => `${g}X ${TDHP_GROUP_NAMES[g] ?? 'grubu'}`)
      .join(', ')
    message = `Şu hesap grupları eksik: ${missingLabels}. Bu gruplarla ilgili aksiyonlar önerilemedi.`
  } else {
    message = 'Portföy boyutu küçük, analiz kapsamı sınırlı.'
  }

  return {
    hasLimitedData:          true,
    accountCount,
    rejectedCandidatesCount: rejectedCount,
    portfolioSize,
    message,
    recommendation: missingGroups.length > 0
      ? `Eksik grupları mizana ekleyin (${missingGroups.slice(0, 4).map(g => `${g}X`).join(', ')}) ve analizi tekrarlayın.`
      : 'Daha kapsamlı bir mizan ile analiz tekrarlanırsa öneri seti genişleyebilir.',
  }
}

// ─── ANA API ─────────────────────────────────────────────────────────────────

/**
 * engineV3.ts ciktisini banker UI cevabina donusturur.
 *
 * @param engineResult           - runEngineV3 ciktisi
 * @param requestedTarget        - kullanicinin istedigi hedef rating
 * @param v2Result               - opsiyonel V2 karsilastirma (null = atla)
 * @param accountBalances        - PATCH 1: dataQualityWarning icin hesap sayisi
 * @param ratios                 - Faz 7.3.7-FIX2: calculateRatiosFromAccounts ciktisi (A21 severity icin)
 * @param actualRatingValidation - Faz 7.3.8a: post-action rating dogrulama sonucu (route'tan iletilir)
 * @param targetPackageContext   - Faz 7.3.8d: hedef rating'e gore minimal paket secimi icin baglam
 *                                 (yoksa filtreleme uygulanmaz, davranis geriye uyumlu kalir)
 */
export function buildDecisionAnswer(
  engineResult:    EngineResult,
  requestedTarget: RatingGrade,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  v2Result:         any | null = null,
  accountBalances?: Record<string, number>,
  ratios?: { currentRatio?: number | null },
  actualRatingValidation?: ActualRatingValidation | null,
  targetPackageContext?: TargetPackageContext,
): DecisionAnswer {
  // ── Faz 7.3.8d: Hedef pakete gore filtreleme ─────────────────────────────
  // Bagam yoksa (eski cagrilar veya test mock'lari) filtreleme calistirilmaz —
  // engineResult.portfolio aynen kullanilir, davranis 7.3.8c oncesi gibi.
  let portfolioForUI: SelectedAction[] = engineResult.portfolio
  let targetPackageMeta: TargetPackageMeta | undefined

  if (targetPackageContext && accountBalances) {
    const pkg = selectTargetPackage({
      portfolio:              engineResult.portfolio,
      initialBalances:        accountBalances,
      sector:                 targetPackageContext.sector,
      subjectiveTotal:        targetPackageContext.subjectiveTotal,
      currentObjectiveScore:  targetPackageContext.currentObjectiveScore,
      currentCombinedScore:   targetPackageContext.currentCombinedScore,
      currentActualRating:    targetPackageContext.currentActualRating,
      // Faz 7.3.19: erken çıkış kararı için ayrı kaynak — inconsistentSources tespiti
      decisionCurrentRating:  targetPackageContext.decisionCurrentRating,
      v3EstimatedRating:      engineResult.finalTargetRating,
      requestedTarget,
    })
    portfolioForUI    = engineResult.portfolio  // Faz 7.3.31: tam portföy — subset paradoksunu önler
    targetPackageMeta = pkg.meta               // meta korunur (badge/banner state için)
  }

  // Filtered view: yalniz portfolio swap edilir, diger alanlar korunur.
  // Bu sayede notch plans, missed opps, executive answer vb. tum engineResult'tan okur.
  const filteredEngineResult: EngineResult = { ...engineResult, portfolio: portfolioForUI }

  const executiveAnswer              = buildExecutiveAnswer(engineResult, requestedTarget)
  // Faz 7.3.35: postActualRating override kaldırıldı — engine kanonik kaynak.
  // postActualRating diagnostic sigorta; SOURCE_MISMATCH banner asenkronlukta uyarır.
  // reachedTarget engine kaynağı olduğundan override korunur.
  if (targetPackageMeta?.reachedTarget) {
    executiveAnswer.targetMatchesRequest = true
  }
  const whatCompanyShouldDo          = buildActionPlan(filteredEngineResult)
  const oneNotchPlan                 = buildOneNotchPlan(engineResult)
  const twoNotchPlan                 = buildTwoNotchPlan(engineResult)
  const accountingImpactTable        = buildAccountingImpactTable(filteredEngineResult)
  const whyCapitalAloneIsNotEnough   = buildWhyCapitalAloneNotEnough(engineResult)
  const targetFeasibilityExplanation = buildTargetFeasibilityExplanation(engineResult, requestedTarget)
  const ifNotDoneRisk                = buildIfNotDoneRisk(engineResult)
  const uiReadyRows                  = buildUiReadyRows(filteredEngineResult)
  const rejectedInsights             = buildRejectedInsights(engineResult)
  // PATCH 1: requestedTarget'ı geç — portfolio capacity mesajı için
  const consultantNarrative          = buildConsultantNarrative(engineResult, requestedTarget)
  const dataQualityWarning           = buildDataQualityWarning(engineResult, accountBalances)

  // Faz 7.3.7: vade uyumsuzluğu risk insight (7.3.7-FIX2: ratios.currentRatio direkt)
  const maturityInsight = accountBalances
    ? buildMaturityMismatchInsight(accountBalances, engineResult.sector, ratios)
    : null
  const riskInsights: DecisionInsight[] = maturityInsight ? [maturityInsight] : []

  // PATCH 2: actionId → { debits, credits } gruplu lookup (mutation yok)
  const accountingLegsByAction: Record<string, { debits: AccountingImpactRow[]; credits: AccountingImpactRow[] }> = {}
  for (const row of accountingImpactTable) {
    if (!accountingLegsByAction[row.actionId]) {
      accountingLegsByAction[row.actionId] = { debits: [], credits: [] }
    }
    if (row.legSide === 'DEBIT') {
      accountingLegsByAction[row.actionId].debits.push(row)
    } else {
      accountingLegsByAction[row.actionId].credits.push(row)
    }
  }

  const comparisonWithV2 = v2Result != null
    ? buildComparisonWithV2(engineResult, v2Result)
    : undefined

  // Faz 7.3.19: UI ayrımı için meta sayımlar
  // enginePortfolioCount: targetPackage öncesi tam engine portföyü (deduped aksiyon sayısı)
  const enginePortfolioCount = dedupeActions(engineResult.portfolio).length
  const rejectedInsightCount = rejectedInsights.length

  // Faz 7.3.38: diagnostics payload — engine'e dokunmadan observability
  const diagnostics = buildDiagnostics(
    engineResult,
    String(requestedTarget),
    targetPackageContext?.currentCombinedScore ?? null,
    actualRatingValidation?.postCombinedScore ?? null,
    actualRatingValidation?.postActualRating ?? null,
  )

  return {
    executiveAnswer,
    whatCompanyShouldDo,
    oneNotchPlan,
    twoNotchPlan,
    accountingImpactTable,
    accountingLegsByAction,
    whyCapitalAloneIsNotEnough,
    targetFeasibilityExplanation,
    ifNotDoneRisk,
    uiReadyRows,
    rejectedInsights,
    consultantNarrative,
    comparisonWithV2,
    dataQualityWarning,
    riskInsights,
    actualRatingValidation: actualRatingValidation ?? null,
    targetPackageMeta,
    enginePortfolioCount,
    rejectedInsightCount,
    diagnostics,
  }
}
