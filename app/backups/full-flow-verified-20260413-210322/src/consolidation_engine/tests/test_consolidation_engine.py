"""Unit tests for Finrate consolidation engine."""

from decimal import Decimal
import unittest

from consolidation_engine.orchestration import ConsolidationEngine
from consolidation_engine.ownership_engine import OwnershipEngine
from consolidation_engine.models import IntercompanyTransaction, OwnershipLink


def base_metrics(equity: str, revenue: str = "0", net_profit: str = "0") -> dict:
    """Create minimal metric dictionary for test fixtures."""
    return {
        "current_assets": "100",
        "cash": "20",
        "trade_receivables": "30",
        "inventories": "40",
        "total_assets": "200",
        "current_liabilities": "80",
        "short_term_debt": "20",
        "long_term_debt": "30",
        "trade_payables": "25",
        "equity": equity,
        "revenue": revenue,
        "gross_profit": "0",
        "ebitda": "0",
        "ebit": "0",
        "net_profit": net_profit,
        "finance_expense": "0",
        "operating_cash_flow": "0",
    }


class ConsolidationEngineTests(unittest.TestCase):
    """Covers scope detection and elimination behavior."""

    def setUp(self) -> None:
        """Initialize engine for each test."""
        self.engine = ConsolidationEngine()

    def test_full_consolidation_100_percent(self) -> None:
        """A->100%B should be full consolidation with zero minority."""
        payload = {
            "root_company_id": "A",
            "companies": [
                {"company_id": "A", "name": "A", "period": "2025", "metrics": base_metrics("100"), "investments": {"B": "50"}},
                {"company_id": "B", "name": "B", "period": "2025", "metrics": base_metrics("50")},
            ],
            "ownership_links": [{"parent_id": "A", "child_id": "B", "ownership_pct": "1.0"}],
            "intercompany_transactions": [],
        }
        out = self.engine.run(payload)
        scope = {x["company_id"]: x["classification"] for x in out["scope_classification"]}
        self.assertEqual(scope["B"], "full_consolidation")
        self.assertEqual(out["minority_interest_outputs"]["minority_equity"], "0.0")

    def test_full_consolidation_60_percent(self) -> None:
        """A->60%B should produce 40% minority."""
        payload = {
            "root_company_id": "A",
            "companies": [
                {"company_id": "A", "name": "A", "period": "2025", "metrics": base_metrics("100"), "investments": {"B": "60"}},
                {"company_id": "B", "name": "B", "period": "2025", "metrics": base_metrics("100", net_profit="50")},
            ],
            "ownership_links": [{"parent_id": "A", "child_id": "B", "ownership_pct": "0.6"}],
            "intercompany_transactions": [],
        }
        out = self.engine.run(payload)
        self.assertEqual(out["minority_interest_outputs"]["details"][0]["minority_pct"], "0.4")
        self.assertEqual(out["scope_classification"][1]["classification"], "full_consolidation")

    def test_equity_method_30_percent(self) -> None:
        """A->30%B should be equity method."""
        payload = {
            "root_company_id": "A",
            "companies": [
                {"company_id": "A", "name": "A", "period": "2025", "metrics": base_metrics("100"), "investments": {"B": "20"}},
                {"company_id": "B", "name": "B", "period": "2025", "metrics": base_metrics("80", net_profit="10")},
            ],
            "ownership_links": [{"parent_id": "A", "child_id": "B", "ownership_pct": "0.3"}],
            "intercompany_transactions": [],
        }
        out = self.engine.run(payload)
        scope = {x["company_id"]: x["classification"] for x in out["scope_classification"]}
        self.assertEqual(scope["B"], "equity_method")

    def test_indirect_effective_ownership_15_percent(self) -> None:
        """A->30%B->50%C gives 15% and not full consolidation."""
        payload = {
            "root_company_id": "A",
            "companies": [
                {"company_id": "A", "name": "A", "period": "2025", "metrics": base_metrics("100"), "investments": {"B": "30"}},
                {"company_id": "B", "name": "B", "period": "2025", "metrics": base_metrics("80"), "investments": {"C": "20"}},
                {"company_id": "C", "name": "C", "period": "2025", "metrics": base_metrics("50")},
            ],
            "ownership_links": [
                {"parent_id": "A", "child_id": "B", "ownership_pct": "0.30"},
                {"parent_id": "B", "child_id": "C", "ownership_pct": "0.50"},
            ],
            "intercompany_transactions": [],
        }
        out = self.engine.run(payload)
        eff = out["effective_ownership_map"]["effective_ownership_pct"]
        scope = {x["company_id"]: x["classification"] for x in out["scope_classification"]}
        self.assertEqual(Decimal(eff["C"]), Decimal("0.15"))
        self.assertNotEqual(scope["C"], "full_consolidation")

    def test_multiple_paths_effective_ownership(self) -> None:
        """Multiple path ownership should sum path contributions."""
        links = [
            OwnershipLink(parent_id="A", child_id="B", ownership_pct=Decimal("0.5")),
            OwnershipLink(parent_id="A", child_id="C", ownership_pct=Decimal("0.2")),
            OwnershipLink(parent_id="B", child_id="D", ownership_pct=Decimal("0.4")),
            OwnershipLink(parent_id="C", child_id="D", ownership_pct=Decimal("0.5")),
        ]
        eff, _, _ = OwnershipEngine(links).compute_effective_ownership("A")
        self.assertEqual(eff["D"], Decimal("0.30"))

    def test_multi_path_with_cycle_and_duplicate_edge(self) -> None:
        """Multi-path should work, cycle should be safe, duplicate edge should not be counted twice."""
        links = [
            OwnershipLink(parent_id="A", child_id="B", ownership_pct=Decimal("0.6")),
            OwnershipLink(parent_id="A", child_id="C", ownership_pct=Decimal("0.4")),
            OwnershipLink(parent_id="B", child_id="D", ownership_pct=Decimal("0.5")),
            OwnershipLink(parent_id="B", child_id="D", ownership_pct=Decimal("0.5")),
            OwnershipLink(parent_id="C", child_id="D", ownership_pct=Decimal("0.5")),
            OwnershipLink(parent_id="D", child_id="A", ownership_pct=Decimal("0.2")),
        ]
        eff, _, audit = OwnershipEngine(links).compute_effective_ownership("A")
        self.assertEqual(eff["D"], Decimal("0.50"))
        self.assertTrue(any("Duplicate edge skipped" in a.message for a in audit))
        self.assertTrue(any("Cycle detected" in a.message for a in audit))

    def test_max_recursion_depth_warning(self) -> None:
        """Traversal should stop and warn when max recursion depth is exceeded."""
        links = [
            OwnershipLink(parent_id="A", child_id="B", ownership_pct=Decimal("0.9")),
            OwnershipLink(parent_id="B", child_id="C", ownership_pct=Decimal("0.9")),
            OwnershipLink(parent_id="C", child_id="D", ownership_pct=Decimal("0.9")),
        ]
        _, _, audit = OwnershipEngine(links, max_depth=2).compute_effective_ownership("A")
        self.assertTrue(any("Max recursion depth reached" in a.message for a in audit))

    def test_sale_purchase_elimination(self) -> None:
        """Sale/purchase elimination should reduce consolidated revenue."""
        payload = {
            "root_company_id": "A",
            "companies": [
                {"company_id": "A", "name": "A", "period": "2025", "metrics": base_metrics("100", revenue="150"), "investments": {"B": "60"}},
                {"company_id": "B", "name": "B", "period": "2025", "metrics": base_metrics("90", revenue="80")},
            ],
            "ownership_links": [{"parent_id": "A", "child_id": "B", "ownership_pct": "0.6"}],
            "intercompany_transactions": [
                {
                    "tx_id": "t1",
                    "tx_type": "sale_purchase",
                    "from_company": "A",
                    "to_company": "B",
                    "amount": "50",
                    "metadata": {"profit_component": "0"},
                }
            ],
        }
        out = self.engine.run(payload)
        self.assertEqual(out["consolidated_financials"]["metrics"]["revenue"], "180")

    def test_inventory_profit_elimination(self) -> None:
        """Unrealized inventory profit should be eliminated."""
        payload = {
            "root_company_id": "A",
            "companies": [
                {"company_id": "A", "name": "A", "period": "2025", "metrics": base_metrics("100", net_profit="40"), "investments": {"B": "60"}},
                {"company_id": "B", "name": "B", "period": "2025", "metrics": base_metrics("100", net_profit="20")},
            ],
            "ownership_links": [{"parent_id": "A", "child_id": "B", "ownership_pct": "0.6"}],
            "intercompany_transactions": [
                {
                    "tx_id": "t2",
                    "tx_type": "inventory_profit",
                    "from_company": "A",
                    "to_company": "B",
                    "amount": "0",
                    "metadata": {"sale_profit": "30", "unsold_ratio": "0.40"},
                }
            ],
        }
        out = self.engine.run(payload)
        self.assertEqual(out["consolidated_financials"]["metrics"]["inventories"], "68.00")

    def test_receivable_payable_mismatch_warning(self) -> None:
        """Mismatch amounts should create warning instead of fail."""
        payload = {
            "root_company_id": "A",
            "companies": [
                {"company_id": "A", "name": "A", "period": "2025", "metrics": base_metrics("100"), "investments": {"B": "60"}},
                {"company_id": "B", "name": "B", "period": "2025", "metrics": base_metrics("80")},
            ],
            "ownership_links": [{"parent_id": "A", "child_id": "B", "ownership_pct": "0.6"}],
            "intercompany_transactions": [
                {
                    "tx_id": "t3",
                    "tx_type": "receivable_payable",
                    "from_company": "A",
                    "to_company": "B",
                    "amount": "100",
                    "metadata": {"counterparty_amount": "90"},
                }
            ],
        }
        out = self.engine.run(payload)
        self.assertTrue(any("mismatch" in w.lower() for w in out["warnings"]))


if __name__ == "__main__":
    unittest.main()
