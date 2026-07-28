from dataclasses import dataclass, field
from typing import Any


@dataclass
class PipelineProfile:
    product_mode: str
    strategy_extra_fields: dict[str, Any] = field(default_factory=dict)
    chapter_structure: str = "hook->intro->body->summary->transition"
    qa_rules: list[str] = field(default_factory=list)
    is_fiction: bool = False
    genre: str | None = None


PROFILES: dict[str, PipelineProfile] = {
    "lead_magnet": PipelineProfile(product_mode="lead_magnet"),
    "paid_ebook": PipelineProfile(product_mode="paid_ebook"),
    "bonus_content": PipelineProfile(product_mode="bonus_content"),
    "authority": PipelineProfile(product_mode="authority"),
}

PROFILES["novel"] = PipelineProfile(
    product_mode="novel",
    strategy_extra_fields={
        "protagonist": str,
        "antagonist": str,
        "setting": str,
        "central_conflict": str,
        "narrative_arc": str,
        "genre": str,
    },
    chapter_structure="scene→conflict→resolution→cliffhanger",
    qa_rules=["character_name_consistency"],
    is_fiction=True,
)

PROFILES["short_story"] = PipelineProfile(
    product_mode="short_story",
    strategy_extra_fields={
        "protagonist": str,
        "setting": str,
        "central_conflict": str,
        "genre": str,
        "pov": str,
    },
    chapter_structure="setup→inciting_incident→rising_action→climax→resolution",
    qa_rules=["character_name_consistency", "pov_consistency"],
    is_fiction=True,
)

PROFILES["memoir"] = PipelineProfile(
    product_mode="memoir",
    strategy_extra_fields={
        "time_period": str,
        "central_theme": str,
        "narrative_arc": str,
        "emotional_journey": str,
    },
    chapter_structure="scene→reflection→lesson→forward_momentum",
    qa_rules=["tense_consistency", "voice_consistency"],
    is_fiction=False,
)

PROFILES["how_to_guide"] = PipelineProfile(
    product_mode="how_to_guide",
    strategy_extra_fields={
        "skill_level": str,
        "prerequisites": str,
        "end_result": str,
    },
    chapter_structure="objective→prerequisites→step_by_step→troubleshooting→checkpoint",
    qa_rules=["numbered_steps_present", "action_verbs"],
    is_fiction=False,
)

PROFILES["textbook"] = PipelineProfile(
    product_mode="textbook",
    strategy_extra_fields={
        "subject": str,
        "academic_level": str,
        "learning_objectives": str,
    },
    chapter_structure="learning_objectives→concept→examples→exercises→summary→review_questions",
    qa_rules=["learning_objectives_present", "exercises_present"],
    is_fiction=False,
)

PROFILES["academic_paper"] = PipelineProfile(
    product_mode="academic_paper",
    strategy_extra_fields={
        "research_question": str,
        "methodology": str,
        "field": str,
        "citation_style": str,
    },
    chapter_structure="abstract→introduction→literature_review→methodology→results→discussion→conclusion→references",
    qa_rules=["citations_present", "abstract_present", "methodology_present"],
    is_fiction=False,
)


PROFILES["manga"] = PipelineProfile(
    product_mode="manga", is_fiction=True, genre="manga"
)
PROFILES["manhwa"] = PipelineProfile(
    product_mode="manhwa", is_fiction=True, genre="manhwa"
)
PROFILES["manhua"] = PipelineProfile(
    product_mode="manhua", is_fiction=True, genre="manhua"
)
PROFILES["comics"] = PipelineProfile(
    product_mode="comics", is_fiction=True, genre="comics"
)


def get_profile(product_mode: str) -> PipelineProfile:
    """Return the profile for the given product_mode, or a default profile for unknown modes."""
    return PROFILES.get(product_mode, PipelineProfile(product_mode=product_mode))
