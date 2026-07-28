import unicodedata
from pathlib import Path

from services.ebook.db.models import ProductMode
from services.ebook.db.repository import ProjectRepository


class ProjectIntake:
    VALID_PRODUCT_MODES = {m.value for m in ProductMode}
    MIN_IDEA_LENGTH = 10
    MAX_IDEA_LENGTH = 500
    MIN_CHAPTERS = 2
    MAX_CHAPTERS = 20

    def __init__(self, db_path: Path | str):
        self.db_path = db_path
        self.repo = ProjectRepository(db_path)

    def create_project(
        self,
        idea: str,
        product_mode: str = "lead_magnet",
        target_language: str = "en",
        chapter_count: int = 5,
        target_languages: list[str] | None = None,
    ) -> dict:
        # Strip control characters and normalize Unicode whitespace
        idea = "".join(
            ch for ch in idea if unicodedata.category(ch) not in ("Cc", "Cf")
        ).strip()
        idea = " ".join(idea.split())  # normalize all whitespace to single spaces
        product_mode = product_mode.lower().strip()

        if len(idea) < self.MIN_IDEA_LENGTH:
            raise ValueError(f"Idea must be at least {self.MIN_IDEA_LENGTH} characters")
        if len(idea) > self.MAX_IDEA_LENGTH:
            raise ValueError(f"Idea must not exceed {self.MAX_IDEA_LENGTH} characters")
        if product_mode not in self.VALID_PRODUCT_MODES:
            raise ValueError(f"product_mode must be one of: {self.VALID_PRODUCT_MODES}")
        if chapter_count < self.MIN_CHAPTERS or chapter_count > self.MAX_CHAPTERS:
            raise ValueError(
                f"chapter_count must be between {self.MIN_CHAPTERS} and {self.MAX_CHAPTERS}"
            )

        if target_languages:
            import logging
            from services.ebook.i18n.languages import SUPPORTED_LANGUAGES

            seen: set[str] = set()
            target_languages = [
                lang_code
                for lang_code in target_languages
                if not (lang_code in seen or seen.add(lang_code))
            ]
            if len(target_languages) > 10:
                raise ValueError(
                    "target_languages may not contain more than 10 languages"
                )
            for lang in target_languages:
                if lang not in SUPPORTED_LANGUAGES:
                    logging.warning(
                        f"Language code '{lang}' not in SUPPORTED_LANGUAGES; proceeding anyway"
                    )

        title = self._generate_title(idea)
        project_id = self.repo.create_project(
            title=title,
            idea=idea,
            product_mode=product_mode,
            target_language=target_language,
            chapter_count=chapter_count,
        )
        self.repo.set_target_languages(
            project_id, target_languages or [target_language]
        )
        return self.repo.get_project(project_id)

    def _generate_title(self, idea: str) -> str:
        words = idea.split()
        if len(words) > 5:
            return " ".join(words[:5]) + "..."
        return idea
