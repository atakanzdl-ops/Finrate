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
    'Acil likidite baskısını azaltmak için banka ile refinansman anlaşması yapılır. KV faiz yükü kısmen azalabilir, vade profilini dengeler.',
  bankerPerspective:
    'Bankacı açısından sınırlı değer: gerçek bir ekonomik iyileşme değil, yalnızca vade uzatma. Asıl sorunun (operasyonel nakit üretimi) çözümü değildir. Kreditörlerin mutabakatı zorunludur.',
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
    'Geçici önlem olarak değerlendirilir. Tedarikçi ilişkilerinde bozulma riski ve tedarik sürekliliği sorgulanır. KV/UV dönüşüm oranı izlenir.',
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
    'En zayıf ekonomik içerikli aksiyon. Gerçek bir güçlenme yoktur; sadece sınıf değişikliği yapılmıştır. Müşteri teslim beklentisi karşılanmazsa otomatik olarak tersine döner.',
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
      if (!hasAnyAccount(analysis, ['102', '103'])) {
        return { pass: false, reason: 'Nakit hesabı (102/103) bulunamadı' }
      }
      const cash = sumAccountsByPrefix(analysis, ['102', '103'])
      if (cash < 500_000) {
        return { pass: false, reason: `Yetersiz nakit: ${cash.toLocaleString('tr-TR')} TL < min 500K TL` }
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
    'Nakit karşılığı borç kapatmayı bankacılar olumlu değerlendirir. Aktif–pasif her ikisi birlikte azalır; yeni bir finansman değil, disiplinli bilanço yönetimi sinyali.',
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
    'Gerçek nakit yaratır. DSO iyileşmesi operasyonel disiplinin göstergesidir. Rating analizinde alacak kalitesi (gecikme profili) de incelenir.',
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
        `Fazla stok nakde dönüşüyor — Simplified Monetization Model (${inventoryCode} → 102)`,
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
    'Fazla veya yavaş dönen stokların (150-153) satışı yoluyla nakde dönüştürülmesi. Not: Simplified monetization model — gerçek satışta gelir tablosu da etkilenir; V3 katalog aşamasında net stok→nakit etkisi modellenmektedir.',
  cfoRationale:
    'Şişkin stok pozisyonu (özellikle imalat/ticaret) hem dönen varlık kalitesini hem nakit akışını bozar. Stok devir hızı aktif verimliliğinin temel göstergesidir.',
  bankerPerspective:
    'Gerçek nakit yaratır ve işletme sermayesi yönetiminin iyileştiğini gösterir. Stok değerleme yöntemi (FIFO/WAC) ve stok kalitesi (fire/eskime riski) incelenir.',
}

