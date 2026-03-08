from pathlib import Path
from typing import Literal, Optional

from pydantic import computed_field, field_validator, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Core ──
    APP_ENV: Literal["development", "production"] = "production"
    APP_SECRET_KEY: str
    MASTER_ENCRYPTION_KEY: str

    # ── JWT ──
    JWT_PRIVATE_KEY_PATH: Path
    JWT_PUBLIC_KEY_PATH: Path

    # ── Postgres ──
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "hyperarbitrage"
    POSTGRES_USER: str = "hyperarb"
    POSTGRES_PASSWORD: str
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # ── Redis ──
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""
    REDIS_URL: str = ""

    # ── Hyperliquid ──
    HL_MAINNET: bool = True
    HL_WS_URL: str = "wss://api.hyperliquid.xyz/ws"
    HL_HTTP_URL: str = "https://api.hyperliquid.xyz"

    # ── Pair names ──
    PAIR_XYZ: str = "XYZ"
    PAIR_CASH: str = "CASH"
    PAIR_KM: str = "KM"
    PAIR_FLX: str = "FLX"

    # ── Bot defaults ──
    DEFAULT_PERCENTILE: float = 0.75
    DEFAULT_TIMEFRAME_HOURS: int = 6
    DEFAULT_PROFIT_MARGIN_BPS: float = 5.0
    DEFAULT_MAX_SLIPPAGE_TICKS: int = 2
    DEFAULT_MAX_POSITION_SIZE: float = 1000.0
    DEFAULT_FUNDING_THRESHOLD: float = 0.5
    ONE_LEG_TIMEOUT_MS: int = 500
    ORDER_RETRY_COUNT: int = 3

    # ── Bot 1 credentials ──
    BOT_1_ACCOUNT_ADDRESS: Optional[str] = None
    BOT_1_API_KEY: Optional[str] = None
    BOT_1_SUB_ACCOUNT: Optional[str] = None

    # ── Bot 2 credentials ──
    BOT_2_ACCOUNT_ADDRESS: Optional[str] = None
    BOT_2_API_KEY: Optional[str] = None
    BOT_2_SUB_ACCOUNT: Optional[str] = None

    # ── Bot 3 credentials ──
    BOT_3_ACCOUNT_ADDRESS: Optional[str] = None
    BOT_3_API_KEY: Optional[str] = None
    BOT_3_SUB_ACCOUNT: Optional[str] = None

    # ── Bot 4 credentials ──
    BOT_4_ACCOUNT_ADDRESS: Optional[str] = None
    BOT_4_API_KEY: Optional[str] = None
    BOT_4_SUB_ACCOUNT: Optional[str] = None

    # ── Bot 5 credentials ──
    BOT_5_ACCOUNT_ADDRESS: Optional[str] = None
    BOT_5_API_KEY: Optional[str] = None
    BOT_5_SUB_ACCOUNT: Optional[str] = None

    # ── Bot 6 credentials ──
    BOT_6_ACCOUNT_ADDRESS: Optional[str] = None
    BOT_6_API_KEY: Optional[str] = None
    BOT_6_SUB_ACCOUNT: Optional[str] = None

    # ── Telegram ──
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    TELEGRAM_ALERT_LEVEL: str = "ERROR"

    # ── Frontend ──
    NEXT_PUBLIC_API_URL: str = ""
    NEXT_PUBLIC_WS_URL: str = ""
    NEXT_PUBLIC_APP_NAME: str = "HyperArbitrage HIP-3"

    # ── Prometheus ──
    PROMETHEUS_ENABLED: bool = False
    PROMETHEUS_PORT: int = 9090

    # ── Logging ──
    LOG_LEVEL: str = "INFO"
    LOG_FILE_PATH: str = "/var/log/hyperarbitrage/app.log"
    LOG_MAX_SIZE_MB: int = 100
    LOG_BACKUP_COUNT: int = 7

    # ── Domain / SSL ──
    DOMAIN: str = "localhost"
    SSL_EMAIL: str = ""

    @field_validator("DEFAULT_PERCENTILE")
    @classmethod
    def validate_percentile(cls, v: float) -> float:
        if not 0.5 <= v <= 0.95:
            raise ValueError("percentile must be in [0.5, 0.95]")
        return v

    @field_validator("DEFAULT_MAX_SLIPPAGE_TICKS")
    @classmethod
    def validate_slippage_ticks(cls, v: int) -> int:
        if not 1 <= v <= 10:
            raise ValueError("max_slippage_ticks must be in [1, 10]")
        return v

    @model_validator(mode="after")
    def validate_required_secrets(self) -> "Settings":
        if not self.APP_SECRET_KEY:
            raise ValueError("APP_SECRET_KEY is required and must not be empty")
        if not self.MASTER_ENCRYPTION_KEY:
            raise ValueError("MASTER_ENCRYPTION_KEY is required and must not be empty")
        if not self.POSTGRES_PASSWORD:
            raise ValueError("POSTGRES_PASSWORD is required and must not be empty")
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL is required and must not be empty")
        return self

    @computed_field
    @property
    def redis_url(self) -> str:
        if self.REDIS_URL:
            return self.REDIS_URL
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @computed_field
    @property
    def base_url(self) -> str:
        if self.HL_MAINNET:
            return "https://api.hyperliquid.xyz"
        return "https://api.hyperliquid-testnet.xyz"

    def get_bot_credentials(self, bot_number: int) -> dict:
        if not 1 <= bot_number <= 6:
            raise ValueError(f"bot_number must be 1-6, got {bot_number}")
        return {
            "account_address": getattr(self, f"BOT_{bot_number}_ACCOUNT_ADDRESS"),
            "api_key": getattr(self, f"BOT_{bot_number}_API_KEY"),
            "sub_account": getattr(self, f"BOT_{bot_number}_SUB_ACCOUNT"),
        }

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()
