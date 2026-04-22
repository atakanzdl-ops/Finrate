/**
 * Faz A3 Test — Hesap kodu bazlı rasyolar vs. aggregate rasyolar karşılaştırması
 *
 * DEKAM ve DEKA analizleri için eski motor (calculateRatios) ile
 * yeni motor (calculateRatiosFromAccounts) sonuçlarını karşılaştırır.
 *
 * Çalıştırma:
 *   node --experimental-vm-modules scripts/test_accounts_ratios.mjs
 */

import { PrismaPg }    from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { Pool }        from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

// .env yükle
try {
  const envPath = resolve(process.cwd(), '.env')
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const val = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  }
} catch { /* ortam değişkenlerini kullan */ }

const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma  = new PrismaClient({ adapter })

// ─── Mapper (accountMapper inline — ESM import sınırlaması) ──────────────────

function rebuildAggregateFromAccounts(accounts) {
  const get = (codes) =>
    accounts.filter(a => codes.includes(a.accountCode))
            .reduce((s, a) => s + Number(a.amount), 0)

  return {
    cash:                  get(['100','101','102','108']) - get(['103']),
    tradeReceivables:      get(['120','121','126','127','128']) - get(['122','129']),
    otherReceivables:      get(['131','132','133','135','136','138']) - get(['137','139']),
    inventory:             get(['150','151','152','153','157']) - get(['158']),
    prepaidSuppliers:      get(['159']),
    otherCurrentAssets:    get(['180','181','190','191','193','195','196','197','198']),
    tangibleAssets:        get(['250','251','252','253','254','255','256','258','259']) - get(['257']),
    intangibleAssets:      get(['260','261','262','263','264','267','269']) - get(['268']),
    otherNonCurrentAssets: get(['220','221','226','240','242','245','280','281','294','295']),
    shortTermFinancialDebt: get(['300','301','303','304','305','306','309']) - get(['302','308']),
    tradePayables:         get(['320','321','326','329']) - get(['322']),
    otherShortTermPayables: get(['331','332','333','335','336','380','381','391','392','393','397','399']) - get(['337']),
    advancesReceived:      get(['340','349']),
    taxPayables:           get(['360','361','368','369','370','372','373','379']) - get(['371']),
    longTermFinancialDebt: get(['400','401','405','407','409']) - get(['402','408']),
    otherNonCurrentLiabilities: get(['420','421','426','429','431','432','433','436','472','479','480','481','492']) - get(['422','437']),
    paidInCapital:         get(['500','502']) - get(['501','503']),
    retainedEarnings:      get(['570']),
    retainedLosses:        get(['580']),
    netProfitCurrentYear:  get(['590']) - get(['591']),
    revenue:               get(['600','601','602']) - get(['610','611','612']),
    cogs:                  get(['620','621','622','623']),
    operatingExpenses:     get(['630','631','632']),
    interestExpense:       get(['660','661']),
  }
}

// ─── Rasyolar (ratios.ts inline basit versiyon) ───────────────────────────────

function nn(v) { return v ?? 0 }

