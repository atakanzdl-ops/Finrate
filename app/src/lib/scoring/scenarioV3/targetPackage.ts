/**
 * TARGET PACKAGE SELECTOR (Faz 7.3.8d-FIX2 / R3.3)
 *
 * Mevcut V3 portföyünden, kullanıcının istediği hedef rating'e
 * ulaşmak için OPTİMAL aksiyon paketini seçer.
 *
 * Algoritma — R3.3 hedef-aware rasyo grubu çeşitlilik öncelikli alt küme araması:
 *   1. requestedTarget parse edilir; geçersizse → tüm liste fallback
 *   2. currentIdx >= targetIdx → boş paket, reachedTarget=true
 *   3. Boş portföy → reachedTarget=false, boş paket
 *   4. targetGap = targetIdx - currentIdx hesaplanır; desiredMinK türetilir:
 *        gap=0→1 | gap=1→2 | gap=2→4 | gap=3→5 | gap≥4→6
 *   5. C(N,k) alt kümeleri k=1..N tam aralığında aranır; hedefe ulaşan tüm adaylar
 *      toplanır. Sıralama kararı compareCandidate'e bırakılır (R3.3 fix Codex 1).
 *   6. Adaylar gap'e göre çift modlu öncelik sırasıyla karşılaştırılır:
 *        KOLAY (gap<=1):  desiredMinK eşiği → grup → az aksiyon → tutar → achievedIdx
 *        ZOR   (gap>=2):  grup → |cardinality−desiredMinK| → tutar → achievedIdx
 *   7. Hiçbir alt küme yeterli değilse → tüm liste fallback,
 *      reachedTarget=false, achievedRating=fullPortfolio post-rating
 *
 * KORUMA: N > SUBSET_SEARCH_LIMIT (12) ise 2^N patlamasını engellemek
 *   için subset search atlanır, fullPortfolio + uyarı dönülür.
 *
 * ÇIKTI ŞEKLİ:
 *   { selectedActions, meta: TargetPackageMeta, validation }
 *   meta.coveredGroupCount (0..4) — UI "4/4 grup kapsanmış" için
 *
 * selectedActions sırası: fullPortfolio orijinal sırası korunur.
 *
 * KRİTİK:
 *   score.ts / ratios.ts / subjective.ts DOKUNULMAZ — sadece
 *   calculateActualPostActionRating helper'ı tüketilir.
 */

import { calculateActualPostActionRating } from './postActionRating'
import type { ActualRatingValidation }     from './postActionRating'
import type { AccountingTransaction }      from './contracts'
import type { SelectedAction }             from './engineV3'
import {
  RATING_ORDER,
  ratingToIndex,
  type RatingGrade,
} from './ratingReasoning'
import { getCoveredGroups }                from './actionRatioGroupProfile'

// ─── ÇIKTI TİPLERİ (sözleşme: değişmedi) ──────────────────────────────────────

export interface TargetPackageMeta {
  /**
   * Faz 7.3.20: Paketin genel durumu — UI banner seçimi için birincil alan.
   *
   *   REACHED         → hedef rating elde edildi (optimal subset bulundu)
   *   NOT_REACHED     → tüm kombinasyonlar denendi, hedef ulaşılamadı
   *   SOURCE_MISMATCH → rating kaynakları çelişiyor (bkz. inconsistentSources)
   *   FALLBACK        → arama atlandı (N>12, geçersiz hedef vb.)
   */
  status:                   'REACHED' | 'NOT_REACHED' | 'SOURCE_MISMATCH' | 'FALLBACK'
  /** Hedef rating tutuldu mu? (achievedIdx >= targetIdx) — geriye uyum, korunur */
  reachedTarget:            boolean
  /** Seçilen paket uygulandığında elde edilen gerçek rating */
  achievedRating:           RatingGrade
  /** Seçilen aksiyonların toplam tutarı (geriye uyum — selectedPackageAmountTRY ile eşdeğer) */
  totalAmountTRY:           number
  /** Seçilen paketteki raw satır sayısı (geriye uyum — rawSelectedActionCount ile eşdeğer) */
  selectedActionCount:      number
  /** Tam V3 portföyündeki aksiyon sayısı */
  fullPortfolioActionCount: number
  /** true → minimal subset bulunamadı veya search atlandı; tüm liste fallback */
  fallback:                 boolean
  /** Edge case açıklamaları (UI'da gösterim opsiyoneldir) */
  warnings:                 string[]
  /**
   * Seçilen pakette kapsanan farklı rasyo grubu sayısı (0..4).
   * Gruplar: LIQUIDITY, PROFITABILITY, LEVERAGE, ACTIVITY.
   * UI'da "4/4 grup kapsanmış" gösterimi için kullanılabilir.
   */
  coveredGroupCount:        number
  /**
   * true → currentActualRating >= target ama decisionCurrentRating < target.
   * İki rating kaynağı çelişiyor; engine portföyü gösteriliyor, UI'da uyarı üretilmeli.
   * Geriye uyum için korunur — status === 'SOURCE_MISMATCH' ile eşdeğerdir.
   */
  inconsistentSources?:     boolean

