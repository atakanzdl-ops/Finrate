/**
 * SEMANTIC GUARDRAILS (V3-7) — ACTION VALIDITY AND PORTFOLIO SANITY LAYER
 *
 * Bu katman AKSIYONUN GEÇERLİLİĞİNİ denetler, kalitesini DEĞİL.
 *
 * V3-4 (qualityEngine) ile sınır:
 *   V3-4 = "Bu aksiyon ne kadar kaliteli?" → quality penalty
 *   V3-7 = "Bu aksiyon uygulanabilir mi, mantıklı mı?" → engel veya uyarı
 *
 * 3 Seviyeli Severity:
 *   HARD_REJECT    — Aksiyon uygulanamaz (fiziksel/mantıksal imkânsızlık)
 *   SOFT_BLOCK     — Teknik mümkün ama çok zayıf/tartışmalı
 *   WARNING        — Dikkat gerektiren durum
 *   INFO           — Sadece açıklama (hukuki prosedür, süre vb)
 *
 * Kapsam:
 *   1. Semantic direction guard (yön-duyarlı iyileşme/kötüleşme)
 *   2. Economic impossibility (kaynak yetersizliği, fiziksel sınır)
 *   3. Cross-action dependency (dependency graph)
 *   4. Temporal realism (horizon içi gerçekçilik)
 *   5. Legal/regulatory sanity (hukuki uyarılar)
 *   6. Portfolio aggregate rule DEFINITIONS (uygulama V3-10'da)
 *
 * V3-10 orchestrator bu kuralları iteratif seçim sırasında uygular.
 */

import type {
  SectorCode,
  ActionTemplateV3,
  AccountingTransaction,
  AccountingLeg,
} from './contracts'

import type { SectorBenchmark } from '../benchmarks'

// Tipler kullanılıyor; TypeScript yanlış pozitif vermemesi için
void 0 as unknown as SectorCode
void 0 as unknown as AccountingLeg
void 0 as unknown as SectorBenchmark

// ─── SEVERITY TİPİ VE GUARDRAIL RESULT ───────────────────────────────────────

/** Guardrail severity seviyeleri */
export type GuardrailSeverity =
  | 'HARD_REJECT'   // Aksiyon uygulanamaz
  | 'SOFT_BLOCK'    // Teknik mümkün ama çok zayıf
  | 'WARNING'       // Dikkat gerektiren durum
  | 'INFO'          // Sadece açıklama
  | 'PASS'          // Tüm kontrollerden geçti

/** Guardrail kural kodu */
export type GuardrailRuleCode =
  // Semantic direction
  | 'SEMANTIC_DIRECTION_VIOLATION'
  // Economic impossibility
  | 'INSUFFICIENT_SOURCE_BALANCE'
  | 'EXCEEDS_ASSET_SIZE'
  | 'EXCEEDS_REVENUE_BASE'
  | 'NEGATIVE_BALANCE_CREATION'
  | 'NET_LIQUIDITY_VIOLATION'
  // Cross-action dependency
  | 'MISSING_PREREQUISITE_ACTION'
  | 'MUTUALLY_EXCLUSIVE_CONFLICT'
  | 'CIRCULAR_DEPENDENCY'
  // Temporal realism
  | 'HORIZON_UNREALISTIC_AMOUNT'
  | 'HORIZON_TIMING_TOO_AGGRESSIVE'
  // Legal/regulatory
  | 'REQUIRES_LEGAL_PROCEDURE'
  | 'REQUIRES_SHAREHOLDER_APPROVAL'
  | 'ASSET_MAY_BE_ENCUMBERED'
  // Portfolio aggregate (V3-10 için)
  | 'PORTFOLIO_EQUITY_INFLATION'
  | 'PORTFOLIO_CASH_INCOHERENCE'
  | 'PORTFOLIO_REVENUE_UNREALISTIC'
  | 'PORTFOLIO_LIQUIDITY_NET_NEGATIVE'

export interface GuardrailResult {
  pass:             boolean
  severity:         GuardrailSeverity
  ruleCode:         GuardrailRuleCode | null
  message:          string
  affectedActionId: string
  /** Gereken aksiyon ID'leri (dependency durumunda) */
  requiresActionIds?: string[]
  /** Çakışan aksiyon ID'leri (mutually exclusive) */
  conflictsWithActionIds?: string[]
  /** Portföy seviyesinde mi yoksa tek aksiyon mu? */
  portfolioLevel:   boolean
  /** Ek context */
  context?: Record<string, unknown>
}

