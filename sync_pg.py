#!/usr/bin/env python3
"""
PostgreSQL Sync by @anton (Python Edition, Self-healing + Safety Interlocks)
- Reads KEY=VALUE pairs from db.conf
- Menu:
  1) Test HOST DB connection
  2) Test LOCAL DB connection
  3) Backup HOST DB (to backup.dump, custom format)
  4) Restore Into LOCAL DB (drop schema OR create new DB)   [HARDENED]
  5) Compare Table Counts (public schema)
  6) Exit

Auto-fixes:
  * If Python deps missing (psycopg2-binary, colorama) → offer auto-install via pip
  * If PostgreSQL client tools missing (pg_dump, pg_restore, psql, createdb) → offer:
      1) Auto-install via winget/choco/scoop (Windows)
      2) Enter PG_BIN path and save to db.conf
      3) Open official download page
      4) Quit

Safety Interlocks (configurable in db.conf; defaults shown here):
  LOCAL_MUST_BE_LOOPBACK=true    → require 127.0.0.1 or ::1 for destructive ops
"""

import os
import sys
import shlex
import subprocess
import webbrowser
import socket
from pathlib import Path
from typing import Dict, Optional

# ---------- Colors (soft dependency) ----------
try:
    from colorama import Fore, Style, init as colorama_init
    colorama_init()
except Exception:
    class _Dummy:
        def __getattr__(self, k): return ''
    Fore = Style = _Dummy()

# ---------- Simple UI helpers ----------
def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def ask_yes_no(prompt: str, default: bool = True) -> bool:
    d = "Y/n" if default else "y/N"
    ans = input(f"{prompt} [{d}]: ").strip().lower()
    if not ans:
        return default
    return ans in ("y", "yes")

def run_cmd(cmd: list[str]) -> int:
    print(f"{Fore.BLUE}$ {' '.join(map(shlex.quote, cmd))}{Style.RESET_ALL}")
    return subprocess.call(cmd)

# ---------- Paths ----------
ROOT = Path(getattr(sys, "_MEIPASS", Path.cwd()))  # PyInstaller-safe asset root
CONF_FILE = Path.cwd() / "db.conf"
BACKUP_FILE = Path.cwd() / "backup.dump"

