"""Mapping helper for Finrate score engine."""

from __future__ import annotations

from decimal import Decimal
from typing import Dict


FINRATE_SCORE_FIELDS = [
    "current_assets",
    "cash",
    "trade_receivables",
    "inventories",
    "total_assets",
    "current_liabilities",
    "short_term_debt",
    "long_term_debt",
    "trade_payables",
    "equity",
    "revenue",
    "gross_profit",
    "ebitda",
    "ebit",
    "net_profit",
    "finance_expense",
    "operating_cash_flow",
]


def map_to_score_input(metrics: Dict[str, Decimal]) -> Dict[str, Decimal]:
    """Normalize consolidated metrics for Finrate scoring."""
    return {field: metrics.get(field, Decimal("0")) for field in FINRATE_SCORE_FIELDS}

