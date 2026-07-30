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
# Load project root .env first (DATABASE_URL, etc.), then service .env (API keys, cookies)
def _load_dotenv(path):
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, _, val = line.partition('=')
            os.environ[key] = val

root_env = os.path.join(PROJECT_ROOT, '.env')
if os.path.exists(root_env):
    _load_dotenv(root_env)
os.chdir(SERVICES_DIR)
_load_dotenv(os.path.join(SERVICES_DIR, '.env'))

print(f"PINTEREST_COOKIES loaded: {len(os.environ.get('PINTEREST_COOKIES',''))} chars")
print(f"PINTEREST_CSRF loaded: {os.environ.get('PINTEREST_CSRF','')[:20]}...")

if __name__ == '__main__':
    # Launch uvicorn
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8767, reload=False, loop="asyncio")