# ---------- Config & PATH helpers ----------
def read_conf(path: Path) -> Dict[str, str]:
    """Very small KEY=VALUE parser. Lines starting with # or :: are ignored."""
    conf: Dict[str, str] = {}
    if not path.exists():
        print(f"{Fore.RED}Config file not found: {path}{Style.RESET_ALL}")
        sys.exit(1)
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("::"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        conf[k.strip()] = v.strip()
    return conf

def pg_bin_dir(conf: Dict[str, str]) -> Optional[str]:
    p = conf.get("PG_BIN", "").strip()
    return p if p else None

def which(cmd: str) -> Optional[str]:
    exts = os.environ.get("PATHEXT", ".EXE;.BAT;.CMD").split(";")
    paths = os.environ.get("PATH", "").split(os.pathsep)
    for base in paths:
        candidate = Path(base) / cmd
        if candidate.exists():
            return str(candidate)
        for ext in exts:
            c2 = Path(base) / f"{cmd}{ext}"
            if c2.exists():
                return str(c2)
    return None

def has_cmd(name: str) -> bool:
    return which(name) is not None

def save_pg_bin_to_conf(conf_path: Path, new_path: str) -> None:
    # Append or replace PG_BIN=... in db.conf
    lines = conf_path.read_text(encoding="utf-8").splitlines()
    wrote = False
    for i, line in enumerate(lines):
        if line.strip().upper().startswith("PG_BIN="):
            lines[i] = f"PG_BIN={new_path}"
            wrote = True
            break
    if not wrote:
        lines.append(f"PG_BIN={new_path}")
    conf_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{Fore.GREEN}Updated {conf_path} with PG_BIN={new_path}{Style.RESET_ALL}")

# ---------- Dependency bootstrap (Python packages) ----------
def ensure_python_deps() -> None:
    """
    Ensure psycopg2-binary (and colorama) are importable.
    If not, offer to install via pip.
    """
    try:
        import psycopg2  # noqa: F401
        from psycopg2 import sql  # noqa: F401
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT  # noqa: F401
        return
    except Exception:
        print(f"{Fore.YELLOW}Missing dependency: psycopg2-binary (and optionally colorama).{Style.RESET_ALL}")
        if ask_yes_no("Do you want me to install required Python packages now?", default=True):
            rc = run_cmd([sys.executable, "-m", "pip", "install", "psycopg2-binary", "colorama"])
            if rc != 0:
                print(f"{Fore.RED}pip install failed. Please install manually: pip install psycopg2-binary colorama{Style.RESET_ALL}")
                sys.exit(1)
        else:
            sys.exit(1)

# Perform check before importing psycopg2 (so auto-install can run)
ensure_python_deps()

# Safe to import now
import psycopg2  # type: ignore
from psycopg2 import sql  # type: ignore
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT  # type: ignore[attr-defined]

# ---------- Tool resolution & self-healing for PG client tools ----------
def resolve_tool(tool: str, conf: Dict[str, str]) -> str:
    """Resolve path to pg client tool, honoring optional PG_BIN; emit guidance if missing."""
    # 1) PG_BIN from db.conf
    pgdir = pg_bin_dir(conf)
    if pgdir:
        for ext in ("", ".exe", ".bat", ".cmd"):
            p = Path(pgdir) / f"{tool}{ext}"
            if p.exists():
                return str(p)
    # 2) PATH
    found = which(tool)
    if not found:
        print(f"{Fore.RED}Required tool not found: {tool}{Style.RESET_ALL}")
        print("\nHow to fix:")
        if os.name == 'nt':
            print("  Either install the PostgreSQL client tools and add them to PATH,")
            print("  or set PG_BIN in db.conf to the 'bin' folder, e.g.:")
            print("     PG_BIN=C:\\\\Program Files\\\\PostgreSQL\\\\16\\\\bin\n")
        else:
            print("  Install postgresql-client and ensure tools are on PATH,")
            print("  or set PG_BIN=/usr/lib/postgresql/16/bin in db.conf\n")
        raise SystemExit(2)
    return found

def ensure_pg_tools(conf: Dict[str, str]) -> bool:
    """
    Ensure pg_dump, pg_restore, psql, createdb are available.
    If missing, offer:
      1) Auto-install (winget/choco/scoop on Windows)
      2) Enter PG_BIN path and save to db.conf
      3) Open official download page
      4) Quit
    """
    needed = ["pg_dump", "pg_restore", "psql", "createdb"]
    missing = []
    for t in needed:
        try:
            _ = resolve_tool(t, conf)
        except SystemExit:
            missing.append(t)
        except Exception:
            missing.append(t)

    if not missing:
        return True

    print(f"{Fore.YELLOW}Missing PostgreSQL client tools: {', '.join(missing)}{Style.RESET_ALL}")
    print("Choose an option:")
    print("  1) Try auto-install (winget/choco/scoop)")
    print("  2) Enter PG_BIN path (saved to db.conf)")
    print("  3) Open official PostgreSQL download page")
    print("  4) Quit")
    choice = input("Enter choice [1/2/3/4]: ").strip() or "1"

    if choice == "1":
        if os.name == "nt":
            if has_cmd("winget"):
                print(f"{Fore.CYAN}Attempting: winget install --id=PostgreSQL.PostgreSQL -e{Style.RESET_ALL}")
                rc = run_cmd(["winget", "install", "--id=PostgreSQL.PostgreSQL", "-e"])
                if rc == 0:
                    print(f"{Fore.GREEN}winget install finished. Re-run your action.{Style.RESET_ALL}")
                    return True
            if has_cmd("choco"):
                print(f"{Fore.CYAN}Attempting: choco install postgresql -y{Style.RESET_ALL}")
                rc = run_cmd(["choco", "install", "postgresql", "-y"])
                if rc == 0:
                    print(f"{Fore.GREEN}choco install finished. Re-run your action.{Style.RESET_ALL}")
                    return True
            if has_cmd("scoop"):
                print(f"{Fore.CYAN}Attempting: scoop install postgresql{Style.RESET_ALL}")
                rc = run_cmd(["scoop", "install", "postgresql"])
                if rc == 0:
                    print(f"{Fore.GREEN}scoop install finished. Re-run your action.{Style.RESET_ALL}")
                    return True

            print(f"{Fore.YELLOW}No supported package manager detected or install failed.{Style.RESET_ALL}")
        else:
            print(f"{Fore.YELLOW}Auto-install only attempted on Windows. Use your distro's package manager.{Style.RESET_ALL}")
        # Fall through to let user specify PG_BIN
        choice = "2"

    if choice == "2":
        hint = r"C:\Program Files\PostgreSQL\16\bin" if os.name == "nt" else "/usr/lib/postgresql/16/bin"
        path_in = input(f"Enter full path to PostgreSQL bin (e.g., {hint}): ").strip()
        if Path(path_in).exists():
            save_pg_bin_to_conf(CONF_FILE, path_in)
            conf["PG_BIN"] = path_in  # keep in-memory conf updated
            print(f"{Fore.GREEN}Saved PG_BIN to db.conf. Re-run your action.{Style.RESET_ALL}")
            return True
        else:
            print(f"{Fore.RED}Path does not exist: {path_in}{Style.RESET_ALL}")
            return False

    if choice == "3":
        url = "https://www.postgresql.org/download/windows/" if os.name == "nt" else "https://www.postgresql.org/download/"
        print(f"Opening: {url}")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        return False

    return False

# ---------- Safety helpers ----------
def is_loopback_host(host: str) -> bool:
    """Return True if host resolves to a loopback address."""
    try:
        infos = socket.getaddrinfo(host, None)
        for _, _, _, _, sockaddr in infos:
            ip = sockaddr[0]
            if isinstance(ip, bytes):
                ip = ip.decode("utf-8", errors="ignore")
            if ip.startswith("127.") or ip == "::1":
                return True
        return False
    except Exception:
        # If resolution fails, treat as NOT loopback
        return False

def _must_bool(conf: Dict[str, str], key: str, default_true: bool) -> bool:
    v = conf.get(key, "true" if default_true else "false").strip().lower()
    return v in ("1", "true", "yes", "y")

def guard_local_only(params: Dict[str, str], op_name: str) -> bool:
    host = params["host"].strip().lower()
    if host in ("localhost", "127.0.0.1", "::1"):
        return True
    print(f"{Fore.RED}Refusing {op_name}: LOCAL host is '{host}', must be localhost/127.0.0.1/::1{Style.RESET_ALL}")
    return False

# ---------- DB helpers ----------
def conn_params(prefix: str, conf: Dict[str, str]) -> Dict[str, str]:
    return {
        "host": conf[f"{prefix}"].strip(),
        "port": conf[f"{prefix}_PORT"].strip(),
        "dbname": conf[f"{prefix}_DBNAME"].strip(),
        "user": conf[f"{prefix}_USER"].strip(),
        "password": conf[f"{prefix}_PASSWORD"].strip(),
        "sslmode": conf.get(f"{prefix}_SSL", "prefer").strip(),
    }

def test_connection(label: str, params: Dict[str, str]) -> None:
    print(f"{Fore.CYAN}Testing {label} DB connection...{Style.RESET_ALL}")
    try:
        with psycopg2.connect(**params) as conn:
            with conn.cursor() as cur:
                cur.execute("""SELECT count(*) FROM information_schema.tables WHERE table_schema='public'""")
                count = cur.fetchone()[0]
                print(f"{Fore.GREEN}OK:{Style.RESET_ALL} Connected to {label}. Public tables: {count}")
    except Exception as e:
        print(f"{Fore.RED}FAILED:{Style.RESET_ALL} {e}")

def run_tool(tool: str, args: list, password: Optional[str] = None) -> int:
    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password
    shown = " ".join([shlex.quote(str(x)) for x in ([tool] + args)])
    print(f"{Fore.BLUE}$ {shown}{Style.RESET_ALL}")
    proc = subprocess.run([tool] + [str(a) for a in args], env=env)
    return proc.returncode

def backup_host(conf: Dict[str, str]) -> None:
    if not ensure_pg_tools(conf):
        print(f"{Fore.RED}Required client tools are not installed. Aborting backup.{Style.RESET_ALL}")
        return
    print(f"{Fore.CYAN}Backing up HOST DB...{Style.RESET_ALL}")
    tool = resolve_tool("pg_dump", conf)
    params = conn_params("HOST", conf)
    args = [
        "-h", params["host"],
        "-p", params["port"],
        "-U", params["user"],
        "-d", params["dbname"],
        "-Fc",
        "-f", str(BACKUP_FILE)
    ]
    rc = run_tool(tool, args, password=params.get("password"))
    if rc == 0:
        print(f"{Fore.GREEN}Backup saved to {BACKUP_FILE}{Style.RESET_ALL}")
    else:
        print(f"{Fore.RED}Backup failed with exit code {rc}{Style.RESET_ALL}")

def database_exists(params: Dict[str, str], dbname: str) -> bool:
    check = params.copy()
    check["dbname"] = "postgres"
    try:
        with psycopg2.connect(**check) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_database WHERE datname=%s", (dbname,))
                return cur.fetchone() is not None
    except Exception as e:
        print(f"{Fore.RED}Could not check database existence: {e}{Style.RESET_ALL}")
        return False

def drop_schema_public(params: Dict[str, str], conf: Dict[str, str]) -> None:
    op_name = "DROP/RECREATE SCHEMA public"
    if not guard_local_only(params, op_name):
        return
    try:
        conn = psycopg2.connect(**params)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)  # required to avoid tx block
        try:
            with conn.cursor() as cur:
                cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        finally:
            conn.close()
        print(f"{Fore.GREEN}Dropped and recreated schema public in {params['dbname']}{Style.RESET_ALL}")
    except Exception as e:
        print(f"{Fore.RED}Failed to drop schema: {e}{Style.RESET_ALL}")