/** Birden fazla guardrail sonucu */
export interface GuardrailReport {
  results:         GuardrailResult[]
  hasHardReject:   boolean
  hasSoftBlock:    boolean
  hasWarning:      boolean
  highestSeverity: GuardrailSeverity
}

// ─── DEPENDENCY GRAPH ─────────────────────────────────────────────────────────

/**
 * Aksiyon bağımlılık grafiği.
 * Her aksiyonun hangi aksiyonlara ihtiyaç duyduğu, hangilerini tercih ettiği,
 * hangileriyle çakıştığı, hangilerini engellediği tanımlı.
 *
 * NET LIQUIDITY FIELDS (ChatGPT review eklemesi):
 *   consumesLiquidity: Bu aksiyon nakit tüketir (örn. A04)
 *   producesLiquidity: Bu aksiyon nakit üretir (örn. A05, A06, A10)
 *   liquidityImpactRatio: Tutarın ne kadarı nakit etkisi yaratır (0-1)
 */
export interface ActionDependencySpec {
  /** Bu aksiyon çalışabilmesi için önce olması gereken aksiyonlar */
  requires?: string[]
  /** Bu aksiyondan önce yapılması tercih edilen aksiyonlar (hard zorunlu değil) */
  preferredAfter?: string[]
  /** Bu aksiyonla birlikte yapılamayacak aksiyonlar */
  mutuallyExclusiveWith?: string[]
  /** Bu aksiyon bu aksiyonların anlamını ortadan kaldırır */
  blocks?: string[]
  /** Kendi kaynak gereksinimi (hesap kodları) */
  sourceAccountRequirements?: string[]
  /** Minimum bakiye gereksinimi */
  minSourceBalance?: number
  /** Firmanın kârda olması gerekir mi (A11 gibi) */
  requiresPositiveEarnings?: boolean
  /** Nakit tüketen aksiyon mu */
  consumesLiquidity?: boolean
  /** Nakit üreten aksiyon mu */
  producesLiquidity?: boolean
  /** Nakit etkisi oranı — tutarın ne kadarı nakit akımına dokunur */
  liquidityImpactRatio?: number
}

