"""Data models for consolidation engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional


def to_decimal(value: Any, default: str = "0") -> Decimal:
    """Safely convert value to Decimal."""
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def decimal_dict(data: Dict[str, Any]) -> Dict[str, Decimal]:
    """Convert all dict values to Decimal."""
    return {key: to_decimal(value) for key, value in data.items()}


def to_jsonable(value: Any) -> Any:
    """Convert Decimal-rich structures to JSON-serializable structures."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    if hasattr(value, "to_dict"):
        return to_jsonable(value.to_dict())
    return value


class ScopeClassification(str, Enum):
    """Consolidation scope classification."""

    FULL = "full_consolidation"
    EQUITY = "equity_method"
    FINANCIAL_ASSET = "financial_asset"


class TransactionType(str, Enum):
    """Supported intercompany transaction types."""

    RECEIVABLE_PAYABLE = "receivable_payable"
    SALE_PURCHASE = "sale_purchase"
    INTEREST = "interest"
    DIVIDEND = "dividend"
    INVENTORY_PROFIT = "inventory_profit"
    FIXED_ASSET_SALE = "fixed_asset_sale"


@dataclass
class AuditLogEntry:
    """Represents a single audit log entry."""

    stage: str
    level: str
    message: str
    context: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "stage": self.stage,
            "level": self.level,
            "message": self.message,
            "context": to_jsonable(self.context),
        }


@dataclass
class CompanyFinancials:
    """Financial data for a single company and period."""

    company_id: str
    name: str
    period: str
    currency: str = "TRY"
    metrics: Dict[str, Decimal] = field(default_factory=dict)
    investments: Dict[str, Decimal] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "CompanyFinancials":
        """Create CompanyFinancials from raw payload."""
        return cls(
            company_id=payload["company_id"],
            name=payload.get("name", payload["company_id"]),
            period=payload.get("period", ""),
            currency=payload.get("currency", "TRY"),
            metrics=decimal_dict(payload.get("metrics", {})),
            investments=decimal_dict(payload.get("investments", {})),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize financials to dictionary."""
        return {
            "company_id": self.company_id,
            "name": self.name,
            "period": self.period,
            "currency": self.currency,
            "metrics": to_jsonable(self.metrics),
            "investments": to_jsonable(self.investments),
        }


@dataclass
class OwnershipLink:
    """Represents ownership relation between two companies."""

    parent_id: str
    child_id: str
    ownership_pct: Decimal
    control_override: Optional[bool] = None
    significant_influence_override: Optional[bool] = None

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "OwnershipLink":
        """Create OwnershipLink from raw payload."""
        return cls(
            parent_id=payload["parent_id"],
            child_id=payload["child_id"],
            ownership_pct=to_decimal(payload.get("ownership_pct", "0")),
            control_override=payload.get("control_override"),
            significant_influence_override=payload.get("significant_influence_override"),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize ownership link to dictionary."""
        return {
            "parent_id": self.parent_id,
            "child_id": self.child_id,
            "ownership_pct": str(self.ownership_pct),
            "control_override": self.control_override,
            "significant_influence_override": self.significant_influence_override,
        }


@dataclass
class IntercompanyTransaction:
    """Represents one intercompany transaction for elimination."""

    tx_id: str
    tx_type: TransactionType
    from_company: str
    to_company: str
    amount: Decimal
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "IntercompanyTransaction":
        """Create intercompany transaction from raw payload."""
        return cls(
            tx_id=payload["tx_id"],
            tx_type=TransactionType(payload["tx_type"]),
            from_company=payload["from_company"],
            to_company=payload["to_company"],
            amount=to_decimal(payload.get("amount", "0")),
            metadata=payload.get("metadata", {}),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize transaction to dictionary."""
        return {
            "tx_id": self.tx_id,
            "tx_type": self.tx_type.value,
            "from_company": self.from_company,
            "to_company": self.to_company,
            "amount": str(self.amount),
            "metadata": to_jsonable(self.metadata),
        }


@dataclass
class ConsolidationScopeItem:
    """Scope decision for one company."""

    company_id: str
    parent_id: str
    effective_ownership_pct: Decimal
    classification: ScopeClassification
    reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize scope item to dictionary."""
        return {
            "company_id": self.company_id,
            "parent_id": self.parent_id,
            "effective_ownership_pct": str(self.effective_ownership_pct),
            "classification": self.classification.value,
            "reasons": self.reasons,
        }


@dataclass
class ConsolidationResult:
    """Final result payload."""

    standalone_financials: Dict[str, Any]
    consolidated_financials: Dict[str, Any]
    scope_classification: List[Dict[str, Any]]
    effective_ownership_map: Dict[str, Any]
    elimination_logs: List[Dict[str, Any]]
    minority_interest_outputs: Dict[str, Any]
    score_engine_input: Dict[str, Any]
    standalone_score: int
    consolidated_score: int
    score_delta: int
    drivers: List[Dict[str, Any]]
    consolidation_impact_summary: Dict[str, Any]
    report_text_block: str
    warnings: List[str]
    audit_log: List[Dict[str, Any]]

    def to_dict(self) -> Dict[str, Any]:
        """Serialize full result to dictionary."""
        return to_jsonable(
            {
                "standalone_financials": self.standalone_financials,
                "consolidated_financials": self.consolidated_financials,
                "scope_classification": self.scope_classification,
                "effective_ownership_map": self.effective_ownership_map,
                "elimination_logs": self.elimination_logs,
                "minority_interest_outputs": self.minority_interest_outputs,
                "score_engine_input": self.score_engine_input,
                "standalone_score": self.standalone_score,
                "consolidated_score": self.consolidated_score,
                "score_delta": self.score_delta,
                "drivers": self.drivers,
                "consolidation_impact_summary": self.consolidation_impact_summary,
                "report_text_block": self.report_text_block,
                "warnings": self.warnings,
                "audit_log": self.audit_log,
            }
        )
