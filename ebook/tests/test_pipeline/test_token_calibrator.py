import pytest
import json
from pathlib import Path
from src.pipeline.token_calibrator import TokenCalibrator, CalibrationRecord


@pytest.fixture
def temp_calibration_file(tmp_path):
    """Provide a temporary calibration file path."""
    return tmp_path / "token_calibration.json"


@pytest.fixture
def calibrator(temp_calibration_file):
    """Provide a fresh TokenCalibrator instance."""
    return TokenCalibrator(calibration_file=temp_calibration_file)


class TestCalibrationRecord:
    """Test CalibrationRecord dataclass."""

    def test_words_per_token_calculation(self):
        """Test words_per_token property calculates correctly."""
        record = CalibrationRecord(
            section_type="intro", token_budget=800, words_produced=400, samples=1
        )
        assert record.words_per_token == 0.5

    def test_words_per_token_zero_budget(self):
        """Test words_per_token handles zero token budget."""
        record = CalibrationRecord(
            section_type="intro", token_budget=0, words_produced=100, samples=1
        )
        # Should use max(token_budget, 1) to avoid division by zero
        assert record.words_per_token == 100.0

    def test_words_per_token_high_ratio(self):
        """Test words_per_token with high word-to-token ratio."""
        record = CalibrationRecord(
            section_type="subchapter", token_budget=1000, words_produced=2000, samples=5
        )
        assert record.words_per_token == 2.0


class TestTokenCalibratorInit:
    """Test TokenCalibrator initialization and loading."""

    def test_init_creates_empty_records(self, temp_calibration_file):
        """Test initialization with no existing file."""
        calibrator = TokenCalibrator(calibration_file=temp_calibration_file)
        assert calibrator._records == {}
        assert not temp_calibration_file.exists()

    def test_load_existing_calibration(self, temp_calibration_file):
        """Test loading existing calibration data."""
        # Create calibration file
        data = {
            "intro": {
                "section_type": "intro",
                "token_budget": 800,
                "words_produced": 400,
                "samples": 3,
            }
        }
        temp_calibration_file.parent.mkdir(parents=True, exist_ok=True)
        temp_calibration_file.write_text(json.dumps(data))

        calibrator = TokenCalibrator(calibration_file=temp_calibration_file)
        assert "intro" in calibrator._records
        assert calibrator._records["intro"].token_budget == 800
        assert calibrator._records["intro"].words_produced == 400
        assert calibrator._records["intro"].samples == 3

    def test_load_corrupted_file_graceful(self, temp_calibration_file):
        """Test graceful handling of corrupted calibration file."""
        temp_calibration_file.parent.mkdir(parents=True, exist_ok=True)
        temp_calibration_file.write_text("invalid json {{{")

        calibrator = TokenCalibrator(calibration_file=temp_calibration_file)
        assert calibrator._records == {}


class TestTokenCalibratorRecord:
    """Test recording calibration data."""

    def test_record_new_section_type(self, calibrator, temp_calibration_file):
        """Test recording data for a new section type."""
        calibrator.record("intro", token_budget=800, words_produced=400)

        assert "intro" in calibrator._records
        assert calibrator._records["intro"].token_budget == 800
        assert calibrator._records["intro"].words_produced == 400
        assert calibrator._records["intro"].samples == 1
        assert temp_calibration_file.exists()

    def test_record_updates_existing_rolling_average(self, calibrator):
        """Test recording updates existing data with rolling average."""
        # First record
        calibrator.record("subchapter", token_budget=1000, words_produced=500)
        assert calibrator._records["subchapter"].samples == 1

        # Second record - should update with rolling average
        calibrator.record("subchapter", token_budget=1200, words_produced=700)

        rec = calibrator._records["subchapter"]
        assert rec.samples == 2
        # Rolling average: (1000 * 1 + 1200) // 2 = 1100
        assert rec.token_budget == 1100
        # Rolling average: (500 * 1 + 700) // 2 = 600
        assert rec.words_produced == 600

    def test_record_multiple_updates(self, calibrator):
        """Test multiple updates maintain rolling average correctly."""
        calibrator.record("outro", token_budget=400, words_produced=200)
        calibrator.record("outro", token_budget=500, words_produced=250)
        calibrator.record("outro", token_budget=600, words_produced=300)

        rec = calibrator._records["outro"]
        assert rec.samples == 3
        # Should be averaging towards the middle values
        assert 450 <= rec.token_budget <= 550
        assert 225 <= rec.words_produced <= 275

    def test_record_persists_to_file(self, calibrator, temp_calibration_file):
        """Test that record() persists data to file."""
        calibrator.record("intro", token_budget=800, words_produced=400)

        # Read file directly
        data = json.loads(temp_calibration_file.read_text())
        assert "intro" in data
        assert data["intro"]["token_budget"] == 800
        assert data["intro"]["words_produced"] == 400