export const ACTION_DEPENDENCY_GRAPH: Record<string, ActionDependencySpec> = {
  A01_ST_FIN_DEBT_TO_LT: {
    sourceAccountRequirements: ['300', '303', '304'],
    minSourceBalance: 1_000_000,
    liquidityImpactRatio: 0,  // Sadece reclass, nakit etkisi yok
  },
  A02_TRADE_PAYABLE_TO_LT: {
    sourceAccountRequirements: ['320', '321'],
    minSourceBalance: 1_000_000,
    liquidityImpactRatio: 0,
  },
  A03_ADVANCE_TO_LT: {
    sourceAccountRequirements: ['340'],
    minSourceBalance: 1_000_000,
    liquidityImpactRatio: 0,
  },
  A04_CASH_PAYDOWN_ST: {
    sourceAccountRequirements: ['102'],
    preferredAfter: ['A05_RECEIVABLE_COLLECTION', 'A06_INVENTORY_MONETIZATION', 'A08_FIXED_ASSET_DISPOSAL', 'A10_CASH_EQUITY_INJECTION'],
    minSourceBalance: 500_000,
    consumesLiquidity: true,
    liquidityImpactRatio: 1.0,  // Tam nakit çıkışı
  },
  A05_RECEIVABLE_COLLECTION: {
    sourceAccountRequirements: ['120', '121'],
    minSourceBalance: 500_000,
    producesLiquidity: true,
    liquidityImpactRatio: 1.0,
  },
  A06_INVENTORY_MONETIZATION: {
    sourceAccountRequirements: ['150', '151', '152', '153'],
    minSourceBalance: 1_000_000,
    producesLiquidity: true,
    liquidityImpactRatio: 0.85,  // Stok %85'i nakde dönüşür tipik
  },
  A07_PREPAID_RELEASE: {
    sourceAccountRequirements: ['180'],
    minSourceBalance: 250_000,
    producesLiquidity: true,
    liquidityImpactRatio: 0.80,
  },
  A08_FIXED_ASSET_DISPOSAL: {
    sourceAccountRequirements: ['252', '253', '254'],
    mutuallyExclusiveWith: ['A09_SALE_LEASEBACK'],
    minSourceBalance: 2_000_000,
    producesLiquidity: true,
    liquidityImpactRatio: 0.70,  // Amortisman + satış değeri ilişkisi
  },
  A09_SALE_LEASEBACK: {
    sourceAccountRequirements: ['252', '253', '254'],
    mutuallyExclusiveWith: ['A08_FIXED_ASSET_DISPOSAL'],
    minSourceBalance: 2_000_000,
    producesLiquidity: true,
    liquidityImpactRatio: 0.80,
  },
  A10_CASH_EQUITY_INJECTION: {
    producesLiquidity: true,
    liquidityImpactRatio: 1.0,
  },
  A11_RETAIN_EARNINGS: {
    sourceAccountRequirements: ['590'],
    requiresPositiveEarnings: true,
    minSourceBalance: 500_000,
    liquidityImpactRatio: 0,  // Sadece özkaynak aktarımı
  },
  A12_GROSS_MARGIN_IMPROVEMENT: {
    sourceAccountRequirements: ['600', '621'],
    producesLiquidity: true,
    liquidityImpactRatio: 0.30,  // Gelir iyileşmesi uzun vadede nakde döner
  },
  A13_OPEX_OPTIMIZATION: {
    // Duzeltme: 770-772 maliyet merkezi hesaplari cogu KOBİ'de yok.
    // 630-632 standart P&L gider hesaplari (AR-GE / Pazarlama / Genel Yonetim).
    sourceAccountRequirements: ['630', '631', '632'],
    producesLiquidity: true,
    liquidityImpactRatio: 0.50,
  },
  A14_FINANCE_COST_REDUCTION: {
    sourceAccountRequirements: ['780'],
    producesLiquidity: true,
    liquidityImpactRatio: 0.40,
  },
  A15_DEBT_TO_EQUITY_SWAP: {
    sourceAccountRequirements: ['331'],
    minSourceBalance: 1_000_000,
    liquidityImpactRatio: 0,  // Genelde nakit yok, sadece reclass
  },
  A16_CASH_BUFFER_BUILD: {
    preferredAfter: ['A05_RECEIVABLE_COLLECTION', 'A06_INVENTORY_MONETIZATION', 'A08_FIXED_ASSET_DISPOSAL', 'A10_CASH_EQUITY_INJECTION'],
    requires: ['A10_CASH_EQUITY_INJECTION'],
    liquidityImpactRatio: 0,  // Türetilmiş — bağımsız nakit etkisi yok
  },
  A17_KKEG_CLEANUP: {
    liquidityImpactRatio: 0.20,  // Vergi tasarrufu dolaylı nakit
  },
  A18_NET_SALES_GROWTH: {
    sourceAccountRequirements: ['600'],
    producesLiquidity: true,
    liquidityImpactRatio: 0.60,
  },
  A19_ADVANCE_TO_REVENUE: {
    sourceAccountRequirements: ['340'],
    minSourceBalance: 1_000_000,
    liquidityImpactRatio: 0,  // Avansı zaten nakit girmişti, sadece hasılata tanınıyor
  },
  A20_YYI_MONETIZATION: {
    sourceAccountRequirements: ['350', '351', '352', '353', '354', '355', '356', '357', '358'],
    minSourceBalance: 2_000_000,
    producesLiquidity: true,
    liquidityImpactRatio: 0.75,
  },
}

// ─── GİRDİ TİPLERİ ───────────────────────────────────────────────────────────

export interface GuardrailCheckInput {
  /** Denetlenecek aksiyon */
  action: ActionTemplateV3
  /** Aksiyon uygulandığında oluşacak muhasebe hareketleri */
  transactions: AccountingTransaction[]
  /** Önerilen tutar */
  proposedAmountTRY: number
  /** Firmanın güncel hesap bakiyeleri */
  accountBalances: Record<string, number>
  /** Firmanın büyüklük göstergeleri */
  firmContext: {
    totalAssets:   number
    totalEquity:   number
    totalRevenue:  number
    netIncome:     number
    sector:        SectorCode
  }
  /** Seçilen ufuk */
  horizon: 'short' | 'medium' | 'long'
  /** Bu scenario'da önceden seçilmiş aksiyonların ID listesi */
  previouslySelectedActionIds: string[]
}

export interface PortfolioGuardrailInput {
  portfolio: Array<{
    actionId:  string
    amountTRY: number
  }>
  firmContext: {
    totalAssets:  number
    totalEquity:  number
    totalRevenue: number
    netIncome:    number
  }
}

// ─── 1. SEMANTIC DIRECTION GUARD ─────────────────────────────────────────────

/**
 * Transaction'ın yönünün semantik olarak tutarlı olduğunu kontrol eder.
 * Örnek: A15 Debt-to-Equity Swap — 331/500 vs 331/102 ayrımı.
 */
