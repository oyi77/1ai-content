import streamlit as st
from pathlib import Path
import sys
import json
import uuid
import requests

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

st.set_page_config(page_title="Integrations", page_icon="🔗", layout="wide")

from utils.mobile_css import inject_mobile_css
inject_mobile_css()

from src.integrations.manager import IntegrationManager, Integration

manager = IntegrationManager()
manager.ensure_defaults()


# ─── helpers ─────────────────────────────────────────────────────────────────

def _get(url, headers=None, timeout=4):
    try:
        r = requests.get(url, headers=headers or {}, timeout=timeout)
        ct = r.headers.get("content-type", "")
        return r.status_code, r.json() if "json" in ct else r.text
    except requests.exceptions.ConnectionError:
        return None, "Connection refused"
    except Exception as e:
        return None, str(e)


def _post(url, payload, headers=None, timeout=8):
    try:
        r = requests.post(url, json=payload, headers=headers or {}, timeout=timeout)
        ct = r.headers.get("content-type", "")
        return r.status_code, r.json() if "json" in ct else r.text
    except requests.exceptions.ConnectionError:
        return None, "Connection refused"
    except Exception as e:
        return None, str(e)


def _auth(ig):
    return {"Authorization": f"Bearer {ig.api_key}"} if ig.api_key else {}


# ─── load completed projects ─────────────────────────────────────────────────

try:
    from src.db.repository import ProjectRepository
    db_path = Path("data/ebook_generator.db")
    completed = []
    if db_path.exists():
        repo = ProjectRepository(str(db_path))
        completed = [p for p in repo.list_projects(limit=50) if p["status"] == "completed"]
except Exception:
    completed = []

project_options = {f"#{p['id']} — {p.get('idea', '')[:60]}": p for p in completed}


# ─── type-specific action panels ─────────────────────────────────────────────

def _bk_hub_panel(ig, uid):
    base = ig.url.rstrip("/")
    headers = _auth(ig)

    code, health = _get(f"{base}/health", headers=headers)
    online = code == 200
    st.caption(f"Status: {'🟢 Online' if online else '🔴 Offline'}")

    if online and isinstance(health, dict):
        services = health.get("services", {})
        if services:
            cols = st.columns(len(services))
            for col, (svc, info) in zip(cols, services.items()):
                ok = isinstance(info, dict) and info.get("status") == "ok"
                col.metric(svc.upper(), "🟢" if ok else "🔴")
    elif not online:
        st.warning(f"Unreachable. Start: `cd ~/.openclaw/workspace/projects/berkahkarya-hub && ./start.sh`")
        return

    st.markdown("**n8n Workflows**")
    col_list, col_trig = st.columns(2)
    with col_list:
        if st.button("List Workflows", key=f"bk_list_{uid}"):
            c, data = _get(f"{base}/n8n/workflows", headers=headers)
            if c == 200:
                wfs = data if isinstance(data, list) else (data or {}).get("data", [])
                st.dataframe(
                    [{"ID": w.get("id"), "Name": w.get("name"), "Active": "✅" if w.get("active") else "⏸️"} for w in wfs[:20]],
                    use_container_width=True,
                )
            else:
                st.error(f"HTTP {c}")

    with col_trig:
        wf_id = st.text_input("Workflow ID", key=f"bk_wfid_{uid}", placeholder="ea2payRL0Q0zLgV5")
        wf_pay = st.text_area("Payload JSON", value="{}", height=60, key=f"bk_wfpay_{uid}")
        if st.button("Trigger", key=f"bk_wftrig_{uid}") and wf_id:
            try:
                payload = json.loads(wf_pay)
                payload["workflowId"] = wf_id
                c, resp = _post(f"{base}/n8n/trigger", payload, headers=headers)
                st.success(str(resp)[:300]) if (c and c < 300) else st.error(f"HTTP {c}: {str(resp)[:200]}")
            except json.JSONDecodeError:
                st.error("Invalid JSON")

    if not project_options:
        return

    st.markdown("**Ebook Actions**")
    label = st.selectbox("Select ebook", list(project_options.keys()), key=f"bk_proj_{uid}")
    project = project_options[label]
    project_dir = Path("projects") / str(project["id"])

    col_kb, col_wa = st.columns(2)
    with col_kb:
        if st.button("Push to PaperClip KB", key=f"bk_kb_{uid}"):
            mf = project_dir / "manuscript.md"
            if not mf.exists():
                st.error("Manuscript not found.")
            else:
            title = project.get("idea", "Ebook")
            try:
                title = json.loads((project_dir / "outline.json").read_text()).get("best_title", title)
            except Exception as e:
                from src.logger import get_logger
                logger = get_logger(__name__)
                logger.warning("Failed to load outline title", page="integrations", operation="kb_push", error=str(e))
                c, resp = _post(f"{base}/paperclip/query", {"query": f"Store: {title}", "context": mf.read_text()[:8000]}, headers=headers)
                st.success("Pushed!") if (c and c < 300) else st.error(f"HTTP {c}: {str(resp)[:150]}")

    with col_wa:
        wa_num = st.text_input("WhatsApp number", value="6282247006969", key=f"bk_wa_{uid}")
        if st.button("Send WA Alert", key=f"bk_alert_{uid}"):
        title = project.get("idea", "Ebook")[:60]
        try:
            title = json.loads((project_dir / "outline.json").read_text()).get("best_title", title)
        except Exception as e:
            from src.logger import get_logger
            logger = get_logger(__name__)
            logger.warning("Failed to load outline title", page="integrations", operation="wa_alert", error=str(e))
            c, resp = _post(f"{base}/alert", {"channels": ["whatsapp"], "message": f"✅ Ebook ready: *{title}*\nProject #{project['id']} generated.", "number": wa_num}, headers=headers)
            st.success("Alert sent!") if (c and c < 300) else st.error(f"HTTP {c}: {str(resp)[:150]}")


