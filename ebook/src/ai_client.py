import json
import os
import random
import re
import time
from typing import Any, Literal

from openai import OpenAI

from src.logger import get_logger

try:
    from oneai_ai_pipeline import AIPipeline, AIPipelineConfig

    _SHARED_AI_AVAILABLE = True
except ImportError:
    AIPipeline = None
    AIPipelineConfig = None
    _SHARED_AI_AVAILABLE = False

logger = get_logger(__name__)


class PermanentAPIError(Exception):
    """Raised when an API error is permanent (e.g., 400, 401, 404) and should not be retried."""

    pass


from typing import Protocol, Any, Dict, List, Optional, Union


class AIClient(Protocol):
    def generate_text(
        self,
        prompt: str,
        system_prompt: str = "You are a helpful assistant.",
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str: ...

    def generate_structured(
        self,
        prompt: str,
        system_prompt: str = "You are a helpful assistant.",
        response_schema: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> Union[Dict[str, Any], List[Any]]: ...


class OmnirouteClient(AIClient):
    def _parse_json_response(self, content: str | None) -> dict[str, Any]:
        if content is None:
            raise ValueError(
                "AI response content is None (possible refusal or tool-call response)"
            )
        # strip markdown code blocks from start/end
        content = content.strip()
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
        content = content.strip()
        # extract first JSON object or array if surrounded by prose
        match = re.search(r"(\{.*\}|\[.*\])", content, re.DOTALL)
        if match:
            content = match.group(1)
        return json.loads(content)

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        provider: Literal["omniroute", "ollama", "openai", "custom"] | None = None,
        max_retries: int = 3,
        timeout: int = 300,
    ):
        # Try shared AIPipeline first if available
        self._pipeline = None
        if _SHARED_AI_AVAILABLE and AIPipeline is not None:
            try:
                self._pipeline = AIPipeline.from_env()
            except Exception:
                self._pipeline = None

        # Determine provider from explicit arg, env var, or default
        self.provider = provider or os.getenv("EBOOK_AI_PROVIDER", "omniroute")

        # Set base URL and API key based on provider
        if self.provider == "omniroute":
            self.base_url = base_url or os.getenv(
                "OMNIROUTE_BASE_URL", "http://localhost:20128/v1"
            )
            self.api_key = api_key or os.getenv("OMNIROUTE_API_KEY", "")
        elif self.provider == "ollama":
            self.base_url = base_url or os.getenv(
                "OLLAMA_BASE_URL", "http://localhost:11434/v1"
            )
            self.api_key = api_key or os.getenv("OLLAMA_API_KEY", "ollama")
        elif self.provider == "openai":
            self.base_url = base_url or os.getenv(
                "OPENAI_BASE_URL", "https://api.openai.com/v1"
            )
            self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        else:  # custom
            self.base_url = base_url or os.getenv(
                "CUSTOM_AI_BASE_URL", "http://localhost:20128/v1"
            )
            self.api_key = api_key or os.getenv("CUSTOM_AI_API_KEY", "")

        from src.config import get_config

        cfg = get_config()
        self.max_retries = max_retries if max_retries != 3 else cfg.ai_max_retries
        self.timeout = timeout if timeout != 300 else cfg.ai_request_timeout
        self.client = OpenAI(
            base_url=self.base_url, api_key=self.api_key, timeout=self.timeout
        )
        self._supports_images: bool | None = None

    def generate_text(
        self,
        prompt: str,
        system_prompt: str = "You are a helpful assistant.",
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> str:
        if self._pipeline is not None:
            try:
                from oneai_ai_pipeline import GenerateOptions

                opts = GenerateOptions(
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    system_prompt=system_prompt,
                )
                result = self._pipeline.generate_sync(prompt, opts)
                if result and result.content:
                    return result.content
            except Exception:
                pass

        if model is None:
            from src.config import get_config

            config = get_config()
            if self.provider == "ollama":
                model = config.ollama_default_model
            elif self.provider == "openai":
                model = config.openai_default_model
            else:  # omniroute or custom
                model = config.default_model

        for attempt in range(self.max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                return response.choices[0].message.content
            except Exception as e:
                err_str = str(e).lower()
                error_type = type(e).__name__
                context = {
                    "operation": "generate_text",
                    "model": model,
                    "attempt": attempt + 1,
                    "max_retries": self.max_retries,
                    "provider": getattr(self, "provider", "unknown"),
                }

                if any(
                    code in err_str
                    for code in ("400", "401", "403", "404", "invalid_request")
                ):
                    logger.error(
                        "Permanent API error, not retrying",
                        error=str(e),
                        error_type=error_type,
                        context=context,
                        severity="error",
                    )
                    raise PermanentAPIError(f"Permanent API error: {e}") from e

                if attempt == self.max_retries - 1:
                    logger.error(
                        "AI text generation failed after all retries",
                        error=str(e),
                        error_type=error_type,
                        context=context,
                        severity="error",
                    )
                    raise

                wait_time = (2**attempt) + random.uniform(0, 1)
                if "429" in err_str:
                    wait_time *= 2

                logger.warning(
                    "AI text generation failed, retrying",
                    error=str(e),
                    error_type=error_type,
                    context={**context, "wait_time": wait_time},
                    severity="warning",
                )
                time.sleep(wait_time)
        return ""

    def generate_structured(
        self,
        prompt: str,
        system_prompt: str = "You are a helpful assistant.",
        response_schema: dict[str, Any] | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        if self._pipeline is not None:
            try:
                from oneai_ai_pipeline import GenerateOptions

                opts = GenerateOptions(
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    system_prompt=system_prompt,
                    json_mode=True,
                )
                text = self._pipeline.generate_sync(prompt, opts)
                if text and text.content:
                    return self._parse_json_response(text.content)
            except Exception:
                pass

        if model is None:
            from src.config import get_config

            config = get_config()
            if self.provider == "ollama":
                model = config.ollama_default_model
            elif self.provider == "openai":
                model = config.openai_default_model
            else:  # omniroute or custom
                model = config.default_model

        if response_schema:
            system_prompt += (
                f"\n\nRespond with valid JSON matching this schema: {response_schema}"
            )

        for attempt in range(self.max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {
                            "role": "user",
                            "content": prompt + "\n\nRespond with JSON only.",
                        },
                    ],
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                content = response.choices[0].message.content
                return self._parse_json_response(content)
            except (json.JSONDecodeError, ValueError) as e:
                error_type = type(e).__name__
                context = {
                    "operation": "generate_structured",
                    "model": model,
                    "attempt": attempt + 1,
                    "max_retries": self.max_retries,
                    "provider": getattr(self, "provider", "unknown"),
                }

                if attempt == self.max_retries - 1:
                    logger.error(
                        "JSON parsing failed after all retries",
                        error=str(e),
                        error_type=error_type,
                        context=context,
                        severity="error",
                    )
                    raise

                logger.warning(
                    "JSON parsing failed, retrying",
                    error=str(e),
                    error_type=error_type,
                    context=context,
                    severity="warning",
                )
                time.sleep(1)
                continue
            except Exception as e:
                err_str = str(e).lower()
                error_type = type(e).__name__
                context = {
                    "operation": "generate_structured",
                    "model": model,
                    "attempt": attempt + 1,
                    "max_retries": self.max_retries,
                    "provider": getattr(self, "provider", "unknown"),
                }

                if any(
                    code in err_str
                    for code in ("400", "401", "403", "404", "invalid_request")
                ):
                    logger.error(
                        "Permanent API error, not retrying",
                        error=str(e),
                        error_type=error_type,
                        context=context,
                        severity="error",
                    )
                    raise PermanentAPIError(f"Permanent API error: {e}") from e

                if attempt == self.max_retries - 1:
                    logger.error(
                        "AI structured generation failed after all retries",
                        error=str(e),
                        error_type=error_type,
                        context=context,
                        severity="error",
                    )
                    raise

                wait_time = (2**attempt) + random.uniform(0, 1)
                if "429" in err_str:
                    wait_time *= 2

                logger.warning(
                    "AI structured generation failed, retrying",
                    error=str(e),
                    error_type=error_type,
                    context={**context, "wait_time": wait_time},
                    severity="warning",
                )
                time.sleep(wait_time)
        return {}

    def generate_image(
        self, prompt: str, size: str = "1024x1024", model: str = "dall-e-3"
    ) -> bytes:
        """Generate an image. Raises RuntimeError if proxy does not support images."""
        if self._supports_images is False:
            raise RuntimeError("Image generation not supported by this AI provider")
        import base64

        try:
            response = self.client.images.generate(
                model=model,
                prompt=prompt,
                size=size,
                response_format="b64_json",
                n=1,
            )
            self._supports_images = True
            return base64.b64decode(response.data[0].b64_json)
        except Exception as e:
            err_str = str(e).lower()
            error_type = type(e).__name__
            context = {
                "operation": "generate_image",
                "model": model,
                "size": size,
                "provider": getattr(self, "provider", "unknown"),
            }

            if (
                "404" in err_str
                or "not found" in err_str
                or error_type in ("NotFoundError", "APIStatusError")
            ):
                self._supports_images = False
                logger.warning(
                    "Image generation not supported by provider",
                    error=str(e),
                    error_type=error_type,
                    context=context,
                    severity="warning",
                )
            else:
                logger.error(
                    "Image generation failed",
                    error=str(e),
                    error_type=error_type,
                    context=context,
                    severity="error",
                )
            raise RuntimeError(f"Image generation unavailable: {e}") from e
