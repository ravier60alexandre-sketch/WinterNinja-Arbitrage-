from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_ENV: Literal["development", "production"] = "production"
    APP_SECRET_KEY: str
    MASTER_ENCRYPTION_KEY: str

    JWT_PRIVATE_KEY_PATH: Path
    JWT_PUBLIC_KEY_PATH: Path

    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "hyperarbitrage"
    POSTGRES_USER: str = "hyperarb"
    POSTGRES_PASSWORD: str
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    REDIS_URL: str
    REDIS_PASSWORD: str

    HL_MAINNET: bool = True
    HL_WS_URL: str = "wss://api.hyperliquid.xyz/ws"
    HL_HTTP_URL: str = "https://api.hyperliquid.xyz"

    PAIR_XYZ: str = "XYZ"
    PAIR_CASH: str = "CASH"
    PAIR_KM: str = "KM"
    PAIR_FLX: str = "FLX"

    DEFAULT_PERCENTILE: float = 0.75
    DEFAULT_TIMEFRAME_HOURS: int = 6
    DEFAULT_PROFIT_MARGIN_BPS: float = 5.0
    DEFAULT_MAX_SLIPPAGE_TICKS: int = 2
    DEFAULT_MAX_POSITION_SIZE: float = 1000.0
    DEFAULT_FUNDING_THRESHOLD: float = 0.5
    ONE_LEG_TIMEOUT_MS: int = 500
    ORDER_RETRY_COUNT: int = 3

    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    TELEGRAM_ALERT_LEVEL: str = "ERROR"

    NEXT_PUBLIC_API_URL: str = ""
    NEXT_PUBLIC_WS_URL: str = ""
    NEXT_PUBLIC_APP_NAME: str = "HyperArbitrage HIP-3"

    PROMETHEUS_ENABLED: bool = False
    PROMETHEUS_PORT: int = 9090

    LOG_LEVEL: str = "INFO"
    LOG_FILE_PATH: str = "/var/log/hyperarbitrage/app.log"
    LOG_MAX_SIZE_MB: int = 100
    LOG_BACKUP_COUNT: int = 7

    DOMAIN: str = "localhost"
    SSL_EMAIL: str = ""

    # Bot credentials (1-6)
    BOT_1_ACCOUNT_ADDRESS: str = ""
    BOT_1_API_KEY: str = ""
    BOT_1_SUB_ACCOUNT: str = ""
    BOT_2_ACCOUNT_ADDRESS: str = ""
    BOT_2_API_KEY: str = ""
    BOT_2_SUB_ACCOUNT: str = ""
    BOT_3_ACCOUNT_ADDRESS: str = ""
    BOT_3_API_KEY: str = ""
    BOT_3_SUB_ACCOUNT: str = ""
    BOT_4_ACCOUNT_ADDRESS: str = ""
    BOT_4_API_KEY: str = ""
    BOT_4_SUB_ACCOUNT: str = ""
    BOT_5_ACCOUNT_ADDRESS: str = ""
    BOT_5_API_KEY: str = ""
    BOT_5_SUB_ACCOUNT: str = ""
    BOT_6_ACCOUNT_ADDRESS: str = ""
    BOT_6_API_KEY: str = ""
    BOT_6_SUB_ACCOUNT: str = ""

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

    def get_bot_credentials(self, bot_number: int) -> dict:
        return {
            "account_address": getattr(self, f"BOT_{bot_number}_ACCOUNT_ADDRESS"),
            "api_key": getattr(self, f"BOT_{bot_number}_API_KEY"),
            "sub_account": getattr(self, f"BOT_{bot_number}_SUB_ACCOUNT"),
        }

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": True}


settings = Settings()
