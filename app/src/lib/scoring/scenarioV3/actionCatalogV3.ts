/**
 * SCENARIO ENGINE V3 — Action Catalog V3
 * 20 ekonomik-gerçeklik-bazlı aksiyon tanımı
 *
 * V2 motoruna dokunulmaz — bu dosya yalnızca V3 tiplerini kullanır.
 * Her aksiyon: AccountingTransaction[] üretir, kalite katsayısı taşır,
 * sürdürülebilirlik etiketi içerir.
 *
 * Paradigma:
 *   Action → AccountingTransaction[] (çift taraflı fiş)
 *            → qualityCoefficient (0-1)
 *            → sustainability (RECURRING → ACCOUNTING_ONLY)
 *            → expectedEconomicImpact (4 boolean)
 */

import {
  ActionTemplateV3,
  AccountingTransaction,
  AccountingLeg,
  SectorCode,
  SemanticType,
  FirmContext,
} from './contracts'

import {
  getPeriodDays,
  getBenchmarkValue,
  applyFeasibilityCap,
  getInventoryBalance,
  getCogs,
  computeDIO,
  sumByCodesPrefix,
  sumByCodesPrefixNet,
  getNetFixedAssets,
  getGrossFixedAssets,
  getConstructionSafeFixedAssets,
  isIdleAssetCandidate,
  getFixedAssetRatioBenchmark,
  selectIdleAssetAccount,
  getCashBalance,
  getShortTermFinancialDebt,
  getShortTermTradeDebt,
  getLongTermFinancialDebt,
  getTradeReceivables,
  getAccumulatedDepreciation,
  getRevaluationReserve,
  getCurrentRatio,
  getNetWorkingCapital,
  getIdleAssetPoolBalance,
  getGrossMarginReductionTarget,            // R4: A12+A20 ortak helper
  getOperatingExpenses,                     // R5: A21 faaliyet gideri tespiti
  getOperatingExpensesDetail,               // R7B: A21 build için isEstimated bilgisi
  getOperatingExpenseReductionTarget,       // R5: A21 azaltma hedefi
  getFinancialExpenses,                     // R5: A14 finansman gideri tespiti
  getFinancialExpenseReductionTarget,       // R5: A14 azaltma hedefi
  getEquityInjectionTarget,                 // R8.3: A10/A10B özkaynak enjeksiyon hedefi
  getReceivableCollectionTarget,            // R8.4: A05 yarım-boşluk DSO hedefi
  getCurrentRatioTarget,                    // R8.5: A15B cari oran half-gap hedefi
} from './ratioHelpers'

// ─── Helper Types ─────────────────────────────────────────────────────────────

interface RawAccount {
  accountCode: string
  amount: number
}