export function checkSemanticDirection(
  input: GuardrailCheckInput,
): GuardrailResult {
  const { action, transactions } = input

  // A15 Debt-to-Equity Swap özel kontrol
  if (action.id === 'A15_DEBT_TO_EQUITY_SWAP') {
    const hasEquityCredit = transactions.some(tx =>
      tx.legs.some(l => l.accountCode === '500' && l.side === 'CREDIT')
    )
    const hasCashCredit = transactions.some(tx =>
      tx.legs.some(l => l.accountCode === '102' && l.side === 'CREDIT')
    )

    if (hasEquityCredit && !hasCashCredit) {
      return {
        pass: true,
        severity: 'WARNING',
        ruleCode: 'SEMANTIC_DIRECTION_VIOLATION',
        message: 'Ortak borcu sermayeye çevriliyor — nakit girişi yok, sadece muhasebesel düzeltme',
        affectedActionId: action.id,
        portfolioLevel: false,
      }
    }
  }

  return passResult(action.id)
}

// ─── 2. ECONOMIC IMPOSSIBILITY CHECKS ────────────────────────────────────────

export function checkEconomicImpossibility(
  input: GuardrailCheckInput,
): GuardrailResult {
  const { action, proposedAmountTRY, accountBalances, firmContext } = input
  const spec = ACTION_DEPENDENCY_GRAPH[action.id]

  // 1. Kaynak hesap bakiye kontrolü
  if (spec?.sourceAccountRequirements) {
    const totalSource = spec.sourceAccountRequirements.reduce((sum, code) => {
      return sum + Math.abs(accountBalances[code] ?? 0)
    }, 0)

    if (totalSource < proposedAmountTRY && !isSourceIrrelevant(action.id)) {
      return {
        pass: false,
        severity: 'HARD_REJECT',
        ruleCode: 'INSUFFICIENT_SOURCE_BALANCE',
        message: `Kaynak bakiye yetersiz: ${(totalSource / 1e6).toFixed(1)}M TL mevcut, ${(proposedAmountTRY / 1e6).toFixed(1)}M TL gerekiyor`,
        affectedActionId: action.id,
        portfolioLevel: false,
        context: {
          totalSource,
          proposedAmountTRY,
          sourceAccounts: spec.sourceAccountRequirements,
        },
      }
    }
  }

  // 2. Minimum bakiye kontrolü
  if (spec?.minSourceBalance && proposedAmountTRY < spec.minSourceBalance) {
    return {
      pass: false,
      severity: 'SOFT_BLOCK',
      ruleCode: 'INSUFFICIENT_SOURCE_BALANCE',
      message: `Önerilen tutar minimum eşiğin altında: ${(proposedAmountTRY / 1e6).toFixed(2)}M TL < ${(spec.minSourceBalance / 1e6).toFixed(2)}M TL eşik`,
      affectedActionId: action.id,
      portfolioLevel: false,
    }
  }

  // 3. Aktif büyüklüğü kontrolü
  if (proposedAmountTRY > firmContext.totalAssets * 0.8) {
    return {
      pass: false,
      severity: 'HARD_REJECT',
      ruleCode: 'EXCEEDS_ASSET_SIZE',
      message: `Önerilen tutar aktif büyüklüğünün %80'ini aşıyor (${(proposedAmountTRY / 1e6).toFixed(1)}M TL vs aktif ${(firmContext.totalAssets / 1e6).toFixed(1)}M TL)`,
      affectedActionId: action.id,
      portfolioLevel: false,
    }
  }

  // 4. Hasılat bazlı aksiyonlar
  const revenueBasedActions = ['A18_NET_SALES_GROWTH', 'A12_GROSS_MARGIN_IMPROVEMENT']
  if (revenueBasedActions.includes(action.id)) {
    const revenueLimit = firmContext.totalRevenue *
      (action.id === 'A18_NET_SALES_GROWTH' ? 1.5 : 0.3)
    if (proposedAmountTRY > revenueLimit) {
      return {
        pass: false,
        severity: 'HARD_REJECT',
        ruleCode: 'EXCEEDS_REVENUE_BASE',
        message: `${action.name} için önerilen tutar hasılat bazını aşıyor (${(proposedAmountTRY / 1e6).toFixed(1)}M TL vs limit ${(revenueLimit / 1e6).toFixed(1)}M TL)`,
        affectedActionId: action.id,
        portfolioLevel: false,
      }
    }
  }

  // 5. Pozitif kâr kontrolü
  if (spec?.requiresPositiveEarnings && firmContext.netIncome <= 0) {
    return {
      pass: false,
      severity: 'HARD_REJECT',
      ruleCode: 'INSUFFICIENT_SOURCE_BALANCE',
      message: `${action.name} için firma kârlı olmalı (mevcut net kâr: ${(firmContext.netIncome / 1e6).toFixed(1)}M TL)`,
      affectedActionId: action.id,
      portfolioLevel: false,
    }
  }

  return passResult(action.id)
}

