from __future__ import annotations

import hmac
import hashlib
import json
import threading
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal
from services.ebook.logger import get_logger

logger = get_logger(__name__)

INTEGRATIONS_FILE = Path("config/integrations.json")

IntegrationType = Literal["bk_hub", "adforge", "webhook", "custom"]


@dataclass
class Integration:
    id: str
    name: str
    type: IntegrationType
    url: str
    api_key: str = ""
    enabled: bool = True
    meta: dict = field(default_factory=dict)  # extra type-specific fields


class IntegrationManager:
    def __init__(self, config_file: Path = INTEGRATIONS_FILE, db_path: str | None = None):
        self.config_file = config_file
        self.db_path = db_path
        self._engine = None
        if db_path:
            from sqlalchemy import create_engine
            from services.ebook.db.database import create_tables

            self._engine = create_engine(f"sqlite:///{db_path}")
            create_tables(self._engine)
        self._integrations: dict[str, Integration] = {}
        self._load()

    def _load(self) -> None:
        if self.config_file.exists():
            try:
                raw = json.loads(self.config_file.read_text())
                for item in raw:
                    ig = Integration(**item)
                    self._integrations[ig.id] = ig
            except Exception as e:
                error_type = type(e).__name__
                context = {
                    "operation": "load_integrations_config",
                    "config_file": str(self.config_file),
                }
                logger.info(
                    "Failed to load integrations config, resetting",
                    error=str(e),
                    error_type=error_type,
                    context=context,
                    severity="info",
                )
                self._integrations = {}

    def _save(self) -> None:
        self.config_file.parent.mkdir(parents=True, exist_ok=True)
        data = [asdict(ig) for ig in self._integrations.values()]
        self.config_file.write_text(json.dumps(data, indent=2))

    def list(self) -> list[Integration]:
        return list(self._integrations.values())

    def list_integrations(self) -> list[dict]:
        """Return integrations as list of dicts (for webhook dispatch)."""
        return [asdict(ig) for ig in self._integrations.values()]

    def get(self, integration_id: str) -> Integration | None:
        return self._integrations.get(integration_id)

    def get_by_type(self, type_: IntegrationType) -> Integration | None:
        for ig in self._integrations.values():
            if ig.type == type_ and ig.enabled:
                return ig
        return None

    def add(self, integration: Integration) -> None:
        self._integrations[integration.id] = integration
        self._save()

    def update(self, integration_id: str, **kwargs) -> Integration | None:
        ig = self._integrations.get(integration_id)
        if not ig:
            return None
        for k, v in kwargs.items():
            if hasattr(ig, k):
                setattr(ig, k, v)
        self._save()
        return ig

    def delete(self, integration_id: str) -> bool:
        if integration_id not in self._integrations:
            return False
        del self._integrations[integration_id]
        self._save()
        return True

    def ensure_defaults(self) -> None:
        """Seed default integrations if config is empty."""
        import os

        if not self._integrations:
            defaults = [
                Integration(
                    id="bk_hub",
                    name="BerkahKarya Hub",
                    type="bk_hub",
                    url=os.environ.get("BK_HUB_URL", "http://localhost:9099"),
                    api_key="",
                    enabled=True,
                    meta={"company": "berkahkarya"},
                ),
                Integration(
                    id="adforge",
                    name="adforge",
                    type="adforge",
                    url=os.environ.get("ADFORGE_URL", "http://localhost:3000"),
                    api_key=os.environ.get("ADFORGE_API_KEY", ""),
                    enabled=True,
                    meta={},
                ),
            ]
            for d in defaults:
                self._integrations[d.id] = d
            self._save()

    def invoke_webhook(self, integration_id: str, event: str, payload: dict) -> None:
        """Fire webhook in background thread — non-blocking."""
        thread = threading.Thread(
            target=self._invoke_webhook_sync,
            args=(integration_id, event, payload),
            daemon=True,
        )
        thread.start()

    def _invoke_webhook_sync(
        self, integration_id: str, event: str, payload: dict
    ) -> None:
        """Synchronous webhook invocation with circuit breaker."""
        import httpx

        integration = self._get_integration(integration_id)
        if not integration:
            logger.warning(
                "Webhook integration not found", integration_id=integration_id
            )
            return

        url = integration.get("url", "")
        secret = integration.get("secret", "") or integration.get("api_key", "")
        if not url:
            return

        # Circuit breaker check
        if self._is_circuit_open(integration_id):
            logger.info(
                "Webhook circuit open, skipping",
                integration_id=integration_id,
                event=event,
            )
            self._log_attempt(integration_id, event, "skipped", None, "circuit open")
            return

        body = json.dumps(payload, default=str)
        signature = (
            hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
            if secret
            else ""
        )

        headers = {
            "Content-Type": "application/json",
            "X-Event": event,
            "X-Signature-SHA256": f"sha256={signature}",
        }

        max_retries = 3
        last_error = None
        http_status = None
        error_type = None

        for attempt in range(max_retries):
            try:
                response = httpx.post(url, content=body, headers=headers, timeout=10.0)
                response.raise_for_status()
                self._log_attempt(
                    integration_id, event, "success", response.status_code, None
                )
                self._reset_circuit(integration_id)
                logger.info(
                    "Webhook delivered",
                    integration_id=integration_id,
                    event=event,
                    webhook_url=url,
                    status=response.status_code,
                    retry_attempt=attempt + 1,
                )
                return {
                    "success": True,
                    "status_code": response.status_code,
                    "retries": attempt,
                }
            except httpx.TimeoutException as e:
                error_type = "timeout"
                last_error = f"Request timeout after 10s: {str(e)}"
                http_status = None
                logger.warning(
                    "Webhook timeout",
                    integration_id=integration_id,
                    event=event,
                    webhook_url=url,
                    error_type=error_type,
                    retry_attempt=attempt + 1,
                    max_retries=max_retries,
                )
            except httpx.HTTPStatusError as e:
                error_type = "http_error"
                http_status = e.response.status_code
                last_error = f"HTTP {http_status}: {str(e)}"
                logger.warning(
                    "Webhook HTTP error",
                    integration_id=integration_id,
                    event=event,
                    webhook_url=url,
                    error_type=error_type,
                    http_status=http_status,
                    retry_attempt=attempt + 1,
                    max_retries=max_retries,
                )
            except (httpx.ConnectError, httpx.NetworkError) as e:
                error_type = "network_error"
                last_error = f"Network error: {str(e)}"
                http_status = None
                logger.warning(
                    "Webhook network error",
                    integration_id=integration_id,
                    event=event,
                    webhook_url=url,
                    error_type=error_type,
                    retry_attempt=attempt + 1,
                    max_retries=max_retries,
                )
            except Exception as e:
                error_type = "unknown_error"
                last_error = f"Unexpected error: {str(e)}"
                http_status = getattr(getattr(e, "response", None), "status_code", None)
                logger.error(
                    "Webhook unexpected error",
                    integration_id=integration_id,
                    event=event,
                    webhook_url=url,
                    error_type=error_type,
                    error=str(e),
                    retry_attempt=attempt + 1,
                    max_retries=max_retries,
                )

            # Exponential backoff: 1s, 2s, 4s
            if attempt < max_retries - 1:
                delay = 2**attempt
                logger.info(
                    "Retrying webhook after delay",
                    integration_id=integration_id,
                    delay_seconds=delay,
                    next_attempt=attempt + 2,
                )
                time.sleep(delay)

        # All attempts failed
        self._log_attempt(integration_id, event, "failed", http_status, last_error)
        self._increment_failures(integration_id)
        logger.error(
            "Webhook delivery failed after all retries",
            integration_id=integration_id,
            event=event,
            webhook_url=url,
            error_type=error_type,
            error=last_error,
            retries=max_retries,
        )
        return {
            "success": False,
            "error": last_error,
            "retries": max_retries,
            "error_type": error_type,
        }

    def _get_integration(self, integration_id: str) -> dict | None:
        """Get integration by id from loaded integrations."""
        ig = self._integrations.get(integration_id)
        if ig:
            return asdict(ig)
        # Fallback: match by name
        for integ in self._integrations.values():
            if integ.name == integration_id:
                return asdict(integ)
        return None

    def _is_circuit_open(self, integration_id: str) -> bool:
        """Check if circuit breaker is open for this integration."""
        if not self._engine:
            return False
        try:
            from sqlalchemy.orm import Session
            from services.ebook.db.models import IntegrationLogRecord
            from datetime import datetime

            with Session(bind=self._engine) as session:
                latest = (
                    session.query(IntegrationLogRecord)
                    .filter(IntegrationLogRecord.integration_id == integration_id)
                    .order_by(IntegrationLogRecord.id.desc())
                    .first()
                )
                if latest and latest.circuit_open:
                    if latest.circuit_open_until and latest.circuit_open_until > datetime.utcnow():
                        return True
                    # Cooldown expired — auto-reset
                    latest.circuit_open = 0
                    latest.circuit_open_until = None
                    latest.consecutive_failures = 0
                    session.commit()
        except Exception as e:
            logger.warning(
                "Failed to check circuit breaker state",
                integration_id=integration_id,
                error=str(e),
            )
        return False

    def _increment_failures(self, integration_id: str) -> None:
        """Increment consecutive failure count; trip circuit after 2."""
        if not self._engine:
            return
        try:
            from sqlalchemy.orm import Session
            from services.ebook.db.models import IntegrationLogRecord
            from datetime import datetime

            with Session(bind=self._engine) as session:
                latest = (
                    session.query(IntegrationLogRecord)
                    .filter(IntegrationLogRecord.integration_id == integration_id)
                    .order_by(IntegrationLogRecord.id.desc())
                    .first()
                )
                count = (latest.consecutive_failures if latest else 0) + 1
                if latest:
                    latest.consecutive_failures = count
                    if count >= 2:
                        latest.circuit_open = 1
                        latest.circuit_open_until = datetime.utcnow() + timedelta(minutes=5)
                        logger.warning(
                            "Circuit breaker tripped",
                            integration_id=integration_id,
                            cooldown_until=latest.circuit_open_until.isoformat(),
                        )
                    session.commit()
        except Exception as e:
            logger.info("Could not update circuit state", error=str(e))

    def _reset_circuit(self, integration_id: str) -> None:
        """Reset circuit breaker after successful delivery."""
        if not self._engine:
            return
        try:
            from sqlalchemy.orm import Session
            from services.ebook.db.models import IntegrationLogRecord

            with Session(bind=self._engine) as session:
                latest = (
                    session.query(IntegrationLogRecord)
                    .filter(IntegrationLogRecord.integration_id == integration_id)
                    .order_by(IntegrationLogRecord.id.desc())
                    .first()
                )
                if latest:
                    latest.circuit_open = 0
                    latest.circuit_open_until = None
                    latest.consecutive_failures = 0
                    session.commit()
        except Exception as e:
            logger.warning(
                "Failed to reset circuit breaker",
                integration_id=integration_id,
                error=str(e),
            )

    def _log_attempt(
        self,
        integration_id: str,
        event: str,
        status: str,
        http_status,
        error: str | None,
    ) -> None:
        """Write attempt to integration_logs."""
        if not self._engine:
            return
        try:
            from sqlalchemy.orm import Session
            from services.ebook.db.models import IntegrationLogRecord

            with Session(bind=self._engine) as session:
                record = IntegrationLogRecord(
                    integration_id=integration_id,
                    event=event,
                    status=status,
                    http_status=http_status,
                    error=error,
                )
                session.add(record)
                session.commit()
        except Exception as e:
            logger.info("Could not write integration log", error=str(e))
