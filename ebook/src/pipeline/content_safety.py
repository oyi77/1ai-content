CONTENT_WARNING = """
DISCLAIMER: This content was AI-generated and may contain inaccuracies.
Always review and verify all factual claims before publishing.
"""

BLOCKED_KEYWORDS = [
    "violence",
    "harmful",
    "illegal",
    "fraud",
]


class ContentSafety:
    def __init__(self, blocked_keywords: list[str] = None):
        self.blocked_keywords = blocked_keywords or BLOCKED_KEYWORDS

    def check_content(self, content: str) -> dict:
        content_lower = content.lower()

        issues = []
        for keyword in self.blocked_keywords:
            if keyword in content_lower:
                issues.append(f"Potentially sensitive keyword detected: {keyword}")

        return {
            "passed": len(issues) == 0,
            "issues": issues,
        }

    def add_disclaimer(self, content: str) -> str:
        return f"{content}\n\n---\n{CONTENT_WARNING}"