function isSourceIrrelevant(actionId: string): boolean {
  return actionId === 'A10_CASH_EQUITY_INJECTION' || actionId === 'A16_CASH_BUFFER_BUILD'
}

// ─── 3. CROSS-ACTION DEPENDENCY CHECK ────────────────────────────────────────

export function checkCrossActionDependency(
  input: GuardrailCheckInput,
): GuardrailResult {
  const { action, previouslySelectedActionIds } = input
  const spec = ACTION_DEPENDENCY_GRAPH[action.id]

  if (!spec) return passResult(action.id)

  // 1. Requires kontrolü
  if (spec.requires && spec.requires.length > 0) {
    const missingRequired = spec.requires.filter(
      reqId => !previouslySelectedActionIds.includes(reqId)
    )
    if (missingRequired.length > 0) {
      return {
        pass: false,
        severity: 'HARD_REJECT',
        ruleCode: 'MISSING_PREREQUISITE_ACTION',
        message: `${action.name} için gerekli ön aksiyonlar eksik: ${missingRequired.join(', ')}`,
        affectedActionId: action.id,
        requiresActionIds: missingRequired,
        portfolioLevel: false,
      }
    }
  }

  // 2. Mutually exclusive kontrolü
  if (spec.mutuallyExclusiveWith && spec.mutuallyExclusiveWith.length > 0) {
    const conflicting = spec.mutuallyExclusiveWith.filter(
      exId => previouslySelectedActionIds.includes(exId)
    )
    if (conflicting.length > 0) {
      return {
        pass: false,
        severity: 'HARD_REJECT',
        ruleCode: 'MUTUALLY_EXCLUSIVE_CONFLICT',
        message: `${action.name} aynı anda uygulanamayacak aksiyonlarla çakışıyor: ${conflicting.join(', ')}`,
        affectedActionId: action.id,
        conflictsWithActionIds: conflicting,
        portfolioLevel: false,
      }
    }
  }

  // 3. Preferred after
  if (spec.preferredAfter && spec.preferredAfter.length > 0) {
    const anyPreferredSelected = spec.preferredAfter.some(
      prefId => previouslySelectedActionIds.includes(prefId)
    )
    if (!anyPreferredSelected && previouslySelectedActionIds.length > 0) {
      return {
        pass: true,
        severity: 'WARNING',
        ruleCode: 'MISSING_PREREQUISITE_ACTION',
        message: `${action.name} için şunlar tercih edilir (zorunlu değil): ${spec.preferredAfter.join(', ')}`,
        affectedActionId: action.id,
        requiresActionIds: spec.preferredAfter,
        portfolioLevel: false,
      }
    }
  }

  return passResult(action.id)
}

// ─── 4. TEMPORAL REALISM CHECK ────────────────────────────────────────────────

export function checkTemporalRealism(
  input: GuardrailCheckInput,
): GuardrailResult {
  const { action, horizon, proposedAmountTRY, firmContext } = input

  // Short ufuk + büyük A10 → soft block
  if (horizon === 'short' && action.id === 'A10_CASH_EQUITY_INJECTION') {
    const isLarge = proposedAmountTRY > firmContext.totalEquity * 0.5
    if (isLarge) {
      return {
        pass: false,
        severity: 'SOFT_BLOCK',
        ruleCode: 'HORIZON_TIMING_TOO_AGGRESSIVE',
        message: `3 ay içinde özkaynağın %50 üzerinde sermaye artışı gerçekçi değil (TTK prosedürü, ortak onayı vb.)`,
        affectedActionId: action.id,
        portfolioLevel: false,
      }
    }
  }

  // Short ufuk + A08 varlık satışı → uyarı
  if (horizon === 'short' && action.id === 'A08_FIXED_ASSET_DISPOSAL') {
    return {
      pass: true,
      severity: 'WARNING',
      ruleCode: 'HORIZON_UNREALISTIC_AMOUNT',
      message: `Duran varlık satışı 3 ayda gerçekleşmesi nadirdir — piyasa koşulları ve değerleme süreçleri gerekir`,
      affectedActionId: action.id,
      portfolioLevel: false,
    }
  }

  // Short ufuk + A18 satış artışı → büyükse warning
  if (horizon === 'short' && action.id === 'A18_NET_SALES_GROWTH') {
    const isLarge = proposedAmountTRY > firmContext.totalRevenue * 0.15
    if (isLarge) {
      return {
        pass: true,
        severity: 'WARNING',
        ruleCode: 'HORIZON_UNREALISTIC_AMOUNT',
        message: `3 ayda hasılatın %15'inden fazla organik büyüme olağandışıdır`,
        affectedActionId: action.id,
        portfolioLevel: false,
      }
    }
  }

  // Medium ufuk + çok büyük A10 → warning
  if (horizon === 'medium' && action.id === 'A10_CASH_EQUITY_INJECTION') {
    const isVeryLarge = proposedAmountTRY > firmContext.totalEquity * 1.5
    if (isVeryLarge) {
      return {
        pass: true,
        severity: 'WARNING',
        ruleCode: 'HORIZON_UNREALISTIC_AMOUNT',
        message: `1 yıl içinde özkaynağın 1.5 katı sermaye artışı büyük ölçekli sermaye operasyonu gerektirir`,
        affectedActionId: action.id,
        portfolioLevel: false,
      }
    }
  }

  return passResult(action.id)
}

