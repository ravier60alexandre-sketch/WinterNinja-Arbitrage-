import gzip
import logging
import logging.handlers
import os
import shutil
from pathlib import Path

import structlog

from app.config import settings

SECRET_FIELDS = frozenset({
    "api_key", "api_key_encrypted", "private_key", "secret",
    "password", "token", "master_encryption_key", "app_secret_key",
})


def redact_secrets(_logger: str, _method: str, event_dict: dict) -> dict:
    for key in list(event_dict.keys()):
        if key.lower() in SECRET_FIELDS or any(s in key.lower() for s in ("api_key", "private_key", "secret", "password", "token")):
            event_dict[key] = "***REDACTED***"
    return event_dict


def _namer(name: str) -> str:
    return name + ".gz"


def _rotator(source: str, dest: str) -> None:
    with open(source, "rb") as f_in:
        with gzip.open(dest, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
    os.remove(source)


_current_log_level: int = logging.INFO


def set_log_level(level: str) -> None:
    global _current_log_level
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    _current_log_level = numeric_level
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    for handler in root_logger.handlers:
        handler.setLevel(numeric_level)


def setup_logging() -> None:
    global _current_log_level
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    _current_log_level = log_level

    log_path = Path(settings.LOG_FILE_PATH)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    file_handler = logging.handlers.RotatingFileHandler(
        filename=str(log_path),
        maxBytes=settings.LOG_MAX_SIZE_MB * 1024 * 1024,
        backupCount=settings.LOG_BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.rotator = _rotator
    file_handler.namer = _namer

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
