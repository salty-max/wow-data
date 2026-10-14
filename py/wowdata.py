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