// ─── 5. LEGAL/REGULATORY SANITY CHECK ────────────────────────────────────────

export function checkLegalRegulatorySanity(
  input: GuardrailCheckInput,
): GuardrailResult {
  const { action, proposedAmountTRY, firmContext } = input

  if (action.id === 'A15_DEBT_TO_EQUITY_SWAP') {
    return {
      pass: true,
      severity: 'INFO',
      ruleCode: 'REQUIRES_LEGAL_PROCEDURE',
      message: `Ortak borcu sermayeye dönüştürme TTK md. 343 gereği genel kurul kararı, bilirkişi raporu ve tescil gerektirir`,
      affectedActionId: action.id,
      portfolioLevel: false,
    }
  }

  if (action.id === 'A10_CASH_EQUITY_INJECTION') {
    const isSignificant = proposedAmountTRY > firmContext.totalEquity * 0.3
    if (isSignificant) {
      return {
        pass: true,
        severity: 'INFO',
        ruleCode: 'REQUIRES_SHAREHOLDER_APPROVAL',
        message: `Özkaynağın %30'undan fazla sermaye artışı genel kurul kararı ve ticaret sicil tescili gerektirir`,
        affectedActionId: action.id,
        portfolioLevel: false,
      }
    }
  }

  if (action.id === 'A08_FIXED_ASSET_DISPOSAL' || action.id === 'A09_SALE_LEASEBACK') {
    return {
      pass: true,
      severity: 'INFO',
      ruleCode: 'ASSET_MAY_BE_ENCUMBERED',
      message: `${action.name} için varlığın ipotek/rehin/haciz kayıtları kontrol edilmelidir. Teminat verilen varlıklar satılamaz.`,
      affectedActionId: action.id,
      portfolioLevel: false,
    }
  }

  if (action.id === 'A11_RETAIN_EARNINGS') {
    return {
      pass: true,
      severity: 'INFO',
      ruleCode: 'REQUIRES_SHAREHOLDER_APPROVAL',
      message: `Kârın dağıtılmaması için genel kurul kararı gerekir. Zorunlu yedek akçeler (TTK md. 519) korunmalı.`,
      affectedActionId: action.id,
      portfolioLevel: false,
    }
  }

  return passResult(action.id)
}

// ─── 6. PORTFOLIO AGGREGATE RULES (V3-10 İÇİN) ───────────────────────────────

/**
 * Portföy seviyesinde kural tanımları.
 * V3-10 orchestrator bunları iteratif seçim sırasında uygular.
 */
export interface PortfolioAggregateRule {
  ruleCode:    GuardrailRuleCode
  description: string
  check:       (input: PortfolioGuardrailInput) => GuardrailResult | null
}

