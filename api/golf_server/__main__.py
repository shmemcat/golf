import sys
from .application import create_app
from .schema import upgrade_schema

if sys.argv[1:] != ["migrate"]:
    raise SystemExit("Use python -m golf_server migrate; serve with the documented single-worker command.")
app = create_app({"START_GOLF_WORKER": False})
with app.app_context():
    upgrade_schema()
