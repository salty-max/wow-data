"""wow-data's databases for the addons' Python scripts, read only:

  sys.path.insert(0, os.path.join(<addon>, "..", "wow-data", "py"))
  from wowdata import db
  db("forever").execute("SELECT ...")

The files are .cache/db/<game>.db (WOW_DATA_CACHE moves the cache, as for
the TypeScript): built by bin/build.ts or fetched by bin/get.ts.
"""
import os, sqlite3, sys

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
        stale = staleness(_dbs[game], game)
        if stale and os.environ.get("WOW_DATA_STRICT") == "1":
            raise SystemExit(stale)
        if stale:
            print(f"wow-data: {stale}", file=sys.stderr)
    return _dbs[game]


def staleness(con, game):
    """why a database isn't this checkout's (src/db.ts's twin), or None: its
    meta's tag against the inputs' last commit (src/dbRelease.ts)"""
    import subprocess
    run = subprocess.run(
        ["git", "log", "-1", "--format=%H", "--", "pins.json", "schema.sql", "src", "bin", "data", ".github/workflows/db.yml"],
        cwd=ROOT, capture_output=True, text=True,
    )
    if run.returncode != 0 or len(run.stdout.strip()) != 40:
        return None
    want = f"db-{run.stdout.strip()[:12]}"
    row = con.execute("SELECT value FROM meta WHERE key = 'tag'").fetchone()
    fix = f"rebuild it (bun wow-data/bin/build.ts {game}) or get this checkout's (bun wow-data/bin/get.ts {game} --tag {want})"
    if row is None:
        return f"{game}.db was built before the databases kept their tag: {fix}"
    return None if row[0] == want else f"{game}.db was built at {row[0]}, this checkout is at {want}: {fix}"


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
