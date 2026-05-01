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
} from './contracts'

import { getPeriodDays, getBenchmarkValue, applyFeasibilityCap } from './ratioHelpers'

// ─── Helper Types ─────────────────────────────────────────────────────────────

interface RawAccount {
  accountCode: string
  amount: number
}

interface AnalysisInput {
  accounts?: RawAccount[]
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
  name: 'KV Finansal Borç → UV Yeniden Yapılandırma',
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
}

// ── A03 ──────────────────────────────────────────────────────────────────────
const A03_ADVANCE_TO_LT: ActionTemplateV3 = {
  id: 'A03_ADVANCE_TO_LT',
  name: 'KV Alınan Avans → UV Sınıflandırma',
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
}

// ── A04 ──────────────────────────────────────────────────────────────────────
const A04_CASH_PAYDOWN_ST: ActionTemplateV3 = {
  id: 'A04_CASH_PAYDOWN_ST',
  name: 'Nakit ile KV Borç Kapatma',
  family: 'DEBT_STRUCTURE',
  semanticType: 'DEBT_REPAYMENT',
  horizons: ['short', 'medium'],

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

  computeAmount: (ctx) => {
    // 1. Gerekli verileri al
    const ar = (ctx.accountBalances['120'] ?? 0) + (ctx.accountBalances['121'] ?? 0)
    const netSales = ctx.netSales
    if (ar <= 0 || netSales <= 0) return null

    // 2. Period gün sayısı (Durum C: ctx.period alanından)
    const { days: periodDays } = getPeriodDays({ period: (ctx as any).period ?? 'ANNUAL' })

    // 3. Benchmark DSO
    const bm = getBenchmarkValue(ctx.sector, 'receivablesDays')
    const targetDays = bm?.value ?? 90  // fallback 90

    // 4. Applicability check
    // 1.1 tolerans: Benchmark'ın hafif üzerindeki firmalarda
    // gereksiz aksiyon önerilmesini engellemek için kullanılıyor.
    // Hard scientific threshold değil — pragmatik tampon.
    // Örn: DSO 85 olan firma (benchmark 79), 79 × 1.1 = 86.9
    // altında olduğu için aksiyon önerilmez. 6 günlük iyileştirme
    // önermek gürültü yaratır.
    const currentDSO = (ar / netSales) * periodDays
    if (currentDSO <= targetDays * 1.1) return null

    // 5. Hedef bakiye
    const targetAR = (netSales * targetDays) / periodDays

    // 6. Feasibility cap (%25)
    const result = applyFeasibilityCap(ar, targetAR, 0.25)

    // 7. null/0 koruması → fallback'e geç
    return result > 0 ? result : null
  },

  targetRatio: {
    metric:          'DSO',
    benchmarkField:  'receivablesDays',
    basis:           'netSales',
    fallback:        90,
    reliability:     'TCMB_DIRECT',
    // targetDays omit edildi (opsiyonel, dinamik benchmark'tan gelecek)
  },
}

