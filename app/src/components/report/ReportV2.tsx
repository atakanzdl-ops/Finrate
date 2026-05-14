'use client'
import './report-v2.css'
import type { ReportData } from '@/types/report'

import CoverPage            from './pages/01-CoverPage'
import ExecutiveSummaryPage from './pages/02-ExecutiveSummaryPage'
import CompanyInfoPage      from './pages/03-CompanyInfoPage'
import FinancialDetailPage  from './pages/04-FinancialDetailPage'
import LiquidityRatiosPage  from './pages/05-LiquidityRatiosPage'
import ProfitabilityRatiosPage from './pages/06-ProfitabilityRatiosPage'
import TrendPage            from './pages/07-TrendPage'
import BalanceSheetPage     from './pages/08-BalanceSheetPage'
import IncomeStatementPage  from './pages/09-IncomeStatementPage'
import CashFlowPage         from './pages/10-CashFlowPage'
import ScenarioPage         from './pages/11-ScenarioPage'
import ActionPlanPage       from './pages/12-ActionPlanPage'
import SubjectivePage       from './pages/13-SubjectivePage'
import MethodologyPage      from './pages/14-MethodologyPage'
import ClosingPage          from './pages/15-ClosingPage'

interface Props {
  data: ReportData
}

export default function ReportV2({ data }: Props) {
  return (
    <div className="report-v2-root">
      {/* Sayfa 1 — Kapak */}
      <CoverPage data={data} />

      {/* Sayfa 2 — Yönetici Özeti */}
      <ExecutiveSummaryPage data={data} />

      {/* Sayfa 3 — Şirket Bilgileri & Sektör Kıyası */}
      <CompanyInfoPage data={data} />

      {/* Sayfa 4 — Finansal Skor Detayı */}
      <FinancialDetailPage data={data} />

      {/* Sayfa 5 — Likidite & Kaldıraç Oranları */}
      <LiquidityRatiosPage data={data} />

      {/* Sayfa 6 — Kârlılık & Faaliyet Oranları */}
      <ProfitabilityRatiosPage data={data} />

      {/* Sayfa 7 — Trend & Büyüme Analizi */}
      <TrendPage data={data} />

      {/* Sayfa 8 — Bilanço Tabloları */}
      <BalanceSheetPage data={data} />

      {/* Sayfa 9 — Gelir Tablosu */}
      <IncomeStatementPage data={data} />

      {/* Sayfa 10 — Nakit Döngüsü & Çalışma Sermayesi */}
      <CashFlowPage data={data} />

      {/* Sayfa 11 — Senaryo Analizi */}
      <ScenarioPage data={data} />

      {/* Sayfa 12 — Detaylı Aksiyon Planı */}
      <ActionPlanPage data={data} />

      {/* Sayfa 13 — Subjektif Faktörler */}
      <SubjectivePage data={data} />

      {/* Sayfa 14 — Metodoloji & Açıklamalar */}
      <MethodologyPage data={data} />

      {/* Sayfa 15 — Kapanış */}
      <ClosingPage data={data} />
    </div>
  )
}
