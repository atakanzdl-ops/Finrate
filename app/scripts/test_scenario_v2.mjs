import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const allWithAccounts = await prisma.analysis.findMany({
    where: {
      financialAccounts: { some: {} },
    },
    include: {
      entity: true,
      financialAccounts: true,
      financialData: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  })

  // En az 20 hesap kaydı olanları al — gerçek dolu analizler
  const testCases = allWithAccounts
    .filter(tc => tc.financialAccounts.length >= 20)
    .slice(0, 10)

  console.log(`\n${testCases.length} test case (20+ hesap kayıtlı) bulundu\n`)
  console.log('='.repeat(80))

  // Dinamik import — ts dosyaları için
  const { runScenarioEngine } = await import('../src/lib/scoring/scenario/engine.ts')
  const { calculateRatiosFromAccounts } = await import('../src/lib/scoring/ratios.ts')
  const { calculateScore, scoreToRating } = await import('../src/lib/scoring/score.ts')
  const { detectStressLevel } = await import('../src/lib/scoring/scenario/dynamicThresholds.ts')
  const { computeDynamicMicroFilter } = await import('../src/lib/scoring/scenario/dynamicMicroFilter.ts')
  const { evaluateA04, evaluateA05, evaluateA06, evaluateA07 } = await import('../src/lib/scoring/scenario/dynamicPreconditions.ts')
  const { getActionFamily } = await import('../src/lib/scoring/scenario/actionFamilies.ts')

  for (const tc of testCases) {
    console.log(`\n\n╔═══ ${tc.entity.name} — ${tc.year}/${tc.period} ═══╗`)
    console.log(`Sektör: ${tc.entity.sector ?? 'bilinmiyor'}`)
    console.log(`Hesap sayısı: ${tc.financialAccounts.length}`)

    const accounts = tc.financialAccounts.map(a => ({
      accountCode: a.accountCode,
      amount: Number(a.amount),
    }))

    // Likidite kalemleri özet
    const cashPool = accounts.filter(a => ['101','102','108'].includes(a.accountCode)).reduce((s,a) => s+a.amount, 0)
    const tradeRec = accounts.filter(a => ['120','121','126','127'].includes(a.accountCode)).reduce((s,a) => s+a.amount, 0)
    const inventory = accounts.filter(a => ['150','151','152','153','157'].includes(a.accountCode)).reduce((s,a) => s+a.amount, 0)
    const advances = accounts.filter(a => a.accountCode === '159').reduce((s,a) => s+a.amount, 0)
    const receivedAdvances = accounts.filter(a => ['340','349'].includes(a.accountCode)).reduce((s,a) => s+a.amount, 0)

    console.log(`Nakit Havuzu (101+102+108): ${(cashPool/1_000_000).toFixed(2)}M TL`)
    console.log(`Ticari Alacak (120-127):    ${(tradeRec/1_000_000).toFixed(2)}M TL`)
    console.log(`Stok (150-157):             ${(inventory/1_000_000).toFixed(2)}M TL`)
    console.log(`Verilen Avans (159):        ${(advances/1_000_000).toFixed(2)}M TL`)
    console.log(`Alınan Avans (340+349):     ${(receivedAdvances/1_000_000).toFixed(2)}M TL`)

    // Önce mevcut skor ve rasyolar
    const ratios = calculateRatiosFromAccounts(accounts)
    const scoreResult = calculateScore(ratios, tc.entity.sector ?? 'İmalat')
    const currentScore = scoreResult.finalScore
    const currentGrade = scoreToRating(currentScore)

    console.log(`\nMevcut skor: ${currentScore.toFixed(1)} (${currentGrade})`)
    console.log(`Cari Oran: ${ratios.currentRatio?.toFixed(2) ?? '-'}`)
    console.log(`Özkaynak Oranı: ${ratios.equityRatio?.toFixed(2) ?? '-'}`)
    console.log(`D/E: ${ratios.debtToEquity?.toFixed(2) ?? '-'}`)

    // En büyük 3 KVYK kalemi göster
    const kvykAccounts = accounts
      .filter(a => {
        const n = parseInt(a.accountCode, 10)
        return n >= 300 && n < 400 && a.amount > 0
      })
      .sort((a, b) => b.amount - a.amount)

    console.log(`\nEn büyük 3 KVYK kalemi:`)
    for (const a of kvykAccounts.slice(0, 3)) {
      console.log(`  ${a.accountCode} → ${(a.amount / 1_000_000).toFixed(1)}M TL`)
    }

    // Hedef: bir üst not (55→60 veya 60→65 gibi)
    const targetScore = Math.min(100, Math.ceil(currentScore / 10) * 10 + 5)
    const targetGrade = scoreToRating(targetScore)

    console.log(`\nHedef: ${targetScore} (${targetGrade})\n`)

    try {
      const result = runScenarioEngine({
        accounts,
        companyId: tc.entityId,
        scenarioId: `test-${tc.id}`,
        sector: tc.entity.sector ?? 'İmalat',
        currentScore,
        currentGrade,
        targetGrade,
        targetScore,
      })

      // Stres seviyesi + dinamik eşikler + microfilter
      console.log(`Stres seviyesi: ${result.stressLevel}`)
      console.log(`Dinamik eşikler:`)
      console.log(`  ΔCari:   ${result.appliedThresholds.minCurrentRatioDelta.toFixed(4)}`)
      console.log(`  ΔÖzk:    ${result.appliedThresholds.minEquityRatioDelta.toFixed(4)}`)
      console.log(`  ΔFaiz:   ${result.appliedThresholds.minInterestCoverageDelta.toFixed(4)}`)
      console.log(`  ΔNİS:    ${result.appliedThresholds.minNetWorkingCapitalDeltaPctAssets.toFixed(4)}`)
      console.log(`  ΔQuick:  ${result.appliedThresholds.minQuickRatioDelta.toFixed(4)}`)
      console.log(`  ΔCash:   ${result.appliedThresholds.minCashRatioDelta.toFixed(4)}`)
      console.log(`  ΔDSO:    ${result.appliedThresholds.minDsoImprovementDays.toFixed(2)} gün`)
      console.log(`  ΔCCC:    ${result.appliedThresholds.minCccImprovementDays.toFixed(2)} gün`)
      console.log(`Dinamik MicroFilter:`)
      console.log(`  minLineAmountTry: ${(result.appliedMicroFilter.minLineAmountTry / 1_000_000).toFixed(2)}M TL`)
      console.log(`  minLineShareInGroup: ${(result.appliedMicroFilter.minLineShareInGroup * 100).toFixed(1)}%`)

      // A04-A07 dinamik precondition detayları
      const stress = detectStressLevel(result.analysis)
      const mf = computeDynamicMicroFilter(result.analysis, stress.level)
      const a04 = evaluateA04(result.analysis, stress.level, mf)
      const a05 = evaluateA05(result.analysis, mf)
      const a06 = evaluateA06(result.analysis, mf)
      const a07 = evaluateA07(result.analysis, mf)

      console.log(`\nA04-A07 dinamik precondition:`)
      console.log(`  A04: ${a04.pass ? '✓' : '✗'} cashPool=${(a04.cashPool/1e6).toFixed(1)}M xMaxBuf=${(a04.xMaxBuffer/1e6).toFixed(1)}M`)
      if (!a04.pass) a04.reasons.forEach(r => console.log(`       ${r}`))
      console.log(`  A05: ${a05.pass ? '✓' : '✗'} tradeRec=${(a05.tradeRec/1e6).toFixed(1)}M pct=${(a05.actualPct*100).toFixed(2)}%`)
      if (!a05.pass) a05.reasons.forEach(r => console.log(`       ${r}`))
      console.log(`  A06: ${a06.pass ? '✓' : '✗'} inventory=${(a06.inventory/1e6).toFixed(1)}M share=${(a06.invShareCA*100).toFixed(1)}%`)
      if (!a06.pass) a06.reasons.forEach(r => console.log(`       ${r}`))
      console.log(`  A07: ${a07.pass ? '✓' : '✗'} prepaid=${(a07.prepaid/1e6).toFixed(1)}M pct=${(a07.actualPct*100).toFixed(3)}%`)
      if (!a07.pass) a07.reasons.forEach(r => console.log(`       ${r}`))

      // A04-A07 acil aksiyon durumu
      const shortScen = result.scenarios.find(s => s.horizon === 'short')
      const shortActionsCount = shortScen?.actions.length ?? 0
      const shortActionIds = shortScen?.actions.map(a => a.actionId) ?? []
      console.log(`Acil aksiyonlar: ${shortActionsCount} (${shortActionIds.join(', ') || '-'})`)

      // Acil müdahale değerlendirmesi
      const ea = result.emergencyAssessment
      console.log(`Acil Müdahale: ${ea.required ? '🚨 GEREKLİ' : '✅ Gerekmiyor'}`)
      if (ea.signals.length > 0) {
        for (const s of ea.signals) console.log(`  ⚠ ${s}`)
      }

      // Ters bakiye emniyet ağı uyarıları
      if (result.analysis.warnings?.length > 0) {
        console.log(`\n⚠ Ters bakiye uyarıları:`)
        for (const w of result.analysis.warnings) {
          console.log(`  ${w}`)
        }
      }

      // 6 grup özet
      console.log(`\n6 Grup Analizi:`)
      const g = result.analysis.groups
      console.log(`  Dönen Varlıklar:     ${(g.CURRENT_ASSETS.total / 1_000_000).toFixed(1)}M`)
      console.log(`  Duran Varlıklar:     ${(g.NON_CURRENT_ASSETS.total / 1_000_000).toFixed(1)}M`)
      console.log(`  KVYK:                ${(g.SHORT_TERM_LIABILITIES.total / 1_000_000).toFixed(1)}M`)
      console.log(`  UVYK:                ${(g.LONG_TERM_LIABILITIES.total / 1_000_000).toFixed(1)}M`)
      console.log(`  Özkaynaklar:         ${(g.EQUITY.total / 1_000_000).toFixed(1)}M`)
      console.log(`  Gelir Tablosu:       ${(g.INCOME_STATEMENT.total / 1_000_000).toFixed(1)}M`)

      console.log(`\n3 Senaryo Özeti:`)
      for (const s of result.scenarios) {
        if (s.skipped) {
          console.log(`  — ${s.horizonLabel} [ATLANDI]`)
          console.log(`      ${s.skipReason}`)
          if (s.watchlist) {
            for (const w of s.watchlist) console.log(`      👁 ${w}`)
          }
          continue
        }
        const status = s.goalReached ? '✓' : '○'
        console.log(`  ${status} ${s.horizonLabel}`)
        console.log(`      ${s.scoreBefore.toFixed(1)} → ${s.scoreAfter.toFixed(1)} (${s.actions.length} aksiyon, ${(s.totalTLMovement / 1_000_000).toFixed(1)}M TL)`)

        for (const a of s.actions) {
          const priority = a.scoreBreakdown.finalPriorityScore.toFixed(1)
          const amount = (a.amountApplied / 1_000_000).toFixed(1)
          const deltaCur = a.ratioDelta.CURRENT_RATIO.toFixed(3)
          const deltaQuick = a.ratioDelta.QUICK_RATIO.toFixed(3)
          const family = getActionFamily(a.actionId)
          console.log(`        • ${a.actionId} [${family}] — ${amount}M TL, ΔCari=${deltaCur}, ΔQuick=${deltaQuick}, skor=${priority}`)

          // Hesap hareketleri — özet
          const topMoves = a.accountMovements
            .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
            .slice(0, 3)
          for (const mv of topMoves) {
            const sign = mv.delta > 0 ? '+' : ''
            console.log(`            ${mv.accountCode}: ${sign}${(mv.delta / 1_000_000).toFixed(1)}M`)
          }
        }
      }
    } catch (err) {
      console.log(`  HATA: ${err.message}`)
      console.log(err.stack)
    }

    console.log('\n' + '─'.repeat(80))
  }

  // ============ A04-A07 REGRESYON RAPORU ============
  console.log('\n\n╔═══ A04-A07 REGRESYON RAPORU ═══╗')
  console.log('(Not: Bu test firmalarında 102/nakit hesabı eksik olduğundan A04 geçemez)')
  console.log('(A05/A06/A07 ise alacak/stok/peşin gider varlığına göre değişir)')

  // ============ SENTETİK SAĞLIKLI FİRMA TESTİ ============
  console.log('\n\n╔═══ SENTETİK SAĞLIKLI FİRMA (watchlist path testi) ═══╗')

  const healthyAccounts = [
    { accountCode: '102', amount: 50_000_000 },   // Bankalar — güçlü nakit
    { accountCode: '120', amount: 30_000_000 },   // Alıcılar
    { accountCode: '153', amount: 40_000_000 },   // Stoklar
    { accountCode: '252', amount: 80_000_000 },   // Binalar
    { accountCode: '300', amount: 20_000_000 },   // KV krediler
    { accountCode: '320', amount: 15_000_000 },   // Satıcılar
    { accountCode: '400', amount: 40_000_000 },   // UV krediler
    { accountCode: '500', amount: 100_000_000 },  // Sermaye
    { accountCode: '570', amount: 25_000_000 },   // Geçmiş kârlar
    { accountCode: '600', amount: 200_000_000 },  // Satışlar
    { accountCode: '621', amount: 140_000_000 },  // SMM
    { accountCode: '632', amount: 20_000_000 },   // Genel yönetim
    { accountCode: '660', amount: 8_000_000 },    // Finansman gideri
    { accountCode: '590', amount: 30_000_000 },   // Dönem kârı
  ]

  const healthyRatios = calculateRatiosFromAccounts(healthyAccounts)
  const healthyScore = calculateScore(healthyRatios, 'İmalat')

  console.log(`Cari Oran: ${healthyRatios.currentRatio?.toFixed(2)}`)
  console.log(`Nakit Oranı: ${healthyRatios.cashRatio?.toFixed(2)}`)
  console.log(`Özkaynak Oranı: ${healthyRatios.equityRatio?.toFixed(2)}`)
  console.log(`Skor: ${healthyScore.finalScore.toFixed(1)} (${scoreToRating(healthyScore.finalScore)})`)

  const healthyResult = runScenarioEngine({
    accounts: healthyAccounts,
    companyId: 'synthetic',
    scenarioId: 'test-healthy',
    sector: 'İmalat',
    currentScore: healthyScore.finalScore,
    currentGrade: scoreToRating(healthyScore.finalScore),
    targetGrade: 'AA',
    targetScore: 85,
    currentRatios: {
      CURRENT_RATIO: healthyRatios.currentRatio ?? 0,
      CASH_RATIO: healthyRatios.cashRatio ?? 0,
      QUICK_RATIO: healthyRatios.quickRatio ?? 0,
      EQUITY_RATIO: healthyRatios.equityRatio ?? 0,
      DEBT_TO_EQUITY: healthyRatios.debtToEquity ?? 0,
      INTEREST_COVERAGE: healthyRatios.interestCoverage ?? 0,
    },
  })

  console.log(`\nEmergency required: ${healthyResult.emergencyAssessment.required}`)
  console.log(`Emergency signals: ${healthyResult.emergencyAssessment.signals.length}`)
  console.log(`Skipped signals: ${healthyResult.emergencyAssessment.skippedSignals.length}`)
  for (const s of healthyResult.emergencyAssessment.skippedSignals) {
    console.log(`  — ${s}`)
  }

  const shortScenario = healthyResult.scenarios.find(s => s.horizon === 'short')
  console.log(`\nAcil Müdahale horizon:`)
  console.log(`  Skipped: ${shortScenario?.skipped ?? false}`)
  console.log(`  Actions: ${shortScenario?.actions.length ?? 0}`)
  console.log(`  SkipReason: ${shortScenario?.skipReason ?? '-'}`)
  console.log(`  Watchlist: ${shortScenario?.watchlist?.length ?? 0} öneri`)

  // ASSERTION — sağlıklı firmada Acil horizon skipped olmalı
  if (!shortScenario?.skipped) {
    console.log('\n❌ REGRESYON HATASI: Sağlıklı firmada Acil Müdahale atlanmadı!')
    process.exit(1)
  } else {
    console.log('\n✓ Sağlıklı firma testi başarılı — watchlist path çalışıyor')
  }

  // ============ TERS BAKİYE REKLASIFIKASYON TESTİ ============
  console.log('\n\n╔═══ TERS BAKİYE TESTİ ═══╗')

  const { reclassifyAccounts } = await import('../src/lib/scoring/reversalMap.ts')

  const messyAccounts = [
    { code: '120', amount: -15_000_000 },  // Alacak ters → 340 olmalı
    { code: '320', amount: -8_000_000 },   // Borç ters → 159 olmalı
    { code: '159', amount: 10_000_000 },   // Normal avans
    { code: '131', amount: -5_000_000 },   // Ortak alacağı ters → 331 olmalı
    { code: '102', amount: 20_000_000 },   // Normal banka
    { code: '500', amount: 50_000_000 },   // Normal sermaye
  ]

  const reclass = reclassifyAccounts(messyAccounts)

  console.log(`Orijinal hesap sayısı: ${messyAccounts.length}`)
  console.log(`Reklasifikasyon sonrası: ${reclass.accounts.length}`)
  console.log(`\nReklasifikasyon kayıtları:`)
  for (const r of reclass.reversals) {
    console.log(`  ${r.originalCode} (${r.originalAmount.toLocaleString('tr-TR')}) → ${r.reclassifiedCode} (+${r.amount.toLocaleString('tr-TR')}) [${r.ruleId}]`)
  }

  console.log(`\nFinal hesap listesi:`)
  for (const a of reclass.accounts) {
    console.log(`  ${a.code}: ${a.amount.toLocaleString('tr-TR')}`)
  }

  // Assertions
  const finalMap = new Map(reclass.accounts.map(a => [a.code, a.amount]))

  if (finalMap.get('340') !== 15_000_000) {
    console.log('\n❌ HATA: 120 ters bakiye 340\'a aktarılmadı')
    process.exit(1)
  }
  if (finalMap.get('331') !== 5_000_000) {
    console.log('\n❌ HATA: 131 ters bakiye 331\'e aktarılmadı')
    process.exit(1)
  }
  // 320 ters 8M + 159 normal 10M → 159'da toplam 18M (320 kalemi 159'a eklenir)
  if (finalMap.get('159') !== 18_000_000) {
    console.log(`\n❌ HATA: 159 toplamı yanlış — beklenen 18M, gelen ${finalMap.get('159')?.toLocaleString('tr-TR')}`)
    process.exit(1)
  }
  if (finalMap.has('120') || finalMap.has('320') || finalMap.has('131')) {
    console.log('\n❌ HATA: Ters bakiyeli orijinal hesaplar silinmedi')
    process.exit(1)
  }

  console.log('\n✓ Ters bakiye reklasifikasyon testi başarılı')

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