export const PORTFOLIO_AGGREGATE_RULES: PortfolioAggregateRule[] = [
  {
    ruleCode: 'PORTFOLIO_EQUITY_INFLATION',
    description: 'Portföydeki sermaye artışı aksiyonlarının toplamı makul sınırda olmalı',
    check: (input) => {
      const equityActions = input.portfolio.filter(p =>
        p.actionId === 'A10_CASH_EQUITY_INJECTION' || p.actionId === 'A15_DEBT_TO_EQUITY_SWAP'
      )
      const totalEquityIncrease = equityActions.reduce((sum, a) => sum + a.amountTRY, 0)

      if (totalEquityIncrease > input.firmContext.totalEquity * 2) {
        return {
          pass: false,
          severity: 'SOFT_BLOCK',
          ruleCode: 'PORTFOLIO_EQUITY_INFLATION',
          message:
            `Portföydeki toplam sermaye artışı mevcut özkaynağın 2 katını aşıyor ` +
            `(${(totalEquityIncrease / 1e6).toFixed(1)}M TL vs özkaynak ${(input.firmContext.totalEquity / 1e6).toFixed(1)}M TL)`,
          affectedActionId: equityActions.map(a => a.actionId).join(','),
          portfolioLevel: true,
        }
      }
      return null
    },
  },
  {
    ruleCode: 'PORTFOLIO_CASH_INCOHERENCE',
    description: 'Portföy hem büyük nakit tüketip hem aşırı nakit tamponu oluşturamaz',
    check: (input) => {
      const cashConsumers = input.portfolio.filter(p => p.actionId === 'A04_CASH_PAYDOWN_ST')
      const cashBuffers   = input.portfolio.filter(p => p.actionId === 'A16_CASH_BUFFER_BUILD')

      const totalConsumed = cashConsumers.reduce((sum, a) => sum + a.amountTRY, 0)
      const totalBuffered = cashBuffers.reduce((sum, a) => sum + a.amountTRY, 0)

      if (totalConsumed > 0 && totalBuffered > 0 && totalBuffered > totalConsumed) {
        return {
          pass: false,
          severity: 'WARNING',
          ruleCode: 'PORTFOLIO_CASH_INCOHERENCE',
          message:
            `Portföy hem nakit tüketiyor (${(totalConsumed / 1e6).toFixed(1)}M TL) ` +
            `hem nakit tamponu oluşturuyor (${(totalBuffered / 1e6).toFixed(1)}M TL) — mantık çelişkisi`,
          affectedActionId: 'A04_CASH_PAYDOWN_ST,A16_CASH_BUFFER_BUILD',
          portfolioLevel: true,
        }
      }
      return null
    },
  },
  {
    ruleCode: 'PORTFOLIO_REVENUE_UNREALISTIC',
    description: 'Portföydeki hasılat artışı aksiyonlarının toplamı gerçekçi olmalı',
    check: (input) => {
      const revenueActions = input.portfolio.filter(p =>
        p.actionId === 'A18_NET_SALES_GROWTH' || p.actionId === 'A19_ADVANCE_TO_REVENUE'
      )
      const totalRevenueAdd = revenueActions.reduce((sum, a) => sum + a.amountTRY, 0)

      if (totalRevenueAdd > input.firmContext.totalRevenue * 1.5) {
        return {
          pass: false,
          severity: 'SOFT_BLOCK',
          ruleCode: 'PORTFOLIO_REVENUE_UNREALISTIC',
          message:
            `Portföydeki hasılat artışı mevcut hasılatın 1.5 katını aşıyor ` +
            `(${(totalRevenueAdd / 1e6).toFixed(1)}M TL vs hasılat ${(input.firmContext.totalRevenue / 1e6).toFixed(1)}M TL)`,
          affectedActionId: revenueActions.map(a => a.actionId).join(','),
          portfolioLevel: true,
        }
      }
      return null
    },
  },
  {
    ruleCode: 'PORTFOLIO_LIQUIDITY_NET_NEGATIVE',
    description: 'Portföyün net likidite etkisi aşırı negatif olmamalı (ChatGPT review eklemesi)',
    check: (input) => {
      let netLiquidity = 0
      for (const p of input.portfolio) {
        const spec = ACTION_DEPENDENCY_GRAPH[p.actionId]
        if (!spec) continue

        const ratio = spec.liquidityImpactRatio ?? 0
        if (spec.producesLiquidity) {
          netLiquidity += p.amountTRY * ratio
        } else if (spec.consumesLiquidity) {
          netLiquidity -= p.amountTRY * ratio
        }
      }

      // Net negatif likidite aktif büyüklüğünün %20'sinden fazlaysa problem
      const threshold = input.firmContext.totalAssets * 0.2
      if (netLiquidity < -threshold) {
        return {
          pass: false,
          severity: 'SOFT_BLOCK',
          ruleCode: 'PORTFOLIO_LIQUIDITY_NET_NEGATIVE',
          message:
            `Portföyün net likidite etkisi aşırı negatif: ` +
            `${(netLiquidity / 1e6).toFixed(1)}M TL (limit: -${(threshold / 1e6).toFixed(1)}M TL)`,
          affectedActionId: input.portfolio.map(p => p.actionId).join(','),
          portfolioLevel: true,
          context: { netLiquidity, threshold },
        }
      }
      return null
    },
  },
]

