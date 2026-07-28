"""
Tracks AI model performance per task type and surfaces the best model.
Stats are persisted to projects/model_stats.json.
"""

from __future__ import annotations
import json
import time
from pathlib import Path
from dataclasses import dataclass, field, asdict
from services.ebook.config import get_config
from services.ebook.logger import get_logger

logger = get_logger(__name__)

STATS_FILE = Path("projects/model_stats.json")


@dataclass
class ModelStats:
    model: str
    task_type: str
    successes: int = 0
    failures: int = 0
    total_tokens: int = 0
    total_latency_ms: float = 0.0

    @property
    def attempts(self) -> int:
        return self.successes + self.failures

    @property
    def success_rate(self) -> float:
        return self.successes / self.attempts if self.attempts > 0 else 0.0

    @property
    def avg_latency_ms(self) -> float:
        return self.total_latency_ms / self.attempts if self.attempts > 0 else 0.0


class ModelTracker:
    def __init__(self, stats_file: Path = STATS_FILE):
        self.stats_file = stats_file
        self._stats: dict[str, dict[str, ModelStats]] = (
            {}
        )  # task_type -> model -> stats
        self._load()

    def _load(self) -> None:
        if self.stats_file.exists():
            try:
                raw = json.loads(self.stats_file.read_text())
                for task_type, models in raw.items():
                    self._stats[task_type] = {}
                    for model, s in models.items():
                        self._stats[task_type][model] = ModelStats(**s)
            except Exception as e:
                logger.info("Failed to load model stats, resetting", error=str(e))
                self._stats = {}

    def _save(self) -> None:
        self.stats_file.parent.mkdir(parents=True, exist_ok=True)
        data: dict = {}
        for task_type, models in self._stats.items():
            data[task_type] = {m: asdict(s) for m, s in models.items()}
        self.stats_file.write_text(json.dumps(data, indent=2))

    def record(
        self,
        model: str,
        task_type: str,
        success: bool,
        tokens: int = 0,
        latency_ms: float = 0.0,
    ) -> None:
        if task_type not in self._stats:
            self._stats[task_type] = {}
        if model not in self._stats[task_type]:
            self._stats[task_type][model] = ModelStats(model=model, task_type=task_type)
        s = self._stats[task_type][model]
        if success:
            s.successes += 1
        else:
            s.failures += 1
        s.total_tokens += tokens
        s.total_latency_ms += latency_ms
        self._save()

    def best_model(self, task_type: str, default: str | None = None) -> str:
        cfg = get_config()
        default = default or cfg.default_model
        models = self._stats.get(task_type, {})
        qualified = [
            s
            for s in models.values()
            if s.attempts >= cfg.model_min_samples
            and s.success_rate >= cfg.model_success_threshold
        ]
        if not qualified:
            return default
        return max(qualified, key=lambda s: s.success_rate).model

    def get_stats(self) -> dict:
        result = {}
        for task_type, models in self._stats.items():
            result[task_type] = [asdict(s) for s in models.values()]
        return result