interface AnalysisInput {
  accounts?: RawAccount[]
  sector?: SectorCode
  netSales?: number
  grossProfit?: number
  baselineNetSales?: number
  baselineGrossProfit?: number
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Dengeli muhasebe fişi oluşturur.
 * Caller sayısal dengeyi sağlamakla yükümlüdür (debit = credit).
 */
function makeBalancedTransaction(
  transactionId: string,
  description: string,
  semanticType: SemanticType,
  legs: AccountingLeg[]
): AccountingTransaction {
  return { transactionId, description, semanticType, legs }
}

/**
 * Tutarı [min, max] aralığına sıkıştırır.
 * amount < min ise 0 döner → buildTransactions erken çıkış yapar.
 */
function clampAmount(amount: number, min = 0, max = Infinity): number {
  if (amount < min) return 0
  return Math.min(amount, max)
}

/** İnşaat / proje bazlı sektör mü? */
function isConstructionLike(sector: SectorCode): boolean {
  return sector === 'CONSTRUCTION'
}

/** Ticaret ağırlıklı sektör mü? */
function isTradeLike(sector: SectorCode): boolean {
  return sector === 'TRADE' || sector === 'RETAIL'
}

/** Hizmet / bilişim sektörü mü? */
function isServiceLike(sector: SectorCode): boolean {
  return sector === 'SERVICES' || sector === 'IT'
}

/** Analizde bu prefix'lerden herhangi birine sahip pozitif bakiyeli hesap var mı? */
function hasAnyAccount(analysis: unknown, prefixes: string[]): boolean {
  const a = analysis as AnalysisInput
  if (!a?.accounts) return false
  return a.accounts.some(
    acc => prefixes.some(p => acc.accountCode.startsWith(p)) && acc.amount > 0
  )
}

/** Bu prefix'lere sahip hesapların toplam bakiyesi */
function sumAccountsByPrefix(analysis: unknown, prefixes: string[]): number {
  const a = analysis as AnalysisInput
  if (!a?.accounts) return 0
  return a.accounts
    .filter(acc => prefixes.some(p => acc.accountCode.startsWith(p)))
    .reduce((sum, acc) => sum + acc.amount, 0)
}

/**
 * Net nakit bakiyesi: kasa (100) + PTT (101) + bankalar (102) + diğer likit (108)
 * eksi verilen çekler ve ödeme emirleri (103, kontra hesap).
 *
 * Invariant: RawAccount.amount her zaman pozitif mutlak değerdir;
 * kontra hesaplar çıkarılır, Math.abs KULLANILMAZ.
 *
 * Faz 7.3.4F — A04 ve A16 eligibility düzeltmesi
 */
function getNetCashBalance(analysis: unknown): number {
  const a = analysis as AnalysisInput
  if (!a?.accounts) return 0
  const amountOf = (prefix: string): number =>
    a.accounts!
      .filter(acc => acc.accountCode.startsWith(prefix))
      .reduce((sum, acc) => sum + acc.amount, 0)
  return amountOf('100') + amountOf('101') + amountOf('102') + amountOf('108') - amountOf('103')
}

// ─── 20 Aksiyon Tanımları ─────────────────────────────────────────────────────

// ── A01 ──────────────────────────────────────────────────────────────────────
const A01_ST_FIN_DEBT_TO_LT: ActionTemplateV3 = {
  id: 'A01_ST_FIN_DEBT_TO_LT',
  name: 'Finansal Borç Vade Uzatma',  // R8.7: 'KV Finansal Borç → UV Yeniden Yapılandırma' → sade
  family: 'DEBT_STRUCTURE',
  semanticType: 'DEBT_RECLASSIFICATION',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A01_MAIN',
        'KV finansal borç UV olarak yeniden yapılandırılıyor (300 → 400)',
        'DEBT_RECLASSIFICATION',
        [
          { accountCode: '300', accountName: 'Banka Kredileri (KV)',  side: 'DEBIT',  amount, description: 'KV finansal borç azalışı' },
          { accountCode: '400', accountName: 'Banka Kredileri (UV)',  side: 'CREDIT', amount, description: 'UV finansal borç artışı'  },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['300', '303', '304'],
    minSourceAmountTRY: 1_000_000,  // 5M → 1M: orta olcekli firmalari dahil et
  },

  qualityCoefficient: 0.30,
  sustainability: 'ACCOUNTING_ONLY',

  repeatDecay: { first: 1.00, second: 0.50, third: 0.25, maxRepeats: 2 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.10,
    typicalPctOfBasis: 0.25,
    maxPctOfBasis: 0.50,
    absoluteMinTRY: 1_000_000,  // 5M → 1M: paralel esit
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'Kısa vadeli finansal borcun (300-304) banka refinansmanı ile uzun vadeli (400-404) olarak yeniden yapılandırılması. Cari oranı iyileştirir ancak nakit yaratmaz.',
  cfoRationale:
    'Acil likidite baskısını hafifletmek amacıyla finansal kuruluşlarla refinansman müzakeresi başlatılabilir. KV faiz yükü kısmen azalabilir; vade profili dengeli bir yapıya kavuşabilir.',
  bankerPerspective:
    'Yalnızca vade profili değişir; toplam borç tutarı azalmaz. Bu aksiyon likidite baskısını geçici olarak hafifletebildiğinden, operasyonel nakit üretimini güçlendiren aksiyonlarla birlikte uygulandığında daha kalıcı etki yaratabilir. Mevcut finansal kuruluşların mutabakatı süreci belirler.',
  bankerTrust: 'medium',
  targetRatio: {
    metric:         'SHORT_TERM_DEBT_RATIO',
    benchmarkField: 'shortTermDebtRatio',
    basis:          'totalDebt',
    reliability:    'TCMB_DIRECT',
  },
}

// ── A02 ──────────────────────────────────────────────────────────────────────
const A02_TRADE_PAYABLE_TO_LT: ActionTemplateV3 = {
  id: 'A02_TRADE_PAYABLE_TO_LT',
  name: 'KV Ticari Borç → UV Vade Uzatma',
  family: 'DEBT_STRUCTURE',
  semanticType: 'DEBT_EXTENSION',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A02_MAIN',
        'KV ticari borç UV olarak yeniden yapılandırılıyor (320 → 420)',
        'DEBT_EXTENSION',
        [
          { accountCode: '320', accountName: 'Satıcılar (KV)',  side: 'DEBIT',  amount, description: 'KV ticari borç azalışı' },
          { accountCode: '420', accountName: 'Satıcılar (UV)',  side: 'CREDIT', amount, description: 'UV ticari borç artışı'  },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['320', '321'],
    minSourceAmountTRY: 3_000_000,
  },

  qualityCoefficient: 0.25,
  sustainability: 'ACCOUNTING_ONLY',

  repeatDecay: { first: 1.00, second: 0.40, third: 0.20, maxRepeats: 2 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.10,
    typicalPctOfBasis: 0.20,
    maxPctOfBasis: 0.40,
    absoluteMinTRY: 3_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'primary',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'Kısa vadeli ticari borçların (320-321) tedarikçilerle anlaşılarak uzun vadeli (420-421) olarak yeniden yapılandırılması.',
  cfoRationale:
    'Tedarikçilerle vade uzatma anlaşması KV baskısını azaltır. Tedarikçi ilişkileri güçlüyse düşük maliyetle uygulanabilir.',
  bankerPerspective:
    'Geçici bir likidite müdahalesidir; kalıcı finansal güçlenme anlamına gelmez. Tedarikçi ilişkilerinin sağlıklı tutulması hem vade uzatmanın sürdürülebilirliğini hem de tedarik sürekliliğini doğrudan etkiler. KV/UV dönüşüm oranı düzenli olarak izlenmelidir.',
  bankerTrust: 'medium',
  targetRatio: {
    metric:         'SHORT_TERM_DEBT_RATIO',
    benchmarkField: 'shortTermDebtRatio',
    basis:          'totalDebt',
    reliability:    'TCMB_DIRECT',
  },
}

// ── A03 ──────────────────────────────────────────────────────────────────────
const A03_ADVANCE_TO_LT: ActionTemplateV3 = {
  id: 'A03_ADVANCE_TO_LT',
  name: 'Alınan Avans Vade Uzatma',  // R8.7: 'KV Alınan Avans → UV Sınıflandırma' → sade
  family: 'DEBT_STRUCTURE',
  semanticType: 'DEBT_RECLASSIFICATION',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A03_MAIN',
        'KV alınan avans UV olarak yeniden sınıflandırılıyor (340 → 440)',
        'DEBT_RECLASSIFICATION',
        [
          { accountCode: '340', accountName: 'Alınan Sipariş Avansları (KV)', side: 'DEBIT',  amount, description: 'KV avans azalışı' },
          { accountCode: '440', accountName: 'Alınan Sipariş Avansları (UV)', side: 'CREDIT', amount, description: 'UV avans artışı'  },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['340'],
    minSourceAmountTRY: 2_000_000,
    sectorMustExclude: ['IT'],
  },

  qualityCoefficient: 0.20,
  sustainability: 'ACCOUNTING_ONLY',

  repeatDecay: { first: 1.00, second: 0.35, third: 0.15, maxRepeats: 2 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.10,
    typicalPctOfBasis: 0.20,
    maxPctOfBasis: 0.40,
    absoluteMinTRY: 2_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'not_applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'Müşteriden alınan sipariş avanslarının KV (340) yerine UV (440) olarak sınıflandırılması. Teslim takviminin 12 ayın ötesinde olduğu projelerde muhasebe doğruluğunu artırır.',
  cfoRationale:
    'Proje teslim süreleri 12 ayı aşıyorsa UV sınıflandırma cari oranı iyileştirir ve gerçeği yansıtır.',
  bankerPerspective:
    'Ekonomik içerik sınırlıdır; bilanço içi sınıf değişikliği gerçek bir finansal güçlenme yaratmaz. Teslim takviminin gerçekçi biçimde belirlenmesi, sınıflandırmanın muhasebe doğruluğunu koruması açısından kritiktir.',
  bankerTrust: 'medium',
  targetRatio: {
    metric:         'SHORT_TERM_DEBT_RATIO',
    benchmarkField: 'shortTermDebtRatio',
    basis:          'totalDebt',
    reliability:    'FINRATE_ESTIMATE',
  },
}

// ── A04 ──────────────────────────────────────────────────────────────────────
const A04_CASH_PAYDOWN_ST: ActionTemplateV3 = {
  id: 'A04_CASH_PAYDOWN_ST',
  name: 'Nakit ile KV Borç Kapatma',
  family: 'DEBT_STRUCTURE',
  semanticType: 'DEBT_REPAYMENT',
  horizons: ['short', 'medium'],

  // R6 — computeAmount: nakit %80 / borç %30, %15 anlamlı etki, 500K min
  // R6 Hotfix 2: baseline kullan — greedy loop önceki A20 nakitini şişirmiş olabilir
  useRatioBasedAmount: true,
  computeAmount: (ctx: FirmContext): number | null => {
    // R6 Hotfix 2: baselineAccountBalances kullan (greedy simulation'dan etkilenmez)
    const baseline   = ctx.baselineAccountBalances ?? ctx.accountBalances ?? {}
    const mevcutNakit = baseline['102'] ?? 0
    const kvBorç      = baseline['300'] ?? 0

    if (mevcutNakit <= 0) return null
    if (kvBorç <= 0)      return null

    const nakitCap  = mevcutNakit * 0.80   // mevcut nakitin en fazla %80'ini kullan
    const borçHedef = kvBorç * 0.30        // KV borcun %30'unu kapat
    const oneri     = Math.min(nakitCap, borçHedef)

    if (oneri < 500_000) return null
    // Atakan Karar 5: %15 anlamlı etki — öneri / kvBorç < %15 → sembolik → elensin
    if (oneri / kvBorç < 0.15) return null

    return oneri
  },

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 500_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A04_MAIN',
        'Mevcut nakit ile kısa vadeli finansal borç ödeniyor (300 ↓ / 102 ↓)',
        'DEBT_REPAYMENT',
        [
          { accountCode: '300', accountName: 'Banka Kredileri (KV)', side: 'DEBIT',  amount, description: 'KV borç azalışı'  },
          { accountCode: '102', accountName: 'Bankalar',             side: 'CREDIT', amount, description: 'Nakit çıkışı'      },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['102', '300'],
    minSourceAmountTRY: 500_000,
    customCheck: (analysis) => {
      // Faz 7.3.4F: Net nakit = 100+101+102+108−103 (kontra çıkarılır)
      const netCash = getNetCashBalance(analysis)
      if (netCash < 500_000) {
        return { pass: false, reason: `Yetersiz net nakit: ${netCash.toLocaleString('tr-TR')} TL < min 500K TL` }
      }
      return { pass: true }
    },
  },

  qualityCoefficient: 0.65,
  sustainability: 'ONE_OFF',

  repeatDecay: { first: 1.00, second: 0.70, third: 0.40, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.10,
    typicalPctOfBasis: 0.30,
    maxPctOfBasis: 0.60,
    absoluteMinTRY: 500_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'applicable',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'Şirketin mevcut nakit varlığı (102 Bankalar) kullanılarak kısa vadeli finansal borç (300) erken kapatılır. Her iki taraf azalır: aktif (nakit) ve pasif (borç).',
  cfoRationale:
    'Fazla nakit varsa KV borcu kapatmak faiz yükünü azaltır, borçluluk oranını düşürür ve net borç pozisyonunu iyileştirir.',
  bankerPerspective:
    'Aktif ve pasif aynı anda azalır; bu yapı yeni bir finansman değil, disiplinli bilanço yönetiminin somut göstergesidir. Faiz yükü düşer, net borç pozisyonu iyileşir. Fazla nakdin borç ödemesinde kullanılması özkaynak/borç dengesini güçlü biçimde iyileştirebilir.',
  bankerTrust: 'high',
  targetRatio: {
    metric:         'DEBT_TO_ASSETS',
    benchmarkField: 'debtToAssets',
    basis:          'totalAssets',
    reliability:    'TCMB_DIRECT',
  },
}

// ── A05 ──────────────────────────────────────────────────────────────────────
const A05_RECEIVABLE_COLLECTION: ActionTemplateV3 = {
  id: 'A05_RECEIVABLE_COLLECTION',
  name: 'Alacak Tahsilat Hızlandırma',
  family: 'WC_COMPOSITION',
  semanticType: 'RECEIVABLE_COLLECTION',
  horizons: ['short', 'medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 500_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A05_MAIN',
        'Müşteri alacakları tahsil ediliyor (120 → 102)',
        'RECEIVABLE_COLLECTION',
        [
          { accountCode: '102', accountName: 'Bankalar', side: 'DEBIT',  amount, description: 'Tahsilat nakit girişi' },
          { accountCode: '120', accountName: 'Alıcılar', side: 'CREDIT', amount, description: 'Alacak kapatma'       },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['120', '121'],
    minSourceAmountTRY: 500_000,
  },

  qualityCoefficient: 0.85,
  sustainability: 'SEMI_RECURRING',

  repeatDecay: { first: 1.00, second: 0.75, third: 0.50, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.05,
    typicalPctOfBasis: 0.15,
    maxPctOfBasis: 0.30,
    absoluteMinTRY: 500_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'primary',
    RETAIL:        'applicable',
    SERVICES:      'primary',
    IT:            'primary',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'Müşteri alacaklarının (120-121) proaktif tahsilat yönetimiyle nakde (102) dönüştürülmesi. DSO (Days Sales Outstanding) iyileşir.',
  cfoRationale:
    'Vadesi geçmiş alacaklar önceliklendirilir, iskonto programı veya tahsilat ekibi güçlendirilerek nakit döngüsü kısaltılır.',
  bankerPerspective:
    'Gerçek nakit yaratır. Alacak tahsil süresi (DSO) kısaldıkça işletme sermayesi döngüsü hızlanır ve finansal esneklik artar. Alacak kalitesi — özellikle gecikme profili — bu aksiyonun sürdürülebilirlik boyutunu belirleyen kilit göstergedir.',

  // R8.4: applyFeasibilityCap(%25) yerine yarım-boşluk DSO hedefi
  // ENES A05 fix: 1.71M (eski cap) → 2.5M+ (half-gap), daha gerçekçi öneri
  // R8.6 öne çekildi: useRatioBasedAmount eksikti → computeAmount ölü koddu (engine bypass)
  useRatioBasedAmount: true,
  computeAmount: (ctx) => getReceivableCollectionTarget(ctx, { halfGap: true }),

  targetRatio: {
    metric:          'DSO',
    benchmarkField:  'receivablesDays',
    basis:           'netSales',
    fallback:        90,
    reliability:     'TCMB_DIRECT',
    // targetDays omit edildi (opsiyonel, dinamik benchmark'tan gelecek)
  },
  bankerTrust: 'high',
}

// ── A06 ──────────────────────────────────────────────────────────────────────
const A06_INVENTORY_MONETIZATION: ActionTemplateV3 = {
  id: 'A06_INVENTORY_MONETIZATION',
  name: 'Stok Optimizasyonu ve Nakde Dönüşüm',
  family: 'WC_COMPOSITION',
  semanticType: 'INVENTORY_MONETIZATION',
  horizons: ['short', 'medium', 'long'],

  targetRatio: {
    metric:         'DIO',
    benchmarkField: 'inventoryDays',
    basis:          'cogs',
    fallback:       90,
    reliability:    'TCMB_DIRECT',
  },

  buildTransactions: (context) => {
    // Dominant stok seçimi (A18/A19 ile aynı pattern) — 159 hariç (avans niteliği)
    const stockAccounts = [
      { code: '150', name: 'İlk Madde ve Malzeme' },
      { code: '151', name: 'Yarı Mamuller'        },
      { code: '152', name: 'Mamuller'             },
      { code: '153', name: 'Ticari Mallar'        },
    ]

    const balances = context.accountBalances ?? {}
    const dominantStock = stockAccounts.reduce((max, acc) =>
      (balances[acc.code] ?? 0) > (balances[max.code] ?? 0) ? acc : max
    )
    const dominantBalance = balances[dominantStock.code] ?? 0

    // Stok sıfır veya negatif → uygulama yok
    if (dominantBalance <= 0) return []

    // %95 güvenlik tamponu: dominant hesabın negatife düşmesini engeller
    const amount = clampAmount(
      Math.min(context.amount, dominantBalance * 0.95),
      1_000_000
    )
    if (amount <= 0) return []

    // Not: Bu simplified monetization modelidir. Gerçek satışta 600 Satışlar ve
    // 620/621 Satış Maliyeti de etkilenir; V3 katalog aşamasında net stok→nakit
    // etkisi temsil edilmektedir.
    return [
      makeBalancedTransaction(
        'A06_MAIN',
        `Fazla stok nakde dönüşüyor — basitleştirilmiş nakde dönüşüm modeli (${dominantStock.code} → 102)`,
        'INVENTORY_MONETIZATION',
        [
          { accountCode: '102',                accountName: 'Bankalar',            side: 'DEBIT',  amount, description: 'Stok satışından nakit girişi'    },
          { accountCode: dominantStock.code,   accountName: dominantStock.name,    side: 'CREDIT', amount, description: 'Stok azalışı (simplified model)' },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['150', '151', '152', '153'],
    minSourceAmountTRY: 2_000_000,
    sectorMustExclude: ['IT', 'SERVICES', 'CONSTRUCTION'],  // CONSTRUCTION eklendi
  },

  qualityCoefficient: 0.85,
  sustainability: 'SEMI_RECURRING',

  repeatDecay: { first: 1.00, second: 0.70, third: 0.45, maxRepeats: 3 },

  useRatioBasedAmount: true,

  computeAmount: (ctx: FirmContext): number | null => {
    // CONSTRUCTION guard (defensive, sectorMustExclude zaten kontrol ediyor)
    if (ctx.sector === 'CONSTRUCTION') return null

    // 1. Stok bakiyesi (prefix-safe, alt hesaplar dahil)
    const stockBalance = getInventoryBalance(ctx)
    if (stockBalance <= 0) return null

    // 2. COGS
    const cogs = getCogs(ctx)
    if (cogs == null || cogs <= 0) return null

    // 3. Period days (Türk muhasebe kümülatif: Q1=90, Q4=ANNUAL=365)
    const periodDays = getPeriodDays({ period: (ctx as any).period ?? 'ANNUAL' }).days

    // 4. Mevcut DIO
    const currentDIO = computeDIO(stockBalance, cogs, periodDays)
    if (currentDIO == null) return null

    // 5. Sektör hedef DIO
    const sectorBench = getBenchmarkValue(ctx.sector, 'inventoryDays')
    const sectorDIO = sectorBench?.value ?? 90

    // 6. Zaten sektör hedefine yakınsa öneri yok
    if (currentDIO <= sectorDIO * 1.10) return null

    // 7. Hedef stok
    const targetStock = (cogs * sectorDIO) / periodDays

    // 8. Feasibility cap %25 (büyük tek seferlik azalış riskli)
    const cappedDelta = applyFeasibilityCap(stockBalance, targetStock, 0.25)

    return cappedDelta > 0 ? cappedDelta : null
  },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.02,
    typicalPctOfBasis: 0.04,
    maxPctOfBasis: 0.10,
    absoluteMinTRY: 2_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'not_applicable',  // İnşaat stoğu = proje maliyeti, A06 geçerli değil
    MANUFACTURING: 'primary',
    TRADE:         'primary',
    RETAIL:        'primary',
    SERVICES:      'not_applicable',
    IT:            'not_applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  true,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'Fazla veya yavaş dönen stokların (150-153) satışı yoluyla nakde dönüştürülmesi. Not: Basitleştirilmiş nakde dönüşüm modeli — gerçek satışta gelir tablosu da etkilenir; V3 katalog aşamasında net stok→nakit etkisi modellenmektedir.',
  cfoRationale:
    'Şişkin stok pozisyonu (özellikle imalat/ticaret) hem dönen varlık kalitesini hem nakit akışını bozar. Stok devir hızı aktif verimliliğinin temel göstergesidir.',
  bankerPerspective:
    'Fazla stoku nakde çevirmek hem işletme sermayesini serbest bırakır hem de stok devir süresi (DIO) üzerinde ölçülebilir iyileşme sağlayabilir. Stok değerleme yöntemi (FIFO/WAC) ve stok kalitesi (fire, eskime riski) aksiyonun gerçek etkisini doğrudan belirler.',
  bankerTrust: 'high',
}

// ── A08 — Yerel ipotek flag helper (computeAmount ↔ buildTransactions senkron) ──
/**
 * A08 için ipotek flag hesabı.
 * computeAmount ve buildTransactions'ın AYNI MDV bazı ve UV borç formülünü
 * kullanmasını garanti eder.
 *
 * MDV bazı: getNetFixedAssets ile birebir aynı
 *   Pozitif: 250+251+252+253+254+255+256+258+259
 *   Negatif: 257
 *
 * İpotek koşulu: UV Mali Borç / Net MDV > 0.40
 */
function _a08IpotekFlag(balances: Record<string, number>): boolean {
  const mdvNet = sumByCodesPrefixNet(
    balances,
    ['250', '251', '252', '253', '254', '255', '256', '258', '259'],
    ['257']
  )
  const uvDebt = sumByCodesPrefixNet(
    balances,
    ['400', '401', '405', '407', '409'],
    ['402', '408']
  )
  return mdvNet > 0 && uvDebt / mdvNet > 0.40
}

// ── A08 ──────────────────────────────────────────────────────────────────────
const A08_FIXED_ASSET_DISPOSAL: ActionTemplateV3 = {
  id: 'A08_FIXED_ASSET_DISPOSAL',
  name: 'Atıl Duran Varlık Satışı',
  family: 'DEBT_STRUCTURE',
  semanticType: 'ASSET_DISPOSAL',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = context.amount
    if (amount <= 0) return []

    const balances = context.accountBalances ?? {}

    // computeAmount ile AYNI helper → ipotek flag senkron
    const isIpotekli = _a08IpotekFlag(balances)

    const selected = selectIdleAssetAccount(
      { sector: context.sector, accountBalances: balances },
      amount,
      isIpotekli
    )

    // selectIdleAssetAccount null dönerse → boş aksiyon
    if (!selected) return []

    const finalAmount = selected.usableAmount
    if (finalAmount < 1_000_000) return []

    return [
      makeBalancedTransaction(
        'A08_MAIN',
        `Atıl maddi duran varlık satışı (${selected.code} → 102)`,
        'ASSET_DISPOSAL',
        [
          {
            accountCode: '102',
            accountName: 'Bankalar',
            side:        'DEBIT',
            amount:      finalAmount,
            description: 'Varlık satış geliri',
          },
          {
            accountCode: selected.code,
            accountName: selected.name,
            side:        'CREDIT',
            amount:      finalAmount,
            description: `${selected.name} (net defter değeri)`,
          },
        ]
      ),
    ]
  },

  useRatioBasedAmount: true,

  computeAmount: (ctx: FirmContext): number | null => {
    const balances = ctx.accountBalances ?? {}

    // ====================================================================
    // GUARD 1 — Yeniden Değerleme Şişkinliği (Gemini)
    // (522 Fonu / Net MDV) > 0.30 → MDV fiktif şişkin, satış yanlış sinyal
    // ====================================================================
    const mdvNet   = getNetFixedAssets(ctx)
    const reval522 = getRevaluationReserve(ctx)
    if (mdvNet > 0 && reval522 / mdvNet > 0.30) return null

    // ====================================================================
    // GUARD 2 — Yeni Yatırım (Gemini)
    // (257 Birikmiş Amortisman / Brüt MDV) < 0.15 → varlık çok yeni
    // ====================================================================
    const mdvGross  = getGrossFixedAssets(ctx)
    const accDep257 = getAccumulatedDepreciation(ctx)
    if (mdvGross > 0 && accDep257 / mdvGross < 0.15) return null

    // ====================================================================
    // GUARD 3 — İpotek Tespiti (Gemini)
    // (UV Mali Borç / Net MDV) > 0.40 → 250+252 muhtemelen rehinli
    // buildTransactions ile AYNI helper → senkron garantisi
    // ====================================================================
    const isIpotekli = _a08IpotekFlag(balances)

    // ====================================================================
    // EŞİK 1 — Likidite Stresi
    // En az bir kriter sağlanmalı
    // ====================================================================
    const currentRatio  = getCurrentRatio(ctx)
    const nwc           = getNetWorkingCapital(ctx)
    const cashBalance   = getCashBalance(ctx)
    const receivables   = getTradeReceivables(ctx)

    let likiditeStres = false

    if (currentRatio !== null && currentRatio < 1.2) likiditeStres = true
    if (nwc < ctx.totalAssets * 0.10)                likiditeStres = true
    if (cashBalance <= 0) {
      likiditeStres = true
    } else {
      const kvBorc      = getShortTermFinancialDebt(ctx) + getShortTermTradeDebt(ctx)
      const denominator = cashBalance + receivables
      if (denominator > 0 && kvBorc / denominator > 5) likiditeStres = true
    }

    if (!likiditeStres) return null

    // ====================================================================
    // EŞİK 2 — Verimsizlik (çift koşul güçlendirildi)
    // ====================================================================
    const benchmarkRatio = getFixedAssetRatioBenchmark(ctx.sector)
    const mdvAktifOrani  = mdvNet / Math.max(ctx.totalAssets, 1)
    const assetTurnover  = ctx.netSales / Math.max(ctx.totalAssets, 1)
    const sectorATBench  = getBenchmarkValue(ctx.sector, 'assetTurnover')
    const sectorAT       = sectorATBench?.value ?? 0.80

    let verimsiz = false
    if (assetTurnover < sectorAT * 0.85 && mdvAktifOrani > benchmarkRatio * 1.10) verimsiz = true
    if (mdvAktifOrani > benchmarkRatio * 1.20) verimsiz = true

    if (!verimsiz) return null

    // ====================================================================
    // EŞİK 3 — Satılabilir Pool Minimum (%5 aktif)
    // ====================================================================
    const pool = getIdleAssetPoolBalance(ctx, { isIpotekli })
    if (pool < ctx.totalAssets * 0.05) return null

    // ====================================================================
    // CAP HESAPLAMA — min(Cap1, Cap2, Cap3)
    // ====================================================================
    const fazlaMDV   = Math.max(mdvNet - ctx.totalAssets * benchmarkRatio, 0)
    const stPressure = getShortTermFinancialDebt(ctx) + getShortTermTradeDebt(ctx) - cashBalance

    const cap1 = pool * 0.30
    const cap2 = fazlaMDV * 0.25
    const cap3 = Math.max(stPressure * 0.50, 0)

    const rawAmount = Math.min(cap1, cap2, cap3)
    if (rawAmount < 1_000_000) return null

    // ====================================================================
    // SENKRONİZASYON FIX (Gemini)
    // computeAmount → selectIdleAssetAccount → usableAmount döner
    // buildTransactions ayni selected.usableAmount'u kullanır
    // ====================================================================
    const selected = selectIdleAssetAccount(
      { sector: ctx.sector, accountBalances: balances },
      rawAmount,
      isIpotekli
    )

    if (!selected) return null

    // %90 cap uygulanmış final tutarı dön
    return selected.usableAmount
  },

  preconditions: {
    requiredAccountCodes: ['250', '252', '253', '254', '255'],
    minSourceAmountTRY: 1_000_000,
    sectorMustExclude: ['IT', 'SERVICES'],
  },

  qualityCoefficient: 0.75,
  sustainability: 'ONE_OFF',

  repeatDecay: { first: 1.00, second: 0.55, third: 0.25, maxRepeats: 2 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.05,
    typicalPctOfBasis: 0.15,
    maxPctOfBasis: 0.30,
    absoluteMinTRY: 1_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',   // Proje varlıkları hariç, güvenli alt-küme kullanılır
    MANUFACTURING: 'applicable',   // primary → applicable (Gemini: imalat makinesi korunmalı)
    TRADE:         'primary',
    RETAIL:        'primary',
    SERVICES:      'not_applicable',
    IT:            'not_applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'Üretim/operasyonda kullanılmayan maddi duran varlıkların (250-255) piyasa değerinden satılarak nakde dönüştürülmesi. ROA ve aktif devir hızı iyileşir.',
  cfoRationale:
    'Atıl varlıklar hem bakım maliyeti yaratır hem de sermayeyi bağlar. Satış nakit sağlar ve aktif verimliliğini (ROA) artırır.',
  bankerPerspective:
    'Tek seferlik nakit girişi sağlar; yinelenebilir bir kaynak değildir. Satış bedelinin net defter değerinin altında kalması dönem kârını olumsuz etkileyebilir. Atıl aktifin elden çıkarılması aktif verimliliğini (ROA) güçlendirir ve bilanço kompozisyonunu sadeleştirir.',
  bankerTrust: 'high',
  targetRatio: {
    metric:         'FIXED_ASSET_TURNOVER',
    benchmarkField: 'fixedAssetTurnover',
    basis:          'netSales',
    reliability:    'TCMB_DIRECT',
  },
}

// ── A09 ──────────────────────────────────────────────────────────────────────
const A09_SALE_LEASEBACK: ActionTemplateV3 = {
  id: 'A09_SALE_LEASEBACK',
  name: 'Sat ve Geri Kirala',  // R8.7: 'Sat-Geri Kirala (Sale & Leaseback)' → İngilizce kaldırıldı
  family: 'DEBT_STRUCTURE',
  semanticType: 'SALE_LEASEBACK',
  horizons: ['medium', 'long'],

  // R6 — computeAmount: arsa(250)+bina(252) havuzu, 3 guard + %40 cap
  useRatioBasedAmount: true,
  computeAmount: (ctx: FirmContext): number | null => {
    const accountBalances = ctx.accountBalances ?? {}

    const arsa = accountBalances['250'] ?? 0
    const bina = accountBalances['252'] ?? 0
    const realEstatePool = arsa + bina

    // GUARD 1: Minimum 5M TL gayrimenkul havuzu
    if (realEstatePool < 5_000_000) return null

    // GUARD 2: Yeniden değerleme şişkinliği — 522/bina > %30 → fiktif değer
    const reval522 = accountBalances['522'] ?? 0
    if (bina > 0 && reval522 / bina > 0.30) return null

    // GUARD 3: Gayrimenkul/aktif oranı — < %10 → sat-leaseback için yetersiz
    const toplamAktif = ctx.totalAssets ?? 0
    if (toplamAktif <= 0) return null
    if (realEstatePool / toplamAktif < 0.10) return null

    // Sonnet Düzeltme 7: Arsa için sat-leaseback tutarsız (geri kira yok)
    // Sadece bina varsa öneri yap
    if (bina <= 0) return null

    // R6 HOTFIX (Codex K8): Cap SADECE bina bazlı
    // Önceki: realEstatePool × 0.40 → arsa büyükse 252 negatife düşüyordu
    // (250=90M, 252=10M → önceki öneri 40M → 252 bakiyesi -30M HATA)
    const oneri = bina * 0.40   // CAP %40 — sadece satılan varlık (bina)
    if (oneri < 1_000_000) return null
    return oneri
  },

  // R6 — buildTransactions: dynamic (bina yoksa boş dizi → engine guard devreye girer)
  buildTransactions: (context) => {
    const { amount } = context
    if (amount <= 0) return []

    const balances = context.accountBalances ?? {}
    const bina = balances['252'] ?? 0
    // Sonnet Düzeltme 7: Arsa (250) için geri kira tutarsız → sadece bina varsa yevmiye
    if (bina <= 0) return []

    return [
      makeBalancedTransaction(
        'A09_SALE_LEASEBACK',
        'Bina sat-geri kirala — Simplified (TFRS 16 kira yükümlülüğü ayrıca izlenmeli)',
        'SALE_LEASEBACK',
        [
          { accountCode: '102', accountName: 'Bankalar', side: 'DEBIT',  amount, description: 'Satış bedeli nakit girişi'                              },
          { accountCode: '252', accountName: 'Binalar',  side: 'CREDIT', amount, description: 'Duran varlık çıkışı (net defter değeri, simplified)' },
        ]
      ),
    ]
  },

  preconditions: {
    // R6: sadece arsa(250) ve bina(252) — 253/254 prefix bug düzeltildi
    requiredAccountCodes: ['250', '252'],
    minSourceAmountTRY: 5_000_000,
    sectorMustExclude: ['IT', 'SERVICES', 'RETAIL'],
    // R6 HOTFIX (Codex K9): A08 _a08IpotekFlag pattern'e yaklaştır
    // Önceki: sadece 400+401; şimdi 400+401+405+407+409 (tüm UV finansal borç)
    // + 257 amortisman netleme (net MDV için)
    customCheck: (analysis) => {
      // UV finansal borç (A08 pattern: 400/401/405/407/409)
      const uvBorç = sumAccountsByPrefix(analysis, ['400', '401', '405', '407', '409'])
      // Gross gayrimenkul
      const bina        = sumAccountsByPrefix(analysis, ['252'])
      const arsa        = sumAccountsByPrefix(analysis, ['250'])
      // 257 birikmiş amortisman netleme (A08 pattern)
      const amortisman  = sumAccountsByPrefix(analysis, ['257'])
      const netMDV      = (bina + arsa) - amortisman
      if (netMDV > 0 && uvBorç / netMDV > 0.40) {
        return {
          pass:   false,
          reason: 'Gayrimenkul üzerinde yüksek ipotek riski tespit edildi (UV borç oranı). Sat-geri kirala için danışman incelemesi gerekir.',
        }
      }
      return { pass: true }
    },
  },

  qualityCoefficient: 0.50,
  sustainability: 'ONE_OFF',

  repeatDecay: { first: 1.00, second: 0.35, third: 0.15, maxRepeats: 2 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.10,
    typicalPctOfBasis: 0.20,
    maxPctOfBasis: 0.35,
    absoluteMinTRY: 5_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'applicable',
    RETAIL:        'not_applicable',
    SERVICES:      'not_applicable',
    IT:            'not_applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            false,  // kira yükümlülüğü yeni yük oluşturur
  },

  description:
    'Sahip olunan mülk/varlığın satılarak geri kiralanması. Nakit yaratır ancak gelecek dönemlerde kira yükümlülüğü doğurur. Not: TFRS 16 kullanım hakkı varlığı ve kira borcu bu simplified modelde tam modellenmemiştir.',
  cfoRationale:
    'Kısa vadeli nakit ihtiyacını karşılar ve bilanço varlık ağırlığını azaltır. Ancak uzun vadeli kira yükümlülüğü borç yükü yaratır.',
  bankerPerspective:
    'Anlık nakit ihtiyacını karşılar; ancak bu yapı özünde gelecek nakit akışlarının peşin değere dönüştürülmesidir. Doğan kira yükümlülüğü bilanço kaldıracını yeniden artırabileceğinden, uzun vadeli maliyet-fayda dengesi dikkatle analiz edilmelidir.',
  bankerTrust: 'medium',
  targetRatio: {
    metric:         'FIXED_ASSET_TURNOVER',
    benchmarkField: 'fixedAssetTurnover',
    basis:          'netSales',
    reliability:    'FINRATE_ESTIMATE',
  },
}

// ── A10 ──────────────────────────────────────────────────────────────────────
const A10_CASH_EQUITY_INJECTION: ActionTemplateV3 = {
  id: 'A10_CASH_EQUITY_INJECTION',
  name: 'Nakit Sermaye Artırımı',
  family: 'EQUITY_PNL',
  semanticType: 'CASH_EQUITY',
  horizons: ['short', 'medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 2_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A10_MAIN',
        'Nakit sermaye artırımı — ortak şirkete nakit koyuyor (102 ↑ / 500 ↑)',
        'CASH_EQUITY',
        [
          { accountCode: '102', accountName: 'Bankalar', side: 'DEBIT',  amount, description: 'Sermaye katkısı nakit girişi' },
          { accountCode: '500', accountName: 'Sermaye',  side: 'CREDIT', amount, description: 'Ödenmiş sermaye artışı'       },
        ]
      ),
    ]
  },

  preconditions: {
    minSourceAmountTRY: 2_000_000,
  },

  // R8.3: Rasyo bazlı tutar — half-gap özkaynak/aktif hedefi (R5 tamamlama)
  // Formül: x = (targetRatio × A − E) / (1 − targetRatio)
  // Guard: currentRatio ≥ sectorMedian → null (zaten iyi durumda)
  useRatioBasedAmount: true,
  computeAmount: (ctx) => getEquityInjectionTarget(ctx, { halfGap: true }),

  qualityCoefficient: 1.00,
  sustainability: 'RECURRING',

  repeatDecay: { first: 1.00, second: 0.65, third: 0.35, maxRepeats: 1 },

  suggestedAmount: {
    basis: 'assets',
    minPctOfBasis: 0.02,
    typicalPctOfBasis: 0.05,
    maxPctOfBasis: 0.12,
    absoluteMinTRY: 2_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'applicable',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  false,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'Mevcut veya yeni ortakların şirkete nakit sermaye koyması. En yüksek kaliteli finansman kaynağı — hem nakit hem özkaynak artar, tüm rasyolar iyileşir.',
  cfoRationale:
    'Nakit sermaye artırımı likidite, özkaynak oranı ve borçluluk rasyolarını eş zamanlı iyileştirebilecek önemli aksiyonlardan biridir. Kalite katsayısı 1.00 olmakla birlikte tutarın toplam aktife oranı belirleyicidir.',
  bankerPerspective:
    'Ortakların şirkete doğrudan nakit koyması taahhüt ve güven açısından güçlü bir sinyal taşır. Tutarın toplam aktife oranı kritik bir değişkendir: görece küçük bir sermaye enjeksiyonu tek başına çok kategorili bir iyileşmeyi desteklemeyebilir; operasyonel aksiyonlarla birlikte uygulandığında çarpan etkisi ortaya çıkabilir.',
  bankerTrust: 'high',
  targetRatio: {
    metric:         'DEBT_TO_EQUITY',
    benchmarkField: 'debtToEquity',
    basis:          'equity',
    reliability:    'TCMB_DIRECT',
  },
}

// ── A10B ─────────────────────────────────────────────────────────────────────
const A10B_PROMISSORY_NOTE_EQUITY_INJECTION: ActionTemplateV3 = {
  id: 'A10B_PROMISSORY_NOTE_EQUITY_INJECTION',
  name: 'Senetli Sermaye Artırımı',
  family: 'EQUITY_PNL',
  semanticType: 'NON_CASH_EQUITY',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 2_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A10B_MAIN',
        'Senetli sermaye artırımı — ortak senedi ile özkaynak artışı (121 ↑ / 500 ↑)',
        'NON_CASH_EQUITY',
        [
          { accountCode: '121', accountName: 'Alacak Senetleri', side: 'DEBIT',  amount, description: 'Ortak senedi artışı'  },
          { accountCode: '500', accountName: 'Sermaye',          side: 'CREDIT', amount, description: 'Sermaye artışı'        },
        ]
      ),
    ]
  },

  preconditions: { minSourceAmountTRY: 2_000_000 },

  // R8.3: A10 ile aynı helper — formül aynı, yevmiye farklı (121 vs 102)
  // qualityCoefficient 0.55 korunur (senetli = nakit kadar güçlü değil)
  useRatioBasedAmount: true,
  computeAmount: (ctx) => getEquityInjectionTarget(ctx, { halfGap: true }),

  qualityCoefficient: 0.55,
  sustainability: 'SEMI_RECURRING',

  repeatDecay: { first: 1.00, second: 0.50, third: 0.25, maxRepeats: 1 },

  suggestedAmount: {
    basis: 'assets',
    minPctOfBasis: 0.03,
    typicalPctOfBasis: 0.08,
    maxPctOfBasis: 0.20,
    absoluteMinTRY: 2_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'applicable',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  false,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'Ortakların şirkete senet vererek yapacağı sermaye artırımı. Nakit girişi olmaz; özkaynak artar, alacak senedi (121) likit varlık olarak bilançoya girer. Cari oran iyileşir.',
  cfoRationale:
    'Nakit gerektirmeden özkaynak güçlendirilir. Alacak senedi vade sonunda nakde dönüşebilir. Likidite ve sermaye yapısı eş zamanlı iyileşir.',
  bankerPerspective:
    'Senet kalitesi ve ortak finansal gücü değerlendirilir. Nakit sermaye artırımına göre daha düşük kaliteli ama yine de sermaye artışı sayılır.',
  bankerTrust: 'low',
  targetRatio: {
    metric:         'DEBT_TO_EQUITY',
    benchmarkField: 'debtToEquity',
    basis:          'equity',
    reliability:    'FINRATE_ESTIMATE',
  },
}

// ── A11 ──────────────────────────────────────────────────────────────────────
const A11_RETAIN_EARNINGS: ActionTemplateV3 = {
  id: 'A11_RETAIN_EARNINGS',
  name: 'Kârı Özkaynakta Tut',  // R8.7: 'Dönem Kârını Dağıtmayıp Özkaynakta Tutma' → sade
  family: 'EQUITY_PNL',
  semanticType: 'RETAINED_EARNINGS',
  horizons: ['medium', 'long'],

  // R7B — A11 disable (A13 patern)
  // 590 → 570 özkaynak içi transfer: toplam özkaynak değişmez, rating etkisi sıfır.
  // Atakan canlı tespiti: A11 önerildiğinde özkaynak toplamı artmıyor.
  buildTransactions: () => [],

  preconditions: {
    minSourceAmountTRY: 1_000_000,
    // R7B — A11 devre dışı (A13 patern)
    // DB backward compat için id korunur (roadmapSnapshot referansları bozulmasın).
    customCheck: () => ({
      pass: false,
      reason: 'Dönem kârı özkaynakta zaten yer almaktadır; 590 → 570 transferi özkaynak toplamını değiştirmez ve rating üzerinde ek etki yaratmaz.',
    }),
  },

  qualityCoefficient: 0.65,
  sustainability: 'SEMI_RECURRING',

  repeatDecay: { first: 1.00, second: 0.80, third: 0.60, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'equity',
    minPctOfBasis: 0.05,
    typicalPctOfBasis: 0.15,
    maxPctOfBasis: 0.40,
    absoluteMinTRY: 1_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'applicable',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,  // özkaynak içi transfer
    reducesRisk:            true,
  },

  description:
    'Dönem net kârının (590) ortaklara dağıtılmayıp geçmiş yıllar kârlarına (570) aktarılması. Özkaynağı güçlendirir ancak nakit yaratmaz.',
  cfoRationale:
    'Kâr dağıtımı yapmamak özkaynağı büyütür ve özkaynak oranını organik olarak iyileştirir. Ortakların kısa vadeli getiri beklentisini ertelemesi gerekir.',
  bankerPerspective:
    'Kâr tutma disiplini özkaynak yapısını organik olarak güçlendirir. Kâr kalitesi bu aksiyonun etkinliğini doğrudan belirler: yinelenen operasyonel faaliyetlerden gelen kâr, olağandışı gelirlerden gelen kâra kıyasla çok daha sağlam bir özkaynak tabanı oluşturur.',
  bankerTrust: 'medium',
}

// ── A12 ──────────────────────────────────────────────────────────────────────
const A12_GROSS_MARGIN_IMPROVEMENT: ActionTemplateV3 = {
  id: 'A12_GROSS_MARGIN_IMPROVEMENT',
  name: 'Brüt Kâr Marjı İyileştirme',
  family: 'EQUITY_PNL',
  semanticType: 'OPERATIONAL_MARGIN',
  horizons: ['medium'],

  // Faz 7.3.6B3a: computeAmount + gerçek yevmiye (320/621 → 690/590)
  useRatioBasedAmount: true,

  targetRatio: {
    metric:         'GROSS_MARGIN',
    benchmarkField: 'grossMargin',
    basis:          'netSales',
    fallback:       0.30,
    reliability:    'TCMB_DIRECT',
  },

  computeAmount: (ctx) => {
    // R4 — Brüt zarar guard kaldırıldı; ortak helper kullanılıyor
    const baseReduction = getGrossMarginReductionTarget(ctx)
    if (baseReduction === null) return null

    const accountBalances = ctx.accountBalances ?? {}
    const supplier320     = accountBalances['320'] ?? 0
    const cogs621         = accountBalances['621'] ?? 0

    // R4 KONSERVATİF cap'ler (eski %50'den daha sıkı — mali müşavir kararı)
    // Tedarikçi kanal: max %30, COGS kanal: max %20
    const maxFromSupplier = supplier320 * 0.30
    const maxFromCogs     = cogs621     * 0.20

    if (maxFromSupplier <= 0) return null  // tedarikçi kanal şart (A12 320 kanalı)

    const result = Math.min(baseReduction, maxFromSupplier, maxFromCogs)
    return result > 0 ? result : null
  },

  buildTransactions: (context) => {
    const balances        = context.accountBalances ?? {}
    const supplierBalance = balances['320'] ?? 0
    const cogsBalance     = balances['621'] ?? 0

    if (supplierBalance <= 0 || cogsBalance <= 0) return []

    const requestedAmount = context.amount ?? 0
    const amount = Math.min(requestedAmount, supplierBalance, cogsBalance)
    if (amount <= 0) return []

    return [
      makeBalancedTransaction(
        'A12_SUPPLIER_DISCOUNT',
        'Tedarikçi iskonto/indirim — 320 borcu düşer, 621 maliyet azalır',
        'OPERATIONAL_MARGIN',
        [
          { accountCode: '320', accountName: 'Satıcılar',               side: 'DEBIT',  amount, description: 'Ticari borç azalışı' },
          { accountCode: '621', accountName: 'Satılan Mal Maliyeti',    side: 'CREDIT', amount, description: 'Maliyet azalışı'     },
        ]
      ),
      makeBalancedTransaction(
        'A12_PROFIT_TRANSFER',
        'Tasarruf dönem kârına yansır — 690 kapanır, 590 artar',
        'OPERATIONAL_MARGIN',
        [
          { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount, description: 'Sonuç hesabı aktarımı' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount, description: 'Dönem net kârı artışı' },
        ]
      ),
    ]
  },

  preconditions: {
    minSourceAmountTRY: 500_000,
    customCheck: (analysis) => {
      const revenue = sumAccountsByPrefix(analysis, ['600', '601'])
      if (revenue <= 0) return { pass: false, reason: 'Satış geliri yok — marj iyileştirme uygulanamaz' }
      return { pass: true }
    },
  },

  qualityCoefficient: 0.90,
  sustainability: 'RECURRING',

  repeatDecay: { first: 1.00, second: 0.75, third: 0.55, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'revenue',
    minPctOfBasis: 0.01,
    typicalPctOfBasis: 0.03,
    maxPctOfBasis: 0.08,
    absoluteMinTRY: 500_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'primary',
    TRADE:         'primary',
    RETAIL:        'primary',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  true,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'Tedarikçilerle iskonto/indirim görüşmesi sonucu 320 Satıcılar hesabındaki ticari borç azaltılır. ' +
    'Bu durumda 621 Satılan Mal Maliyeti de düşer. Sonuç olarak brüt kâr marjı pozitif yönde iyileşir, ' +
    'FAVÖK marjı (faiz, vergi, amortisman öncesi kâr) da büyür. Mali müşavir tarafında işlem zamanı geldiğinde gerçek yevmiye kayıt ile tamamlanır.',
  cfoRationale:
    'Tedarikçi pazarlığı yapıldığında her 1 puanlık brüt kâr marjı artışı, satışın doğrudan kârlılığa yansıyan kısmını büyütür. ' +
    'FAVÖK marjı da bu hareketten doğrudan etkilenir; finansman kapasitesi ve borç servis gücü artar.',
  bankerPerspective:
    'Brüt kâr marjındaki iyileşme operasyonel kalitenin sürdürülebilir göstergesidir. ' +
    'FAVÖK marjı yükselişi ile birlikte rating değerlendirmesinde olumlu yansır. ' +
    'Tek seferlik avantajlardan ayrı, yapısal iyileşme aranır.',
  bankerTrust: 'high',
}

// ── A13 ──────────────────────────────────────────────────────────────────────
const A13_OPEX_OPTIMIZATION: ActionTemplateV3 = {
  id: 'A13_OPEX_OPTIMIZATION',
  name: 'Faaliyet Giderleri Optimizasyonu',
  family: 'EQUITY_PNL',
  semanticType: 'OPEX_REDUCTION',
  horizons: ['medium', 'long'],

  // Faz 7.3.6A1: Projeksiyon aksiyonu — buildTransactions boş array döner.
  buildTransactions: () => [],

  preconditions: {
    minSourceAmountTRY: 300_000,
    // R6 — A13 devre dışı: işlevselliği A21_OPERATING_PROFIT_REFORM'a taşındı.
    // DB backward compat için id korundu (roadmapSnapshot JSON referansları bozulmasın).
    customCheck: () => ({
      pass: false,
      reason: 'Bu aksiyon güncellenmiş yöntemle (Faaliyet Karı Reformu) değerlendirilmektedir.',
    }),
  },

  qualityCoefficient: 0.70,
  sustainability: 'RECURRING',

  repeatDecay: { first: 1.00, second: 0.70, third: 0.45, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'revenue',
    minPctOfBasis: 0.005,
    typicalPctOfBasis: 0.02,
    maxPctOfBasis: 0.05,
    absoluteMinTRY: 300_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'applicable',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'primary',
    IT:            'primary',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  true,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'Genel yönetim, pazarlama ve diğer faaliyet giderlerinin optimize edilmesi. Not: Modeled OPEX reduction entry — gider azalışının net kâra etkisi temsil edilmektedir.',
  cfoRationale:
    'İşletme giderlerinde verimlilik artırımı (personel, kira, idari giderler). Yapısal tasarruf programları FAVÖK marjını kalıcı olarak iyileştirebilir.',
  bankerPerspective:
    'Yapısal tasarruf programları FAVÖK marjını kalıcı biçimde güçlendirebilir. Geçici kısıntı veya yatırım ertelemesinden kaynaklanan tasarrufu organik verimlilik artışından ayırt etmek kritiktir; yatırım dondurmak kısa vadeli kâr yaratırken uzun vadeli büyüme kapasitesini zayıflatabilir.',
  bankerTrust: 'high',
  targetRatio: {
    metric:         'OPEX_RATIO',
    benchmarkField: 'operatingExpenseRatio',
    basis:          'netSales',
    reliability:    'FINRATE_ESTIMATE',
  },
}

// ── A14 ──────────────────────────────────────────────────────────────────────
const A14_FINANCE_COST_REDUCTION: ActionTemplateV3 = {
  id: 'A14_FINANCE_COST_REDUCTION',
  name: 'Finansman Gideri Azaltma',
  family: 'EQUITY_PNL',
  semanticType: 'FINANCE_COST_REDUCTION',
  horizons: ['medium', 'long'],

  // R5 — computeAmount EKLENDİ (önceden yoktu)
  computeAmount: (ctx) => {
    // Atakan Karar 1: A14 güncellendi (id korundu, computeAmount eklendi)
    // Finansman gideri rasyo bazlı (financialExpenseRatio hedef)
    const result = getFinancialExpenseReductionTarget(ctx)
    if (result === null) return null

    // Cap: finExp × %30
    const finResult = getFinancialExpenses(ctx)
    if (finResult.amount === null || finResult.amount <= 0) return null

    const cap = finResult.amount * 0.30
    return Math.min(result.amount, cap)
  },

  useRatioBasedAmount: true,

  // R5 — buildTransactions fiş üretiyor (eskiden boş array döndürüyordu)
  // R7A Mini (Sonnet BLOCKER 1): isEstimated:true → 660 kullan (780 değil)
  // 780 hesabı olmayan KOBİ'lerde 780'i negatife düşürmemek için.
  buildTransactions: (context) => {
    const amount = context.amount ?? 0
    if (amount <= 0) return []

    // 780/781 yoksa tutar borç × %25 tahmininden geliyor → isEstimated:true
    const fin780 = (context.accountBalances?.['780'] ?? 0)
    const fin781 = (context.accountBalances?.['781'] ?? 0)
    const isEstimated = (fin780 + fin781) === 0

    // R7A Mini: KOBİ (isEstimated:true) → 660 Kısa Vadeli Borçlanma Maliyeti
    // Gerçek 780 varsa → 780 Finansman Giderleri (mevcut davranış)
    const creditAccountCode = isEstimated ? '660' : '780'
    const creditAccountName = isEstimated
      ? 'Kısa Vadeli Borçlanma Maliyeti (Tahmini)'
      : 'Finansman Giderleri'

    return [
      // 1. Operasyonel: nakit artar, finansman gideri azalır
      makeBalancedTransaction(
        'A14_FINEXP_REDUCTION',
        isEstimated
          ? 'Finansman Gideri Azaltma — Tahmini faiz oranına (%25) dayalı hesaplama'
          : 'Finansman Gideri Azaltma — Kredi Yeniden Yapılandırma',
        'FINANCE_COST_REDUCTION',
        [
          {
            accountCode: '102',
            accountName: 'Bankalar',
            side: 'DEBIT',
            amount,
            description: isEstimated
              ? 'Tahmini finansman gideri azalışı (borç × %25) — Simülasyon'
              : 'Finansman gideri azalışı nakit etkisi',
          },
          {
            accountCode: creditAccountCode,
            accountName: creditAccountName,
            side: 'CREDIT',
            amount,
            description: isEstimated
              ? 'Tahmini finansman gideri üzerinden simülasyon (780 mevcut değil)'
              : 'Finansman gideri azalışı',
          },
        ]
      ),
      // 2. Kar zinciri (R5 — R4 pattern, vergi 691 YOK)
      makeBalancedTransaction(
        'A14_PROFIT_TRANSFER',
        isEstimated
          ? 'Finansman Gideri Azaltma — Kar Aktarımı (tahmini)'
          : 'Finansman Gideri Azaltma — Kar Aktarımı',
        'FINANCE_COST_REDUCTION',
        [
          { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount, description: 'Sonuç hesabı aktarımı' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount, description: 'Dönem net kârı artışı'  },
        ]
      ),
    ]
  },

  preconditions: {
    // R5 — requiredAccountCodes ['660','661','780'] KALDIRILDI
    // Eligibility: 780 OR borç > 0 → computeAmount içinde kontrol edilir
    minSourceAmountTRY: 200_000,
  },

  qualityCoefficient: 0.70,
  sustainability: 'RECURRING',

  repeatDecay: { first: 1.00, second: 0.65, third: 0.40, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'revenue',
    minPctOfBasis: 0.003,
    typicalPctOfBasis: 0.01,
    maxPctOfBasis: 0.03,
    absoluteMinTRY: 200_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  false,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'Mevcut kredi faiz oranlarının refinansman, borç ödeme veya faiz riski yönetimi ile düşürülmesi. Net kâr ve faiz karşılama oranı (EBIT/faiz gideri) iyileşir.',
  cfoRationale:
    'Faiz maliyetinin azaltılması net kâr üzerinde olumlu etki yaratabilir. Refinansman veya borç azaltma yoluyla hayata geçirilebilir.',
  bankerPerspective:
    'Faiz karşılama oranı finansal sağlığın temel göstergelerinden biridir. Finansman giderinin düşürülmesi hem kârlılığı hem kaldıraç rasyolarını eş zamanlı güçlendirebilir. Refinansman olanakları ve mevcut piyasa faiz ortamı aksiyonun uygulanabilirliğini belirler.',
  bankerTrust: 'high',
  targetRatio: {
    metric:         'INTEREST_COVERAGE',
    benchmarkField: 'interestCoverage',
    basis:          'interestExpense',
    reliability:    'TCMB_DIRECT',
  },
}

// ── A15 ──────────────────────────────────────────────────────────────────────
const A15_DEBT_TO_EQUITY_SWAP: ActionTemplateV3 = {
  id: 'A15_DEBT_TO_EQUITY_SWAP',
  name: 'Ortaklara Borçlar Kalemini Sermayeye Çevirme',
  family: 'EQUITY_PNL',
  semanticType: 'DEBT_TO_EQUITY_SWAP',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A15_MAIN',
        'Ortak cari hesabı sermayeye dönüştürülüyor (331 → 500)',
        'DEBT_TO_EQUITY_SWAP',
        [
          { accountCode: '331', accountName: 'Ortaklara Borçlar', side: 'DEBIT',  amount, description: 'Ortak borcu kapatma (nakit çıkışı yok)' },
          { accountCode: '500', accountName: 'Sermaye',           side: 'CREDIT', amount, description: 'Sermayeye dönüştürme'                    },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['331'],
    minSourceAmountTRY: 1_000_000,
  },

  qualityCoefficient: 0.40,
  sustainability: 'ONE_OFF',

  repeatDecay: { first: 1.00, second: 0.40, third: 0.15, maxRepeats: 2 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.10,
    typicalPctOfBasis: 0.20,
    maxPctOfBasis: 0.50,
    absoluteMinTRY: 1_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,  // toplam aktif değişmez
    reducesRisk:            true,
  },

  description:
    'Ortakların şirkete borç verdiği tutarların (331 Ortaklara Borçlar) sermayeye (500) dönüştürülmesi. Nakit hareketi yoktur — pasif içinde sınıf değişikliği.',
  cfoRationale:
    'Ortak borçları yüksek şirketlerde en hızlı ve düşük maliyetli özkaynak artış yöntemi. Nakit gerektirmez, yalnızca ortakların kararı yeterlidir.',
  bankerPerspective:
    'Nakit hareketi içermez; bilanço içi sınıf değişimidir. Borç/özkaynak oranını iyileştirmesi somut bir finansal katkıdır. Nakit sermaye artırımına kıyasla daha sınırlı kalitede görülmekle birlikte, portföy içinde tamamlayıcı bir rol üstlenebilir.',
  bankerTrust: 'high',
  targetRatio: {
    metric:         'DEBT_TO_EQUITY',
    benchmarkField: 'debtToEquity',
    basis:          'equity',
    reliability:    'TCMB_DIRECT',
  },

  // R8.5 — Rasyo bazlı tutar (getEquityInjectionTarget paylaşımı — A10/A10B ile aynı helper)
  useRatioBasedAmount: true,
  computeAmount: (ctx: FirmContext): number | null => {
    // Özkaynak/aktif half-gap hedefi (A10 ile aynı formül, 331 kaynağı cap'ler)
    const target = getEquityInjectionTarget(ctx, { halfGap: true })
    if (!target) return null

    // 331 bakiye cap — kaynak yetersizse önerilen tutarı kırp
    const sourceBalance = ctx.accountBalances?.['331'] ?? 0
    if (sourceBalance <= 0) return null

    return Math.min(target, sourceBalance)
  },
}

// ── A15B ─────────────────────────────────────────────────────────────────────
const A15B_SHAREHOLDER_DEBT_TO_LT: ActionTemplateV3 = {
  id: 'A15B_SHAREHOLDER_DEBT_TO_LT',
  name: 'Ortaklara Borçlar Kalemini Uzun Vadeye Aktarma',
  family: 'DEBT_STRUCTURE',
  semanticType: 'DEBT_EXTENSION',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A15B_MAIN',
        'Ortak borcu uzun vadeye aktarılıyor (331 ↓ / 431 ↑)',
        'DEBT_EXTENSION',
        [
          { accountCode: '331', accountName: 'Ortaklara Borçlar',      side: 'DEBIT',  amount, description: 'Kısa vadeli ortak borcu azalışı' },
          { accountCode: '431', accountName: 'Ortaklara Borçlar (UV)', side: 'CREDIT', amount, description: 'Uzun vadeli ortak borcu artışı'  },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['331'],
    minSourceAmountTRY: 1_000_000,
  },

  qualityCoefficient: 0.25,
  sustainability: 'ACCOUNTING_ONLY',

  repeatDecay: { first: 1.00, second: 0.40, third: 0.20, maxRepeats: 2 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.20,
    typicalPctOfBasis: 0.50,
    maxPctOfBasis: 1.00,
    absoluteMinTRY: 1_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'applicable',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'Ortakların şirkete vermiş olduğu kısa vadeli borç (331) uzun vadeye (431) aktarılır. Cari oran iyileşir, kısa vadeli ödeme baskısı azalır. Sermaye artışı değildir.',
  cfoRationale:
    'Sermaye dönüşümü yapmadan vade yapısı düzeltilir. Kısa vadeli yükümlülük azaldığı için işletme sermayesi rahatlar. Özkaynak değişmez.',
  bankerPerspective:
    'Vade uzatımı kabul edilebilir ancak nakit yaratan bir hareket değildir. Cari oran ve likidite değerlendirmesinde olumlu yansır.',
  bankerTrust: 'medium',
  targetRatio: {
    metric:         'SHORT_TERM_DEBT_RATIO',
    benchmarkField: 'shortTermDebtRatio',
    basis:          'totalDebt',
    reliability:    'FINRATE_ESTIMATE',
  },

  // R8.5 — Rasyo bazlı tutar (getCurrentRatioTarget — cari oran half-gap)
  useRatioBasedAmount: true,
  computeAmount: (ctx: FirmContext): number | null => {
    // Cari oran half-gap hedefi — 331 KV→UV taşıma ile gerekli reduction tutarı
    const target = getCurrentRatioTarget(ctx)
    if (!target) return null

    // 331 bakiye cap — kaynak yetersizse önerilen tutarı kırp
    const sourceBalance = ctx.accountBalances?.['331'] ?? 0
    if (sourceBalance <= 0) return null

    return Math.min(target, sourceBalance)
  },
}

// ── A18 ──────────────────────────────────────────────────────────────────────
const A18_NET_SALES_GROWTH: ActionTemplateV3 = {
  id: 'A18_NET_SALES_GROWTH',
  name: 'Net Satış Artışı',
  family: 'EQUITY_PNL',
  semanticType: 'OPERATIONAL_REVENUE',
  horizons: ['medium', 'long'],

  targetRatio: {
    metric:         'ASSET_TURNOVER',
    benchmarkField: 'assetTurnover',
    basis:          'totalAssets',
    fallback:       1.0,
    reliability:    'TCMB_DIRECT',
  },

  // R7B — Rasyo bazlı (R5 kararı uygulanma)
  // Hedef: sektör asset turnover benchmark'ına doğru satış büyümesi
  useRatioBasedAmount: true,

  computeAmount: (ctx) => {
    const baselineAssets = ctx.totalAssets ?? 0
    if (baselineAssets <= 0) return null

    const baselineRevenue = ctx.baselineNetSales ?? ctx.netSales ?? 0
    if (baselineRevenue <= 0) return null

    // Brüt zarar guard: negatif marjda satış artışı zarar büyütür
    const baselineGrossProfit = ctx.baselineGrossProfit ?? ctx.grossProfit ?? 0
    if (baselineGrossProfit <= 0) return null

    // Sektör asset turnover benchmark
    const sectorTurnover = getBenchmarkValue(ctx.sector, 'assetTurnover')
    if (!sectorTurnover) return null

    const currentTurnover = baselineRevenue / baselineAssets
    if (currentTurnover >= sectorTurnover.value) return null  // Hedef üstünde

    // Hedef satış = sektör benchmark × mevcut aktifler
    const targetRevenue = sectorTurnover.value * baselineAssets
    const revenueGap    = targetRevenue - baselineRevenue

    // Gerçekçi cap: mevcut satışın %50'si kadar artış
    const realisticCap = baselineRevenue * 0.50
    const amount = Math.min(revenueGap, realisticCap)

    if (amount < 1_000_000) return null
    return amount
  },

  buildTransactions: (context) => {
    const netSales    = context.netSales    ?? 0
    const grossProfit = context.grossProfit ?? 0
    if (netSales <= 0 || grossProfit <= 0) return []

    const grossMargin = grossProfit / netSales
    if (grossMargin <= 0 || grossMargin >= 1) return []

    // Hizmet/bilişim: doğrudan nakit tahsilat (102)
    // İmalat/ticaret/inşaat: alacak üzerinden satış (120)
    const useCash   = isServiceLike(context.sector)
    const debitCode = useCash ? '102' : '120'
    const debitName = useCash ? 'Bankalar' : 'Alıcılar'

    // Stok hesap havuzu (A19 ile aynı) — 159 avans değil, hariç tutulur
    const stockAccounts = [
      { code: '150', name: 'İlk Madde ve Malzeme' },
      { code: '151', name: 'Yarı Mamuller'        },
      { code: '152', name: 'Mamuller'             },
      { code: '153', name: 'Ticari Mallar'        },
    ]

    const balances   = context.accountBalances ?? {}
    const totalStock = stockAccounts.reduce(
      (sum, acc) => sum + (balances[acc.code] ?? 0),
      0
    )

    // Stok yoksa — sektöre göre ayrı yol
    if (totalStock <= 0) {
      const amount = clampAmount(context.amount, 1_000_000)
      if (amount <= 0) return []

      if (isServiceLike(context.sector)) {
        // Hizmet/bilişim: maliyet yok → tam ciro kâr (mevcut davranış)
        return [
          makeBalancedTransaction(
            'A18_REVENUE_ONLY',
            `Net satış artışı — ${useCash ? 'nakit' : 'alacak'} bazlı model (${debitCode} + 600)`,
            'OPERATIONAL_REVENUE',
            [
              { accountCode: debitCode, accountName: debitName,          side: 'DEBIT',  amount, description: `Satıştan ${useCash ? 'nakit girişi' : 'alacak artışı'}` },
              { accountCode: '600',     accountName: 'Yurtiçi Satışlar', side: 'CREDIT', amount, description: 'Net satış artışı'                                       },
            ]
          ),
          makeBalancedTransaction(
            'A18_PROFIT_TRANSFER',
            'Dönem kâr aktarımı',
            'OPERATIONAL_REVENUE',
            [
              { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount, description: 'Sonuç hesabı aktarımı' },
              { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount, description: 'Dönem net kârı artışı' },
            ]
          ),
        ]
      }

      // R7B — İmalat/ticaret/inşaat: stok yoksa sektör marj fallback ile COGS tanı
      // (Stoksuz imalat/ticaret: mizan eksik — tam ciro = tam kâr saçma)
      const baselineSales = context.baselineNetSales ?? netSales
      const baselineGP    = context.baselineGrossProfit ?? grossProfit
      const sectorMarginFallback =
        context.sector === 'TRADE' ? 0.25
        : context.sector === 'CONSTRUCTION' ? 0.15
        : 0.20  // MANUFACTURING default
      const currentMargin = baselineSales > 0
        ? Math.max(baselineGP / baselineSales, 0.05)
        : sectorMarginFallback
      const costAmount   = Math.round(amount * (1 - currentMargin))
      const profitAmount = amount - costAmount
      return [
        makeBalancedTransaction(
          'A18_REVENUE_AND_COST_FALLBACK',
          `Net satış artışı + sektör marj fallback (${debitCode} + 600 / 621 + 770)`,
          'OPERATIONAL_REVENUE',
          [
            { accountCode: debitCode, accountName: debitName,                  side: 'DEBIT',  amount,      description: `Satıştan ${useCash ? 'nakit girişi' : 'alacak artışı'}` },
            { accountCode: '600',     accountName: 'Yurtiçi Satışlar',         side: 'CREDIT', amount,      description: 'Net satış artışı'                                       },
            { accountCode: '621',     accountName: 'Satılan Mal Maliyeti',     side: 'DEBIT',  amount: costAmount,   description: 'Maliyet artışı (sektör marj fallback)'         },
            { accountCode: '770',     accountName: 'Genel Yönetim Giderleri', side: 'CREDIT', amount: costAmount,   description: 'Maliyet karşılığı (simülasyon)'                },
          ]
        ),
        makeBalancedTransaction(
          'A18_PROFIT_TRANSFER',
          'Dönem kâr aktarımı',
          'OPERATIONAL_REVENUE',
          [
            { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount: profitAmount, description: 'Sonuç hesabı aktarımı' },
            { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount: profitAmount, description: 'Dönem net kârı artışı' },
          ]
        ),
      ]
    }

    // Stok varsa: 4 leg (dominant stok maliyetlendirmesi)
    const dominantStock = stockAccounts.reduce((max, acc) =>
      (balances[acc.code] ?? 0) > (balances[max.code] ?? 0) ? acc : max
    )
    const dominantBalance = balances[dominantStock.code] ?? 0

    // maxByStock: DOMINANT bakiyeye göre (toplam değil — dominant hesap negatife düşmesin)
    const maxByStock = dominantBalance / (1 - grossMargin)
    const amount     = clampAmount(
      Math.min(context.amount, maxByStock),
      1_000_000
    )
    if (amount <= 0) return []

    const costAmount   = amount * (1 - grossMargin)
    const profitAmount = amount * grossMargin

    return [
      makeBalancedTransaction(
        'A18_REVENUE_AND_COST',
        `Net satış artışı + maliyet — ${useCash ? 'nakit' : 'alacak'} bazlı model (${debitCode} + 600 / 621 + ${dominantStock.code})`,
        'OPERATIONAL_REVENUE',
        [
          { accountCode: debitCode,          accountName: debitName,              side: 'DEBIT',  amount,      description: `Satıştan ${useCash ? 'nakit girişi' : 'alacak artışı'}` },
          { accountCode: '600',              accountName: 'Yurtiçi Satışlar',     side: 'CREDIT', amount,      description: 'Net satış artışı'                                       },
          { accountCode: '621',              accountName: 'Satılan Mal Maliyeti', side: 'DEBIT',  amount: costAmount, description: 'Maliyet artışı'                                },
          { accountCode: dominantStock.code, accountName: dominantStock.name,     side: 'CREDIT', amount: costAmount, description: 'Stok azalışı'                                  },
        ]
      ),
      makeBalancedTransaction(
        'A18_PROFIT_TRANSFER',
        'Dönem kâr aktarımı',
        'OPERATIONAL_REVENUE',
        [
          { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount: profitAmount, description: 'Sonuç hesabı aktarımı' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount: profitAmount, description: 'Dönem net kârı artışı' },
        ]
      ),
    ]
  },

  preconditions: {
    minSourceAmountTRY: 1_000_000,
    // Mevcut revenue check'in yerine geçer: sumAccountsByPrefix → netSales > 0 eşdeğer
    // + sektör altı %50 marj filtresi eklendi (Faz 7.3.50A.13)
    // + baseline öncelikli marj kontrolü eklendi (Faz 7.3.50A.13.1)
    customCheck: (analysis) => {
      const {
        sector, netSales, grossProfit,
        baselineNetSales, baselineGrossProfit,
      } = analysis as AnalysisInput

      if (!netSales || netSales <= 0) {
        return { pass: false, reason: 'Mevcut satış geliri yok — A18 net satış artışı için baz gerekli' }
      }

      if (grossProfit === undefined || grossProfit <= 0) {
        return { pass: false, reason: 'Brüt zarar — düşük marjda satış artışı zarar büyütür' }
      }

      const bm = sector ? getBenchmarkValue(sector, 'grossMargin') : null
      const targetMargin = bm?.value

      if (!targetMargin) {
        return { pass: true }  // sektör eşiği yoksa mevcut davranış
      }

      // YENİ: BASELINE öncelikli kontrol (Faz 7.3.50A.13.1)
      // İş kuralı: "Baseline marj sektör altı %50 ise paketin TAMAMINDA A18 önerilmesin."
      // Sıfır/negatif baseline marj da eler (0/x = 0 < threshold, -n/x < threshold).
      // baselineContext proxy'den gelir; yoksa yedek olarak current marj kullanılır.
      if (baselineGrossProfit !== undefined && baselineNetSales !== undefined && baselineNetSales > 0) {
        const baselineMargin = baselineGrossProfit / baselineNetSales
        if (baselineMargin < targetMargin * 0.5) {
          return {
            pass: false,
            reason: 'Baseline marj sektör altı — önce maliyet yapısı düzeltilmeli, sonra satış artışı',
          }
        }
      }

      // CURRENT marj kontrolü KORUNDU (yedek — baselineContext yoksa devreye girer)
      const currentMargin = grossProfit / netSales

      if (currentMargin < targetMargin * 0.5) {
        return { pass: false, reason: 'Sektör altı marj — mevcut maliyet yapısıyla satış artışı zarar büyütür' }
      }

      return { pass: true }
    },
  },

  qualityCoefficient: 0.95,
  sustainability: 'RECURRING',

  repeatDecay: { first: 1.00, second: 0.80, third: 0.60, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'revenue',
    minPctOfBasis: 0.05,
    typicalPctOfBasis: 0.15,
    maxPctOfBasis: 0.35,
    absoluteMinTRY: 1_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'primary',
    TRADE:         'primary',
    RETAIL:        'primary',
    SERVICES:      'primary',
    IT:            'primary',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  true,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'Şirketin net satış gelirini artırması. Hizmet/bilişim sektöründe nakit (102), imalat/ticaret/inşaat sektöründe alacak (120) bazlı modellenir.',
  cfoRationale:
    'Güçlü büyüme kaynaklarından biridir. Hacim artışı ve fiyat gücünün birlikte uygulandığı senaryolarda tüm finansal rasyolar organik olarak iyileşebilir. Aktif devir hızı düşük şirketlerde satış büyümesi portföyün öncelikli aksiyonu olabilir.',
  bankerPerspective:
    'Satış büyümesi yinelenen gelir tabanını güçlendirebilir; aktif verimliliği (aktif devir hızı) ve kaldıraç rasyoları organik biçimde iyileşebilir. Büyümenin sürdürülebilirliği ve finansman yapısı — özkaynak mı, işletme nakit akışı mı — aksiyonun uzun vadeli kalitesini belirler.',
  bankerTrust: 'high',
  requiresOperationalProof: true,
}

// ── A19 ──────────────────────────────────────────────────────────────────────
const A19_ADVANCE_TO_REVENUE: ActionTemplateV3 = {
  id: 'A19_ADVANCE_TO_REVENUE',
  name: 'Alınan Avansların Teslimi',  // R8.7: 'Alınan Avansın Hasılata Tanınması (Proje Teslimi)' → sade
  family: 'EQUITY_PNL',
  semanticType: 'ADVANCE_TO_REVENUE',
  horizons: ['short', 'medium', 'long'],

  targetRatio: {
    metric:         'ASSET_TURNOVER',
    benchmarkField: 'assetTurnover',
    basis:          'totalAssets',
    fallback:       1.0,
    reliability:    'TCMB_DIRECT',
  },

  // R7B — Rasyo bazlı (R5 kararı uygulanma)
  // Avans tutarı: 340 × %10-60 pct yerine avans bazlı + asset turnover hedefi
  useRatioBasedAmount: true,

  computeAmount: (ctx) => {
    // R10.2: baselineGrossProfit guard kaldırıldı — brüt zararda da avans hasılata dönüşebilir

    // Avans bakiyesi
    const advance = ctx.accountBalances?.['340'] ?? 0
    if (advance <= 0) return null

    // Asset turnover hedefi
    const sectorTurnover = getBenchmarkValue(ctx.sector, 'assetTurnover')
    if (!sectorTurnover) return null

    const baselineAssets  = ctx.totalAssets ?? 0
    if (baselineAssets <= 0) return null

    const baselineRevenue = ctx.baselineNetSales ?? ctx.netSales ?? 0

    // Avans dönüşüm cap: 340 × %30 (tek dönem gerçekçi sınır)
    const advanceConversionCap = advance * 0.30

    // Asset turnover gap
    const targetRevenue = sectorTurnover.value * baselineAssets
    const revenueGap    = Math.max(targetRevenue - baselineRevenue, 0)

    // Her iki cap'in min'i — avans yoksa büyük bir tutar üretmez
    const gapCap = revenueGap > 0 ? revenueGap : advanceConversionCap
    const amount = Math.min(advanceConversionCap, gapCap, advance)

    if (amount < 1_000_000) return null
    return amount
  },

  buildTransactions: (context) => {
    // R10.2: baselineGrossProfit guard kaldırıldı — brüt zararda da avans hasılata dönüşebilir.
    // profitAmount = grossMargin <= 0 ? 0 : hesaplanan kâr (kâr aktarımı brüt zararda sıfır)

    const netSales    = context.netSales    ?? 0
    const grossProfit = context.grossProfit ?? 0
    if (netSales <= 0) return []

    const grossMargin = grossProfit / netSales
    if (grossMargin >= 1) return []

    const balances       = context.accountBalances ?? {}
    const advanceBalance = balances['340'] ?? 0
    if (advanceBalance <= 0) return []

    // Stok hesap havuzu (150-153) — 159 avans niteliğinde, hariç tutulur
    const stockAccounts = [
      { code: '150', name: 'İlk Madde ve Malzeme' },
      { code: '151', name: 'Yarı Mamuller'        },
      { code: '152', name: 'Mamuller'             },
      { code: '153', name: 'Ticari Mallar'        },
    ]

    // Toplam stok — "stok var mı?" kontrolü
    const totalStock = stockAccounts.reduce(
      (sum, acc) => sum + (balances[acc.code] ?? 0),
      0
    )

    // Stok yoksa: sektöre göre ayrı yol
    if (totalStock <= 0) {
      const amount = clampAmount(
        Math.min(context.amount, advanceBalance),
        1_000_000
      )
      if (amount <= 0) return []

      if (!isServiceLike(context.sector)) {
        // R7B mini — İmalat/ticaret/inşaat stoksuz: sektör marj fallback COGS (CODEX audit)
        // Avansın yarattığı hasılata gerçekçi maliyet eklenir; tam hasılat = tam kâr saçma
        const costAccountCode = context.sector === 'CONSTRUCTION' ? '622' : '621'
        const costAccountName = context.sector === 'CONSTRUCTION'
          ? 'Hizmet Üretim Maliyeti'   // Tek Düzen Hesap Planı resmi adı (622)
          : 'Satılan Mal Maliyeti'
        const costAmount   = Math.round(amount * (1 - grossMargin))
        const profitAmount = grossMargin <= 0 ? 0 : (amount - costAmount)
        return [
          makeBalancedTransaction(
            'A19_DELIVERY_REVENUE_AND_COST_FALLBACK',
            `Alınan avans teslimatla hasılata dönüşür + sektör marj COGS (${costAccountCode}+770)`,
            'ADVANCE_TO_REVENUE',
            [
              { accountCode: '340',          accountName: 'Alınan Sipariş Avansları', side: 'DEBIT',  amount,           description: 'Avans çözülmesi' },
              { accountCode: '600',          accountName: 'Yurtiçi Satışlar',         side: 'CREDIT', amount,           description: 'Hasılat artışı'  },
              { accountCode: costAccountCode, accountName: costAccountName,            side: 'DEBIT',  amount: costAmount, description: 'Maliyet artışı (sektör marj fallback)' },
              { accountCode: '770',          accountName: 'Genel Yönetim Giderleri', side: 'CREDIT', amount: costAmount, description: 'Maliyet karşılığı (simülasyon)'        },
            ]
          ),
          // R10.2: brüt zararda kâr aktarımı sıfır — işlem oluşturulmaz
          ...(profitAmount > 0 ? [makeBalancedTransaction(
            'A19_PROFIT_TRANSFER',
            'Dönem kâr aktarımı',
            'ADVANCE_TO_REVENUE',
            [
              { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount: profitAmount, description: 'Sonuç hesabı aktarımı' },
              { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount: profitAmount, description: 'Dönem net kârı artışı' },
            ]
          )] : []),
        ]
      }

      // Hizmet/bilişim: tam hasılat = tam kâr (avans çözülmesi — maliyet yok)
      return [
        makeBalancedTransaction(
          'A19_DELIVERY_REVENUE_ONLY',
          'Alınan avans hizmet/proje teslimatı ile hasılata dönüşür',
          'ADVANCE_TO_REVENUE',
          [
            { accountCode: '340', accountName: 'Alınan Sipariş Avansları', side: 'DEBIT',  amount, description: 'Avans çözülmesi' },
            { accountCode: '600', accountName: 'Yurtiçi Satışlar',         side: 'CREDIT', amount, description: 'Hasılat artışı' },
          ]
        ),
        makeBalancedTransaction(
          'A19_PROFIT_TRANSFER',
          'Dönem kâr aktarımı',
          'ADVANCE_TO_REVENUE',
          [
            { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount, description: 'Sonuç hesabı aktarımı' },
            { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount, description: 'Dönem net kârı artışı' },
          ]
        ),
      ]
    }

    // Dominant stok hesabı (en büyük bakiyeli)
    const dominantStock = stockAccounts.reduce((max, acc) =>
      (balances[acc.code] ?? 0) > (balances[max.code] ?? 0) ? acc : max
    )
    const dominantBalance = balances[dominantStock.code] ?? 0

    // maxByStock: DOMINANT bakiyeye göre — toplam kullanılırsa dominant negatife düşer
    const maxByStock = dominantBalance / (1 - grossMargin)
    const amount     = clampAmount(
      Math.min(context.amount, advanceBalance, maxByStock),
      1_000_000
    )
    if (amount <= 0) return []

    const costAmount   = amount * (1 - grossMargin)
    const profitAmount = grossMargin <= 0 ? 0 : (amount * grossMargin)

    // R8.1: İnşaat firmaları için 622 Hizmet Üretim Maliyeti (mali müşavir disiplini)
    // Sonnet + Codex ortak bulgu: inşaat proje teslimatında 621 (SMM) değil
    // 622 = Hizmet Üretim Maliyeti (Tek Düzen Hesap Planı resmi adı).
    // Diğer sektörler (imalat/ticaret/perakende) → 621 SMM korunur.
    const stockedCostCode = context.sector === 'CONSTRUCTION' ? '622' : '621'
    const stockedCostName = context.sector === 'CONSTRUCTION'
      ? 'Hizmet Üretim Maliyeti'   // Tek Düzen Hesap Planı resmi adı (622)
      : 'Satılan Mal Maliyeti'

    return [
      makeBalancedTransaction(
        'A19_DELIVERY_REVENUE_AND_COST',
        'Alınan avans teslimatla satışa dönüşür, ilgili stok maliyeti gelir tablosuna alınır',
        'ADVANCE_TO_REVENUE',
        [
          { accountCode: '340',              accountName: 'Alınan Sipariş Avansları', side: 'DEBIT',  amount,      description: 'Avans çözülmesi' },
          { accountCode: '600',              accountName: 'Yurtiçi Satışlar',         side: 'CREDIT', amount,      description: 'Hasılat artışı'  },
          { accountCode: stockedCostCode,    accountName: stockedCostName,            side: 'DEBIT',  amount: costAmount, description: 'Maliyet artışı' },
          { accountCode: dominantStock.code, accountName: dominantStock.name,         side: 'CREDIT', amount: costAmount, description: 'Stok azalışı'  },
        ]
      ),
      // R10.2: brüt zararda kâr aktarımı sıfır — işlem oluşturulmaz
      ...(profitAmount > 0 ? [makeBalancedTransaction(
        'A19_PROFIT_TRANSFER',
        'Dönem kâr aktarımı',
        'ADVANCE_TO_REVENUE',
        [
          { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount: profitAmount, description: 'Sonuç hesabı aktarımı' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount: profitAmount, description: 'Dönem net kârı artışı' },
        ]
      )] : []),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['340'],
    minSourceAmountTRY: 1_000_000,
  },

  qualityCoefficient: 0.75,
  sustainability: 'SEMI_RECURRING',

  repeatDecay: { first: 1.00, second: 0.75, third: 0.55, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.10,
    typicalPctOfBasis: 0.25,
    maxPctOfBasis: 0.60,
    absoluteMinTRY: 1_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'primary',
    RETAIL:        'applicable',
    SERVICES:      'applicable',
    IT:            'not_applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        false,   // nakit zaten alındı, şimdi gelir tanınıyor
    strengthensOperations:  true,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'Müşteriden önceden alınan sipariş avanslarının (340) ürün/hizmet teslim edilmesiyle yurtiçi satışlara (600) dönüştürülmesi.',
  cfoRationale:
    'Avans → hasılat dönüşümü üretim/teslimat hızlanmasıyla sağlanır. Proje portföyünü aktifleştirir ve gelir tablosunu güçlendirir. ' +
    'Uyarı (R10.2): Firma brüt zararda ise kâr aktarımı (690→590) sıfır tutarla oluşturulmaz; sadece hasılat/maliyet kalemleri kaydedilir.',
  bankerPerspective:
    'Avansın hasılata dönüşmesi iş hacminin fiilen gerçekleştiğini belgeler ve gelir tablosunu güçlendirir. Teslim belgesi ve müşteri kabulü olmadan yapılan erken hasılat tanıma ilerleyen dönemlerde düzeltme riski yaratabilir; gerçek teslim takvimine uyum muhasebe güvenilirliğini korur.',
  bankerTrust: 'medium',
  requiresOperationalProof: true,
}

// ── A20 ──────────────────────────────────────────────────────────────────────
const A20_GROSS_MARGIN_REFORM: ActionTemplateV3 = {
  id: 'A20_GROSS_MARGIN_REFORM',
  name: 'Brüt Marj Reformu',  // R8.7: 'Brüt Marj Reformu — Maliyet Düşüşü (Nakit Kanal)' → sade
  family: 'EQUITY_PNL',
  semanticType: 'OPERATIONAL_MARGIN',
  horizons: ['medium'],

  useRatioBasedAmount: true,

  targetRatio: {
    metric:         'GROSS_MARGIN',
    benchmarkField: 'grossMargin',
    basis:          'netSales',
    fallback:       0.30,
    reliability:    'TCMB_DIRECT',
  },

  computeAmount: (ctx) => {
    // R4 — Brüt zarar guard kaldırıldı; A20 nakit kanal (tedarikçi bağımsız)
    const baseReduction = getGrossMarginReductionTarget(ctx)
    if (baseReduction === null) return null

    const cogs = getCogs(ctx) ?? 0
    if (cogs <= 0) return null

    // Cap: COGS'un %30'u — nakit kanal makul üst sınır
    const cap = cogs * 0.30

    const result = Math.min(baseReduction, cap)
    return result > 0 ? result : null
  },

  buildTransactions: (context) => {
    const amount = context.amount ?? 0
    if (amount <= 0) return []
    return [
      // 1. Operasyonel etki: nakit artar, maliyet azalır
      makeBalancedTransaction(
        'A20_REFORM_NAKİT',
        'Brüt Marj Reformu — Maliyet Düşüşü (Nakit Kanal)',
        'OPERATIONAL_MARGIN',
        [
          { accountCode: '102', accountName: 'Bankalar',             side: 'DEBIT',  amount, description: 'Maliyet tasarrufu nakit etkisi' },
          { accountCode: '621', accountName: 'Satılan Mal Maliyeti', side: 'CREDIT', amount, description: 'Maliyet azalışı'                },
        ]
      ),
      // 2. R4 — Kar zinciri (A12 pattern, vergi YOK — A12/A18/A19 ile tutarlı)
      // SONNET NOTU: 690/590 dönem sonu kar transferi simülasyonudur;
      //              anlık yevmiye değil. Sistemin "ne yapmalı" gösterimi için.
      makeBalancedTransaction(
        'A20_PROFIT_TRANSFER',
        'Brüt Marj Reformu — Kar Aktarımı',
        'OPERATIONAL_MARGIN',
        [
          { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount, description: 'Sonuç hesabı aktarımı' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount, description: 'Dönem net kârı artışı' },
        ]
      ),
    ]
  },

  preconditions: {
    minSourceAmountTRY: 500_000,
  },

  qualityCoefficient: 0.85,
  sustainability: 'RECURRING',

  repeatDecay: { first: 1.00, second: 0.75, third: 0.55, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'revenue',
    minPctOfBasis: 0.01,
    typicalPctOfBasis: 0.03,
    maxPctOfBasis: 0.08,
    absoluteMinTRY: 500_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'primary',
    TRADE:         'primary',
    RETAIL:        'primary',
    SERVICES:      'applicable',
    IT:            'applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  true,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'Tedarikçi dışı maliyet optimizasyonu ile satılan mal maliyeti (621) düşürülür, tasarruf bankada nakit (102) olarak tutulur. A12\'den farkı: 320 Satıcılar hesabı gerekmez — nakit tasarruf kanalı.',
  cfoRationale:
    'Maliyet yapısı iyileştirildiğinde her 1 puanlık brüt marj artışı net kâra doğrudan yansır. Nakit kanalı tedarikçi borç müzakeresi gerektirmez; operasyonel verimlilik, proses iyileştirme veya alternatif tedarik kanalı ile sağlanabilir.',
  bankerPerspective:
    'Brüt marjdaki yapısal iyileşme operasyonel kalitenin sürdürülebilir göstergesidir. Tedarikçi bağımlılığı olmadan uygulanabilen nakit kanallı bir maliyet optimizasyonudur.',
  bankerTrust: 'high',
}

// ── A21 ──────────────────────────────────────────────────────────────────────
const A21_OPERATING_PROFIT_REFORM: ActionTemplateV3 = {
  id: 'A21_OPERATING_PROFIT_REFORM',
  name: 'Faaliyet Kârı Reformu — Gider Optimizasyonu (Nakit Kanal)',
  family: 'EQUITY_PNL',
  semanticType: 'OPEX_REDUCTION',
  horizons: ['medium', 'long'],

  useRatioBasedAmount: true,

  computeAmount: (ctx) => {
    // R5 — Faaliyet gideri rasyo bazlı (operatingExpenseRatio hedef)
    // Atakan Karar 1: A21 güncellendi (id korundu)
    // ÖNCE: ebitMargin hedef + operatingProfit<0 guard
    // SONRA: operatingExpenseRatio hedef + guard kalktı
    const baseReduction = getOperatingExpenseReductionTarget(ctx)
    if (baseReduction === null) return null

    // Cap: opex × %25 (konservatif, tek dönem hedefi)
    const opex = getOperatingExpenses(ctx) ?? 0
    if (opex <= 0) return null

    const cap = opex * 0.25
    return Math.min(baseReduction, cap)
  },

  buildTransactions: (context) => {
    // R7B — Dinamik faaliyet gideri hesabı (en yüklü 630/631/632 seçilir)
    // R7B mini — getOperatingExpensesDetail: isEstimated bilgisi description'a yansıtılır
    // R5 — Kar zinciri (R4 A12/A20 pattern, vergi 691 YOK)
    const amount = context.amount ?? 0
    if (amount <= 0) return []

    // isEstimated: detay hesap yoksa KOBİ fallback (grossProfit - operatingProfit)
    const detail        = getOperatingExpensesDetail(context as unknown as import('./contracts').FirmContext)
    const isEstimatedOp = detail?.isEstimated ?? true   // detay yok → tahmin

    // En yüklü gider hesabı: 630/631/632 — büyük firmada doğru hesaba girer
    // KOBİ fallback (tümü 0): 632 Genel Yönetim Giderleri temsili
    const balances = context.accountBalances ?? {}
    const candidates = [
      { code: '630', name: 'Araştırma ve Geliştirme Giderleri',    amount: balances['630'] ?? 0 },
      { code: '631', name: 'Pazarlama, Satış ve Dağıtım Giderleri', amount: balances['631'] ?? 0 },
      { code: '632', name: 'Genel Yönetim Giderleri',               amount: balances['632'] ?? 0 },
    ]
    const dominant   = candidates.reduce((max, c) => c.amount > max.amount ? c : max, candidates[2])
    const creditCode = dominant.amount > 0 ? dominant.code : '632'
    const creditName = dominant.amount > 0 ? dominant.name : 'Genel Yönetim Giderleri'
    const opexDesc   = isEstimatedOp
      ? 'Faaliyet gideri azalışı (KOBİ tahmin — detay hesap yok)'
      : 'Faaliyet gideri azalışı'

    return [
      // 1. Operasyonel: nakit artar, en yüklü faaliyet gideri azalır
      makeBalancedTransaction(
        'A21_OPEX_REDUCTION',
        'Faaliyet Kârı Reformu — Gider Optimizasyonu (Nakit Kanal)',
        'OPEX_REDUCTION',
        [
          { accountCode: '102',      accountName: 'Bankalar', side: 'DEBIT',  amount, description: 'Gider tasarrufu nakit etkisi' },
          { accountCode: creditCode, accountName: creditName,  side: 'CREDIT', amount, description: opexDesc                       },
        ]
      ),
      // 2. Kar zinciri (R5 — R4 pattern, vergi 691 YOK)
      makeBalancedTransaction(
        'A21_PROFIT_TRANSFER',
        'Faaliyet Kârı Reformu — Kar Aktarımı',
        'OPEX_REDUCTION',
        [
          { accountCode: '690', accountName: 'Dönem Kârı veya Zararı', side: 'DEBIT',  amount, description: 'Sonuç hesabı aktarımı' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount, description: 'Dönem net kârı artışı'  },
        ]
      ),
    ]
  },

  preconditions: {
    minSourceAmountTRY: 300_000,
  },

  qualityCoefficient: 0.80,
  sustainability: 'RECURRING',

  repeatDecay: { first: 1.00, second: 0.70, third: 0.45, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'revenue',
    minPctOfBasis: 0.005,
    typicalPctOfBasis: 0.02,
    maxPctOfBasis: 0.05,
    absoluteMinTRY: 300_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
    MANUFACTURING: 'applicable',
    TRADE:         'applicable',
    RETAIL:        'applicable',
    SERVICES:      'primary',
    IT:            'primary',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  true,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'Genel yönetim giderleri (632) optimize edilerek faaliyet kârı ve FAVÖK marjı iyileştirilir. Tasarruf nakit (102) olarak tutulur. A13\'ten farkı: projeksiyon değil, gerçek yevmiye kaydı.',
  cfoRationale:
    'Faaliyet giderlerindeki yapısal azalma FAVÖK marjını kalıcı olarak güçlendirir. Nakit kanalı tasarrufu anında bilanço güçlenmesi olarak yansıtır.',
  bankerPerspective:
    'Operasyonel gider disiplini FAVÖK kalitesini artırır. A21, A13\'ün projeksiyon modeli yerine gerçek muhasebe kaydı ile somutlaştırılmış versiyonudur.',
  bankerTrust: 'medium',
}

// ── A22 ──────────────────────────────────────────────────────────────────────
const A22_SHAREHOLDER_RECEIVABLE_COLLECTION: ActionTemplateV3 = {
  id: 'A22_SHAREHOLDER_RECEIVABLE_COLLECTION',
  name: 'Ortaklardan Alacak Tahsilatı',
  family: 'WC_COMPOSITION',
  semanticType: 'RECEIVABLE_COLLECTION',
  horizons: ['short', 'medium'],

  // FIX 4: 131 VEYA 231'den tahsilat — önce KV (131), kalan UV (231)
  // Toplam alacağın %50 kapı — sürdürülebilir ortak ilişkisi için koruma
  buildTransactions: (context) => {
    const bal131 = context.accountBalances?.['131'] ?? 0
    const bal231 = context.accountBalances?.['231'] ?? 0
    const total  = bal131 + bal231
    if (total < 1_000_000) return []

    // %50 tavan: ortak ilişkileri ve nakit akışı dengesi
    const maxAmount = total * 0.50
    const amount    = Math.min(context.amount, maxAmount)
    if (amount <= 0) return []

    // Önce 131 (KV alacak), kalan 231 (UV alacak)
    const from131 = Math.min(amount, bal131)
    const from231 = amount - from131

    const legs: AccountingLeg[] = [
      { accountCode: '102', accountName: 'Bankalar',                       side: 'DEBIT',  amount,   description: 'Ortak tahsilatı nakit girişi'        },
      { accountCode: '131', accountName: 'Ortaklardan Alacaklar (KV)',     side: 'CREDIT', amount: from131, description: 'Kısa vadeli ortak alacağı tahsilatı' },
    ]
    if (from231 > 0) {
      legs.push(
        { accountCode: '231', accountName: 'Ortaklardan Alacaklar (UV)', side: 'CREDIT', amount: from231, description: 'Uzun vadeli ortak alacağı tahsilatı' }
      )
    }

    return [makeBalancedTransaction('A22_MAIN', 'Ortaklardan alacak tahsilatı — 131/231 → 102', 'RECEIVABLE_COLLECTION', legs)]
  },

  // FIX 4: requiredAccountCodes kaldırıldı (AND yerine OR mantığı)
  // Threshold 1M TL — customCheck'te doğrulanır
  preconditions: {
    minSourceAmountTRY: 1_000_000,
    customCheck: (analysis) => {
      const b131 = sumAccountsByPrefix(analysis, ['131'])
      const b231 = sumAccountsByPrefix(analysis, ['231'])
      const total = b131 + b231
      if (total < 1_000_000) {
        return {
          pass: false,
          reason: `Yetersiz ortak alacağı: ${total.toLocaleString('tr-TR')} TL < min 1.000.000 TL (131+231 hesapları)`,
        }
      }
      return { pass: true }
    },
  },

  qualityCoefficient: 0.65,
  sustainability: 'ONE_OFF',

  repeatDecay: { first: 1.00, second: 0.40, third: 0.15, maxRepeats: 1 },

  suggestedAmount: {
    basis: 'assets',
    minPctOfBasis: 0.02,
    typicalPctOfBasis: 0.05,
    maxPctOfBasis: 0.10,
    absoluteMinTRY: 1_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'primary',
    RETAIL:        'applicable',
    SERVICES:      'primary',
    IT:            'primary',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'Ortaklara (131 — kısa vadeli, 231 — uzun vadeli) verilen borçların tahsil edilerek nakde (102) dönüştürülmesi. İlişkili taraf alacak riskini azaltır, nakit pozisyonunu güçlendirir.',
  cfoRationale:
    'Ortak alacakları zaman zaman bilanço şişmesine neden olur ve tahsilat disiplinsizliğine işaret eder. Tahsilat nakit döngüsünü kısaltır ve ilişkili taraf riskini açık biçimde azaltır.',
  bankerPerspective:
    'Ortaklardan alacak tahsilatı hem nakit pozisyonunu hem ilişkili taraf risk profilini iyileştirir. Bankacı perspektifinden bu, ortak disiplininin ve kurumsal yönetim kalitesinin somut göstergesidir. Belgelenmiş tahsilat kararları kredi değerlendirmesinde pozitif sinyal oluşturur.',
  bankerTrust: 'high',
}

// ─── Katalog Derleme & Exports ────────────────────────────────────────────────

export const ACTION_CATALOG_V3: Record<string, ActionTemplateV3> = {
  A01_ST_FIN_DEBT_TO_LT,
  A02_TRADE_PAYABLE_TO_LT,
  A03_ADVANCE_TO_LT,
  A04_CASH_PAYDOWN_ST,
  A05_RECEIVABLE_COLLECTION,
  A06_INVENTORY_MONETIZATION,
  A08_FIXED_ASSET_DISPOSAL,
  A09_SALE_LEASEBACK,
  A10_CASH_EQUITY_INJECTION,
  A10B_PROMISSORY_NOTE_EQUITY_INJECTION,
  A11_RETAIN_EARNINGS,
  A12_GROSS_MARGIN_IMPROVEMENT,
  A13_OPEX_OPTIMIZATION,
  A14_FINANCE_COST_REDUCTION,
  A15_DEBT_TO_EQUITY_SWAP,
  A15B_SHAREHOLDER_DEBT_TO_LT,
  A18_NET_SALES_GROWTH,
  A19_ADVANCE_TO_REVENUE,
  A20_GROSS_MARGIN_REFORM,
  A21_OPERATING_PROFIT_REFORM,
  A22_SHAREHOLDER_RECEIVABLE_COLLECTION,
}

export const ACTION_IDS_V3 = Object.keys(ACTION_CATALOG_V3)

export function getActionTemplateV3(actionId: string): ActionTemplateV3 | undefined {
  return ACTION_CATALOG_V3[actionId]
}
