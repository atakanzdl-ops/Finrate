"""Equity method calculations."""

from __future__ import annotations

from decimal import Decimal
from typing import Dict, List, Tuple

from .models import (
    AuditLogEntry,
    CompanyFinancials,
    ConsolidationScopeItem,
    IntercompanyTransaction,
    ScopeClassification,
    TransactionType,
)


class EquityMethodCalculator:
    """Applies equity method for significant influence investments."""

    def apply(
        self,
        root_company_id: str,
        consolidated_metrics: Dict[str, Decimal],
        company_financials: Dict[str, CompanyFinancials],
        scope_items: List[ConsolidationScopeItem],
        transactions: List[IntercompanyTransaction],
    ) -> Tuple[Dict[str, Decimal], List[Dict[str, str]], List[AuditLogEntry], List[str]]:
        """Apply equity method adjustments and return updated metrics."""
        metrics = dict(consolidated_metrics)
        logs: List[Dict[str, str]] = []
        audit: List[AuditLogEntry] = []
        warnings: List[str] = []

        root = company_financials.get(root_company_id)
        if not root:
            warnings.append("Root company financials missing; equity method skipped.")
            return metrics, logs, audit, warnings

        for item in scope_items:
            if item.classification != ScopeClassification.EQUITY:
                continue

            investee = company_financials.get(item.company_id)
            if not investee:
                warnings.append(f"Missing investee financials for equity method: {item.company_id}.")
                continue

            old_carrying = root.investments.get(item.company_id, Decimal("0"))
            share_of_profit = investee.metrics.get("net_profit", Decimal("0")) * item.effective_ownership_pct
            dividends = sum(
                tx.amount
                for tx in transactions
                if tx.tx_type == TransactionType.DIVIDEND
                and tx.from_company == item.company_id
                and tx.to_company == root_company_id
            )
            new_carrying = old_carrying + share_of_profit - dividends

            delta = new_carrying - old_carrying
            metrics["total_assets"] = metrics.get("total_assets", Decimal("0")) + delta
            metrics["net_profit"] = metrics.get("net_profit", Decimal("0")) + share_of_profit
            metrics["equity"] = metrics.get("equity", Decimal("0")) + share_of_profit - dividends

            log = {
                "company_id": item.company_id,
                "old_carrying_value": str(old_carrying),
                "share_of_profit": str(share_of_profit),
                "dividends": str(dividends),
                "new_carrying_value": str(new_carrying),
            }
            logs.append(log)
            audit.append(
                AuditLogEntry(
                    stage="equity_method",
                    level="INFO",
                    message="Applied equity method.",
                    context=log,
                )
            )

        return metrics, logs, audit, warnings

