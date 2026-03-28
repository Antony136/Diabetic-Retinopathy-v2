"""
Truncate (empty) Supabase Postgres tables without changing schema/relationships.

Default behavior:
- Truncates ONLY tables in the `public` schema (recommended; avoids wiping auth/storage internals).
- Uses TRUNCATE ... RESTART IDENTITY CASCADE to satisfy foreign keys and reset sequences.

Usage:
  python backend/scripts/truncate_supabase.py --db-url "$DATABASE_URL" --confirm

Optional:
  python backend/scripts/truncate_supabase.py --db-url "$DATABASE_URL" --schemas public,storage --confirm
  python backend/scripts/truncate_supabase.py --db-url "$DATABASE_URL" --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Iterable

import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv


DEFAULT_EXCLUDED_SCHEMAS = {
    "information_schema",
    "pg_catalog",
    "pg_toast",
    "extensions",
    "graphql",
    "graphql_public",
    "net",
    "realtime",
    "supabase_functions",
    "supabase_migrations",
    "vault",
}


def _parse_csv(value: str) -> list[str]:
    return [x.strip() for x in value.split(",") if x.strip()]


def _iter_tables(conn, schemas: Iterable[str], exclude_tables: set[tuple[str, str]]) -> list[tuple[str, str]]:
    # Uses pg_catalog for correctness and to include partitioned tables if present.
    q = """
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')  -- r=ordinary table, p=partitioned table
      AND n.nspname = ANY(%s)
    ORDER BY n.nspname, c.relname;
    """
    with conn.cursor() as cur:
        cur.execute(q, (list(schemas),))
        rows = [(r[0], r[1]) for r in cur.fetchall()]

    return [(s, t) for (s, t) in rows if (s, t) not in exclude_tables]


def truncate_tables(db_url: str, schemas: list[str], exclude_tables: set[tuple[str, str]], dry_run: bool) -> int:
    with psycopg2.connect(db_url) as conn:
        conn.autocommit = True

        tables = _iter_tables(conn, schemas=schemas, exclude_tables=exclude_tables)
        if not tables:
            print("No tables found to truncate.")
            return 0

        print("Tables to truncate:")
        for s, t in tables:
            print(f"- {s}.{t}")

        if dry_run:
            print("Dry run: no changes applied.")
            return 0

        stmt = sql.SQL("TRUNCATE {tables} RESTART IDENTITY CASCADE").format(
            tables=sql.SQL(", ").join(sql.Identifier(s, t) for s, t in tables)
        )
        with conn.cursor() as cur:
            cur.execute(stmt)

        print("Done.")
        return 0


def main(argv: list[str]) -> int:
    # Load env from backend/.env (if present) and from current working directory .env
    backend_env = Path(__file__).resolve().parents[1] / ".env"
    if backend_env.exists():
        load_dotenv(dotenv_path=backend_env)
    load_dotenv()

    parser = argparse.ArgumentParser(description="Truncate Supabase Postgres tables (keeps schema).")
    parser.add_argument(
        "--db-url",
        default=os.getenv("DATABASE_URL", ""),
        help="Postgres connection string. Defaults to DATABASE_URL from environment/.env.",
    )
    parser.add_argument(
        "--schemas",
        default="public",
        help="Comma-separated schemas to truncate (default: public).",
    )
    parser.add_argument(
        "--exclude-schemas",
        default="",
        help="Comma-separated schemas to exclude (in addition to built-ins).",
    )
    parser.add_argument(
        "--exclude-tables",
        default="",
        help="Comma-separated fully-qualified tables to exclude, e.g. public.users,public.reports",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print tables but do not truncate.")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required to actually truncate (safety switch).",
    )

    args = parser.parse_args(argv)

    if not args.db_url:
        print("ERROR: missing --db-url (or set DATABASE_URL).", file=sys.stderr)
        return 2

    requested_schemas = _parse_csv(args.schemas) or ["public"]
    user_excluded_schemas = set(_parse_csv(args.exclude_schemas))

    # If user explicitly asks for schemas beyond public, still protect common system schemas unless they asked for them.
    schemas = [s for s in requested_schemas if s not in (DEFAULT_EXCLUDED_SCHEMAS | user_excluded_schemas)]
    if not schemas:
        print(
            "ERROR: after exclusions, there are no schemas left to truncate. "
            "If you truly want system schemas, pass them in --schemas and remove them from --exclude-schemas.",
            file=sys.stderr,
        )
        return 2

    exclude_tables: set[tuple[str, str]] = set()
    for fq in _parse_csv(args.exclude_tables):
        if "." not in fq:
            print(f"ERROR: --exclude-tables must be fully qualified (schema.table), got: {fq}", file=sys.stderr)
            return 2
        s, t = fq.split(".", 1)
        exclude_tables.add((s.strip(), t.strip()))

    if not args.dry_run and not args.confirm:
        print("Refusing to truncate without --confirm.", file=sys.stderr)
        print("Tip: run with --dry-run first to review the tables.", file=sys.stderr)
        return 2

    return truncate_tables(
        db_url=args.db_url,
        schemas=schemas,
        exclude_tables=exclude_tables,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
