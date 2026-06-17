from unittest.mock import MagicMock, patch

import pytest


def test_generate_text_returns_string():
    from src.ai_client import OmnirouteClient

    client = OmnirouteClient(base_url="http://localhost:20128/v1")
    with patch.object(client.client, "chat") as mock_chat:
        mock_chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Hello world"))]
        )
        result = client.generate_text("Say hello", system_prompt="Be brief")
        assert result == "Hello world"


def test_generate_structured_returns_json():
    from src.ai_client import OmnirouteClient

    client = OmnirouteClient(base_url="http://localhost:20128/v1")
    with patch.object(client.client, "chat") as mock_chat:
        mock_chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content='{"key": "value"}'))]
        )
        result = client.generate_structured(
            "Give me JSON", response_schema={"key": str}
        )
        assert result == {"key": "value"}


def test_retry_on_rate_limit():
    from src.ai_client import OmnirouteClient

    client = OmnirouteClient(base_url="http://localhost:20128/v1", max_retries=3)
    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise Exception("Rate limit")
        return MagicMock(choices=[MagicMock(message=MagicMock(content="Success"))])

    with patch.object(client.client, "chat") as mock_chat:
        mock_chat.completions.create.side_effect = side_effect
        result = client.generate_text("test")
        assert result == "Success"
        assert call_count == 3


def test_timeout_raises_error():
    from src.ai_client import OmnirouteClient
    import openai

    client = OmnirouteClient(base_url="http://localhost:20128/v1", timeout=1)
    with patch.object(client.client, "chat") as mock_chat:
        mock_chat.completions.create.side_effect = openai.APITimeoutError("Timeout")
        with pytest.raises(openai.APITimeoutError):
            client.generate_text("test")


def test_generate_image_caches_unsupported():
    """generate_image caches _supports_images=False on 404-like errors."""
    from src.ai_client import OmnirouteClient

    client = OmnirouteClient.__new__(OmnirouteClient)
    client._supports_images = None
    mock_images = MagicMock()
    mock_images.generate.side_effect = Exception("404 not found")
    client.client = MagicMock()
    client.client.images = mock_images

    with pytest.raises(RuntimeError, match="Image generation unavailable"):
        client.generate_image("test prompt")

    assert client._supports_images is False


def test_generate_image_skips_when_cached_unsupported():
    from src.ai_client import OmnirouteClient

    client = OmnirouteClient.__new__(OmnirouteClient)
    client._supports_images = False

    with pytest.raises(RuntimeError, match="not supported"):
        client.generate_image("test prompt")


def test_parse_json_response_null_raises():
    from src.ai_client import OmnirouteClient

    client = OmnirouteClient.__new__(OmnirouteClient)
    with pytest.raises(ValueError, match="None"):
        client._parse_json_response(None)


def test_parse_json_response_extracts_from_prose():
    from src.ai_client import OmnirouteClient

    client = OmnirouteClient.__new__(OmnirouteClient)
    result = client._parse_json_response('Here is the result: {"key": "value"} end.')
    assert result == {"key": "value"}
