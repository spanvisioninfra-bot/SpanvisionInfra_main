"""Database deployment regressions; uses synthetic credentials and no network."""

import asyncio
from pathlib import Path
import ssl
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vision-bim-validator"))
from server.database_config import DatabaseConfigurationError, build_database_config


NEON_URL = "postgresql://test_user:fake%40password@ep-example-pooler.ap-southeast-1.aws.neon.tech/neondb"


class DatabaseConfigTests(unittest.TestCase):
    def test_standard_postgres_schemes_use_asyncpg(self):
        for scheme in ("postgres", "postgresql", "postgresql+asyncpg"):
            with self.subTest(scheme=scheme):
                url, _ = build_database_config(NEON_URL.replace("postgresql:", scheme + ":"))
                self.assertEqual(url.drivername, "postgresql+asyncpg")
                self.assertEqual(url.password, "fake@password")
                self.assertEqual(url.username, "test_user")

    def test_copied_neon_snippets(self):
        for value in (f"  {NEON_URL}  ", f"'{NEON_URL}'", f'DATABASE_URL="{NEON_URL}"', f"psql '{NEON_URL}'"):
            with self.subTest(wrapper=value[:12]):
                url, _ = build_database_config(value)
                self.assertEqual(url.database, "neondb")

    def test_neon_default_options_enforce_verified_tls(self):
        url, options = build_database_config(NEON_URL + "?sslmode=require&channel_binding=require")
        self.assertFalse(url.query)
        tls = options["connect_args"]["ssl"]
        self.assertIsInstance(tls, ssl.SSLContext)
        self.assertEqual(tls.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(tls.check_hostname)

    def test_neon_verifies_tls_without_query_options(self):
        _, options = build_database_config(NEON_URL)
        self.assertTrue(options["connect_args"]["ssl"].check_hostname)

    def test_pooled_neon_disables_caches_and_uses_unique_statement_names(self):
        _, options = build_database_config(NEON_URL + "?prepared_statement_cache_size=100&statement_cache_size=100")
        self.assertIs(options["poolclass"], NullPool)
        args = options["connect_args"]
        self.assertEqual(args["prepared_statement_cache_size"], 0)
        self.assertEqual(args["statement_cache_size"], 0)
        self.assertNotEqual(args["prepared_statement_name_func"](), args["prepared_statement_name_func"]())

    def test_direct_neon_does_not_disable_local_pool(self):
        _, options = build_database_config(NEON_URL.replace("-pooler.", "."))
        self.assertNotIn("poolclass", options)
        self.assertTrue(options["connect_args"]["ssl"].check_hostname)

    def test_timeout_and_application_name_are_driver_options(self):
        url, options = build_database_config(NEON_URL + "?connect_timeout=10&application_name=spanvision-bim")
        self.assertFalse(url.query)
        self.assertEqual(options["connect_args"]["timeout"], 10)
        self.assertEqual(options["connect_args"]["server_settings"], {"application_name": "spanvision-bim"})

    def test_generic_postgres_and_explicit_local_tls_disable(self):
        url, options = build_database_config("postgresql://localhost/bim?sslmode=disable")
        self.assertEqual(url.drivername, "postgresql+asyncpg")
        self.assertIs(options["connect_args"]["ssl"], False)

    def test_invalid_urls_never_reveal_credentials_or_fall_back(self):
        invalid = (
            "", " ", "fake-secret@ep-example.neon.tech/neondb?sslmode=require",
            "https://ep-example.neonauth.neon.tech/neondb/auth",
            "postgresql:///neondb", "postgresql://test:fake-secret@host/",
            "postgresql://ep-example.neon.tech/neondb",
            "postgresql://test:fake-secret@host:invalid/neondb",
            NEON_URL + "?sslmode=disable", NEON_URL + "?sslmode=prefer",
            NEON_URL + "?sslmode=require&sslmode=disable",
            NEON_URL + "?sslmode=require&ssl=verify-full",
            NEON_URL + "?connect_timeout=nan", NEON_URL + "?connect_timeout=-1",
            NEON_URL + "?statement_cache_size=invalid", NEON_URL + "?unknown=fake-secret",
            f"psql '{NEON_URL}' --command 'SELECT 1'", "psql 'fake-secret",
            NEON_URL + "\nDATABASE_URL=fake-secret",
        )
        for value in invalid:
            with self.subTest(case=invalid.index(value)):
                with self.assertRaises(DatabaseConfigurationError) as caught:
                    build_database_config(value)
                self.assertNotIn("fake-secret", str(caught.exception))
                self.assertNotIn("fake%40password", str(caught.exception))
                self.assertIn("DATABASE_URL", str(caught.exception))

    def test_sqlite_default_and_paths_with_spaces(self):
        url, options = build_database_config(None)
        self.assertEqual(url.drivername, "sqlite+aiosqlite")
        self.assertEqual(url.database, "./bimvalidator.db")
        self.assertEqual(options, {})
        url, _ = build_database_config("sqlite:///./local folder/bim.db")
        self.assertEqual(url.database, "./local folder/bim.db")

    def test_actual_asyncpg_driver_boundary_has_no_libpq_keywords(self):
        class DriverReached(Exception):
            pass

        async def check():
            url, options = build_database_config(NEON_URL + "?sslmode=require&channel_binding=require&connect_timeout=10")
            engine = create_async_engine(url, **options)
            try:
                mocked = AsyncMock(side_effect=DriverReached)
                with patch("asyncpg.connect", mocked):
                    with self.assertRaises(DriverReached):
                        async with engine.connect():
                            pass
                mocked.assert_awaited_once()
                args = mocked.call_args.kwargs
                self.assertEqual(args["password"], "fake@password")
                self.assertEqual(args["statement_cache_size"], 0)
                self.assertEqual(args["timeout"], 10)
                self.assertTrue(args["ssl"].check_hostname)
                for key in ("sslmode", "channel_binding", "prepared_statement_cache_size", "prepared_statement_name_func"):
                    self.assertNotIn(key, args)
            finally:
                await engine.dispose()
        asyncio.run(check())

    def test_sqlite_engine_still_reads_and_writes(self):
        async def check(database):
            url, options = build_database_config("sqlite+aiosqlite:///" + database.as_posix())
            engine = create_async_engine(url, **options)
            try:
                async with engine.begin() as connection:
                    await connection.execute(text("CREATE TABLE deployment_check (id INTEGER PRIMARY KEY)"))
                    await connection.execute(text("INSERT INTO deployment_check VALUES (1)"))
                async with engine.connect() as connection:
                    self.assertEqual((await connection.execute(text("SELECT id FROM deployment_check"))).scalar_one(), 1)
            finally:
                await engine.dispose()
        with tempfile.TemporaryDirectory(prefix="spanvision-database-test-") as folder:
            asyncio.run(check(Path(folder) / "test.db"))


if __name__ == "__main__":
    unittest.main()
