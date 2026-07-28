"""
Adjusts token budgets based on observed word-count outcomes.
Persists calibration data to projects/token_calibration.json.
"""

from __future__ import annotations
import json
from pathlib import Path
from dataclasses import dataclass, asdict
from services.ebook.config import get_config
from services.ebook.logger import get_logger

logger = get_logger(__name__)

CALIBRATION_FILE = Path("projects/token_calibration.json")


@dataclass
class CalibrationRecord:
    section_type: str  # "intro", "subchapter", "outro"
    token_budget: int
    words_produced: int
    samples: int = 1

    @property
    def words_per_token(self) -> float:
        return self.words_produced / max(self.token_budget, 1)


class TokenCalibrator:
    def __init__(self, calibration_file: Path = CALIBRATION_FILE):
        self.calibration_file = calibration_file
        self._records: dict[str, CalibrationRecord] = {}
        self._load()

    def _load(self) -> None:
        if self.calibration_file.exists():
            try:
                raw = json.loads(self.calibration_file.read_text())
                for section_type, r in raw.items():
                    self._records[section_type] = CalibrationRecord(**r)
            except Exception as e:
                logger.info("Failed to load token calibration data", error=str(e))

    def _save(self) -> None:
        self.calibration_file.parent.mkdir(parents=True, exist_ok=True)
        self.calibration_file.write_text(
            json.dumps({k: asdict(v) for k, v in self._records.items()}, indent=2)
        )

    def record(self, section_type: str, token_budget: int, words_produced: int) -> None:
        if section_type in self._records:
            rec = self._records[section_type]
            # Rolling average
            rec.words_produced = (
                rec.words_produced * rec.samples + words_produced
            ) // (rec.samples + 1)
            rec.token_budget = (rec.token_budget * rec.samples + token_budget) // (
                rec.samples + 1
            )
            rec.samples += 1
        else:
            self._records[section_type] = CalibrationRecord(
                section_type=section_type,
                token_budget=token_budget,
                words_produced=words_produced,
            )
        self._save()

    def calibrated_tokens(self, section_type: str, target_words: int) -> int:
        """Return a token budget calibrated to hit target_words based on observed ratio."""
        cfg = get_config()
        defaults = {
            "intro": cfg.tokens_intro,
            "subchapter": cfg.tokens_subchapter,
            "outro": cfg.tokens_outro,
        }
        base = defaults.get(section_type, cfg.tokens_subchapter)

        if section_type not in self._records or self._records[section_type].samples < 3:
            return base  # not enough data yet

        rec = self._records[section_type]
        if rec.words_per_token <= 0:
            return base
        needed = int(target_words / rec.words_per_token)
        # Cap at 4x base to avoid runaway costs
        return min(needed, base * 4)

    def get_calibration(self) -> dict:
        return {k: asdict(v) for k, v in self._records.items()}
