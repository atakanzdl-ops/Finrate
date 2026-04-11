import { RatioResult } from './ratios'
import { calculateScore, getRatingMinimum, RATING_BANDS, scoreToRating } from './score'

export const RATING_MIN: Record<string, number> = Object.fromEntries(
  RATING_BANDS.map((band) => [band.label, band.min])
) as Record<string, number>

const RATING_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D']

export function getNextRating(rating: string): string | null {
  const idx = RATING_ORDER.indexOf(rating)
  if (idx <= 0) return null
  return RATING_ORDER[idx - 1]
}

export interface RatioSuggestion {
  key: keyof RatioResult
  label: string
  category: string
  currentValue: number | null
  targetValue: number
  unit: 'pct' | 'x' | 'day' | 'ratio'
  direction: 'up' | 'down'
  scoreGain: number
  marginalScoreGain: number
  actionText: string
  priority: 'KRİTİK' | 'ÖNEMLİ' | 'ORTA'
  difficulty: 'ORTA' | 'ZOR'
  timeHorizon: '0-90 Gün' | '3-6 Ay' | '6-12 Ay'
  confidenceScore: 'low' | 'medium' | 'high'
  dependencies: string[]
  actionFamily: 'liquidity' | 'profitability' | 'leverage' | 'working-capital'
}

export interface ActionPlan {
  label: 'minimum' | 'ideal'
  title: string
  targetScore: number
  projectedScore: number
  projectedRating: string
  achievable: boolean
  suggestions: RatioSuggestion[]
}

export interface OptimizationResult {
  currentRating: string
  currentScore: number
  targetRating: string
  targetScore: number
  gap: number
  achievable: boolean
  suggestions: RatioSuggestion[]
  projectedScore: number
  projectedRating: string
  minimumPlan: ActionPlan
  idealPlan: ActionPlan
}

function fmtVal(val: number | null, unit: RatioSuggestion['unit']): string {
  if (val == null) return '—'
  if (unit === 'pct') return `%${(val * 100).toFixed(1)}`
  if (unit === 'x') return `${val.toFixed(2)}x`
  if (unit === 'day') return `${Math.round(val)} gün`
  return val.toFixed(2)
}

function buildMeta(key: keyof RatioResult): Pick<RatioSuggestion, 'priority' | 'difficulty' | 'timeHorizon' | 'confidenceScore' | 'dependencies' | 'actionFamily'> {
  switch (key) {
    case 'currentRatio':
    case 'quickRatio':
      return {
        priority: 'ÖNEMLİ',
        difficulty: 'ORTA',
        timeHorizon: '0-90 Gün',
        confidenceScore: 'high',
        dependencies: [],
        actionFamily: 'liquidity',
      }
    case 'receivablesTurnoverDays':
    case 'inventoryTurnoverDays':
      return {
        priority: 'ÖNEMLİ',
        difficulty: 'ORTA',
        timeHorizon: '0-90 Gün',
        confidenceScore: 'high',
        dependencies: [],
        actionFamily: 'working-capital',
      }
    case 'netProfitMargin':
    case 'ebitdaMargin':
    case 'grossMargin':
    case 'roa':
      return {
        priority: 'KRİTİK',
        difficulty: 'ZOR',
        timeHorizon: '3-6 Ay',
        confidenceScore: 'medium',
        dependencies: [],
        actionFamily: 'profitability',
      }
    case 'debtToEquity':
    case 'debtToAssets':
    case 'interestCoverage':
      return {
        priority: 'KRİTİK',
        difficulty: 'ZOR',
        timeHorizon: '3-6 Ay',
        confidenceScore: 'high',
        dependencies: [],
        actionFamily: 'leverage',
      }
    case 'assetTurnover':
      return {
        priority: 'ORTA',
        difficulty: 'ORTA',
        timeHorizon: '6-12 Ay',
        confidenceScore: 'low',
        dependencies: [],
        actionFamily: 'working-capital',
      }
    default:
      return {
        priority: 'ORTA',
        difficulty: 'ORTA',
        timeHorizon: '3-6 Ay',
        confidenceScore: 'medium',
        dependencies: [],
        actionFamily: 'working-capital',
      }
  }
}

function simulatePlan(
  ratios: RatioResult,
  planSuggestions: RatioSuggestion[],
  currentScore: number,
  baseFinancialScore: number,
  targetScore: number,
  sector?: string | null,
): Omit<ActionPlan, 'label' | 'title'> {
  let projected = { ...ratios } as RatioResult
  for (const suggestion of planSuggestions) {
    projected = { ...projected, [suggestion.key]: suggestion.targetValue }
  }
  const projectedFinancialScore = calculateScore(projected, sector).finalScore
  const financialGain = projectedFinancialScore - baseFinancialScore
  const projectedScore = Math.round(Math.min(100, currentScore + financialGain * 0.70))
  return {
    targetScore,
    projectedScore,
    projectedRating: scoreToRating(projectedScore),
    achievable: projectedScore >= targetScore,
    suggestions: planSuggestions,
  }
}