function calcRatios(d) {
  const totalCurrentAssets = nn(d.cash) + nn(d.tradeReceivables) + nn(d.otherReceivables)
    + nn(d.inventory) + nn(d.prepaidSuppliers) + nn(d.otherCurrentAssets)
  const totalCurrentLiab = nn(d.shortTermFinancialDebt) + nn(d.tradePayables)
    + nn(d.otherShortTermPayables) + nn(d.advancesReceived) + nn(d.taxPayables)
  const totalNonCurrentLiab = nn(d.longTermFinancialDebt) + nn(d.otherNonCurrentLiabilities)
  const totalNonCurrentAssets = nn(d.tangibleAssets) + nn(d.intangibleAssets) + nn(d.otherNonCurrentAssets)
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets
  const totalEquity = totalAssets - totalCurrentLiab - totalNonCurrentLiab

  const revenue    = nn(d.revenue)
  const cogs       = nn(d.cogs)
  const grossProfit = revenue - cogs
  const opEx       = nn(d.operatingExpenses)
  const ebit       = grossProfit - opEx
  const intExp     = nn(d.interestExpense)
  const netProfit  = nn(d.netProfitCurrentYear)

  return {
    currentRatio:    totalCurrentLiab > 0 ? totalCurrentAssets / totalCurrentLiab : null,
    quickRatio:      totalCurrentLiab > 0 ? (totalCurrentAssets - nn(d.inventory)) / totalCurrentLiab : null,
    debtToEquity:    totalEquity > 0 ? (totalCurrentLiab + totalNonCurrentLiab) / totalEquity : null,
    equityRatio:     totalAssets > 0 ? totalEquity / totalAssets : null,
    grossMargin:     revenue > 0 ? grossProfit / revenue : null,
    netMargin:       revenue > 0 ? netProfit / revenue : null,
    roe:             totalEquity > 0 ? netProfit / totalEquity : null,
    interestCoverage: intExp > 0 ? ebit / intExp : null,
  }
}

// ─── getAccountTotals inline ─────────────────────────────────────────────────

function getAccountTotals(accounts) {
  const sum = (codes) =>
    accounts.filter(a => codes.includes(a.accountCode))
            .reduce((s, a) => s + Number(a.amount), 0)

  const currentAssets =
    sum(['100','101','102','108']) - sum(['103']) +
    sum(['120','121','126','127','128']) - sum(['122','129']) +
    sum(['131','132','133','135','136','138']) - sum(['137','139']) +
    sum(['150','151','152','153','157','159']) - sum(['158']) +
    sum(['180','181','190','191','193','195','196','197','198'])

  const nonCurrentAssets =
    sum(['220','221','226','240','242','245']) +
    sum(['250','251','252','253','254','255','256','258','259']) - sum(['257']) +
    sum(['260','261','262','263','264','267','269']) - sum(['268']) +
    sum(['280','281','294','295'])

  const totalAssets = currentAssets + nonCurrentAssets

  const currentLiab =
    sum(['300','301','303','304','305','306','309']) - sum(['302','308']) +
    sum(['320','321','326','329']) - sum(['322']) +
    sum(['331','332','333','335','336']) - sum(['337']) +
    sum(['340','349','350','358','360','361','368','369']) +
    sum(['370','372','373','379']) - sum(['371']) +
    sum(['380','381','391','392','393','397','399'])

  const nonCurrentLiab =
    sum(['400','401','405','407','409']) - sum(['402','408']) +
    sum(['420','421','426','429']) - sum(['422']) +
    sum(['431','432','433','436']) - sum(['437']) +
    sum(['440','449','472','479','480','481','492'])

  const totalEquity =
    sum(['500','502']) - sum(['501','503']) +
    sum(['520','521','522','523','524','529']) +
    sum(['540','541','542','548','549']) +
    sum(['570']) - sum(['580']) +
    sum(['590']) - sum(['591'])

  const revenue    = sum(['600','601','602']) - sum(['610','611','612'])
  const costOfSales = sum(['620','621','622','623'])
  const grossProfit = revenue - costOfSales
  const opEx       = sum(['630','631','632'])
  const otherInc   = sum(['640','641','642','643','644','645','646','647','648','649'])
  const otherExp   = sum(['653','654','655','656','657','658','659'])
  const opProfit   = grossProfit - opEx + otherInc - otherExp
  const intExp     = sum(['660','661'])
  const netProfit  = opProfit - intExp - sum(['691']) + sum(['671','679']) - sum(['680','681','689'])

  return {
    currentAssets, nonCurrentAssets, totalAssets,
    currentLiabilities: currentLiab, nonCurrentLiabilities: nonCurrentLiab,
    totalLiabilities: currentLiab + nonCurrentLiab, totalEquity,
    revenue, costOfSales, grossProfit, operatingExpenses: opEx,
    operatingProfit: opProfit, interestExpense: intExp, netProfit,
  }
}