  // ── Faz 7.3.8d-FIX3: Sayım uyumu (debug / UI) ────────────────────────────
  /**
   * Raw satır sayısı — aynı actionId'nin birden fazla parçası (short/medium/long)
   * ayrı satır olarak sayılır. selectedActionCount ile eşdeğerdir (geriye uyum alias'ı).
   */
  rawSelectedActionCount:   number
  /**
   * Müşteri görünümü için consolidated aksiyon sayısı.
   * Aynı actionId'nin tüm parçaları tek satır sayılır
   * (= UI kart sayısı, dedupeActions + consolidateByActionId sonrası).
   */
  displayActionCount:       number
  /**
   * Tam motor portföyünün toplam tutarı (input fullPortfolio.reduce).
   * Hedef paket seçildiğinde totalAmountTRY'den farklı olabilir.
   */
  fullPortfolioAmountTRY:   number
  /**
   * Seçilen paketin toplam tutarı.
   * totalAmountTRY ile eşdeğerdir (geriye uyum alias'ı).
   */
  selectedPackageAmountTRY: number
}

export interface TargetPackageResult {
  /** UI'ın "Firma Ne Yapmalı?" listesinde göstereceği aksiyonlar */
  selectedActions: SelectedAction[]
  /** Paket meta verisi (UI banner'ları için) */
  meta:            TargetPackageMeta
  /** Son ölçülen post-action validation (debug/audit için) */
  validation:      ActualRatingValidation | null
}

/**
 * Alt küme araması için üst sınır.
 * 12 → 2^12-1 = 4095 alt küme (kabul edilebilir).
 * Üstünde patlama riski; greedy fallback uygulanır.
 */
const SUBSET_SEARCH_LIMIT = 12

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * actionId'nin "kısa prefix"ini döndürür (YOL B: split('_')[0]).
 * Aynı aksiyonun birden fazla horizon parçasını (short/medium/long) tek satırda
 * saymak için kullanılır.
 *
 * @example
 *   getShortActionId('A10_CASH_EQUITY_INJECTION')         // → 'A10'
 *   getShortActionId('A10B_PROMISSORY_NOTE_EQUITY_...')   // → 'A10B'
 *   getShortActionId('A15B_SHAREHOLDER_DEBT_TO_LT')       // → 'A15B'
 *   getShortActionId('LEGACY_ID')                         // → 'LEGACY' (sessiz fallback)
 */
function getShortActionId(actionId: string): string {
  return actionId.split('_')[0]
}

/** Geçerli bir RatingGrade ise normalize edip döner; değilse null. */
function tryParseRating(rating: string | undefined | null): RatingGrade | null {
  if (!rating) return null
  const clean = rating.trim().toUpperCase().replace(/[+-]/g, '')
  if ((RATING_ORDER as readonly string[]).includes(clean)) return clean as RatingGrade
  return null
}

/** Bir aksiyon listesinin transaction'larını dedupe ederek toplar (actionId+amountTRY). */
function flattenTransactions(actions: SelectedAction[]): AccountingTransaction[] {
  const seen = new Set<string>()
  const out: AccountingTransaction[] = []
  for (const a of actions) {
    const key = `${a.actionId}::${a.amountTRY}`
    if (seen.has(key)) continue
    seen.add(key)
    for (const t of (a.transactions ?? [])) out.push(t)
  }
  return out
}

/**
 * Lex-order combinations of indices [0..n-1] of size k.
 * yielded array sıralıdır → fullPortfolio sırası alt küme içinde korunur.
 */