def create_database(params: Dict[str, str], new_db: str) -> bool:
    check = params.copy()
    check["dbname"] = "postgres"
    try:
        conn = psycopg2.connect(**check)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)  # CREATE DATABASE cannot run in a tx
        try:
            with conn.cursor() as cur:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(new_db)))
        finally:
            conn.close()
        print(f"{Fore.GREEN}Created database {new_db}{Style.RESET_ALL}")
        return True
    except Exception as e:
        print(f"{Fore.RED}Failed to create database {new_db}: {e}{Style.RESET_ALL}")
        return False

def restore_into_local(conf: Dict[str, str]) -> None:
    if not BACKUP_FILE.exists():
        print(f"{Fore.RED}Backup file not found: {BACKUP_FILE}. Run a backup first.{Style.RESET_ALL}")
        return
    if not ensure_pg_tools(conf):
        print(f"{Fore.RED}Required client tools are not installed. Aborting restore.{Style.RESET_ALL}")
        return

    local = conn_params("LOCAL", conf)

    # Hard stop if host isn't loopback and policy requires it
    if _must_bool(conf, "LOCAL_MUST_BE_LOOPBACK", True) and not is_loopback_host(local["host"]):
        print(f"{Fore.RED}Refusing restore: LOCAL host '{local['host']}' is not loopback (127.0.0.1/::1).{Style.RESET_ALL}")
        return

    dbname = local["dbname"]
    exists = database_exists(local, dbname)
    if not exists:
        # Guard the "create + restore" path as well
        prospective = local.copy()
        op_name = f"CREATE DATABASE + RESTORE into '{dbname}'"
        if not guard_local_only(prospective, op_name):
            return
        print(f"{Fore.YELLOW}LOCAL DB '{dbname}' not found. Creating...{Style.RESET_ALL}")
        if not create_database(local, dbname):
            return
    else:
        print("LOCAL DB exists. Choose option:")
        print("  1) Drop all tables (recreate schema public) and restore into same DB")
        print("  2) Create NEW DB and restore into it")
        choice = input("Enter choice [1/2]: ").strip() or "1"
        if choice == "1":
            drop_schema_public(local, conf)
        else:
            new_db = input("Enter new DB name: ").strip()
            if not new_db:
                print(f"{Fore.RED}No DB name provided. Abort.{Style.RESET_ALL}")
                return
            prospective = local.copy()
            prospective["dbname"] = new_db
            if not guard_local_only(prospective, f"CREATE DATABASE + RESTORE into '{new_db}'"):
                return
            if not create_database(local, new_db):
                return
            local["dbname"] = new_db

    tool = resolve_tool("pg_restore", conf)
    args = [
        "-h", local["host"],
        "-p", local["port"],
        "-U", local["user"],
        "-d", local["dbname"],
        "-Fc",
        "--no-owner",            # ignore original owners from dump
        "--no-acl",              # ignore GRANT/REVOKE from dump
        "--role", local["user"], # make restored objects owned by LOCAL_USER
        str(BACKUP_FILE)
    ]
    rc = run_tool(tool, args, password=local.get("password"))
    if rc == 0:
        print(f"{Fore.GREEN}Restore completed into {local['dbname']}{Style.RESET_ALL}")
    else:
        print(f"{Fore.RED}Restore failed with exit code {rc}{Style.RESET_ALL}")