// ─── Test ────────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '       null'
  return n.toFixed(4).padStart(11)
}

function fmtTL(n) {
  if (n == null || n === 0) return '0'
  return (n / 1_000_000).toFixed(1) + 'M'
}

async function test() {
  const analyses = await prisma.analysis.findMany({
    include: {
      financialData:    true,
      financialAccounts: true,
      entity:           { select: { name: true, sector: true } },
    },
    where: {
      financialAccounts: { some: {} },   // sadece migrate edilmiş analizler
    },
    orderBy: [{ year: 'desc' }, { period: 'desc' }],
    take: 8,
  })

  console.log(`\n${'='.repeat(72)}`)
  console.log('Faz A3 — Hesap Kodu Bazlı Rasyo Karşılaştırma Testi')
  console.log(`${'='.repeat(72)}\n`)
  console.log(`Test edilen analiz sayısı: ${analyses.length}\n`)

  const KEYS = ['currentRatio','quickRatio','debtToEquity','equityRatio','grossMargin','netMargin','roe','interestCoverage']

  let totalDiffs = 0
  let totalKeys  = 0

  for (const a of analyses) {
    const entityName = a.entity?.name ?? a.id.slice(0, 8)
    console.log(`\n─── ${entityName} — ${a.year}/${a.period} ` +
                `(${a.financialAccounts.length} hesap) ───`)

    if (!a.financialData) {
      console.log('  [SKIP] financialData yok')
      continue
    }

    // Eski motor — doğrudan aggregate
    const oldRatios  = calcRatios(a.financialData)

    // Yeni motor — hesap kodlarından rebuild
    const rebuilt    = rebuildAggregateFromAccounts(a.financialAccounts)
    const newRatios  = calcRatios(rebuilt)

    // Bilanço kontrolü
    const totals     = getAccountTotals(a.financialAccounts)
    const balanceDiff = totals.totalAssets - totals.totalLiabilities - totals.totalEquity
    const balanced   = Math.abs(balanceDiff) < 1

    console.log(`  Bilanço: Aktif=${fmtTL(totals.totalAssets)}  ` +
                `Pasif+ÖK=${fmtTL(totals.totalLiabilities + totals.totalEquity)}  ` +
                `Fark=${fmtTL(balanceDiff)}  ${balanced ? '✓' : '⚠ UYUMSUZ'}`)

    console.log(`\n  ${'Rasyo'.padEnd(22)} ${'Eski Motor'.padStart(11)}  ${'Yeni Motor'.padStart(11)}  ${'Δ'.padStart(8)}`)
    console.log(`  ${'-'.repeat(58)}`)

    for (const key of KEYS) {
      const oldV = oldRatios[key]
      const newV = newRatios[key]
      const diff = (oldV != null && newV != null) ? Math.abs(oldV - newV) : null
      const flag = diff != null && diff > 0.01 ? '  ⚠' : ''
      if (diff != null && diff > 0.01) totalDiffs++
      totalKeys++
      console.log(`  ${key.padEnd(22)} ${fmt(oldV)}  ${fmt(newV)}  ${diff != null ? diff.toFixed(4).padStart(8) : '    null'}${flag}`)
    }
  }

  console.log(`\n${'='.repeat(72)}`)
  console.log(`Özet: ${totalDiffs} uyumsuz rasyo / ${totalKeys} toplam karşılaştırma`)
  if (totalDiffs === 0) {
    console.log('✓ Tüm rasyolar eski motorla uyumlu (Δ < 0.01)')
  } else {
    console.log('⚠ Uyumsuzluk tespit edildi — hesap eşleme gözden geçirilmeli')
  }
  console.log(`${'='.repeat(72)}\n`)

  await prisma.$disconnect()
  await pool.end()
}

test().catch(async (err) => {
  console.error('Test hatası:', err)
  await prisma.$disconnect()
  await pool.end()
  process.exit(1)
})
