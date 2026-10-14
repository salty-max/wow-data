"""wow-data's databases for the addons' Python scripts, read only:

  sys.path.insert(0, os.path.join(<addon>, "..", "wow-data", "py"))
  from wowdata import db
  db("forever").execute("SELECT ...")

The files are .cache/db/<game>.db (WOW_DATA_CACHE moves the cache, as for
the TypeScript): built by bin/build.ts or fetched by bin/get.ts.
"""
import os, sqlite3

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CACHE = os.environ.get("WOW_DATA_CACHE") or os.path.join(ROOT, ".cache")
_dbs = {}


def db(game):
    """the game's database (classic or forever), read only"""
    if game not in _dbs:
        path = os.path.abspath(os.path.join(CACHE, "db", f"{game}.db"))
        if not os.path.exists(path):
            raise SystemExit(f"{path}: none yet (bun ../wow-data/bin/get.ts, or bun ../wow-data/bin/build.ts {game})")
        _dbs[game] = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    return _dbs[game]


def client(game, table):
    """a client table's rows (client_<table>, the pinned build's) as
    wago.tools' CSV gives them: { column: text }, empty for nothing"""
    cur = db(game).execute(f'SELECT * FROM "client_{table}" ORDER BY rowid')
    cols = [c[0] for c in cur.description]
    text = lambda v: "" if v is None else str(v)
    return [{c: text(v) for c, v in zip(cols, row)} for row in cur]


def path(*what):
    """a pinned file's local path, downloaded first if need be (bin/path.ts:
    "classicdb", the Classic database's dump; "wago", game, table...)"""
    import subprocess
    run = subprocess.run(["bun", os.path.join(ROOT, "bin", "path.ts"), *what], capture_output=True, text=True)
    if run.returncode:
        raise SystemExit(run.stderr.strip())
    return run.stdout.strip()


def tree(name):
    """a pinned repository's files (bin/path.ts tree)"""
    return path("tree", name).splitlines()