class TestTokenCalibratorCalibratedTokens:
    """Test calibrated token budget calculation."""

    def test_returns_base_when_no_data(self, calibrator):
        """Test returns base config value when no calibration data exists."""
        result = calibrator.calibrated_tokens("intro", target_words=500)
        # Should return default from config (tokens_intro = 600)
        assert result == 800

    def test_returns_base_when_insufficient_samples(self, calibrator):
        """Test returns base when samples < 3."""
        calibrator.record("intro", token_budget=800, words_produced=400)
        calibrator.record("intro", token_budget=850, words_produced=425)

        # Only 2 samples, should return base
        result = calibrator.calibrated_tokens("intro", target_words=500)
        assert result == 800

    def test_calibrated_tokens_with_sufficient_data(self, calibrator):
        """Test calibrated token calculation with sufficient samples."""
        # Record 3 samples with consistent 0.5 words per token ratio
        calibrator.record("intro", token_budget=800, words_produced=400)
        calibrator.record("intro", token_budget=800, words_produced=400)
        calibrator.record("intro", token_budget=800, words_produced=400)

        # Target 500 words with 0.5 words/token = need 1000 tokens
        result = calibrator.calibrated_tokens("intro", target_words=500)
        assert result == 1000

    def test_calibrated_tokens_caps_at_4x_base(self, calibrator):
        """Test calibrated tokens are capped at 4x base to prevent runaway costs."""
        # Record very low words per token ratio
        calibrator.record("intro", token_budget=800, words_produced=50)
        calibrator.record("intro", token_budget=800, words_produced=50)
        calibrator.record("intro", token_budget=800, words_produced=50)

        # Would need huge token budget, but should cap at 4x base (2400)
        result = calibrator.calibrated_tokens("intro", target_words=5000)
        assert result == 3200  # 800 * 4

    def test_calibrated_tokens_unknown_section_type(self, calibrator):
        """Test unknown section type defaults to subchapter base."""
        result = calibrator.calibrated_tokens("unknown_type", target_words=1000)
        # Should return tokens_subchapter = 1000
        assert result == 1500

    def test_calibrated_tokens_zero_words_per_token(self, calibrator):
        """Test handles zero words_per_token gracefully."""
        calibrator.record("intro", token_budget=800, words_produced=0)
        calibrator.record("intro", token_budget=800, words_produced=0)
        calibrator.record("intro", token_budget=800, words_produced=0)

        # Should return base when words_per_token <= 0
        result = calibrator.calibrated_tokens("intro", target_words=500)
        assert result == 800

    def test_calibrated_tokens_high_efficiency(self, calibrator):
        """Test calibration with high words-per-token efficiency."""
        # Record high efficiency: 2 words per token
        calibrator.record("subchapter", token_budget=1000, words_produced=2000)
        calibrator.record("subchapter", token_budget=1000, words_produced=2000)
        calibrator.record("subchapter", token_budget=1000, words_produced=2000)

        # Target 1000 words with 2 words/token = need only 500 tokens
        result = calibrator.calibrated_tokens("subchapter", target_words=1000)
        assert result == 500


class TestTokenCalibratorGetCalibration:
    """Test retrieving calibration data."""

    def test_get_calibration_empty(self, calibrator):
        """Test get_calibration returns empty dict when no data."""
        result = calibrator.get_calibration()
        assert result == {}

    def test_get_calibration_returns_all_records(self, calibrator):
        """Test get_calibration returns all recorded data."""
        calibrator.record("intro", token_budget=800, words_produced=400)
        calibrator.record("subchapter", token_budget=1500, words_produced=750)
        calibrator.record("outro", token_budget=400, words_produced=200)

        result = calibrator.get_calibration()
        assert len(result) == 3
        assert "intro" in result
        assert "subchapter" in result
        assert "outro" in result
        assert result["intro"]["token_budget"] == 800
        assert result["subchapter"]["words_produced"] == 750


class TestTokenCalibratorEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_very_large_token_budget(self, calibrator):
        """Test handling very large token budgets."""
        calibrator.record("intro", token_budget=100000, words_produced=50000)
        calibrator.record("intro", token_budget=100000, words_produced=50000)
        calibrator.record("intro", token_budget=100000, words_produced=50000)

        result = calibrator.calibrated_tokens("intro", target_words=1000)
        # Should still cap at 4x base (2400)
        assert result <= 2400

    def test_very_small_target_words(self, calibrator):
        """Test handling very small target word counts."""
        calibrator.record("intro", token_budget=800, words_produced=400)
        calibrator.record("intro", token_budget=800, words_produced=400)
        calibrator.record("intro", token_budget=800, words_produced=400)

        result = calibrator.calibrated_tokens("intro", target_words=10)
        # 10 words / 0.5 words_per_token = 20 tokens
        assert result == 20

    def test_persistence_across_instances(self, temp_calibration_file):
        """Test calibration data persists across TokenCalibrator instances."""
        # First instance records data
        calibrator1 = TokenCalibrator(calibration_file=temp_calibration_file)
        calibrator1.record("intro", token_budget=800, words_produced=400)

        # Second instance should load the data
        calibrator2 = TokenCalibrator(calibration_file=temp_calibration_file)
        assert "intro" in calibrator2._records
        assert calibrator2._records["intro"].token_budget == 800

    def test_concurrent_section_types(self, calibrator):
        """Test handling multiple section types simultaneously."""
        calibrator.record("intro", token_budget=800, words_produced=400)
        calibrator.record("subchapter", token_budget=1500, words_produced=1000)
        calibrator.record("outro", token_budget=400, words_produced=300)
        calibrator.record("intro", token_budget=850, words_produced=425)
        calibrator.record("subchapter", token_budget=1600, words_produced=1100)

        assert len(calibrator._records) == 3
        assert calibrator._records["intro"].samples == 2
        assert calibrator._records["subchapter"].samples == 2
        assert calibrator._records["outro"].samples == 1
