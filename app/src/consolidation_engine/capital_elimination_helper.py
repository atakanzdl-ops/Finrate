"""Capital consolidation helpers."""

from __future__ import annotations

from decimal import Decimal
from typing import Dict, List, Tuple

from .models import (
    AuditLogEntry,
    CompanyFinancials,
    ConsolidationScopeItem,
    ScopeClassification,
)


class CapitalEliminationHelper:
    """Eliminates parent investment vs subsidiary equity."""

    def apply(
        self,
        root_company_id: str,
        consolidated_metrics: Dict[str, Decimal],
        company_financials: Dict[str, CompanyFinancials],
        scope_items: List[ConsolidationScopeItem],
    ) -> Tuple[Dict[str, Decimal], List[Dict[str, str]], List[AuditLogEntry], List[str]]:
        """Apply capital elimination to consolidated metrics."""
        metrics = dict(consolidated_metrics)
        elimination_logs: List[Dict[str, str]] = []
        audit: List[AuditLogEntry] = []
        warnings: List[str] = []

        root = company_financials.get(root_company_id)
        root_investments = root.investments if root else {}

        for item in scope_items:
            if item.company_id == root_company_id or item.classification != ScopeClassification.FULL:
                continue

            child = company_financials.get(item.company_id)
            if not child:
                warnings.append(f"Capital elimination skipped: missing financials for {item.company_id}.")
                continue

            child_equity = child.metrics.get("equity", Decimal("0"))
            parent_investment = root_investments.get(item.company_id)
            if parent_investment is None:
                parent_investment = child_equity * item.effective_ownership_pct
                warnings.append(
                    f"Investment not provided for {item.company_id}; estimated from equity*ownership."
                )

            elimination_amount = min(parent_investment, child_equity)
            metrics["equity"] = metrics.get("equity", Decimal("0")) - elimination_amount

            investment_metric_key = self._find_investment_metric_key(metrics, item.company_id)
            total_assets_action = "skipped"
            if investment_metric_key is not None:
                metrics[investment_metric_key] = metrics.get(investment_metric_key, Decimal("0")) - elimination_amount
                total_assets_action = "adjusted_via_investment_asset"
            else:
                warnings.append(
                    f"Capital elimination asset-side skipped for {item.company_id}: "
                    "no separate investment asset metric found; total_assets untouched."
                )

            elimination_logs.append(
                {
                    "type": "capital_elimination",
                    "company_id": item.company_id,
                    "parent_investment": str(parent_investment),
                    "child_equity": str(child_equity),
                    "elimination_amount": str(elimination_amount),
                    "remaining_child_equity": str(child_equity - elimination_amount),
                    "investment_metric_key": investment_metric_key or "",
                    "total_assets_action": total_assets_action,
                }
            )
            audit.append(
                AuditLogEntry(
                    stage="capital_elimination",
                    level="INFO",
                    message="Applied investment-equity elimination.",
                    context={
                        "company_id": item.company_id,
                        "parent_investment": parent_investment,
                        "child_equity": child_equity,
                        "elimination_amount": elimination_amount,
                        "investment_metric_key": investment_metric_key,
                        "total_assets_action": total_assets_action,
                    },
                )
            )
        return metrics, elimination_logs, audit, warnings

    def _find_investment_metric_key(self, metrics: Dict[str, Decimal], company_id: str) -> str | None:
        """Find an existing investment-asset metric key for the target subsidiary."""
        candidates = [
            f"investment_in_{company_id}",
            f"investment_in_{company_id.lower()}",
            f"investment_{company_id}",
            f"investment_{company_id.lower()}",
            "investment_assets",
            "investments",
            "non_current_financial_assets",
        ]
        for key in candidates:
            if key in metrics:
                return key
        return None