function* combinationsOfSize(n: number, k: number): Generator<number[]> {
  if (k <= 0 || k > n) return
  const indices = Array.from({ length: k }, (_, i) => i)
  yield [...indices]
  while (true) {
    let i = k - 1
    while (i >= 0 && indices[i] === n - k + i) i--
    if (i < 0) return
    indices[i]++
    for (let j = i + 1; j < k; j++) {
      indices[j] = indices[j - 1] + 1
    }
    yield [...indices]
  }
}

// ─── ANA API ──────────────────────────────────────────────────────────────────

export interface SelectTargetPackageParams {
  /** V3 engine portföyü — engine sırasıyla gelmeli (priority/notch katkı) */
  portfolio:              SelectedAction[]
  /** Aksiyon öncesi bilanço bakiyeleri */
  initialBalances:        Record<string, number>
  /** Firma sektörü — ham string (score.ts'e iletilir) */
  sector:                 string
  /** Subjektif puan — sabit tutulur */
  subjectiveTotal:        number
  /** Mevcut objektif skor (route.ts hesaplar) */
  currentObjectiveScore:  number
  /** Mevcut kombine skor */
  currentCombinedScore:   number
  /** Mevcut gerçek rating (legacy notch'lu kabul edilir, normalize edilir) */
  currentActualRating:    string
  /**
   * Erken çıkış kararı için kullanılan rating kaynağı (opsiyonel).
   * Sağlanmazsa currentActualRating kullanılır (geriye uyumlu davranış).
   * route.ts'den engineResult.currentRating olarak geçirilmeli.
   * İki kaynak çelişirse (decisionCurrentRating < target ≤ currentActualRating)
   * boş portföy döndürülmez; engine portföyü + inconsistentSources uyarısı üretilir.
   */
  decisionCurrentRating?: string
  /** V3 engine'in tahmin ettiği post-rating */
  v3EstimatedRating:      string
  /** Kullanıcının istediği hedef rating */
  requestedTarget:        RatingGrade | string
}