/**
 * Tüm portföy kurallarını çalıştır.
 */
export function checkPortfolioAggregateRules(
  input: PortfolioGuardrailInput,
): GuardrailResult[] {
  const results: GuardrailResult[] = []
  for (const rule of PORTFOLIO_AGGREGATE_RULES) {
    const result = rule.check(input)
    if (result) results.push(result)
  }
  return results
}

// ─── ANA API — TEK AKSİYON ───────────────────────────────────────────────────

export function checkActionGuardrails(
  input: GuardrailCheckInput,
): GuardrailReport {
  const checks: GuardrailResult[] = [
    checkSemanticDirection(input),
    checkEconomicImpossibility(input),
    checkCrossActionDependency(input),
    checkTemporalRealism(input),
    checkLegalRegulatorySanity(input),
  ]

  const results = checks.filter(r => r.severity !== 'PASS')

  const hasHardReject = results.some(r => r.severity === 'HARD_REJECT')
  const hasSoftBlock  = results.some(r => r.severity === 'SOFT_BLOCK')
  const hasWarning    = results.some(r => r.severity === 'WARNING')

  let highestSeverity: GuardrailSeverity = 'PASS'
  if (hasHardReject)       highestSeverity = 'HARD_REJECT'
  else if (hasSoftBlock)   highestSeverity = 'SOFT_BLOCK'
  else if (hasWarning)     highestSeverity = 'WARNING'
  else if (results.length > 0) highestSeverity = 'INFO'

  return {
    results,
    hasHardReject,
    hasSoftBlock,
    hasWarning,
    highestSeverity,
  }
}

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

function passResult(actionId: string): GuardrailResult {
  return {
    pass:             true,
    severity:         'PASS',
    ruleCode:         null,
    message:          '',
    affectedActionId: actionId,
    portfolioLevel:   false,
  }
}

/**
 * GELECEKTEKİ İYİLEŞTİRMELER (ChatGPT review önerileri):
 *
 * V3-10 ORCHESTRATOR'DA:
 *
 * 1. TRANSACTION-LEVEL LIQUIDITY CONTINUITY — Şu an PORTFOLIO_LIQUIDITY_NET_NEGATIVE
 *    rule'u toplam net likidite bakıyor. V3-10'da iteratif seçim sırasında her adımda
 *    kümülatif likidite izlenmeli — "adım 3'te nakit tükendi, A04 artık uygulanamaz" gibi.
 *
 * 2. WEIGHTED DEPENDENCY GRAPH — Şu an preferredAfter binary (hangi aksiyon seçildi mi).
 *    İleride ağırlıklı olmalı: "A04 100M gerekiyor, A05 sadece 20M üretti, yeterli değil".
 *    Yani: requiresLiquiditySupport: 0.5 × proposedAmount gibi.
 *
 * 3. SECTOR-AWARE AGGREGATE REALISM — Portfolio aggregate kuralları şu an statik
 *    (×2 equity, ×1.5 revenue). İleride sektöre göre normalize edilmeli:
 *    startup IT firma vs proje şirketi aynı sınıra tabi olmamalı.
 *
 * 4. FEASIBILITY DECAY — Repeat decay quality'de var (V3-4). Ama semantic feasibility
 *    decay yok. Örnek: ilk 10M stok çözülür, ikinci 10M daha zor, üçüncü 10M çok zor.
 *    Aynı aksiyon tekrarlandıkça fiziksel uygulanabilirlik düşer.
 *
 * V3-11+ (GELECEK):
 *
 * 5. BALANCE SHEET TOPOLOGY CHECK — Şu an semantic direction sadece A15 için.
 *    İleride tüm aksiyonlarda topology kontrolü: UV borç artıyor ama equity çöküyor,
 *    current ratio düzeliyor ama leverage patlıyor gibi çelişkiler.
 *
 * 6. CIRCULAR DEPENDENCY DETECTION — requires/preferredAfter graph topology kontrolü
 *    gerekecek. Şu an yok.
 *
 * 7. DYNAMIC LEGAL DATABASE — TTK maddeleri hardcoded. İleride config.
 *
 * 8. ENCUMBRANCE DATA INTEGRATION — A08/A09 için INFO seviyesinde. İleride Tapu/Rehin
 *    sicilinden gerçek ipotek bilgisi entegre → HARD_REJECT yapılabilir.
 *
 * 9. CONFIDENCE-WEIGHTED WARNINGS — WARNING'ler eşit ağırlıkta. İleride confidence
 *    score ile V3-9 rating reasoning'de ağırlıklı yorumlanabilir.
 */