// ── A06 ──────────────────────────────────────────────────────────────────────
const A06_INVENTORY_MONETIZATION: ActionTemplateV3 = {
  id: 'A06_INVENTORY_MONETIZATION',
  name: 'Stok Optimizasyonu ve Nakde Dönüşüm',
  family: 'WC_COMPOSITION',
  semanticType: 'INVENTORY_MONETIZATION',
  horizons: ['short', 'medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    // Ticaret sektöründe ticari mal (153), imalatta hammadde/mamul (150)
    const inventoryCode = isTradeLike(context.sector) ? '153' : '150'
    const inventoryName = isTradeLike(context.sector)
      ? 'Ticari Mallar'
      : 'İlk Madde ve Malzeme'
    // Not: Bu simplified monetization modelidir. Gerçek satışta 600 Satışlar ve
    // 620/621 Satış Maliyeti de etkilenir; V3 katalog aşamasında net stok→nakit
    // etkisi temsil edilmektedir.
    return [
      makeBalancedTransaction(
        'A06_MAIN',
        `Fazla stok nakde dönüşüyor — basitleştirilmiş nakde dönüşüm modeli (${inventoryCode} → 102)`,
        'INVENTORY_MONETIZATION',
        [
          { accountCode: '102',          accountName: 'Bankalar',     side: 'DEBIT',  amount, description: 'Stok satışından nakit girişi'        },
          { accountCode: inventoryCode,  accountName: inventoryName,  side: 'CREDIT', amount, description: 'Stok azalışı (simplified model)'     },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['150', '151', '152', '153'],
    minSourceAmountTRY: 2_000_000,
    sectorMustExclude: ['IT', 'SERVICES'],
  },

  qualityCoefficient: 0.85,
  sustainability: 'SEMI_RECURRING',

  repeatDecay: { first: 1.00, second: 0.70, third: 0.45, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.05,
    typicalPctOfBasis: 0.10,
    maxPctOfBasis: 0.20,
    absoluteMinTRY: 2_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'applicable',
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
}

// ── A08 ──────────────────────────────────────────────────────────────────────
const A08_FIXED_ASSET_DISPOSAL: ActionTemplateV3 = {
  id: 'A08_FIXED_ASSET_DISPOSAL',
  name: 'Atıl Duran Varlık Satışı',
  family: 'DEBT_STRUCTURE',
  semanticType: 'ASSET_DISPOSAL',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A08_MAIN',
        'Atıl maddi duran varlık satışı (253 → 102)',
        'ASSET_DISPOSAL',
        [
          { accountCode: '102', accountName: 'Bankalar',                      side: 'DEBIT',  amount, description: 'Varlık satış geliri'                     },
          { accountCode: '253', accountName: 'Tesis, Makine ve Cihazlar',     side: 'CREDIT', amount, description: 'Duran varlık çıkışı (net defter değeri)'  },
        ]
      ),
    ]
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
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'primary',
    TRADE:         'applicable',
    RETAIL:        'applicable',
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
}

// ── A09 ──────────────────────────────────────────────────────────────────────
const A09_SALE_LEASEBACK: ActionTemplateV3 = {
  id: 'A09_SALE_LEASEBACK',
  name: 'Sat-Geri Kirala (Sale & Leaseback)',
  family: 'DEBT_STRUCTURE',
  semanticType: 'SALE_LEASEBACK',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 5_000_000)
    if (amount <= 0) return []
    // Simplified model: Varlık satış etkisi. TFRS 16 kullanım hakkı varlığı
    // ve kira yükümlülüğü bu katalog aşamasında tam modellenmemiştir.
    return [
      makeBalancedTransaction(
        'A09_SALE',
        'Maddi duran varlık satışı — Simplified (TFRS 16 kira yükümlülüğü ayrıca izlenmeli)',
        'SALE_LEASEBACK',
        [
          { accountCode: '102', accountName: 'Bankalar',  side: 'DEBIT',  amount, description: 'Satış bedeli nakit girişi'                    },
          { accountCode: '252', accountName: 'Binalar',   side: 'CREDIT', amount, description: 'Duran varlık çıkışı (net defter değeri, simplified)' },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['252', '253', '254'],
    minSourceAmountTRY: 5_000_000,
    sectorMustExclude: ['IT', 'SERVICES', 'RETAIL'],
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

  qualityCoefficient: 1.00,
  sustainability: 'RECURRING',

  repeatDecay: { first: 1.00, second: 0.65, third: 0.35, maxRepeats: 3 },

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

  qualityCoefficient: 0.55,
  sustainability: 'SEMI_RECURRING',

  repeatDecay: { first: 1.00, second: 0.50, third: 0.25, maxRepeats: 2 },

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
}

// ── A11 ──────────────────────────────────────────────────────────────────────
const A11_RETAIN_EARNINGS: ActionTemplateV3 = {
  id: 'A11_RETAIN_EARNINGS',
  name: 'Dönem Kârını Dağıtmayıp Özkaynakta Tutma',
  family: 'EQUITY_PNL',
  semanticType: 'RETAINED_EARNINGS',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A11_MAIN',
        'Dönem net kârı dağıtılmayıp geçmiş yıllar kârına aktarılıyor (590 → 570)',
        'RETAINED_EARNINGS',
        [
          { accountCode: '590', accountName: 'Dönem Net Kârı',          side: 'DEBIT',  amount, description: 'Dönem kârı transferi'     },
          { accountCode: '570', accountName: 'Geçmiş Yıllar Kârları',   side: 'CREDIT', amount, description: 'Birikmiş kâr artışı'       },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['590'],
    minSourceAmountTRY: 1_000_000,
    customCheck: (analysis) => {
      const netProfit = sumAccountsByPrefix(analysis, ['590'])
      if (netProfit <= 0) return { pass: false, reason: 'Dönem net kârı pozitif değil — kâr tutma uygulanamaz' }
      return { pass: true }
    },
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

  computeAmount: (ctx) => {
    const netSales    = ctx.netSales    ?? 0
    const grossProfit = ctx.grossProfit ?? 0
    if (netSales <= 0 || grossProfit < 0) return null

    const currentMargin = grossProfit / netSales

    // TCMB sektör hedef brüt marjı
    const bm = getBenchmarkValue(ctx.sector, 'grossMargin')
    const targetMargin = bm?.value ?? 0.30

    // Mevcut marj zaten hedefte (5% tolerans) → aksiyon gereksiz
    if (currentMargin >= targetMargin * 1.05) return null

    // Hedef marjа ulaşmak için gereken maliyet azaltımı
    const requiredImprovement = (targetMargin - currentMargin) * netSales

    // Bilanço sınırları
    const balances        = ctx.accountBalances ?? {}
    const supplierBalance = balances['320'] ?? 0
    const cogsBalance     = balances['621'] ?? 0

    // 320 bakiyesinin %20'si (tedarikçi iskonto gerçekçi üst sınır)
    const maxFromSupplier = supplierBalance * 0.20
    // 621 bakiyesinin %20'si (maliyet azaltımı gerçekçi üst sınır)
    const maxFromCogs     = cogsBalance     * 0.20

    const result = Math.min(requiredImprovement, maxFromSupplier, maxFromCogs)
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
    customCheck: (analysis) => {
      const opex = sumAccountsByPrefix(analysis, ['630', '631', '632', '633', '660'])
      if (opex <= 0) return { pass: false, reason: 'Faaliyet gideri (630-633) bulunamadı' }
      return { pass: true }
    },
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
}

// ── A14 ──────────────────────────────────────────────────────────────────────
const A14_FINANCE_COST_REDUCTION: ActionTemplateV3 = {
  id: 'A14_FINANCE_COST_REDUCTION',
  name: 'Finansman Gideri Azaltma',
  family: 'EQUITY_PNL',
  semanticType: 'FINANCE_COST_REDUCTION',
  horizons: ['medium', 'long'],

  // Faz 7.3.6A1: Projeksiyon aksiyonu — buildTransactions boş array döner.
  buildTransactions: () => [],

  preconditions: {
    requiredAccountCodes: ['660', '661', '780'],
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
}

// ── A15 ──────────────────────────────────────────────────────────────────────
const A15_DEBT_TO_EQUITY_SWAP: ActionTemplateV3 = {
  id: 'A15_DEBT_TO_EQUITY_SWAP',
  name: 'Ortak Borcu Sermayeye Çevirme',
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
    minPctOfBasis: 0.20,
    typicalPctOfBasis: 0.50,
    maxPctOfBasis: 1.00,
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
}

// ── A15B ─────────────────────────────────────────────────────────────────────
const A15B_SHAREHOLDER_DEBT_TO_LT: ActionTemplateV3 = {
  id: 'A15B_SHAREHOLDER_DEBT_TO_LT',
  name: 'Ortak Borcunu Uzun Vadeye Aktarma',
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
}

// ── A18 ──────────────────────────────────────────────────────────────────────
const A18_NET_SALES_GROWTH: ActionTemplateV3 = {
  id: 'A18_NET_SALES_GROWTH',
  name: 'Net Satış Artışı',
  family: 'EQUITY_PNL',
  semanticType: 'OPERATIONAL_REVENUE',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    // Hizmet/bilişim: doğrudan nakit tahsilat (102)
    // İmalat/ticaret/inşaat: alacak üzerinden satış (120)
    const useCash = isServiceLike(context.sector)
    const debitCode = useCash ? '102' : '120'
    const debitName = useCash ? 'Bankalar' : 'Alıcılar'
    return [
      makeBalancedTransaction(
        'A18_MAIN',
        `Net satış artışı — ${useCash ? 'nakit' : 'alacak'} bazlı model (${debitCode} + 600)`,
        'OPERATIONAL_REVENUE',
        [
          { accountCode: debitCode, accountName: debitName,          side: 'DEBIT',  amount, description: `Satıştan ${useCash ? 'nakit girişi' : 'alacak artışı'}` },
          { accountCode: '600',     accountName: 'Yurtiçi Satışlar', side: 'CREDIT', amount, description: 'Net satış artışı'                                       },
        ]
      ),
    ]
  },

  preconditions: {
    minSourceAmountTRY: 1_000_000,
    customCheck: (analysis) => {
      const revenue = sumAccountsByPrefix(analysis, ['600', '601'])
      if (revenue <= 0) return { pass: false, reason: 'Mevcut satış geliri yok — büyüme modeli uygulanamaz' }
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
}

// ── A19 ──────────────────────────────────────────────────────────────────────
const A19_ADVANCE_TO_REVENUE: ActionTemplateV3 = {
  id: 'A19_ADVANCE_TO_REVENUE',
  name: 'Alınan Avansın Hasılata Tanınması (Proje Teslimi)',
  family: 'EQUITY_PNL',
  semanticType: 'ADVANCE_TO_REVENUE',
  horizons: ['short', 'medium', 'long'],

  buildTransactions: (context) => {
    const netSales    = context.netSales    ?? 0
    const grossProfit = context.grossProfit ?? 0
    if (netSales <= 0 || grossProfit <= 0) return []

    const grossMargin = grossProfit / netSales
    if (grossMargin <= 0 || grossMargin >= 1) return []

    const balances       = context.accountBalances ?? {}
    const advanceBalance = balances['340'] ?? 0
    if (advanceBalance <= 0) return []

    // Stok hesap havuzu (150-153, 159)
    const stockAccounts = [
      { code: '150', name: 'İlk Madde ve Malzeme'        },
      { code: '151', name: 'Yarı Mamuller'               },
      { code: '152', name: 'Mamuller'                    },
      { code: '153', name: 'Ticari Mallar'               },
      { code: '159', name: 'Verilen Sipariş Avansları'   },
    ]

    // Toplam stok — "stok var mı?" kontrolü
    const totalStock = stockAccounts.reduce(
      (sum, acc) => sum + (balances[acc.code] ?? 0),
      0
    )

    // Stok yoksa: yalnızca 2 leg (340 / 600)
    if (totalStock <= 0) {
      const amount = clampAmount(
        Math.min(context.amount, advanceBalance),
        1_000_000
      )
      if (amount <= 0) return []
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

    const costAmount = amount * (1 - grossMargin)

    return [
      makeBalancedTransaction(
        'A19_DELIVERY_REVENUE_AND_COST',
        'Alınan avans teslimatla satışa dönüşür, ilgili stok maliyeti gelir tablosuna alınır',
        'ADVANCE_TO_REVENUE',
        [
          { accountCode: '340',              accountName: 'Alınan Sipariş Avansları', side: 'DEBIT',  amount,      description: 'Avans çözülmesi' },
          { accountCode: '600',              accountName: 'Yurtiçi Satışlar',         side: 'CREDIT', amount,      description: 'Hasılat artışı'  },
          { accountCode: '621',              accountName: 'Satılan Mal Maliyeti',     side: 'DEBIT',  amount: costAmount, description: 'Maliyet artışı' },
          { accountCode: dominantStock.code, accountName: dominantStock.name,         side: 'CREDIT', amount: costAmount, description: 'Stok azalışı'  },
        ]
      ),
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
    'Avans → hasılat dönüşümü üretim/teslimat hızlanmasıyla sağlanır. Proje portföyünü aktifleştirir ve gelir tablosunu güçlendirir.',
  bankerPerspective:
    'Avansın hasılata dönüşmesi iş hacminin fiilen gerçekleştiğini belgeler ve gelir tablosunu güçlendirir. Teslim belgesi ve müşteri kabulü olmadan yapılan erken hasılat tanıma ilerleyen dönemlerde düzeltme riski yaratabilir; gerçek teslim takvimine uyum muhasebe güvenilirliğini korur.',
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
}

export const ACTION_IDS_V3 = Object.keys(ACTION_CATALOG_V3)

export function getActionTemplateV3(actionId: string): ActionTemplateV3 | undefined {
  return ACTION_CATALOG_V3[actionId]
}
