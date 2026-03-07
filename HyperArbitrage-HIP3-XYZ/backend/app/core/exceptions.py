from typing import Any


class HyperArbitrageError(Exception):
    error_code: str = "HA_GENERIC"
    severity: str = "ERROR"
    recommended_action: str = "escalate"

    def __init__(self, message: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.context = context or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "error_code": self.error_code,
            "message": self.message,
            "severity": self.severity,
            "recommended_action": self.recommended_action,
            "context": self.context,
        }


class ConnectionError(HyperArbitrageError):
    error_code = "HA_CONN"
    severity = "WARNING"
    recommended_action = "retry"


class OrderExecutionError(HyperArbitrageError):
    error_code = "HA_ORDER"
    severity = "ERROR"
    recommended_action = "retry"


class OneLegError(HyperArbitrageError):
    error_code = "HA_ONELEG"
    severity = "CRITICAL"
    recommended_action = "alert"


class InsufficientEdgeError(HyperArbitrageError):
    error_code = "HA_EDGE"
    severity = "INFO"
    recommended_action = "ignore"


class FundingBlockedError(HyperArbitrageError):
    error_code = "HA_FUNDING"
    severity = "WARNING"
    recommended_action = "ignore"


class SlippageExceededError(HyperArbitrageError):
    error_code = "HA_SLIPPAGE"
    severity = "WARNING"
    recommended_action = "retry"
