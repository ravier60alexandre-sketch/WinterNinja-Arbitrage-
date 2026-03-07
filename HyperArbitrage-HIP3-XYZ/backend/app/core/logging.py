import logging
import logging.handlers
from pathlib import Path

import structlog

from app.config import settings

SECRET_FIELDS = frozenset({
    "api_key", "api_key_encrypted", "private_key", "secret",
    "password", "token", "MASTER_ENCRYPTION_KEY", "APP_SECRET_KEY",
})


def redact_secrets(_logger: str, _method: str, event_dict: dict) -> dict:
    for key in list(event_dict.keys()):
        if key.lower() in SECRET_FIELDS or any(s in key.lower() for s in ("api_key", "private_key", "secret", "password")):
            event_dict[key] = "***REDACTED***"
    return event_dict


def setup_logging() -> None:
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    log_path = Path(settings.LOG_FILE_PATH)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    file_handler = logging.handlers.RotatingFileHandler(
        filename=str(log_path),
        maxBytes=settings.LOG_MAX_SIZE_MB * 1024 * 1024,
        backupCount=settings.LOG_BACKUP_COUNT,
        encoding="utf-8",
    )

    logging.basicConfig(
        format="%(message)s",
        level=log_level,
        handlers=[logging.StreamHandler(), file_handler],
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            redact_secrets,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
