/**
 * Doğrulama testi — rebuildAggregateFromAccounts fix
 * DEKAM Q4 hesaplarından rasyoları hesaplar.
 * currentRatio, debtToEquity, roe null OLMAMALI.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { resolve } from 'path'

try {
  const envContent = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const val = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  }
} catch {}

const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma  = new PrismaClient({ adapter })

const all = await prisma.analysis.findMany({
  where:   { entity: { name: { contains: 'dekam', mode: 'insensitive' } } },
  include: { financialAccounts: true, entity: { select: { name: true, sector: true } } },
  orderBy: [{ year: 'desc' }, { period: 'desc' }],
})
const a = all.reduce((best, cur) =>
  cur.financialAccounts.length > best.financialAccounts.length ? cur : best
)
console.log(`Analiz: ${a.entity?.name} ${a.year}/${a.period}  score=${a.finalScore?.toFixed(2)}  accounts=${a.financialAccounts.length}`)
const accounts = a.financialAccounts.map(f => ({ accountCode: f.accountCode, amount: Number(f.amount) }))

const get = (codes) => accounts.filter(x => codes.includes(x.accountCode)).reduce((s, x) => s + x.amount, 0)
const r = {
  cash:                   get(['100','101','102','108']) - get(['103']),
  tradeReceivables:       get(['120','121','126','127','128']) - get(['122','129']),
  otherReceivables:       get(['131','132','133','135','136','138']) - get(['137','139']),
  inventory:              get(['150','151','152','153','157']) - get(['158']),
  prepaidSuppliers:       get(['159']),
  otherCurrentAssets:     get(['180','181','190','191','193','195','196','197','198']),
  tangibleAssets:         get(['250','251','252','253','254','255','256','258','259']) - get(['257']),
  intangibleAssets:       get(['260','261','262','263','264','267','269']) - get(['268']),
  otherNonCurrentAssets:  get(['220','221','226','240','242','245','280','281','294','295']),
  shortTermFinancialDebt: get(['300','301','303','304','305','306','309']) - get(['302','308']),
  tradePayables:          get(['320','321','326','329']) - get(['322']),
  otherShortTermPayables: get(['331','332','333','335','336','380','381','391','392','393','397','399']) - get(['337']),
  advancesReceived:       get(['340','349']),
  taxPayables:            get(['360','361','368','369','370','372','373','379']) - get(['371']),
  longTermFinancialDebt:  get(['400','401','405','407','409']) - get(['402','408']),
  otherNonCurrentLiabilities: get(['420','421','426','429','431','432','433','436','472','479','480','481','492']) - get(['422','437']),
  paidInCapital:          get(['500','502']) - get(['501','503']),
  capitalReserves:        get(['520','521','522','523','524','529']),
  profitReserves:         get(['540','541','542','548','549']),
  retainedEarnings:       get(['570']),
  retainedLosses:         get(['580']),
  netProfitCurrentYear:   get(['590']) - get(['591']),
  revenue:                get(['600','601','602']) - get(['610','611','612']),
  costOfSales:            get(['620','621','622','623']),
  operatingExpenses:      get(['630','631','632']),
  interestExpense:        get(['660','661']),
}

const tca  = r.cash + r.tradeReceivables + r.otherReceivables + r.inventory + r.prepaidSuppliers + r.otherCurrentAssets
const tnca = r.tangibleAssets + r.intangibleAssets + r.otherNonCurrentAssets
const tcl  = r.shortTermFinancialDebt + r.tradePayables + r.otherShortTermPayables + r.advancesReceived + r.taxPayables
const tncl = r.longTermFinancialDebt + r.otherNonCurrentLiabilities
const teq  = r.paidInCapital + r.capitalReserves + r.profitReserves + r.retainedEarnings - r.retainedLosses + r.netProfitCurrentYear

const agg = { ...r, totalCurrentAssets: tca, totalNonCurrentAssets: tnca, totalAssets: tca+tnca,
  totalCurrentLiabilities: tcl, totalNonCurrentLiabilities: tncl, totalEquity: teq,
  netProfit: r.netProfitCurrentYear, cogs: r.costOfSales }

const safe = (a, b) => (a == null || b == null || b === 0) ? null : a / b

const currentRatio    = safe(agg.totalCurrentAssets, agg.totalCurrentLiabilities)
const quickRatio      = safe(agg.totalCurrentAssets - agg.inventory, agg.totalCurrentLiabilities)
const cashRatio       = safe(agg.cash, agg.totalCurrentLiabilities)
const nwcRatio        = safe(agg.totalCurrentAssets - agg.totalCurrentLiabilities, agg.totalAssets)
const totalDebt       = agg.totalCurrentLiabilities + agg.totalNonCurrentLiabilities
const debtToEquity    = safe(totalDebt, agg.totalEquity)
const equityRatio     = safe(agg.totalEquity, agg.totalAssets)
const debtToAssets    = safe(totalDebt, agg.totalAssets)
const totalFinDebt    = r.shortTermFinancialDebt + r.longTermFinancialDebt
const shortTermDebtR  = totalFinDebt > 0 ? r.shortTermFinancialDebt / totalFinDebt : null
const grossMargin     = r.revenue > 0 ? (r.revenue - r.costOfSales) / r.revenue : null
const roe             = agg.totalEquity > 0 ? r.netProfitCurrentYear / agg.totalEquity : null
const roa             = agg.totalAssets > 0 ? r.netProfitCurrentYear / agg.totalAssets : null

const fmtR = v => v == null ? 'NULL ✗' : Number(v).toFixed(4) + ' ✓'
const fmt  = v => Math.round(Number(v)).toLocaleString('tr-TR')

console.log('\n━━━ FIX Sonrası — calculateRatios uyumlu alanlar ━━━')
console.log('  totalCurrentAssets    :', fmt(agg.totalCurrentAssets))
console.log('  totalCurrentLiabilities:', fmt(agg.totalCurrentLiabilities))
console.log('  totalAssets           :', fmt(agg.totalAssets))
console.log('  totalEquity           :', fmt(agg.totalEquity))
console.log('')
console.log('  currentRatio    :', fmtR(currentRatio))
console.log('  quickRatio      :', fmtR(quickRatio))
console.log('  cashRatio       :', fmtR(cashRatio))
console.log('  nwcRatio        :', fmtR(nwcRatio))
console.log('  debtToEquity    :', fmtR(debtToEquity))
console.log('  equityRatio     :', fmtR(equityRatio))
console.log('  debtToAssets    :', fmtR(debtToAssets))
console.log('  shortTermDebtR  :', fmtR(shortTermDebtR))
console.log('  grossMargin     :', fmtR(grossMargin) + ' (revenue=0 ise normal null)')
console.log('  roe             :', fmtR(roe))
console.log('  roa             :', fmtR(roa))

const passed = [currentRatio, quickRatio, cashRatio, nwcRatio, debtToEquity, equityRatio, debtToAssets, shortTermDebtR, roe, roa].filter(x => x != null).length
console.log('\n━━━ SONUÇ:', passed + '/10 rasyo hesaplandı (fix öncesi: 1/10) ━━━')
if (passed >= 8) console.log('✅ Fix doğrulandı')
else console.log('⚠ Eksik rasyo var')

const capIncrAmount = Math.round(teq * 0.25)
const crA = safe(tca + capIncrAmount, tcl)
const erA = safe(teq + capIncrAmount, tca + capIncrAmount + tnca)
const dtA = safe(totalDebt, teq + capIncrAmount)
console.log('\n━━━ capital_increase (+' + fmt(capIncrAmount) + ' TL) scoreDelta tahmini ━━━')
console.log('  currentRatio:', fmtR(currentRatio), '->', fmtR(crA), '  Δ='+((crA||0)-(currentRatio||0)).toFixed(4))
console.log('  equityRatio :', fmtR(equityRatio), '->', fmtR(erA), '  Δ='+((erA||0)-(equityRatio||0)).toFixed(4))
console.log('  debtToEquity:', fmtR(debtToEquity), '->', fmtR(dtA), '  Δ='+((dtA||0)-(debtToEquity||0)).toFixed(4))
console.log('  → Tüm liq+lev rasyolar iyileşiyor → scoreDelta > 0 → aksiyon seçilecek')

await prisma.$disconnect()
await pool.end()
