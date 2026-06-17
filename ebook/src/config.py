from __future__ import annotations
import json
from dataclasses import dataclass, field, asdict
from pathlib import Path

try:
    from src.logger import get_logger

    logger = get_logger(__name__)
except ImportError:
    import logging

    logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent.parent / "config.json"


@dataclass
class PipelineConfig:
    # AI routing (provider: omniroute, ollama, openai, or custom)
    provider: str = "omniroute"
    # Model names vary by provider
    default_model: str = "auto/free-chat"
    outline_model: str = "auto/free-chat"
    strategy_model: str = "auto/free-chat"
    cover_model: str = "auto/free-chat"
    qa_model: str = "auto/free-chat"

    # Provider-specific model overrides (used when provider is not omniroute)
    ollama_default_model: str = "qwen2.5:7b"
    ollama_outline_model: str = "qwen2.5:7b"
    ollama_strategy_model: str = "qwen2.5:7b"
    ollama_cover_model: str = "qwen2.5:7b"
    ollama_qa_model: str = "qwen2.5:7b"

    openai_default_model: str = "gpt-4o-mini"
    openai_outline_model: str = "gpt-4o-mini"
    openai_strategy_model: str = "gpt-4o-mini"
    openai_cover_model: str = "gpt-4o-mini"
    openai_qa_model: str = "gpt-4o-mini"

    # Token budgets per section type
    tokens_intro: int = 800
    tokens_subchapter: int = 1500
    tokens_outro: int = 400
    tokens_strategy: int = 1200
    tokens_outline: int = 3000

    # QA thresholds
    qa_word_count_tolerance: float = 0.15  # ±15%
    qa_min_chapter_words: int = 800
    qa_max_retry_attempts: int = 3
    qa_readability_enabled: bool = True
    qa_structure_check_enabled: bool = True
    qa_prose_quality_enabled: bool = True
    qa_post_qa_retries: int = 2

    # Export
    docx_author: str = "AI Ebook Generator"
    cover_width: int = 1200
    cover_height: int = 1600
    cover_title_font_size: int = 80
    cover_watermark_font_size: int = 40

    # Server
    api_host: str = "0.0.0.0"
    api_port: int = 8765
    ui_port: int = 8501

    # AI reliability
    ai_request_timeout: int = 300
    ai_max_retries: int = 3

    # Writing quality
    model_capability_tier: str = "medium"  # "small" | "medium" | "large"
    chapter_enrichment_enabled: bool = True

    # Comics generation
    comics_parallel_workers: int = 4

    # Model performance tracking
    model_success_threshold: float = 0.8  # min success rate to keep using a model
    model_min_samples: int = 5  # samples before switching

    @classmethod
    def load(cls) -> "PipelineConfig":
        if CONFIG_PATH.exists():
            try:
                data = json.loads(CONFIG_PATH.read_text())
                valid = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
                return cls(**valid)
            except Exception as e:
                logger.info("Failed to load config file, using defaults", error=str(e))
        return cls()

    def save(self) -> None:
        CONFIG_PATH.write_text(json.dumps(asdict(self), indent=2))


_config: PipelineConfig | None = None


def get_config() -> PipelineConfig:
    global _config
    if _config is None:
        _config = PipelineConfig.load()
    return _config


def reload_config() -> PipelineConfig:
    global _config
    _config = PipelineConfig.load()
    return _config