def compare_table_counts(conf: Dict[str, str]) -> None:
    host = conn_params("HOST", conf)
    local = conn_params("LOCAL", conf)
    print(f"{Fore.CYAN}Comparing table counts (schema=public){Style.RESET_ALL}")
    def get_count(p):
        try:
            with psycopg2.connect(**p) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
                    return cur.fetchone()[0]
        except Exception as e:
            print(f"{Fore.RED}Count failed for {p['dbname']}: {e}{Style.RESET_ALL}")
            return None
    h = get_count(host)
    l = get_count(local)
    print(f" HOST  ({host['dbname']}): {h}")
    print(f" LOCAL ({local['dbname']}): {l}")
    if h is not None and l is not None:
        if h == l:
            print(f"{Fore.GREEN}Counts match.{Style.RESET_ALL}")
        else:
            print(f"{Fore.YELLOW}Counts differ.{Style.RESET_ALL}")

# ---------- Main Menu ----------
def main_menu(conf: Dict[str, str]) -> None:
    while True:
        clear_screen()
        print()
        print("=" * 30)
        print("  PostgreSQL Sync by @anton")
        print("=" * 30)
        print("1. Test HOST DB Connection")
        print("2. Test LOCAL DB Connection")
        print("3. Backup HOST DB")
        print("4. Restore Into LOCAL DB")
        print("5. Compare Table Counts")
        print("6. Exit")
        choice = input("Enter choice: ").strip()
        if choice == "1":
            test_connection("HOST", conn_params("HOST", conf))
            input("Press Enter to continue...")
            clear_screen()
        elif choice == "2":
            test_connection("LOCAL", conn_params("LOCAL", conf))
            input("Press Enter to continue...")
            clear_screen()
        elif choice == "3":
            backup_host(conf)
            input("Press Enter to continue...")
            clear_screen()
        elif choice == "4":
            restore_into_local(conf)
            input("Press Enter to continue...")
            clear_screen()
        elif choice == "5":
            compare_table_counts(conf)
            input("Press Enter to continue...")
            clear_screen()
        elif choice == "6":
            print("Bye!")
            break
        else:
            print("Invalid choice. Try again.")

if __name__ == "__main__":
    try:
        conf = read_conf(CONF_FILE)
    except SystemExit:
        raise
    except Exception as e:
        print(f"{Fore.RED}Failed to read db.conf: {e}{Style.RESET_ALL}")
        sys.exit(1)
    main_menu(conf)
