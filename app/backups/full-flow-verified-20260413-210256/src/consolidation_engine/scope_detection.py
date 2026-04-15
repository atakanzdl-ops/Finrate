"""Scope detection logic."""

from __future__ import annotations

from decimal import Decimal
from typing import Dict, List

from .models import ConsolidationScopeItem, OwnershipLink, ScopeClassification


class ScopeDetector:
    """Determines consolidation scope using control/significant influence rules."""

    def __init__(self, links: List[OwnershipLink]) -> None:
        """Initialize detector with ownership links."""
        self.links = links

    def classify(
        self,
        root_company_id: str,
        effective_ownership: Dict[str, Decimal],
        direct_ownership: Dict[str, Decimal],
    ) -> List[ConsolidationScopeItem]:
        """Classify each investee into full/equity/financial asset scope."""
        all_companies = set(effective_ownership.keys()) | set(direct_ownership.keys())
        items: List[ConsolidationScopeItem] = [
            ConsolidationScopeItem(
                company_id=root_company_id,
                parent_id=root_company_id,
                effective_ownership_pct=Decimal("1"),
                classification=ScopeClassification.FULL,
                reasons=["Root company included by definition."],
            )
        ]

        for company_id in sorted(all_companies):
            eff = effective_ownership.get(company_id, Decimal("0"))
            direct = direct_ownership.get(company_id, Decimal("0"))
            control_override = any(
                link.child_id == company_id
                and link.parent_id == root_company_id
                and link.control_override is True
                for link in self.links
            )
            sig_override = any(
                link.child_id == company_id
                and link.parent_id == root_company_id
                and link.significant_influence_override is True
                for link in self.links
            )

            reasons: List[str] = []
            classification = ScopeClassification.FINANCIAL_ASSET

            if control_override or direct > Decimal("0.5") or eff > Decimal("0.5"):
                classification = ScopeClassification.FULL
                if control_override:
                    reasons.append("control_override=True")
                if direct > Decimal("0.5"):
                    reasons.append(f"direct ownership > 50% ({direct})")
                if eff > Decimal("0.5"):
                    reasons.append(f"effective ownership > 50% ({eff})")
            elif sig_override or (Decimal("0.2") <= eff <= Decimal("0.5")):
                classification = ScopeClassification.EQUITY
                if sig_override:
                    reasons.append("significant_influence_override=True")
                else:
                    reasons.append(f"effective ownership in 20%-50% band ({eff})")
            else:
                reasons.append(f"effective ownership < 20% ({eff})")

            items.append(
                ConsolidationScopeItem(
                    company_id=company_id,
                    parent_id=root_company_id,
                    effective_ownership_pct=eff,
                    classification=classification,
                    reasons=reasons,
                )
            )
        return items

