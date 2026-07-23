"""Token generation statistics for book generation."""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class GenerationStatistics:
    prompt_tokens: int = 0
    prompt_tokens_used: int = 0  # alias for prompt_tokens
    completion_tokens: int = 0
    completion_tokens_used: int = 0  # alias for completion_tokens
    total_tokens: int = 0
    total_tokens_used: int = 0  # alias for total_tokens

    cost: float = 0.0
    token_price: float = 0.0
    cached_tokens: int = 0

    def __post_init__(self):
        # Normalize aliases
        if self.prompt_tokens_used and not self.prompt_tokens:
            self.prompt_tokens = self.prompt_tokens_used
        if self.completion_tokens_used and not self.completion_tokens:
            self.completion_tokens = self.completion_tokens_used
        if self.total_tokens_used and not self.total_tokens:
            self.total_tokens = self.total_tokens_used

    @property
    def total(self) -> int:
        return self.total_tokens or (self.prompt_tokens + self.completion_tokens)

    def __add__(self, other: "GenerationStatistics") -> "GenerationStatistics":
        return GenerationStatistics(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
            total_tokens=self.total + other.total,
        )


# Global accumulator
total_stats: GenerationStatistics = GenerationStatistics()
