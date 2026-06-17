import json
from pathlib import Path


class FileManager:
    def __init__(self, projects_dir: Path | str = "projects"):
        self.projects_dir = Path(projects_dir)

    def get_project_dir(self, project_id: int) -> Path:
        return self.projects_dir / str(project_id)

    def ensure_directories(self, project_id: int) -> Path:
        project_dir = self.get_project_dir(project_id)
        (project_dir / "chapters").mkdir(parents=True, exist_ok=True)
        (project_dir / "cover").mkdir(parents=True, exist_ok=True)
        (project_dir / "exports").mkdir(parents=True, exist_ok=True)
        return project_dir

    def list_projects(self) -> list[dict]:
        projects = []
        for project_dir in self.projects_dir.iterdir():
            if project_dir.is_dir():
                project_id = project_dir.name
                metadata = self.get_project_metadata(project_id)
                if metadata:
                    projects.append({"id": project_id, **metadata})
        return sorted(projects, key=lambda x: x.get("created_at", ""), reverse=True)

    def get_project_metadata(self, project_id: int) -> dict | None:
        project_dir = self.get_project_dir(project_id)

        files_to_check = [
            "outline.json",
            "strategy.json",
            "manuscript.json",
            "qa_report.json",
        ]

        for f in files_to_check:
            if (project_dir / f).exists():
                with open(project_dir / f) as fp:
                    return json.load(fp)

        return None

    def get_edition_dir(
        self, project_id: int, lang: str | None = None, primary_lang: str = "en"
    ) -> Path:
        """
        Returns the output directory for a language edition.
        The primary language (default 'en') uses the base project dir for backward compatibility.
        Non-primary languages get projects/{id}/editions/{lang}/.

        Pass primary_lang=target_languages[0] when the project has no English edition.
        """
        base = self.get_project_dir(project_id)
        if lang and lang != primary_lang:
            return base / "editions" / lang
        return base

    def cleanup_project(self, project_id: int) -> None:
        import shutil

        project_dir = self.get_project_dir(project_id)
        if project_dir.exists():
            shutil.rmtree(project_dir)
