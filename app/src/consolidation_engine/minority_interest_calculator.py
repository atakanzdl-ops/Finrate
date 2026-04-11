"""Minority interest calculations."""

from __future__ import annotations

from decimal import Decimal
from typing import Dict, List, Tuple

from .models import CompanyFinancials, ConsolidationScopeItem, ScopeClassification


class MinorityInterestCalculator:
    """Calculates minority interest equity and profit shares."""

    def calculate(
        self,
        root_company_id: str,
        company_financials: Dict[str, CompanyFinancials],
        scope_items: List[ConsolidationScopeItem],
    ) -> Tuple[Dict[str, Decimal], List[Dict[str, str]]]:
        """Return minority totals and per-company details."""
        minority_equity = Decimal("0")
        minority_profit = Decimal("0")
        details: List[Dict[str, str]] = []

        for item in scope_items:
            if item.company_id == root_company_id or item.classification != ScopeClassification.FULL:
                continue

            child = company_financials.get(item.company_id)
            if not child:
                continue

            minority_pct = Decimal("1") - item.effective_ownership_pct
            child_equity = child.metrics.get("equity", Decimal("0"))
            child_profit = child.metrics.get("net_profit", Decimal("0"))

            eq_share = child_equity * minority_pct
            np_share = child_profit * minority_pct
            minority_equity += eq_share
            minority_profit += np_share

            details.append(
                {
                    "company_id": item.company_id,
                    "minority_pct": str(minority_pct),
                    "minority_equity": str(eq_share),
                    "minority_profit": str(np_share),
                }
            )

        return {
            "minority_equity": minority_equity,
            "minority_profit": minority_profit,
            "details": details,
        }, details

