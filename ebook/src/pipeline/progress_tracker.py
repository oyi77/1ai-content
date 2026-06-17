"""Progress tracking for pipeline stages."""

from typing import Callable, Optional


class ProgressTracker:
    """Manages progress updates and completion tracking for pipeline stages.

    Encapsulates progress callback logic, percentage calculation, and status tracking.
    """

    def __init__(
        self,
        on_progress: Optional[Callable[[int, str], None]] = None,
        total_steps: int = 100,
    ):
        """Initialize progress tracker.

        Args:
            on_progress: Optional callback receiving (progress_percent, message)
            total_steps: Total number of steps for percentage calculation
        """
        self.on_progress = on_progress
        self.total_steps = total_steps
        self.current_step = 0
        self.is_complete = False

    def update(self, progress: int, message: str) -> None:
        """Update progress with percentage and message.

        Args:
            progress: Progress percentage (0-100)
            message: Status message to display
        """
        if self.on_progress:
            self.on_progress(progress, message)

    def step(self, message: str) -> None:
        """Advance to next step and update progress.

        Args:
            message: Status message for this step
        """
        self.current_step += 1
        if self.total_steps > 0:
            progress = int((self.current_step / self.total_steps) * 100)
        else:
            progress = 0
        self.update(progress, message)

    def complete(self, message: str = "Complete") -> None:
        """Mark generation as complete.

        Args:
            message: Final status message
        """
        self.is_complete = True
        self.update(100, message)

    def reset(self) -> None:
        """Reset tracker to initial state."""
        self.current_step = 0
        self.is_complete = False