export function selectTargetPackage(params: SelectTargetPackageParams): TargetPackageResult {
  const warnings: string[]   = []
  const fullPortfolio        = params.portfolio
  const fullCount            = fullPortfolio.length
  // R3.3 düzeltme (Codex 4): decisionCurrentRating fallback ile currentActualRating.
  // Hotfix VI sonrası route.ts decisionCurrentRating geçiriyor (er.currentRating).
  // targetGap ve erken çıkış kararı her zaman karar motoru kaynağına dayanmalı.
  const currentRatingSource  = params.decisionCurrentRating ?? params.currentActualRating
  const currentIdx           = ratingToIndex(currentRatingSource)
  const fallbackCurrent      = tryParseRating(params.currentActualRating) ?? 'C'

  // ── FIX3: Tam portföy türetilmiş sabitler (tüm return'lerde kullanılır) ──────
  const fullPortfolioAmountTRY = fullPortfolio.reduce((s, a) => s + (a.amountTRY ?? 0), 0)
  const fullDisplayCount       = new Set(fullPortfolio.map(a => getShortActionId(a.actionId))).size

  const targetGrade = tryParseRating(String(params.requestedTarget))

  // ── EDGE: Geçersiz hedef → tüm liste fallback ───────────────────────────────
  if (!targetGrade) {
    warnings.push(
      `Geçersiz hedef rating: '${params.requestedTarget}' — tüm aksiyon listesi gösteriliyor.`,
    )
    return {
      selectedActions: fullPortfolio,
      validation: null,
      meta: {
        status:                   'FALLBACK',
        reachedTarget:            false,
        achievedRating:           fallbackCurrent,
        totalAmountTRY:           fullPortfolioAmountTRY,
        selectedActionCount:      fullCount,
        fullPortfolioActionCount: fullCount,
        fallback:                 true,
        warnings,
        coveredGroupCount:        0,
        rawSelectedActionCount:   fullCount,
        displayActionCount:       fullDisplayCount,
        fullPortfolioAmountTRY,
        selectedPackageAmountTRY: fullPortfolioAmountTRY,
      },
    }
  }

  const targetIdx = ratingToIndex(targetGrade)

  // ── R3.3 ADIM 10: targetGap + desiredMinK — hedef-aware paket büyüklüğü ────────
  // targetGap: mevcut → hedef arası not adımı (0 ise zaten aşıldı)
  // desiredMinK: o gap için "anlamlı" minimum aksiyon sayısı
  //   gap=0 → 1 | gap=1 → 2 | gap=2 → 4 | gap=3 → 5 | gap≥4 → 6
  // Mantık: Büyük sıçramalar tek aksiyonla çözülemez; paket büyüklüğünü zorluyoruz.
  const targetGap = Math.max(targetIdx - currentIdx, 0)
  let desiredMinK: number
  if      (targetGap === 0) desiredMinK = 1
  else if (targetGap === 1) desiredMinK = 2
  else if (targetGap === 2) desiredMinK = 4
  else if (targetGap === 3) desiredMinK = 5
  else                       desiredMinK = 6
  desiredMinK = Math.min(desiredMinK, fullCount)

  // ── EDGE: Mevcut rating zaten hedefte/üstünde → boş paket (veya tutarsızlık) ─
  if (currentIdx >= targetIdx) {
    // decisionCurrentRating sağlandıysa kaynak tutarlılığını kontrol et.
    // Faz 7.3.19: currentActualRating >= target ama decisionCurrentRating < target
    // → engine farklı rating kaynağından analiz yaptı → boş dönme, portföyü göster.
    const decisionIdx = params.decisionCurrentRating !== undefined
      ? ratingToIndex(params.decisionCurrentRating)
      : currentIdx

    if (decisionIdx < targetIdx) {
      // Tutarsızlık: görünen rating hedefin üstünde ama engine hedefin altından çalıştı
      warnings.push(
        'Rating kaynakları arasında tutarsızlık tespit edildi. ' +
        'Görünen rating hedefin üstünde olsa da engine analizi aksiyonlar öneriyor. ' +
        'Engine portföyü gösteriliyor.',
      )
      const coveredGroupCount = getCoveredGroups(fullPortfolio.map(a => a.actionId)).size
      return {
        selectedActions: fullPortfolio,
        validation:      null,
        meta: {
          status:                   'SOURCE_MISMATCH',
          reachedTarget:            false,
          achievedRating:           fallbackCurrent,
          totalAmountTRY:           fullPortfolioAmountTRY,
          selectedActionCount:      fullCount,
          fullPortfolioActionCount: fullCount,
          fallback:                 true,
          warnings,
          coveredGroupCount,
          rawSelectedActionCount:   fullCount,
          displayActionCount:       fullDisplayCount,
          fullPortfolioAmountTRY,
          selectedPackageAmountTRY: fullPortfolioAmountTRY,
          inconsistentSources:      true,
        },
      }
    }

    // Normal: her iki kaynak da hedefin üstünde → hedef gerçekten aşıldı
    return {
      selectedActions: [],
      validation: null,
      meta: {
        status:                   'REACHED',
        reachedTarget:            true,
        achievedRating:           fallbackCurrent,
        totalAmountTRY:           0,
        selectedActionCount:      0,
        fullPortfolioActionCount: fullCount,
        fallback:                 false,
        warnings,
        coveredGroupCount:        0,
        rawSelectedActionCount:   0,
        displayActionCount:       0,
        fullPortfolioAmountTRY,
        selectedPackageAmountTRY: 0,
        inconsistentSources:      false,
      },
    }
  }

  // ── EDGE: Boş portföy ───────────────────────────────────────────────────────
  if (fullCount === 0) {
    warnings.push('Portföy boş — hedef rating elde edilemiyor.')
    return {
      selectedActions: [],
      validation: null,
      meta: {
        status:                   'NOT_REACHED',
        reachedTarget:            false,
        achievedRating:           fallbackCurrent,
        totalAmountTRY:           0,
        selectedActionCount:      0,
        fullPortfolioActionCount: 0,
        fallback:                 false,
        warnings,
        coveredGroupCount:        0,
        rawSelectedActionCount:   0,
        displayActionCount:       0,
        fullPortfolioAmountTRY:   0,
        selectedPackageAmountTRY: 0,
      },
    }
  }

  // ── KORUMA: N büyükse 2^N patlamasını engelle ───────────────────────────────
  if (fullCount > SUBSET_SEARCH_LIMIT) {
    warnings.push(
      `Aksiyon sayısı (${fullCount}) alt küme arama eşiğini (${SUBSET_SEARCH_LIMIT}) aşıyor — ` +
      'optimal paket araması atlandı, tüm portföy gösteriliyor.',
    )
    const transactions = flattenTransactions(fullPortfolio)
    const validation = calculateActualPostActionRating({
      initialBalances:        params.initialBalances,
      transactions,
      sector:                 params.sector,
      subjectiveTotal:        params.subjectiveTotal,
      v3EstimatedRating:      params.v3EstimatedRating,
      currentObjectiveScore:  params.currentObjectiveScore,
      currentCombinedScore:   params.currentCombinedScore,
      currentActualRating:    params.currentActualRating,
    })
    const achievedRating     = tryParseRating(validation.postActualRating) ?? fallbackCurrent
    const achievedIdx        = ratingToIndex(achievedRating)
    const coveredGroupCount  = getCoveredGroups(fullPortfolio.map(a => a.actionId)).size
    return {
      selectedActions: fullPortfolio,
      validation,
      meta: {
        status:                   'FALLBACK',
        reachedTarget:            achievedIdx >= targetIdx,
        achievedRating,
        totalAmountTRY:           fullPortfolioAmountTRY,
        selectedActionCount:      fullCount,
        fullPortfolioActionCount: fullCount,
        fallback:                 true,
        warnings,
        coveredGroupCount,
        rawSelectedActionCount:   fullCount,
        displayActionCount:       fullDisplayCount,
        fullPortfolioAmountTRY,
        selectedPackageAmountTRY: fullPortfolioAmountTRY,
      },
    }
  }

  // ── ALT KÜME ARAMASI: tüm feasible adayları topla, çeşitlilik-öncelikli sırala ──
  type Candidate = {
    indices:        number[]
    actionIds:      string[]            // getCoveredGroups için (tam catalog ID'leri)
    validation:     ActualRatingValidation
    achievedRating: RatingGrade
    achievedIdx:    number
    totalAmount:    number
  }

  /**
   * Aday karşılaştırıcı — R3.3 düzeltme (Gemini 3): targetGap'e göre çift modlu sıralama.
   *
   * KOLAY HEDEF (targetGap <= 1):
   *   1. desiredMinK eşiği desc   (≥ desiredMinK olanlar önce — Hotfix VI barajı)
   *   2. Rasyo grubu kapsama desc (dengeli paket)
   *   3. Aksiyon sayısı asc       (az aksiyon önce — Hotfix VI mantığı korunur)
   *
   * ZOR HEDEF (targetGap >= 2):
   *   1. Rasyo grubu kapsama desc (dengeli paket)
   *   2. |cardinality − desiredMinK| asc  (hedefe uygun boyut, hantal paketten kaçın)
   *
   * Her iki modda ortak sonlandırıcılar:
   *   3/4. Tutar asc       (daha düşük maliyet)
   *   4/5. achievedIdx asc (hedefi en az aşan)
   */
  function compareCandidate(a: Candidate, b: Candidate): number {
    const aGroups = getCoveredGroups(a.actionIds).size
    const bGroups = getCoveredGroups(b.actionIds).size
    const aSize   = a.indices.length
    const bSize   = b.indices.length

    if (targetGap <= 1) {
      // KOLAY HEDEF: Hotfix VI az-aksiyon mantığı + desiredMinK eşiği
      const aDesired = aSize >= desiredMinK ? 1 : 0
      const bDesired = bSize >= desiredMinK ? 1 : 0
      if (aDesired !== bDesired) return bDesired - aDesired        // eşik geçen önce
      if (aGroups  !== bGroups)  return bGroups - aGroups          // fazla grup önce
      if (aSize    !== bSize)    return aSize - bSize              // az aksiyon önce
    } else {
      // ZOR HEDEF: grup çeşitliliği, ardından desiredMinK yakınlığı
      if (aGroups !== bGroups) return bGroups - aGroups            // fazla grup önce
      const aDist = Math.abs(aSize - desiredMinK)
      const bDist = Math.abs(bSize - desiredMinK)
      if (aDist !== bDist) return aDist - bDist                    // desiredMinK'ye yakın önce
    }

    // Ortak sonlandırıcılar
    if (a.totalAmount !== b.totalAmount) return a.totalAmount - b.totalAmount
    return a.achievedIdx - b.achievedIdx
  }

  const allFeasible: Candidate[] = []
  let lastValidation: ActualRatingValidation | null = null

  /**
   * Alt küme aramasını verilen k aralığında çalıştır.
   * Sonuçları allFeasible'a push'lar, lastValidation'ı günceller.
   */
  function runSubsetSearch(kStart: number, kEnd: number): void {
    for (let k = kStart; k <= kEnd; k++) {
      for (const indices of combinationsOfSize(fullCount, k)) {
        const subset       = indices.map(i => fullPortfolio[i])
        const totalAmount  = subset.reduce((s, a) => s + (a.amountTRY ?? 0), 0)
        const transactions = flattenTransactions(subset)

        const validation = calculateActualPostActionRating({
          initialBalances:        params.initialBalances,
          transactions,
          sector:                 params.sector,
          subjectiveTotal:        params.subjectiveTotal,
          v3EstimatedRating:      params.v3EstimatedRating,
          currentObjectiveScore:  params.currentObjectiveScore,
          currentCombinedScore:   params.currentCombinedScore,
          currentActualRating:    params.currentActualRating,
        })
        lastValidation = validation

        const achievedRating = tryParseRating(validation.postActualRating) ?? fallbackCurrent
        const achievedIdx    = ratingToIndex(achievedRating)

        if (achievedIdx >= targetIdx) {
          allFeasible.push({
            indices:      [...indices],
            actionIds:    subset.map(a => a.actionId),
            validation,
            achievedRating,
            achievedIdx,
            totalAmount,
          })
        }
      }
    }
  }

  // R3.3 düzeltme (Codex 1): TÜM subset'leri k=1..fullCount tek çağrıyla tara.
  // Küçük feasible subset'ler büyük subset varlığında bile aday havuzunda kalır.
  // Sıralama kararı compareCandidate'e bırakılır (desiredMinK proximity + gap-aware).
  runSubsetSearch(1, fullCount)

  // ── EN İYİ ADAY: çeşitlilik → cardinality → tutar → yakınlık ────────────────
  if (allFeasible.length > 0) {
    allFeasible.sort(compareCandidate)
    const best = allFeasible[0]
    // indices sıralı geldiğinden (combinationsOfSize lex-order) fullPortfolio sırası korunur
    const selectedActions    = best.indices.map(i => fullPortfolio[i])
    const coveredGroupCount  = getCoveredGroups(best.actionIds).size
    const displayActionCount = new Set(best.actionIds.map(getShortActionId)).size
    return {
      selectedActions,
      validation: best.validation,
      meta: {
        status:                   'REACHED',
        reachedTarget:            true,
        achievedRating:           best.achievedRating,
        totalAmountTRY:           best.totalAmount,
        selectedActionCount:      selectedActions.length,
        fullPortfolioActionCount: fullCount,
        fallback:                 false,
        warnings,
        coveredGroupCount,
        rawSelectedActionCount:   selectedActions.length,
        displayActionCount,
        fullPortfolioAmountTRY,
        selectedPackageAmountTRY: best.totalAmount,
      },
    }
  }

  // ── EDGE: Hiçbir alt küme yeterli değil → tüm liste fallback ────────────────
  // Not: arama k=N'a kadar gittiğinden lastValidation tüm portföye aittir.
  warnings.push(
    'Mevcut aksiyonlarla hedef rating elde edilemiyor — tüm portföy gösteriliyor.',
  )
  // TypeScript control-flow narrowing cannot track mutations done inside nested
  // function declarations (runSubsetSearch). Use optional-chaining cast to bypass.
  const lv = lastValidation as ActualRatingValidation | null
  const finalAchieved: RatingGrade =
    tryParseRating(lv?.postActualRating ?? '') ?? fallbackCurrent

  return {
    selectedActions: fullPortfolio,
    validation: lv,
    meta: {
      status:                   'NOT_REACHED',
      reachedTarget:            false,
      achievedRating:           finalAchieved,
      totalAmountTRY:           fullPortfolioAmountTRY,
      selectedActionCount:      fullCount,
      fullPortfolioActionCount: fullCount,
      fallback:                 true,
      warnings,
      coveredGroupCount:        0,
      rawSelectedActionCount:   fullCount,
      displayActionCount:       fullDisplayCount,
      fullPortfolioAmountTRY,
      selectedPackageAmountTRY: fullPortfolioAmountTRY,
    },
  }
}
