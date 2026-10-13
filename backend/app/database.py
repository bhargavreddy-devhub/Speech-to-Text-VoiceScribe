from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Column (name -> SQL type) added to the ORM models after the first release.
# Base.metadata.create_all() only creates missing *tables*, not new columns on
# tables that already exist, so on an existing SQLite DB we add them by hand.
# This is a pragmatic substitute for a real migration tool (e.g. Alembic) for
# a project this size.
_ADDITIVE_COLUMNS = {
    "users": {
        "name": "VARCHAR",
        "is_admin": "BOOLEAN DEFAULT 0",
        "preferred_language": "VARCHAR DEFAULT 'en'",
        "theme": "VARCHAR DEFAULT 'system'",
        "google_sub": "VARCHAR",
    },
    "transcripts": {
        "cancel_requested": "BOOLEAN DEFAULT 0",
        "retry_count": "INTEGER DEFAULT 0",
        "speakers_json": "TEXT DEFAULT '[]'",
        "is_favorite": "BOOLEAN DEFAULT 0",
        "folder": "VARCHAR",
        "tags_json": "TEXT DEFAULT '[]'",
    },
}


def run_migrations() -> None:
    """Best-effort additive migration for SQLite: add any column that the
    current models declare but the on-disk table doesn't have yet. No-op for
    non-SQLite backends (use a real migration tool like Alembic there)."""
    if not settings.database_url.startswith("sqlite"):
        return

    inspector = inspect(engine)
    with engine.begin() as conn:
        for table_name, columns in _ADDITIVE_COLUMNS.items():
            if table_name not in inspector.get_table_names():
                continue  # table doesn't exist yet; create_all() will make it with all columns
            existing = {c["name"] for c in inspector.get_columns(table_name)}
            for col_name, col_type in columns.items():
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
