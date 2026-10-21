"""Convert deployment database URLs into safe async SQLAlchemy settings."""

import math
import shlex
import ssl
from uuid import uuid4

from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.pool import NullPool


class DatabaseConfigurationError(ValueError):
    """A configuration problem whose message is safe to include in startup logs."""


def _invalid(detail: str) -> DatabaseConfigurationError:
    return DatabaseConfigurationError(
        f"Invalid DATABASE_URL: {detail}. In Neon, open Connect and copy the "
        "complete PostgreSQL connection string into the backend environment variable."
    )


def _unwrap(value: str) -> str:
    value = value.strip()
    if value.startswith("DATABASE_URL="):
        value = value.partition("=")[2].strip()
    if len(value) >= 2 and value[0] in "\"'" and value[-1] == value[0]:
        value = value[1:-1]
    if value.startswith("psql "):
        try:
            parts = shlex.split(value)
        except ValueError:
            raise _invalid("the copied psql command is incomplete") from None
        if len(parts) != 2 or parts[0] != "psql":
            raise _invalid("use only the connection URL, without psql options")
        value = parts[1]
    if not value or "\n" in value or "\r" in value:
        raise _invalid("the connection string is empty or contains line breaks")
    return value


def build_database_config(raw_url: str | None) -> tuple[URL, dict]:
    """Keep SQLite local defaults; normalize Neon/libpq options for asyncpg.

    Never fall back to SQLite when an explicitly configured URL is invalid.
    Errors deliberately omit the URL and the original parser exception.
    """
    value = "sqlite+aiosqlite:///./bimvalidator.db" if raw_url is None else _unwrap(raw_url)
    try:
        url = make_url(value)
    except (ArgumentError, ValueError, TypeError):
        # SQLAlchemy's ArgumentError can include the supplied secret verbatim.
        # Avoid forwarding any parser diagnostics to deployment logs.
        raise _invalid("the URL could not be parsed") from None

    if url.drivername in {"sqlite", "sqlite+aiosqlite"}:
        return url.set(drivername="sqlite+aiosqlite"), {}
    if url.drivername not in {"postgres", "postgresql", "postgresql+asyncpg"}:
        raise _invalid("use a PostgreSQL URL, not the Neon Auth or console URL")
    if any(char.isspace() for char in value):
        raise _invalid("PostgreSQL credentials must use URL-encoded whitespace")
    if not url.host or not url.database:
        raise _invalid("a PostgreSQL host and database name are required")
    neon = url.host.lower().endswith(".neon.tech")
    if neon and (not url.username or not url.password):
        raise _invalid("the Neon username or password is missing")

    query = dict(url.query)
    if any(not isinstance(value, str) for value in query.values()):
        raise _invalid("connection options must not be repeated")
    sslmode = query.pop("sslmode", None)
    ssl_option = query.pop("ssl", None)
    if sslmode and ssl_option:
        raise _invalid("specify only one TLS option")
    tls_mode = sslmode or ssl_option
    if tls_mode not in {None, "require", "verify-ca", "verify-full", "disable"}:
        raise _invalid("the TLS mode is unsupported; use sslmode=verify-full")
    if neon and tls_mode == "disable":
        raise _invalid("Neon requires verified TLS")
    connect_args = {}
    if neon or tls_mode in {"require", "verify-ca", "verify-full"}:
        # Verify both the certificate and hostname, including for sslmode=require.
        connect_args["ssl"] = ssl.create_default_context()
    elif tls_mode == "disable":
        connect_args["ssl"] = False

    # Neon supplies this libpq option by default. asyncpg has no channel_binding
    # keyword; TLS remains verified, but this driver does not provide SCRAM-PLUS.
    channel_binding = query.pop("channel_binding", None)
    if channel_binding not in {None, "require", "prefer", "disable"}:
        raise _invalid("the channel binding option is invalid")
    timeout = query.pop("connect_timeout", None)
    if timeout is not None:
        try:
            seconds = float(timeout)
            if not math.isfinite(seconds) or seconds <= 0:
                raise ValueError
        except ValueError:
            raise _invalid("connect_timeout must be a positive number") from None
        connect_args["timeout"] = seconds
    application_name = query.pop("application_name", None)
    if application_name:
        connect_args["server_settings"] = {"application_name": application_name}

    for cache_option in ("prepared_statement_cache_size", "statement_cache_size"):
        cache_value = query.pop(cache_option, None)
        if cache_value is not None:
            try:
                size = int(cache_value)
                if size < 0:
                    raise ValueError
            except ValueError:
                raise _invalid("statement cache sizes must be nonnegative integers") from None
            connect_args[cache_option] = size
    if query:
        raise _invalid("the connection string contains unsupported query options")

    options = {"connect_args": connect_args}
    if neon and "-pooler." in url.host.lower():
        # Neon already pools connections. Avoid a second pool and cross-session
        # prepared statement collisions when its transaction pool changes servers.
        options["poolclass"] = NullPool
        connect_args["prepared_statement_cache_size"] = 0
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_name_func"] = lambda: f"__spanvision_{uuid4().hex}__"
    return url.set(drivername="postgresql+asyncpg", query={}), options
