"""Intercompany elimination engine."""

from __future__ import annotations

from decimal import Decimal
from typing import Dict, List, Tuple

from .models import AuditLogEntry, IntercompanyTransaction, TransactionType, to_decimal


class EliminationEngine:
    """Applies transaction-level elimination rules."""

    def apply(
        self,
        consolidated_metrics: Dict[str, Decimal],
        transactions: List[IntercompanyTransaction],
    ) -> Tuple[Dict[str, Decimal], List[Dict[str, str]], List[AuditLogEntry], List[str]]:
        """Apply elimination rules and return updated metrics and logs."""
        metrics = dict(consolidated_metrics)
        logs: List[Dict[str, str]] = []
        audit: List[AuditLogEntry] = []
        warnings: List[str] = []

        for tx in transactions:
            net_profit_adjusted = False

            if tx.tx_type == TransactionType.RECEIVABLE_PAYABLE:
                metrics["trade_receivables"] = metrics.get("trade_receivables", Decimal("0")) - tx.amount
                metrics["trade_payables"] = metrics.get("trade_payables", Decimal("0")) - tx.amount
                counterparty_amount = to_decimal(tx.metadata.get("counterparty_amount", tx.amount))
                if counterparty_amount != tx.amount:
                    warnings.append(
                        f"Receivable/payable mismatch in {tx.tx_id}: {tx.amount} vs {counterparty_amount}."
                    )
                    audit.append(
                        AuditLogEntry(
                            stage="elimination",
                            level="WARNING",
                            message="Receivable/payable mismatch warning.",
                            context={"tx_id": tx.tx_id},
                        )
                    )

            elif tx.tx_type == TransactionType.SALE_PURCHASE:
                metrics["revenue"] = metrics.get("revenue", Decimal("0")) - tx.amount
                if "profit_component" in tx.metadata:
                    internal_profit = to_decimal(tx.metadata.get("profit_component"))
                elif "cogs" in tx.metadata:
                    internal_profit = tx.amount - to_decimal(tx.metadata.get("cogs"))
                else:
                    internal_profit = tx.amount
                    warnings.append(
                        f"Sale/purchase {tx.tx_id}: COGS/profit_component missing, conservative "
                        "net profit elimination applied using full amount."
                    )
                metrics["gross_profit"] = metrics.get("gross_profit", Decimal("0")) - internal_profit
                metrics["ebitda"] = metrics.get("ebitda", Decimal("0")) - internal_profit
                metrics["ebit"] = metrics.get("ebit", Decimal("0")) - internal_profit
                metrics["net_profit"] = metrics.get("net_profit", Decimal("0")) - internal_profit
                net_profit_adjusted = True

            elif tx.tx_type == TransactionType.INTEREST:
                metrics["finance_expense"] = metrics.get("finance_expense", Decimal("0")) - tx.amount

            elif tx.tx_type == TransactionType.DIVIDEND:
                metrics["net_profit"] = metrics.get("net_profit", Decimal("0")) - tx.amount
                net_profit_adjusted = True

            elif tx.tx_type == TransactionType.INVENTORY_PROFIT:
                unrealized_profit = to_decimal(tx.metadata.get("unrealized_profit"))
                if unrealized_profit == Decimal("0"):
                    sale_profit = to_decimal(tx.metadata.get("sale_profit", "0"))
                    unsold_ratio = to_decimal(tx.metadata.get("unsold_ratio", "0"))
                    unrealized_profit = sale_profit * unsold_ratio

                metrics["inventories"] = metrics.get("inventories", Decimal("0")) - unrealized_profit
                metrics["gross_profit"] = metrics.get("gross_profit", Decimal("0")) - unrealized_profit
                metrics["ebitda"] = metrics.get("ebitda", Decimal("0")) - unrealized_profit
                metrics["ebit"] = metrics.get("ebit", Decimal("0")) - unrealized_profit
                metrics["net_profit"] = metrics.get("net_profit", Decimal("0")) - unrealized_profit
                net_profit_adjusted = True

            elif tx.tx_type == TransactionType.FIXED_ASSET_SALE:
                gain = to_decimal(tx.metadata.get("gain", tx.amount))
                excess_depreciation = to_decimal(tx.metadata.get("excess_depreciation", "0"))
                net_effect = gain - excess_depreciation
                metrics["ebit"] = metrics.get("ebit", Decimal("0")) - net_effect
                metrics["net_profit"] = metrics.get("net_profit", Decimal("0")) - net_effect
                net_profit_adjusted = True

            logs.append(
                {
                    "tx_id": tx.tx_id,
                    "type": tx.tx_type.value,
                    "amount": str(tx.amount),
                    "from_company": tx.from_company,
                    "to_company": tx.to_company,
                }
            )
            audit.append(
                AuditLogEntry(
                    stage="elimination",
                    level="INFO",
                    message="Applied intercompany elimination.",
                    context={
                        "tx_id": tx.tx_id,
                        "tx_type": tx.tx_type.value,
                        "net_profit_adjusted": net_profit_adjusted,
                    },
                )
            )

        return metrics, logs, audit, warnings
