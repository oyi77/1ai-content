import pytest
from unittest.mock import MagicMock, call

from src.pipeline.progress_tracker import ProgressTracker


class TestProgressTrackerInitialization:
    def test_init_with_callback(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback, total_steps=10)
        assert tracker.on_progress == callback
        assert tracker.total_steps == 10
        assert tracker.current_step == 0
        assert tracker.is_complete is False

    def test_init_without_callback(self):
        tracker = ProgressTracker(total_steps=5)
        assert tracker.on_progress is None
        assert tracker.total_steps == 5
        assert tracker.current_step == 0
        assert tracker.is_complete is False

    def test_init_default_total_steps(self):
        tracker = ProgressTracker()
        assert tracker.total_steps == 100


class TestProgressTrackerUpdate:
    def test_update_calls_callback(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback)
        tracker.update(50, "Halfway done")
        callback.assert_called_once_with(50, "Halfway done")

    def test_update_without_callback(self):
        tracker = ProgressTracker(on_progress=None)
        tracker.update(50, "Halfway done")

    def test_update_multiple_times(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback)
        tracker.update(25, "First update")
        tracker.update(50, "Second update")
        tracker.update(75, "Third update")
        assert callback.call_count == 3
        assert callback.call_args_list == [
            call(25, "First update"),
            call(50, "Second update"),
            call(75, "Third update"),
        ]


class TestProgressTrackerStep:
    def test_step_advances_counter(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback, total_steps=10)
        tracker.step("Step 1")
        assert tracker.current_step == 1
        callback.assert_called_once_with(10, "Step 1")

    def test_step_calculates_percentage(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback, total_steps=4)
        tracker.step("Step 1")
        tracker.step("Step 2")
        tracker.step("Step 3")
        assert callback.call_args_list == [
            call(25, "Step 1"),
            call(50, "Step 2"),
            call(75, "Step 3"),
        ]

    def test_step_with_zero_total_steps(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback, total_steps=0)
        tracker.step("Step")
        callback.assert_called_once_with(0, "Step")

    def test_step_without_callback(self):
        tracker = ProgressTracker(on_progress=None, total_steps=10)
        tracker.step("Step 1")
        assert tracker.current_step == 1


class TestProgressTrackerComplete:
    def test_complete_sets_flag(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback)
        tracker.complete("Done")
        assert tracker.is_complete is True
        callback.assert_called_once_with(100, "Done")

    def test_complete_default_message(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback)
        tracker.complete()
        callback.assert_called_once_with(100, "Complete")

    def test_complete_without_callback(self):
        tracker = ProgressTracker(on_progress=None)
        tracker.complete("Done")
        assert tracker.is_complete is True


class TestProgressTrackerReset:
    def test_reset_clears_state(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback, total_steps=10)
        tracker.step("Step 1")
        tracker.complete("Done")
        assert tracker.current_step == 1
        assert tracker.is_complete is True

        tracker.reset()
        assert tracker.current_step == 0
        assert tracker.is_complete is False

    def test_reset_does_not_call_callback(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback, total_steps=10)
        tracker.step("Step 1")
        callback.reset_mock()
        tracker.reset()
        callback.assert_not_called()


class TestProgressTrackerIntegration:
    def test_typical_workflow(self):
        callback = MagicMock()
        tracker = ProgressTracker(on_progress=callback, total_steps=3)

        tracker.update(0, "Starting...")
        tracker.step("Processing item 1")
        tracker.step("Processing item 2")
        tracker.step("Processing item 3")
        tracker.complete("All done!")

        assert callback.call_count == 5
        assert tracker.is_complete is True
        assert tracker.current_step == 3

    def test_manuscript_generation_pattern(self):
        callback = MagicMock()
        chapters = 5
        tracker = ProgressTracker(on_progress=callback, total_steps=chapters + 2)

        tracker.update(0, "Starting manuscript generation...")
        for i in range(1, chapters + 1):
            progress = int((i - 1) / chapters * 100)
            tracker.update(progress, f"Writing chapter {i}/{chapters}...")

        tracker.update(95, "Finalizing manuscript...")
        tracker.complete("Manuscript generation complete!")

        assert callback.call_count == chapters + 3
        assert tracker.is_complete is True
