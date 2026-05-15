'use client'
import './report-v2.css'
import type { ReportData } from '@/types/report'

import CoverPage               from './pages/01-CoverPage'
import ExecutiveSummaryPage    from './pages/02-ExecutiveSummaryPage'
import CompanyInfoPage         from './pages/03-CompanyInfoPage'
import FinancialDetailPage     from './pages/04-FinancialDetailPage'
import LiquidityRatiosPage     from './pages/05-LiquidityRatiosPage'
import ProfitabilityRatiosPage from './pages/06-ProfitabilityRatiosPage'
import TrendPage               from './pages/07-TrendPage'
import BalanceSheetPage        from './pages/08-BalanceSheetPage'
import IncomeStatementPage     from './pages/09-IncomeStatementPage'
import CashFlowPage            from './pages/10-CashFlowPage'
import ScenarioPage            from './pages/11-ScenarioPage'
import ActionPlanPage          from './pages/12-ActionPlanPage'
import SubjectivePage          from './pages/13-SubjectivePage'
import MethodologyPage         from './pages/14-MethodologyPage'
import ClosingPage             from './pages/15-ClosingPage'

interface Props {
  data: ReportData
}

export default function ReportV2({ data }: Props) {
  // Sektör adı — tüm başlıklarda gösterilir (.ph-sector)
  const sector = data.companyInfo?.sector ?? undefined

  return (
    <div className="report-v2-root">
      {/* Sayfa 1 — Kapak (sektör yok, farklı layout) */}
      <CoverPage data={data} />

      {/* Sayfa 2 — Yönetici Özeti */}
      <ExecutiveSummaryPage data={data} sector={sector} />

      {/* Sayfa 3 — Şirket Bilgileri & Sektör Kıyası */}
      <CompanyInfoPage data={data} sector={sector} />

      {/* Sayfa 4 — Finansal Skor Detayı */}
      <FinancialDetailPage data={data} sector={sector} />

      {/* Sayfa 5 — Likidite & Kaldıraç Oranları */}
      <LiquidityRatiosPage data={data} sector={sector} />

      {/* Sayfa 6 — Kârlılık & Faaliyet Oranları */}
      <ProfitabilityRatiosPage data={data} sector={sector} />

      {/* Sayfa 7 — Trend & Büyüme Analizi */}
      <TrendPage data={data} sector={sector} />

      {/* Sayfa 8 — Bilanço Tabloları */}
      <BalanceSheetPage data={data} sector={sector} />

      {/* Sayfa 9 — Gelir Tablosu */}
      <IncomeStatementPage data={data} sector={sector} />

      {/* Sayfa 10 — Nakit Döngüsü & Çalışma Sermayesi */}
      <CashFlowPage data={data} sector={sector} />

      {/* Sayfa 11 — Senaryo Analizi */}
      <ScenarioPage data={data} sector={sector} />

      {/* Sayfa 12 — Detaylı Aksiyon Planı */}
      <ActionPlanPage data={data} sector={sector} />

      {/* Sayfa 13 — Subjektif Faktörler */}
      <SubjectivePage data={data} sector={sector} />

      {/* Sayfa 14 — Metodoloji & Açıklamalar */}
      <MethodologyPage data={data} sector={sector} />

      {/* Sayfa 15 — Kapanış (sektör yok, farklı layout) */}
      <ClosingPage data={data} />
    </div>
  )
}
