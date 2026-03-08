from typing import Any


class HyperArbitrageError(Exception):
    """Base exception for all HyperArbitrage errors."""

    error_code: str = "HA-1000"
    severity: str = "ERROR"
    recommended_action: str = "escalate"

    def __init__(
        self,
        message: str,
        context: dict[str, Any] | None = None,
        severity: str | None = None,
        recommended_action: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.context = context or {}
        if severity is not None:
            self.severity = severity
        if recommended_action is not None:
            self.recommended_action = recommended_action

    def to_dict(self) -> dict[str, Any]:
        return {
            "error_code": self.error_code,
            "message": self.message,
            "severity": self.severity,
            "recommended_action": self.recommended_action,
            "context": self.context,
        }

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"error_code={self.error_code!r}, "
            f"message={self.message!r}, "
            f"severity={self.severity!r})"
        )


class ConnectionError(HyperArbitrageError):
    """Raised when a connection to an external service fails."""

    error_code = "HA-1001"
    severity = "WARNING"
    recommended_action = "retry_with_backoff"


class OrderExecutionError(HyperArbitrageError):
    """Raised when an order fails to execute on the exchange."""

    error_code = "HA-1002"
    severity = "ERROR"
    recommended_action = "retry_then_cancel"


class OneLegError(HyperArbitrageError):
    """Raised when only one leg of the arbitrage pair fills, creating exposure."""

    error_code = "HA-1003"
    severity = "CRITICAL"
    recommended_action = "emergency_close_and_alert"


class InsufficientEdgeError(HyperArbitrageError):
    """Raised when the spread edge is below the minimum threshold."""

    error_code = "HA-1004"
    severity = "INFO"
    recommended_action = "skip_and_wait"


class FundingBlockedError(HyperArbitrageError):
    """Raised when funding rate exceeds the configured threshold."""

    error_code = "HA-1005"
    severity = "WARNING"
    recommended_action = "pause_until_funding_normalizes"


class SlippageExceededError(HyperArbitrageError):
    """Raised when actual slippage exceeds the configured maximum."""

    error_code = "HA-1006"
    severity = "WARNING"
    recommended_action = "widen_ticks_or_reduce_size"