// ── A07 ──────────────────────────────────────────────────────────────────────
const A07_PREPAID_RELEASE: ActionTemplateV3 = {
  id: 'A07_PREPAID_RELEASE',
  name: 'Peşin Ödenmiş Gider Çözülmesi',
  family: 'WC_COMPOSITION',
  semanticType: 'PREPAID_RELEASE',
  horizons: ['short', 'medium'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 500_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A07_MAIN',
        'Peşin ödenmiş giderlerin dönem içinde gider tanınmasıyla çözülmesi (180 → 102)',
        'PREPAID_RELEASE',
        [
          { accountCode: '102', accountName: 'Bankalar',                          side: 'DEBIT',  amount, description: 'Peşin gider çözülme nakit etkisi' },
          { accountCode: '180', accountName: 'Gelecek Aylara Ait Giderler (KV)', side: 'CREDIT', amount, description: 'Peşin gider azalışı'              },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['180', '280'],
    minSourceAmountTRY: 1_000_000,
  },

  qualityCoefficient: 0.70,
  sustainability: 'ONE_OFF',

  repeatDecay: { first: 1.00, second: 0.50, third: 0.25, maxRepeats: 2 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.20,
    typicalPctOfBasis: 0.40,
    maxPctOfBasis: 0.70,
    absoluteMinTRY: 1_000_000,
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
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            false,
  },

  description:
    'Gelecek dönemlere ait peşin ödenmiş giderlerin (180/280) hizmet alındıkça gider olarak tanınması ve dönen varlık kalitesinin artırılması.',
  cfoRationale:
    'Aşırı peşin ödenmiş giderler çalışma sermayesini bağlar. Optimize edilmiş gider yönetimi nakit akışını iyileştirir.',
  bankerPerspective:
    'Sınırlı etki; tutarlar genellikle küçüktür. Operasyonel disiplinin göstergesi olarak olumlu, ancak rating üzerinde düşük marjinal etki.',
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
    'Tek seferlik nakit giriş; tekrar edemez. Satış fiyatı net defter değerinin altındaysa zarar oluşur. Bilanço temizliği açısından olumlu sinyal.',
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
    'Sat-geri kiralama bankacılar tarafından şüpheyle değerlendirilir: gerçek güçlenme değil, gelecek nakit akışlarını peşin alma. Kira yükümlülüğü yeni bir leverage kaynağıdır.',
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
    'Nakit sermaye artırımı likidite, özkaynak oranı ve borçluluk rasyolarını eş zamanlı iyileştiren tek aksiyondur. Kalite katsayısı 1.00 ancak tutar anlamlı düzeyde olmalı.',
  bankerPerspective:
    'Kredi komitesi en güçlü sinyal olarak değerlendirir. Ortakların şirkete inanması ve nakit koymaya istekli olması güven göstergesidir. Ancak küçük tutarlı sermaye artışı (örn. 24M TL / 407M aktif) tek başına CCC→BB sıçramasını haklı kılmaz; diğer aksiyonlarla desteklenmeli.',
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
    'Kâr tutma disiplinini bankacılar olumlu değerlendirir. Kâr kalitesi (recurring vs olağandışı) kritik: 69M TL olağandışı gelirden gelen kâr tutmak zayıf sinyal.',
}

// ── A12 ──────────────────────────────────────────────────────────────────────
const A12_GROSS_MARGIN_IMPROVEMENT: ActionTemplateV3 = {
  id: 'A12_GROSS_MARGIN_IMPROVEMENT',
  name: 'Brüt Kâr Marjı İyileştirme',
  family: 'EQUITY_PNL',
  semanticType: 'OPERATIONAL_MARGIN',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 500_000)
    if (amount <= 0) return []
    // Modeled Margin Improvement Entry.
    // Gerçekte: satış fiyatı artışı veya hammadde maliyeti düşüşü → 621↓ / 590↑
    // Bu simplified entry marj iyileşmesinin net dönem kârına etkisini temsil eder.
    return [
      makeBalancedTransaction(
        'A12_MAIN',
        'Brüt marj iyileşmesi net kâra yansıması — Modeled Margin Improvement Entry (621 / 590)',
        'OPERATIONAL_MARGIN',
        [
          { accountCode: '621', accountName: 'Satılan Ticari Mallar Maliyeti', side: 'DEBIT',  amount, description: 'Maliyet azalışı / marj iyileşmesi (simplified model)' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',                side: 'CREDIT', amount, description: 'Net kâr artışı'                                       },
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
    'Satış fiyatı optimizasyonu veya üretim/hammadde maliyeti düşüşünden kaynaklanan brüt kâr marjı iyileştirmesi. Not: Modeled entry — marj iyileşmesinin net dönem kârına etkisi temsil edilir.',
  cfoRationale:
    'Fiyatlandırma gücü artırılır veya tedarik maliyetleri düşürülür. Her 1 puan marj artışı doğrudan net kâra yansır ve kaliteli (recurring) kâr yaratır.',
  bankerPerspective:
    'En güçlü operasyonel sinyal. Bankacı sürdürülebilir marj artışını EBITDA büyümesi olarak okur. Geçici spot maliyet düşüşü değil, yapısal iyileşme görmek ister.',
}

// ── A13 ──────────────────────────────────────────────────────────────────────
const A13_OPEX_OPTIMIZATION: ActionTemplateV3 = {
  id: 'A13_OPEX_OPTIMIZATION',
  name: 'Faaliyet Giderleri Optimizasyonu',
  family: 'EQUITY_PNL',
  semanticType: 'OPEX_REDUCTION',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 300_000)
    if (amount <= 0) return []
    // Modeled OPEX Reduction Entry: gider azalışının net kâra etkisi
    return [
      makeBalancedTransaction(
        'A13_MAIN',
        'Faaliyet gideri optimizasyonu — Modeled OPEX Reduction Entry (632 / 590)',
        'OPEX_REDUCTION',
        [
          { accountCode: '632', accountName: 'Genel Yönetim Giderleri', side: 'DEBIT',  amount, description: 'Gider azalışı (simplified model)' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',          side: 'CREDIT', amount, description: 'Net kâr artışı'                   },
        ]
      ),
    ]
  },

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
    'İşletme giderlerinde verimlilik artırımı (personel, kira, idari giderler). Yapısal tasarruf programları EBITDA marjını kalıcı olarak iyileştirir.',
  bankerPerspective:
    'Kalıcı yapısal tasarruf olumlu değerlendirilir. Geçici kısıntı veya yatırım ertelemesinden kaynaklanan tasarruf düşük kaliteli sinyal. EBITDA büyümesi mi, yoksa yatırım dondurma mı? Sorusu sorulur.',
}

// ── A14 ──────────────────────────────────────────────────────────────────────
const A14_FINANCE_COST_REDUCTION: ActionTemplateV3 = {
  id: 'A14_FINANCE_COST_REDUCTION',
  name: 'Finansman Gideri Azaltma',
  family: 'EQUITY_PNL',
  semanticType: 'FINANCE_COST_REDUCTION',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 200_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A14_MAIN',
        'Finansman gideri azaltma — net dönem etkisi (660 / 590)',
        'FINANCE_COST_REDUCTION',
        [
          { accountCode: '660', accountName: 'KV Borçlanma Giderleri', side: 'DEBIT',  amount, description: 'Faiz gideri azalışı (simplified model)' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',         side: 'CREDIT', amount, description: 'Net kâr artışı'                         },
        ]
      ),
    ]
  },

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
    'Faiz maliyetini azaltmak doğrudan net kârı artırır. Refinansman veya borç azaltma yoluyla sağlanabilir.',
  bankerPerspective:
    'Faiz karşılama oranı bankacı için kritik. Finansman gideri düşerse hem kârlılık hem kaldıraç rasyoları iyileşir. Refinansman olanakları ve piyasa faiz ortamı değerlendirilir.',
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
    'Nakit gelmez, pasif içi sınıf değişimi. Bankacı "para dışarı çıkmışken içeri mi gelmiş gibi gösteriliyor?" sorusunu sorar. Yine de borç/özkaynak oranını iyileştirir. Yüksek kaliteli nakit sermaye artışından sonra değerlendirilmeli.',
}

// ── A16 ──────────────────────────────────────────────────────────────────────
const A16_CASH_BUFFER_BUILD: ActionTemplateV3 = {
  id: 'A16_CASH_BUFFER_BUILD',
  name: 'Nakit Tamponu Oluşturma (Türetilmiş Aksiyon)',
  family: 'WC_COMPOSITION',
  semanticType: 'CASH_INFLOW',
  horizons: ['short', 'medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 500_000)
    if (amount <= 0) return []
    // TÜRETİLMİŞ AKSİYON: A05 + A06 + A08 + A10 birikimli nakit etkisini temsil eder.
    // Bu bağımsız bir muhasebe fişi değildir; diğer aksiyonların sonucudur.
    return [
      makeBalancedTransaction(
        'A16_MAIN',
        'Nakit tamponu birikiyor — Türetilmiş Aksiyon (A05+A06+A08+A10 birikimli nakit etkisi)',
        'CASH_INFLOW',
        [
          { accountCode: '102', accountName: 'Bankalar',                 side: 'DEBIT',  amount, description: 'Birikimli nakit girişi (diğer aksiyonların sonucu)' },
          { accountCode: '570', accountName: 'Geçmiş Yıllar Kârları',   side: 'CREDIT', amount, description: 'Nakit tamponu kaydı (simplified)'                   },
        ]
      ),
    ]
  },

  preconditions: {
    minSourceAmountTRY: 500_000,
    customCheck: (analysis) => {
      const cash = sumAccountsByPrefix(analysis, ['102', '103'])
      if (cash <= 0) {
        return {
          pass: false,
          reason: 'Nakit tamponu aksiyonu için önce nakit yaratan aksiyonlar (A05/A06/A08/A10) uygulanmalı',
        }
      }
      return { pass: true }
    },
  },

  qualityCoefficient: 0.50,
  sustainability: 'SEMI_RECURRING',

  repeatDecay: { first: 1.00, second: 0.60, third: 0.30, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'assets',
    minPctOfBasis: 0.01,
    typicalPctOfBasis: 0.02,
    maxPctOfBasis: 0.05,
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
    createsRealCash:        true,
    strengthensOperations:  false,
    realBalanceSheetGrowth: false,
    reducesRisk:            true,
  },

  description:
    'TÜRETİLMİŞ AKSİYON: Bu aksiyon bağımsız olarak uygulanamaz. A05 (alacak tahsili), A06 (stok monetizasyon), A08 (varlık satışı) veya A10 (sermaye artırımı) gibi gerçek nakit yaratan aksiyonların birikimli etkisini temsil eder.',
  cfoRationale:
    'Tek başına rating driver değildir. Likidite tamponunun yeterliliğini sinyal eder. Diğer aksiyonlar yeterli nakit yarattığında nakit oranı iyileşir.',
  bankerPerspective:
    'Bu aksiyon bağımsız değil, diğer gerçek nakit üreten aksiyonların doğal çıktısıdır. Bankacı nakit tamponunu ayrı bir aksiyon olarak değil, portföyün sonucu olarak değerlendirir.',
}

// ── A17 ──────────────────────────────────────────────────────────────────────
const A17_KKEG_CLEANUP: ActionTemplateV3 = {
  id: 'A17_KKEG_CLEANUP',
  name: 'KKEG Temizliği (Kanunen Kabul Edilmeyen Gider)',
  family: 'TAX_QUALITY',
  semanticType: 'KKEG_CLEANUP',
  horizons: ['medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 500_000)
    if (amount <= 0) return []
    // Modeled Tax-Quality Normalization Entry.
    // KKEG'nin azalması efektif vergi yükünü düşürür ve kâr kalitesini artırır.
    return [
      makeBalancedTransaction(
        'A17_MAIN',
        'KKEG normalizasyonu — Modeled Tax-Quality Normalization Entry (689 / 590)',
        'KKEG_CLEANUP',
        [
          { accountCode: '689', accountName: 'Diğer Olağandışı Gider (KKEG)', side: 'DEBIT',  amount, description: 'KKEG azalışı — vergi kalitesi iyileşmesi (simplified)' },
          { accountCode: '590', accountName: 'Dönem Net Kârı',                side: 'CREDIT', amount, description: 'Vergi kalitesi düzeltme etkisi'                        },
        ]
      ),
    ]
  },

  preconditions: {
    minSourceAmountTRY: 500_000,
    customCheck: (analysis) => {
      const kkeg = sumAccountsByPrefix(analysis, ['689', '688'])
      if (kkeg <= 0) return { pass: false, reason: 'KKEG kalemi (688-689) bulunamadı veya sıfır' }
      return { pass: true }
    },
  },

  qualityCoefficient: 0.50,
  sustainability: 'RECURRING',

  repeatDecay: { first: 1.00, second: 0.65, third: 0.40, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'revenue',
    minPctOfBasis: 0.01,
    typicalPctOfBasis: 0.03,
    maxPctOfBasis: 0.10,
    absoluteMinTRY: 500_000,
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
    'Kanunen kabul edilmeyen giderlerin (KKEG) azaltılmasıyla vergi kalitesinin iyileştirilmesi. Not: Modeled tax-quality normalization entry — gerçek muhasebe kaydının sadeliştirilmiş temsilidir.',
  cfoRationale:
    'Yüksek KKEG oranı vergi planlamasının zayıflığını gösterir. KKEG temizliği efektif vergi yükünü azaltır ve gerçek kâr kalitesini artırır.',
  bankerPerspective:
    'KKEG/gelir oranı incelenir. Yüksek KKEG, gerçek kârı olduğundan düşük göstermenin ve vergi kalitesizliğinin sinyali. Temizlik vergi kalitesini artırır ancak anlık nakit etkisi yoktur.',
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
    'En kaliteli büyüme kaynağı. Hacim artışı + fiyat gücü kombinasyonuyla tüm rasyolar organik olarak iyileşir. DEKAM gibi düşük satışlı firmalarda (16.8M satış / 407M aktif → aktif devir hızı 0.04) öncelikli hedef.',
  bankerPerspective:
    'Bankacı satış büyümesini en çok sever: recurring gelir, aktif verimliliği (aktif devir hızı) ve kaldıraç rasyoları organik iyileşir. "Bu büyüme sürdürülebilir mi, nasıl finanse ediliyor?" sorusu sorulur.',
}

// ── A19 ──────────────────────────────────────────────────────────────────────
const A19_ADVANCE_TO_REVENUE: ActionTemplateV3 = {
  id: 'A19_ADVANCE_TO_REVENUE',
  name: 'Alınan Avansın Hasılata Tanınması (Proje Teslimi)',
  family: 'EQUITY_PNL',
  semanticType: 'ADVANCE_TO_REVENUE',
  horizons: ['short', 'medium', 'long'],

  buildTransactions: (context) => {
    const amount = clampAmount(context.amount, 1_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A19_MAIN',
        'Alınan avans proje/mal teslimi ile hasılata dönüşüyor (340 → 600)',
        'ADVANCE_TO_REVENUE',
        [
          { accountCode: '340', accountName: 'Alınan Sipariş Avansları', side: 'DEBIT',  amount, description: 'Avans kapatma — teslim gerçekleşti'  },
          { accountCode: '600', accountName: 'Yurtiçi Satışlar',         side: 'CREDIT', amount, description: 'Hasılat tanıma'                      },
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
    'Avans dönüşümü iş hacminin gerçekleştiğinin kanıtı. Ancak çok hızlı hasılat tanıma (teslim olmadan) ihtiyatlı karşılanır. Teslim belgesi ve müşteri kabulü kritik.',
}

// ── A20 ──────────────────────────────────────────────────────────────────────
const A20_YYI_MONETIZATION: ActionTemplateV3 = {
  id: 'A20_YYI_MONETIZATION',
  name: 'Yıllara Yaygın İnşaat Hakediş Tahsilatı (YYİ Monetizasyon)',
  family: 'INDUSTRY_SPECIFIC',
  semanticType: 'YYI_MONETIZATION',
  horizons: ['short', 'medium', 'long'],

  buildTransactions: (context) => {
    // Savunma katmanı: inşaat dışı sektörde çağrılırsa boş döner
    if (!isConstructionLike(context.sector)) return []
    const amount = clampAmount(context.amount, 2_000_000)
    if (amount <= 0) return []
    return [
      makeBalancedTransaction(
        'A20_MAIN',
        'YYİ hakediş tahsilatı — inşaat proje nakit akışı (350 → 102)',
        'YYI_MONETIZATION',
        [
          { accountCode: '102', accountName: 'Bankalar',                                   side: 'DEBIT',  amount, description: 'Hakediş tahsilatı nakit girişi' },
          { accountCode: '350', accountName: 'Yıllara Yaygın İnşaat ve Onarım Maliyeti',  side: 'CREDIT', amount, description: 'YYİ hesabı çözülmesi'           },
        ]
      ),
    ]
  },

  preconditions: {
    requiredAccountCodes: ['350', '358'],
    minSourceAmountTRY: 2_000_000,
    sectorMustInclude: ['CONSTRUCTION'],
  },

  qualityCoefficient: 0.80,
  sustainability: 'SEMI_RECURRING',

  repeatDecay: { first: 1.00, second: 0.75, third: 0.55, maxRepeats: 3 },

  suggestedAmount: {
    basis: 'source_account',
    minPctOfBasis: 0.10,
    typicalPctOfBasis: 0.25,
    maxPctOfBasis: 0.50,
    absoluteMinTRY: 2_000_000,
  },

  sectorCompatibility: {
    CONSTRUCTION:  'primary',
    MANUFACTURING: 'not_applicable',
    TRADE:         'not_applicable',
    RETAIL:        'not_applicable',
    SERVICES:      'not_applicable',
    IT:            'not_applicable',
  },

  expectedEconomicImpact: {
    createsRealCash:        true,
    strengthensOperations:  true,
    realBalanceSheetGrowth: true,
    reducesRisk:            true,
  },

  description:
    'İNŞAAT SEKTÖRÜNE ÖZGÜ: Yıllara yaygın inşaat maliyetleri (350-358) kapsamındaki projelerin hakediş kesilip tahsil edilmesiyle nakde dönüştürülmesi. İmalat/ticaret sektörü için uygun değildir.',
  cfoRationale:
    'İnşaat şirketlerinde YYİ hesabı birikmiş inşaat maliyetlerini temsil eder. Proje tamamlanma oranına göre hakediş kesilip tahsil edilmesi nakit akışını ve aktif kalitesini ciddi ölçüde iyileştirir.',
  bankerPerspective:
    'Bankacı YYİ hakediş tahsilatını güçlü nakit sinyali olarak okur. İnşaat sektöründe "muhasebe gerçeği" ile "nakit gerçeği" arasındaki fark burada kapanır. Proje riski ve işveren kreditörlüğü incelenir.',
}

// ─── Katalog Derleme & Exports ────────────────────────────────────────────────

export const ACTION_CATALOG_V3: Record<string, ActionTemplateV3> = {
  A01_ST_FIN_DEBT_TO_LT,
  A02_TRADE_PAYABLE_TO_LT,
  A03_ADVANCE_TO_LT,
  A04_CASH_PAYDOWN_ST,
  A05_RECEIVABLE_COLLECTION,
  A06_INVENTORY_MONETIZATION,
  A07_PREPAID_RELEASE,
  A08_FIXED_ASSET_DISPOSAL,
  A09_SALE_LEASEBACK,
  A10_CASH_EQUITY_INJECTION,
  A11_RETAIN_EARNINGS,
  A12_GROSS_MARGIN_IMPROVEMENT,
  A13_OPEX_OPTIMIZATION,
  A14_FINANCE_COST_REDUCTION,
  A15_DEBT_TO_EQUITY_SWAP,
  A16_CASH_BUFFER_BUILD,
  A17_KKEG_CLEANUP,
  A18_NET_SALES_GROWTH,
  A19_ADVANCE_TO_REVENUE,
  A20_YYI_MONETIZATION,
}

export const ACTION_IDS_V3 = Object.keys(ACTION_CATALOG_V3)

export function getActionTemplateV3(actionId: string): ActionTemplateV3 | undefined {
  return ACTION_CATALOG_V3[actionId]
}
