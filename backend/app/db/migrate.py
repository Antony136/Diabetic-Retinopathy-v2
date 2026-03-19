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
            if dialect == "postgresql":
                conn.execute(text("SET statement_timeout TO 0"))
            conn.execute(text(ddl))

    # users.role was added after the table may already exist.
    if _has_column(engine, "users", "id") and not _has_column(engine, "users", "role"):
        if dialect == "postgresql":
            ddl = "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'doctor'"
        else:
            ddl = "ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'doctor'"
        with engine.begin() as conn:
            if dialect == "postgresql":
                conn.execute(text("SET statement_timeout TO 0"))
            conn.execute(text(ddl))

    # user_preferences: triage settings columns
    if _has_column(engine, "user_preferences", "user_id"):
        migrations: list[str] = []
        if not _has_column(engine, "user_preferences", "follow_up_days_moderate"):
            migrations.append("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS follow_up_days_moderate INTEGER NOT NULL DEFAULT 14")
        if not _has_column(engine, "user_preferences", "urgent_review_hours"):
            migrations.append("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS urgent_review_hours INTEGER NOT NULL DEFAULT 24")
        if not _has_column(engine, "user_preferences", "min_confidence_threshold"):
            migrations.append("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS min_confidence_threshold FLOAT NOT NULL DEFAULT 0.85")

        if migrations:
            with engine.begin() as conn:
                if dialect == "postgresql":
                    conn.execute(text("SET statement_timeout TO 0"))
                for ddl in migrations:
                    if dialect != "postgresql":
                        ddl = ddl.replace(" IF NOT EXISTS", "")
                    conn.execute(text(ddl))
