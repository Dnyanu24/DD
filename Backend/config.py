import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent


class Config:
    APP_NAME = os.getenv("APP_NAME", "SMART DATA ANALYSIS SYSTEM")
    ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = os.getenv("FLASK_DEBUG", "1") == "1"
    SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-key")
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(BASE_DIR / 'data.db').as_posix()}")
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", str(BASE_DIR / "app" / "uploads"))
    REPORT_FOLDER = os.getenv("REPORT_FOLDER", str(BASE_DIR / "app" / "reports"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(150 * 1024 * 1024)))
    JSON_SORT_KEYS = False


class DevelopmentConfig(Config):
    DEBUG = True


class TestingConfig(Config):
    TESTING = True
    DATABASE_URL = "sqlite:///:memory:"


class ProductionConfig(Config):
    DEBUG = False


CONFIG_BY_NAME = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config():
    env_name = os.getenv("FLASK_ENV", "development").lower()
    return CONFIG_BY_NAME.get(env_name, DevelopmentConfig)
