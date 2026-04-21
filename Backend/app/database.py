import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import text

DEFAULT_SQLITE_PATH = Path(__file__).resolve().parents[1] / "data.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}")

# Determine if we're using SQLite or PostgreSQL
if DATABASE_URL.startswith("sqlite"):
    # SQLite requires check_same_thread=False
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # PostgreSQL and other databases don't need this argument
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _sqlite_table_columns(conn, table_name: str) -> set[str]:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    # PRAGMA table_info returns: (cid, name, type, notnull, dflt_value, pk)
    return {str(r[1]) for r in rows}


def run_sqlite_migrations() -> None:
    """
    Lightweight, idempotent migrations for SQLite.

    SQLAlchemy's `create_all()` does not ALTER existing tables, so when we add new
    columns to models we need to patch older dev DBs automatically.
    """
    if not str(engine.url).startswith("sqlite"):
        return

    with engine.begin() as conn:
        # user_profiles: older DBs may be missing created_at
        try:
            cols = _sqlite_table_columns(conn, "user_profiles")
        except Exception:
            cols = set()

        if cols and "created_at" not in cols:
            # Keep it nullable so existing rows don't break.
            conn.exec_driver_sql("ALTER TABLE user_profiles ADD COLUMN created_at DATETIME")