export function findOptimalPath(
  ratios: RatioResult,
  currentScore: number,
  targetRating: string,
  sector?: string | null,
): OptimizationResult {
  const currentRating = scoreToRating(currentScore)
  const targetScore = getRatingMinimum(targetRating)
  const gap = Math.max(0, targetScore - currentScore)
  const baseFinancialScore = calculateScore(ratios, sector).finalScore

  function gain(key: keyof RatioResult, newVal: number): number {
    const modified = { ...ratios, [key]: newVal } as RatioResult
    const newFinancial = calculateScore(modified, sector).finalScore
    return (newFinancial - baseFinancialScore) * 0.70
  }

  const candidates: RatioSuggestion[] = []

  function pushCandidate(
    key: keyof RatioResult,
    label: string,
    category: string,
    currentValue: number | null,
    targetValue: number,
    unit: RatioSuggestion['unit'],
    direction: RatioSuggestion['direction'],
    scoreGain: number,
    actionText: string,
  ) {
    candidates.push({
      key,
      label,
      category,
      currentValue,
      targetValue,
      unit,
      direction,
      scoreGain,
      marginalScoreGain: scoreGain,
      actionText,
      ...buildMeta(key),
    })
  }

  const cr = ratios.currentRatio
  if (cr != null && cr < 2.5) {
    const target = Math.min(cr * 1.4, 2.5)
    const g = gain('currentRatio', target)
    if (g > 0.3) pushCandidate('currentRatio', 'Cari Oran', 'Likidite', cr, target, 'x', 'up', g, `Cari oranı ${fmtVal(cr, 'x')}'den ${fmtVal(target, 'x')}'e çıkarın. ① Kısa vadeli banka kredilerini 2+ yıl vadeye çevirmek için banka ile görüşün. ② Müşteri alacak vadelerini kısaltın — erken ödeme için %1-2 iskonto tanımlayın. ③ Stoklardaki yavaş dönen kalemleri indirimli satışa çıkararak nakit yaratın.`)
  }

  const qr = ratios.quickRatio
  if (qr != null && qr < 1.8) {
    const target = Math.min(qr * 1.35, 1.8)
    const g = gain('quickRatio', target)
    if (g > 0.3) pushCandidate('quickRatio', 'Asit-Test Oranı', 'Likidite', qr, target, 'x', 'up', g, `Asit-test oranını ${fmtVal(qr, 'x')}'den ${fmtVal(target, 'x')}'e çıkarın. ① Stok birikimini eriterek nakit elde edin — stoğa bağlı kaynağı serbest bırakın. ② Kısa vadeli borç ödemelerini uzun vadeye yeniden yapılandırın. ③ Kısa vadeli finansmandan (açık kredi) uzak durun; vadeli borç kullanın.`)
  }

  const npm = ratios.netProfitMargin
  if (npm != null && npm < 0.2) {
    const target = Math.min(npm + 0.04, 0.2)
    const g = gain('netProfitMargin', target)
    if (g > 0.3) pushCandidate('netProfitMargin', 'Net Kar Marjı', 'Karlılık', npm, target, 'pct', 'up', g, `Net kar marjını ${fmtVal(npm, 'pct')}'dan ${fmtVal(target, 'pct')}'a çıkarın. ① Faaliyet giderlerini kalem kalem analiz edin; %10 gider azaltması doğrudan kâra yansır. ② Fiyat listesini gözden geçirin — satış hacmini düşürmeden yapılabiliyorsa fiyat artışı öncelikli. ③ Yüksek faizli kredileri refinanse edin; faiz gideri azalınca net kâr otomatik artar.`)
  }

  const em = ratios.ebitdaMargin
  if (em != null && em < 0.25) {
    const target = Math.min(em + 0.05, 0.25)
    const g = gain('ebitdaMargin', target)
    if (g > 0.3) pushCandidate('ebitdaMargin', 'FAVÖK Marjı', 'Karlılık', em, target, 'pct', 'up', g, `FAVÖK marjını ${fmtVal(em, 'pct')}'dan ${fmtVal(target, 'pct')}'a çıkarın. ① Tedarikçilerle fiyat müzakeresi yapın veya alternatif tedarik kaynağı arayın — hammadde maliyeti düşerse FAVÖK doğrudan artar. ② Kira, personel, enerji giderlerini gözden geçirin; verimsiz alanları kapatın veya kiraya verin. ③ Düşük marjlı müşteri/ürün grubunu yeniden fiyatlandırın ya da ürün karmasından çıkarın.`)
  }

  const gm = ratios.grossMargin
  if (gm != null && gm < 0.45) {
    const target = Math.min(gm + 0.06, 0.45)
    const g = gain('grossMargin', target)
    if (g > 0.3) pushCandidate('grossMargin', 'Brüt Kar Marjı', 'Karlılık', gm, target, 'pct', 'up', g, `Brüt marjı ${fmtVal(gm, 'pct')}'dan ${fmtVal(target, 'pct')}'a artırın. ① Toplu alım veya uzun vadeli tedarik sözleşmesiyle hammadde maliyetini indirin. ② Maliyet bazlı fiyatlandırma yerine değer bazlı model deneyin — rakip analizi yapın. ③ Yüksek marjlı ürün/hizmetlere satış ağırlığını kaydırın; düşük marjlı kalemler için fiyat artışı yapın.`)
  }

  const roa = ratios.roa
  if (roa != null && roa < 0.15) {
    const target = Math.min(roa + 0.04, 0.15)
    const g = gain('roa', target)
    if (g > 0.3) pushCandidate('roa', 'Aktif Karlılığı (ROA)', 'Karlılık', roa, target, 'pct', 'up', g, `ROA'yı ${fmtVal(roa, 'pct')}'dan ${fmtVal(target, 'pct')}'a çıkarın. ① Atıl makine, taşıt veya gayrimenkul satın ya da kiraya verin — aktif küçülürse aynı kârla oran artar. ② Aynı varlık tabanıyla satış hacmini artırın; kapasite kullanım oranını yükseltin. ③ Net kârı artırmak için yukarıdaki gelir/gider aksiyonlarını paralel uygulayın.`)
  }

  const dte = ratios.debtToEquity
  if (dte != null && dte > 0.4) {
    const target = Math.max(dte * 0.65, 0.3)
    const g = gain('debtToEquity', target)
    if (g > 0.3) pushCandidate('debtToEquity', 'Borç/Özkaynak', 'Kaldıraç', dte, target, 'x', 'down', g, `Borç/özkaynak oranını ${fmtVal(dte, 'x')}'den ${fmtVal(target, 'x')}'e indirin. ① Kâr dağıtmayı durdurun; birikmiş kârı özkaynakta tutun — her yıl dağıtılmayan kâr oranı düşürür. ② Ortak veya yeni hissedar aracılığıyla sermaye artışı yapın. ③ Mevcut kredileri erken kapatın; yeni kredi almaktan kaçının.`)
  }

  const dta = ratios.debtToAssets
  if (dta != null && dta > 0.25) {
    const target = Math.max(dta * 0.65, 0.2)
    const g = gain('debtToAssets', target)
    if (g > 0.3) pushCandidate('debtToAssets', 'Borç/Aktif', 'Kaldıraç', dta, target, 'ratio', 'down', g, `Borç/aktif oranını ${fmtVal(dta, 'ratio')}'den ${fmtVal(target, 'ratio')}'e indirin. ① Toplam borcu azaltın: yeni kredi kullanmayın, mevcut borçları öncelikli kapatın. ② Kâr birikimi veya sermaye artışıyla özkaynak tarafını güçlendirin — aktif tabanı büyüdükçe oran düşer. ③ Yüksek faizli kısa vadeli kredi yerine düşük faizli uzun vadeli kaynak kullanın.`)
  }

  const ic = ratios.interestCoverage
  if (ic != null && ic < 8) {
    const target = Math.min(ic * 1.5, 8)
    const g = gain('interestCoverage', target)
    if (g > 0.3) pushCandidate('interestCoverage', 'Faiz Karşılama', 'Kaldıraç', ic, target, 'x', 'up', g, `Faiz karşılama oranını ${fmtVal(ic, 'x')}'den ${fmtVal(target, 'x')}'e çıkarın. ① Yüksek faizli kredileri daha düşük maliyetli finansmanla değiştirin; bankayla faiz indirimi müzakeresi yapın. ② FAVÖK'ü artırın — daha fazla nakit faiz yükünü karşılar. ③ Kullanılmayan kredi limitlerini kapatın; gereksiz finansman maliyetini sıfırlayın.`)
  }

  const rec = ratios.receivablesTurnoverDays
  if (rec != null && rec > 20) {
    const target = Math.max(rec * 0.65, 20)
    const g = gain('receivablesTurnoverDays', target)
    if (g > 0.3) pushCandidate('receivablesTurnoverDays', 'Alacak Tahsil Süresi', 'Faaliyet', rec, target, 'day', 'down', g, `Alacak tahsil süresini ${fmtVal(rec, 'day')}'den ${fmtVal(target, 'day')}'e kısaltın. ① Vadesi geçmiş alacaklar için hukuki ihtar gönderin; gecikme faizi uygulayın. ② Erken ödeme yapan müşterilere %1-2 iskonto tanımlayın. ③ Yeni müşterilerde azami 30 gün vade politikası uygulayın; büyük siparişlerde avans isteyin.`)
  }

  const inv = ratios.inventoryTurnoverDays
  if (inv != null && inv > 15) {
    const target = Math.max(inv * 0.65, 15)
    const g = gain('inventoryTurnoverDays', target)
    if (g > 0.3) pushCandidate('inventoryTurnoverDays', 'Stok Devir Süresi', 'Faaliyet', inv, target, 'day', 'down', g, `Stok devir süresini ${fmtVal(inv, 'day')}'den ${fmtVal(target, 'day')}'e indirin. ① ABC analizi yapın: yavaş dönen C grubu ürünleri indirimli satışa çıkarın. ② Minimum stok seviyeleri belirleyin; talep tahminine göre sipariş verin (just-in-time). ③ Bozulma veya demode riski taşıyan stokları elden çıkarın — nakit yaratın.`)
  }

  const at = ratios.assetTurnover
  if (at != null && at < 2.0) {
    const target = Math.min(at * 1.35, 2.0)
    const g = gain('assetTurnover', target)
    if (g > 0.3) pushCandidate('assetTurnover', 'Aktif Devir Hızı', 'Faaliyet', at, target, 'x', 'up', g, `Aktif devir hızını ${fmtVal(at, 'x')}'den ${fmtVal(target, 'x')}'e çıkarın. ① Mevcut müşterilere çapraz satış veya yeni müşteri kazanımıyla ciroyu artırın. ② Kapasite kullanım oranını yükseltin — aynı varlıkla daha fazla satış yapın. ③ Atıl makine, araç veya gayrimenkulü satın ya da kiraya verin; aktif tabanını sadeleştirin.`)
  }

  const familyCounts = new Map<RatioSuggestion['actionFamily'], number>()
  const rankedCandidates = [...candidates].sort((a, b) => b.scoreGain - a.scoreGain)
  const suggestions: RatioSuggestion[] = []

  for (const candidate of rankedCandidates) {
    const count = familyCounts.get(candidate.actionFamily) ?? 0
    if (count >= 2) continue
    const diminishedGain = candidate.scoreGain * (count === 0 ? 1 : 0.6)
    const adjustedCandidate = {
      ...candidate,
      marginalScoreGain: Math.round(diminishedGain * 100) / 100,
      scoreGain: Math.round(diminishedGain * 100) / 100,
    }
    suggestions.push(adjustedCandidate)
    familyCounts.set(candidate.actionFamily, count + 1)
    if (suggestions.length >= 5) break
  }

  const idealBase = simulatePlan(ratios, suggestions, currentScore, baseFinancialScore, targetScore, sector)

  const minimumSuggestions: RatioSuggestion[] = []
  for (const suggestion of suggestions) {
    minimumSuggestions.push(suggestion)
    const plan = simulatePlan(ratios, minimumSuggestions, currentScore, baseFinancialScore, targetScore, sector)
    if (plan.projectedScore >= targetScore) break
  }

  for (let i = minimumSuggestions.length - 1; i >= 0; i -= 1) {
    const testSuggestions = minimumSuggestions.filter((_, index) => index !== i)
    if (testSuggestions.length === 0) continue
    const testPlan = simulatePlan(ratios, testSuggestions, currentScore, baseFinancialScore, targetScore, sector)
    if (testPlan.projectedScore >= targetScore) {
      minimumSuggestions.splice(i, 1)
    }
  }

  const minimumBase = simulatePlan(ratios, minimumSuggestions, currentScore, baseFinancialScore, targetScore, sector)

  return {
    currentRating,
    currentScore,
    targetRating,
    targetScore,
    gap,
    achievable: idealBase.achievable,
    suggestions,
    projectedScore: idealBase.projectedScore,
    projectedRating: idealBase.projectedRating,
    minimumPlan: {
      label: 'minimum',
      title: 'Minimum set',
      ...minimumBase,
    },
    idealPlan: {
      label: 'ideal',
      title: 'Ideal set',
      ...idealBase,
    },
  }
}

