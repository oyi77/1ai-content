"""Launch uvicorn with env vars from .env."""
import os, sys

SERVICES_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SERVICES_DIR)

# hermes/scripts for cloakbrowser_cdp_integration import
HERMES_SCRIPTS = os.path.expanduser("~/.hermes/scripts")
if HERMES_SCRIPTS not in sys.path:
    sys.path.insert(0, HERMES_SCRIPTS)

# PROJECT_ROOT for services.pinterest import
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
# Load .env manually
os.chdir(SERVICES_DIR)
with open(os.path.join(SERVICES_DIR, '.env')) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, _, val = line.partition('=')
        os.environ[key] = val

print(f"PINTEREST_COOKIES loaded: {len(os.environ.get('PINTEREST_COOKIES',''))} chars")
print(f"PINTEREST_CSRF loaded: {os.environ.get('PINTEREST_CSRF','')[:20]}...")

# Launch uvicorn
import uvicorn
uvicorn.run("api:app", host="127.0.0.1", port=8767, reload=False, loop="asyncio")