def _adforge_panel(ig, uid):
    base = ig.url.rstrip("/")
    headers = _auth(ig)

    code, _ = _get(f"{base}/api/health", headers=headers)
    online = code == 200
    st.caption(f"Status: {'🟢 Online' if online else '🔴 Offline — start: `cd ~/projects/adforge && npm start`'}")

    if not online:
        return

    if not project_options:
        st.info("No completed ebooks to push.")
        return

    label = st.selectbox("Select ebook", list(project_options.keys()), key=f"af_proj_{uid}")
    project = project_options[label]
    project_dir = Path("projects") / str(project["id"])

    if st.button("Create Landing Page in adforge", key=f"af_push_{uid}"):
        title = project.get("idea", "Ebook")[:80]
        subtitle = hook = ""
        tone = "professional"
        try:
            ol = json.loads((project_dir / "outline.json").read_text())
            title = ol.get("best_title", title)
            subtitle = ol.get("best_subtitle", "")
        except Exception as e:
            from src.logger import get_logger
            logger = get_logger(__name__)
            logger.warning("Failed to load outline data", page="integrations", operation="adforge_push", error=str(e))
        try:
            st_ = json.loads((project_dir / "strategy.json").read_text())
            hook = st_.get("hook", "")
            tone = st_.get("tone", tone)
        except Exception as e:
            from src.logger import get_logger
            logger = get_logger(__name__)
            logger.warning("Failed to load strategy data", page="integrations", operation="adforge_push", error=str(e))

        payload = {"title": title, "subtitle": subtitle, "hook": hook, "tone": tone,
                   "product_mode": project.get("product_mode", "lead_magnet"),
                   "source": "1ai-ebook", "project_id": project["id"]}
        c, resp = _post(f"{base}/api/landing", payload, headers=headers)
        if c and c < 300:
            lp_id = resp.get("id", "") if isinstance(resp, dict) else ""
            st.success(f"Landing page created! ID: {lp_id}")
            st.info("Open adforge to add checkout link, connect ads, and publish.")
        else:
            st.error(f"HTTP {c}: {str(resp)[:200]}")


ACTION_PANELS = {"bk_hub": _bk_hub_panel, "adforge": _adforge_panel}


# ════════════════════════════════════════════════════════════════════════════
# PAGE
# ════════════════════════════════════════════════════════════════════════════

st.title("🔗 Integrations")
st.caption("Add, edit, or remove service connections. Saved to `config/integrations.json`.")

tab_list, tab_add = st.tabs(["Configured", "Add New"])

with tab_list:
    integrations = manager.list()
    if not integrations:
        st.info("No integrations yet. Use 'Add New' to add one.")
    else:
        for ig in integrations:
            icon = "✅" if ig.enabled else "⏸️"
            with st.expander(f"{icon} **{ig.name}** · `{ig.type}` · `{ig.url}`", expanded=False):
                # Edit form
                col_form, col_delete = st.columns([5, 1])
                with col_form:
                    new_name = st.text_input("Name", value=ig.name, key=f"name_{ig.id}")
                    new_url = st.text_input("URL", value=ig.url, key=f"url_{ig.id}")
                    new_key = st.text_input("API Key", value=ig.api_key, type="password", key=f"key_{ig.id}")
                    new_enabled = st.checkbox("Enabled", value=ig.enabled, key=f"en_{ig.id}")
                    if ig.meta:
                        new_meta_str = st.text_area("Extra fields (JSON)", value=json.dumps(ig.meta, indent=2), height=80, key=f"meta_{ig.id}")
                    else:
                        new_meta_str = "{}"

                    if st.button("Save", key=f"save_{ig.id}", type="primary"):
                        try:
                            new_meta = json.loads(new_meta_str)
                        except json.JSONDecodeError:
                            st.error("Extra fields must be valid JSON")
                            st.stop()
                        manager.update(ig.id, name=new_name, url=new_url, api_key=new_key, enabled=new_enabled, meta=new_meta)
                        st.success("Saved.")
                        st.rerun()

                with col_delete:
                    st.write("")  # vertical align
                    st.write("")
                    if st.button("Delete", key=f"del_{ig.id}"):
                        manager.delete(ig.id)
                        st.rerun()

                # Type-specific action panel
                panel_fn = ACTION_PANELS.get(ig.type)
                if panel_fn and ig.enabled:
                    st.divider()
                    panel_fn(ig, ig.id)

with tab_add:
    st.subheader("Add Integration")
    new_type = st.selectbox("Type", ["bk_hub", "adforge", "webhook", "custom"])
    new_name = st.text_input("Name", placeholder="e.g. Production BK Hub")
    new_url = st.text_input("URL", placeholder="http://localhost:9099")
    new_key = st.text_input("API Key", type="password")
    new_enabled = st.checkbox("Enabled", value=True)

    if st.button("Add", type="primary"):
        if not new_name or not new_url:
            st.error("Name and URL are required.")
        else:
            manager.add(Integration(
                id=str(uuid.uuid4())[:8],
                name=new_name,
                type=new_type,
                url=new_url,
                api_key=new_key,
                enabled=new_enabled,
            ))
            st.success(f"Added '{new_name}'")
            st.rerun()
