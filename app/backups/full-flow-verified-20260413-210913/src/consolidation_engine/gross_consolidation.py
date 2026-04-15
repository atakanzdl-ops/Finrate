"""Gross (pre-elimination) consolidation."""

from __future__ import annotations

from decimal import Decimal
from typing import Dict, List, Tuple

from .models import AuditLogEntry, CompanyFinancials, ConsolidationScopeItem, ScopeClassification


class GrossConsolidator:
    """Aggregates full-consolidation entities at 100% before eliminations."""

    def consolidate(
        self,
        company_financials: Dict[str, CompanyFinancials],
        scope_items: List[ConsolidationScopeItem],
    ) -> Tuple[Dict[str, Decimal], List[AuditLogEntry]]:
        """Produce gross consolidated metrics and audit entries."""
        consolidated: Dict[str, Decimal] = {}
        audit: List[AuditLogEntry] = []

        full_companies = [
            item.company_id for item in scope_items if item.classification == ScopeClassification.FULL
        ]
        for company_id in full_companies:
            financial = company_financials.get(company_id)
            if not financial:
                audit.append(
                    AuditLogEntry(
                        stage="gross_consolidation",
                        level="WARNING",
                        message="Missing standalone financials for full consolidation entity.",
                        context={"company_id": company_id},
                    )
                )
                continue

            for metric, value in financial.metrics.items():
                consolidated[metric] = consolidated.get(metric, Decimal("0")) + value

            audit.append(
                AuditLogEntry(
                    stage="gross_consolidation",
                    level="INFO",
                    message="Included company at 100% in gross consolidation.",
                    context={"company_id": company_id},
                )
            )

        return consolidated, audit

