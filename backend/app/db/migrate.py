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

    # users.is_active / users.created_at
    if _has_column(engine, "users", "id"):
        ddl_list: list[str] = []
        if not _has_column(engine, "users", "is_active"):
            ddl_list.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")
        if not _has_column(engine, "users", "created_at"):
            ddl_list.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
        if ddl_list:
            with engine.begin() as conn:
                if dialect == "postgresql":
                    conn.execute(text("SET statement_timeout TO 0"))
                for ddl in ddl_list:
                    if dialect != "postgresql":
                        ddl = ddl.replace(" IF NOT EXISTS", "")
                        ddl = ddl.replace("BOOLEAN", "INTEGER")
                        ddl = ddl.replace("TRUE", "1")
                        ddl = ddl.replace("TIMESTAMP", "DATETIME")
                        ddl = ddl.replace("CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP")
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

    # reports.filename was added to store original upload name
    if _has_column(engine, "reports", "id") and not _has_column(engine, "reports", "filename"):
        if dialect == "postgresql":
            ddl = "ALTER TABLE reports ADD COLUMN IF NOT EXISTS filename VARCHAR NULL"
        else:
            ddl = "ALTER TABLE reports ADD COLUMN filename VARCHAR"
        with engine.begin() as conn:
            if dialect == "postgresql":
                conn.execute(text("SET statement_timeout TO 0"))
            conn.execute(text(ddl))

    # Offline-first sync support: client_uuid + updated_at/source columns
    if _has_column(engine, "patients", "id"):
        ddl_list: list[str] = []
        if not _has_column(engine, "patients", "client_uuid"):
            ddl_list.append("ALTER TABLE patients ADD COLUMN IF NOT EXISTS client_uuid VARCHAR NULL")
        if not _has_column(engine, "patients", "updated_at"):
            ddl_list.append("ALTER TABLE patients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
        if ddl_list:
            with engine.begin() as conn:
                if dialect == "postgresql":
                    conn.execute(text("SET statement_timeout TO 0"))
                for ddl in ddl_list:
                    if dialect != "postgresql":
                        ddl = ddl.replace(" IF NOT EXISTS", "")
                        ddl = ddl.replace("TIMESTAMP", "DATETIME")
                    conn.execute(text(ddl))

    if _has_column(engine, "reports", "id"):
        ddl_list2: list[str] = []
        if not _has_column(engine, "reports", "client_uuid"):
            ddl_list2.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS client_uuid VARCHAR NULL")
        if not _has_column(engine, "reports", "updated_at"):
            ddl_list2.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
        if not _has_column(engine, "reports", "source"):
            ddl_list2.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS source VARCHAR NULL")
        # Explainable AI (image reasoning)
        if not _has_column(engine, "reports", "image_observations"):
            ddl_list2.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_observations TEXT NULL")
        if not _has_column(engine, "reports", "image_explanation"):
            ddl_list2.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_explanation TEXT NULL")
        if ddl_list2:
            with engine.begin() as conn:
                if dialect == "postgresql":
                    conn.execute(text("SET statement_timeout TO 0"))
                for ddl in ddl_list2:
                    if dialect != "postgresql":
                        ddl = ddl.replace(" IF NOT EXISTS", "")
                        ddl = ddl.replace("TIMESTAMP", "DATETIME")
                    conn.execute(text(ddl))

    # Adaptive Screening Mode columns (risk_score, risk_level, decision, mode, adaptive_explanation)
    if _has_column(engine, "reports", "id"):
        ddl_adaptive: list[str] = []
        if not _has_column(engine, "reports", "risk_score"):
            ddl_adaptive.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS risk_score FLOAT NULL")
        if not _has_column(engine, "reports", "risk_level"):
            ddl_adaptive.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS risk_level VARCHAR NULL")
        if not _has_column(engine, "reports", "decision"):
            ddl_adaptive.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS decision VARCHAR NULL")
        if not _has_column(engine, "reports", "mode"):
            ddl_adaptive.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS mode VARCHAR NULL")
        if not _has_column(engine, "reports", "adaptive_explanation"):
            ddl_adaptive.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS adaptive_explanation TEXT NULL")
        if not _has_column(engine, "reports", "override_applied"):
            ddl_adaptive.append("ALTER TABLE reports ADD COLUMN IF NOT EXISTS override_applied BOOLEAN DEFAULT FALSE")
        
        if ddl_adaptive:
            with engine.begin() as conn:
                if dialect == "postgresql":
                    conn.execute(text("SET statement_timeout TO 0"))
                for ddl in ddl_adaptive:
                    if dialect != "postgresql":
                        ddl = ddl.replace(" IF NOT EXISTS", "")
                        ddl = ddl.replace("BOOLEAN", "INTEGER")
                        ddl = ddl.replace("FALSE", "0")
                    conn.execute(text(ddl))

    # image_cache table may not exist in older environments (desktop/offline feature)
    # Create table only when missing (safe for both SQLite/Postgres).
    insp = inspect(engine)
    try:
        existing_tables = set(insp.get_table_names())
    except Exception:
        existing_tables = set()

    if "image_cache" not in existing_tables:
        if dialect == "postgresql":
            ddl = """
            CREATE TABLE IF NOT EXISTS image_cache (
                id SERIAL PRIMARY KEY,
                doctor_id INTEGER NOT NULL REFERENCES users(id),
                remote_url VARCHAR NOT NULL,
                local_url VARCHAR NOT NULL,
                content_type VARCHAR NULL,
                etag VARCHAR NULL,
                last_modified VARCHAR NULL,
                byte_size INTEGER NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_accessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_image_cache_doctor_remote UNIQUE (doctor_id, remote_url)
            )
            """
            idx = "CREATE INDEX IF NOT EXISTS ix_image_cache_doctor_id ON image_cache (doctor_id)"
        else:
            ddl = """
            CREATE TABLE IF NOT EXISTS image_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doctor_id INTEGER NOT NULL,
                remote_url TEXT NOT NULL,
                local_url TEXT NOT NULL,
                content_type TEXT NULL,
                etag TEXT NULL,
                last_modified TEXT NULL,
                byte_size INTEGER NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(doctor_id, remote_url)
            )
            """
            idx = "CREATE INDEX IF NOT EXISTS ix_image_cache_doctor_id ON image_cache (doctor_id)"

        with engine.begin() as conn:
            if dialect == "postgresql":
                conn.execute(text("SET statement_timeout TO 0"))
            conn.execute(text(ddl))
            conn.execute(text(idx))
    else:
        # Add missing columns for older desktop DBs (backward-compatible).
        def _add_col(table: str, col: str, ddl_pg: str, ddl_sqlite: str):
            if _has_column(engine, table, col):
                return
            ddl = ddl_pg if dialect == "postgresql" else ddl_sqlite
            with engine.begin() as conn:
                if dialect == "postgresql":
                    conn.execute(text("SET statement_timeout TO 0"))
                conn.execute(text(ddl))

        _add_col(
            "image_cache",
            "content_type",
            "ALTER TABLE image_cache ADD COLUMN IF NOT EXISTS content_type VARCHAR NULL",
            "ALTER TABLE image_cache ADD COLUMN content_type TEXT",
        )
        _add_col(
            "image_cache",
            "etag",
            "ALTER TABLE image_cache ADD COLUMN IF NOT EXISTS etag VARCHAR NULL",
            "ALTER TABLE image_cache ADD COLUMN etag TEXT",
        )
        _add_col(
            "image_cache",
            "last_modified",
            "ALTER TABLE image_cache ADD COLUMN IF NOT EXISTS last_modified VARCHAR NULL",
            "ALTER TABLE image_cache ADD COLUMN last_modified TEXT",
        )
        _add_col(
            "image_cache",
            "byte_size",
            "ALTER TABLE image_cache ADD COLUMN IF NOT EXISTS byte_size INTEGER NULL",
            "ALTER TABLE image_cache ADD COLUMN byte_size INTEGER",
        )
        _add_col(
            "image_cache",
            "last_accessed_at",
            "ALTER TABLE image_cache ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE image_cache ADD COLUMN last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP",
        )
