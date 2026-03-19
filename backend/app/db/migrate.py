from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _has_column(engine: Engine, table: str, column: str) -> bool:
    insp = inspect(engine)
    try:
        cols = insp.get_columns(table)
    except Exception:
        return False
    return any(c.get("name") == column for c in cols)


def run_migrations(engine: Engine):
    """
    Lightweight schema migrations for environments without Alembic.
    Only applies additive, backward-compatible changes.
    """
    dialect = engine.dialect.name

    # user_profiles.avatar_url was added after the table may already exist.
    if _has_column(engine, "user_profiles", "user_id") and not _has_column(engine, "user_profiles", "avatar_url"):
        if dialect == "postgresql":
            ddl = "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url VARCHAR NOT NULL DEFAULT ''"
        else:
            # SQLite doesn't support IF NOT EXISTS on ADD COLUMN in all versions;
            # in local dev, table is usually new. Best-effort attempt:
            ddl = "ALTER TABLE user_profiles ADD COLUMN avatar_url VARCHAR NOT NULL DEFAULT ''"
        with engine.begin() as conn:
            conn.execute(text(ddl))

