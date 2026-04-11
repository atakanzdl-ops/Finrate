"""Ownership graph calculations."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Dict, List, Set, Tuple

from .models import AuditLogEntry, OwnershipLink


class OwnershipEngine:
    """Computes effective ownership percentages with cycle-safe traversal."""

    def __init__(self, links: List[OwnershipLink], max_depth: int = 10) -> None:
        """Initialize ownership engine with edge uniqueness and depth guard."""
        self.links = links
        self.max_depth = max_depth
        self.graph: Dict[str, List[OwnershipLink]] = defaultdict(list)
        for link in links:
            self.graph[link.parent_id].append(link)

    def compute_effective_ownership(
        self, root_company_id: str
    ) -> Tuple[Dict[str, Decimal], Dict[str, List[Dict[str, str]]], List[AuditLogEntry]]:
        """Compute effective ownership from root to all reachable entities."""
        ownership: Dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        path_details: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        audit: List[AuditLogEntry] = []

        def dfs(
            current: str,
            running_pct: Decimal,
            path: List[str],
            visited: Set[str],
            depth: int,
        ) -> None:
            if depth > self.max_depth:
                audit.append(
                    AuditLogEntry(
                        stage="ownership",
                        level="WARNING",
                        message="Max recursion depth reached, traversal stopped.",
                        context={"path": path, "max_depth": self.max_depth},
                    )
                )
                return

            for link in self.graph.get(current, []):
                if link.child_id in visited:
                    audit.append(
                        AuditLogEntry(
                            stage="ownership",
                            level="WARNING",
                            message="Cycle detected and skipped.",
                            context={"path": path + [link.child_id]},
                        )
                    )
                    continue

                contribution = running_pct * link.ownership_pct
                ownership[link.child_id] += contribution
                path_details[link.child_id].append(
                    {
                        "path": " -> ".join(path + [link.child_id]),
                        "contribution": str(contribution),
                    }
                )
                dfs(
                    link.child_id,
                    contribution,
                    path + [link.child_id],
                    visited | {link.child_id},
                    depth + 1,
                )

        dfs(root_company_id, Decimal("1"), [root_company_id], {root_company_id}, 1)
        return dict(ownership), dict(path_details), audit

    def direct_ownership_map(self, root_company_id: str) -> Dict[str, Decimal]:
        """Aggregate direct ownership percentages from root."""
        direct: Dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        for link in self.links:
            if link.parent_id == root_company_id:
                direct[link.child_id] += link.ownership_pct
        return dict(direct)
