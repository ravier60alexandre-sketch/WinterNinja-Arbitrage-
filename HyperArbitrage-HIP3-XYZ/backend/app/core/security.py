from datetime import UTC, datetime, timedelta

from cryptography.fernet import Fernet
from jose import jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _get_fernet(master_key: str) -> Fernet:
    return Fernet(master_key.encode())


def encrypt_api_key(key: str, master_key: str | None = None) -> str:
    mk = master_key or settings.MASTER_ENCRYPTION_KEY
    fernet = _get_fernet(mk)
    return fernet.encrypt(key.encode()).decode()


def decrypt_api_key(encrypted: str, master_key: str | None = None) -> str:
    mk = master_key or settings.MASTER_ENCRYPTION_KEY
    fernet = _get_fernet(mk)
    return fernet.decrypt(encrypted.encode()).decode()


def _read_key(path: str) -> str:
    with open(path, "r") as f:
        return f.read()


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(UTC) + (expires_delta or timedelta(hours=24))
    payload = {"sub": subject, "exp": expire, "iat": datetime.now(UTC), "type": "access"}
    private_key = _read_key(str(settings.JWT_PRIVATE_KEY_PATH))
    return jwt.encode(payload, private_key, algorithm="RS256")


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(UTC) + timedelta(days=7)
    payload = {"sub": subject, "exp": expire, "iat": datetime.now(UTC), "type": "refresh"}
    private_key = _read_key(str(settings.JWT_PRIVATE_KEY_PATH))
    return jwt.encode(payload, private_key, algorithm="RS256")


def verify_token(token: str) -> dict:
    public_key = _read_key(str(settings.JWT_PUBLIC_KEY_PATH))
    return jwt.decode(token, public_key, algorithms=["RS256"])


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
