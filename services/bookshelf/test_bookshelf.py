"""Unit tests for bookshelf module."""
import json
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

from openai.types.chat import ChatCompletion, ChatCompletionMessage
from openai.types.chat.chat_completion import Choice

# -- Helpers --


def _make_completion(text: str, prompt_tokens: int = 10, completion_tokens: int = 20):
    """Create a mock sync ChatCompletion."""
    msg = MagicMock(spec=ChatCompletionMessage)
    msg.content = text

    choice = MagicMock(spec=Choice)
    choice.message = msg
    choice.finish_reason = "stop"

    usage = MagicMock()
    usage.prompt_tokens = prompt_tokens
    usage.completion_tokens = completion_tokens
    usage.total_tokens = prompt_tokens + completion_tokens

    comp = MagicMock(spec=ChatCompletion)
    comp.choices = [choice]
    comp.usage = usage
    return comp


class AsyncStreamMock:
    """Mock for async Groq stream."""

    def __init__(self, chunks):
        self._chunks = list(chunks)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._chunks:
            raise StopAsyncIteration
        return self._chunks.pop(0)


def _make_chunk(text: str = "", usage=None):
    """Create a mock streaming chunk."""
    ch = AsyncMock()
    ch.choices = [AsyncMock()]
    ch.choices[0].delta.content = text
    ch.usage = usage
    return ch


# -- Title Writer Tests --


@pytest.mark.asyncio
async def test_generate_title():
    """Test title generation returns (stats, title)."""
    from services.bookshelf.agents.title_writer import generate_title

    client = MagicMock()
    client.chat.completions.create.return_value = _make_completion(
        "The Art of Python Programming",
        prompt_tokens=15, completion_tokens=5,
    )

    stats, title = await generate_title("Python programming books", groq_client=client)

    assert title == "The Art of Python Programming"
    assert stats.prompt_tokens == 15
    assert stats.completion_tokens == 5
    assert stats.total == 20
    client.chat.completions.create.assert_called_once()


@pytest.mark.asyncio
async def test_generate_title_empty():
    """Test title generation with empty response."""
    from services.bookshelf.agents.title_writer import generate_title

    client = MagicMock()
    client.chat.completions.create.return_value = _make_completion("")

    stats, title = await generate_title("test", groq_client=client)
    assert title == ""


# -- Structure Writer Tests --


@pytest.mark.asyncio
async def test_generate_structure():
    """Test structure generation returns valid JSON."""
    from services.bookshelf.agents.structure_writer import generate_structure

    expected_json = json.dumps({
        "title": "Python Guide",
        "sections": [
            {"title": "Chapter 1: Basics", "sections": [{"title": "Variables"}, {"title": "Loops"}]},
            {"title": "Chapter 2: Advanced", "sections": [{"title": "Decorators"}]},
        ],
    })

    client = MagicMock()
    client.chat.completions.create.return_value = _make_completion(
        expected_json, prompt_tokens=20, completion_tokens=40,
    )

    stats, raw = await generate_structure("Python", groq_client=client)
    parsed = json.loads(raw)
    assert parsed["title"] == "Python Guide"
    assert len(parsed["sections"]) == 2
    assert stats.prompt_tokens == 20
    assert stats.completion_tokens == 40


@pytest.mark.asyncio
async def test_generate_structure_invalid_json():
    """Test structure writer handles invalid JSON gracefully."""
    from services.bookshelf.agents.structure_writer import generate_structure

    client = MagicMock()
    client.chat.completions.create.return_value = _make_completion("not valid json")

    stats, raw = await generate_structure("test", groq_client=client)
    parsed = json.loads(raw)
    assert parsed["title"] == "Untitled"


# -- Section Writer Tests --


@pytest.mark.asyncio
async def test_generate_section_content():
    """Test section content returns (stats, content)."""
    from services.bookshelf.agents.section_writer import generate_section_content
    from services.bookshelf.stats import GenerationStatistics

    usage = MagicMock()
    usage.prompt_tokens = 10
    usage.completion_tokens = 5
    usage.total_tokens = 15

    client = AsyncMock()
    client.chat.completions.create = AsyncMock(
        return_value=AsyncStreamMock([
            _make_chunk(text="Hello this is "),
            _make_chunk(text="section content."),
            _make_chunk(usage=usage),
        ])
    )

    stats, content = await generate_section_content("Introduction", book_title="Test Book", groq_client=client)
    assert "Hello this is section content." in content
    assert isinstance(stats, GenerationStatistics)
    assert stats.total_tokens == 15


# -- Orchestrator Engine Tests --


@pytest.mark.asyncio
async def test_generate_book_pipeline():
    """Test full pipeline yields progress events."""
    from services.bookshelf.engine import generate_book_pipeline

    title_structure_json = json.dumps({
        "title": "Test Book",
        "sections": [
            {"title": "Ch 1", "sections": [{"title": "Sec 1.1"}]},
        ],
    })

    with patch("services.bookshelf.engine.get_groq_client") as mock_get_client, \
         patch("services.bookshelf.engine.get_async_groq_client") as mock_get_aclient, \
         patch("services.bookshelf.agents.title_writer.get_groq_client") as mock_get1, \
         patch("services.bookshelf.agents.structure_writer.get_groq_client") as mock_get2, \
         patch("services.bookshelf.agents.section_writer.get_async_groq_client") as mock_get3:

        mock_sync = MagicMock()
        mock_async = AsyncMock()

        # Engine-level: return sync + async mocks
        mock_get_client.return_value = mock_sync
        mock_get_aclient.return_value = mock_async

        # Title call → first return
        mock_get1.return_value = mock_sync

        # Structure call → second return
        mock_get2.return_value = mock_sync

        # Use side_effect so first create() returns title, second returns structure
        mock_sync.chat.completions.create.side_effect = [
            _make_completion("Test Book Title"),
            _make_completion(title_structure_json),
        ]

        # Section: async streaming call
        mock_async.chat.completions.create = AsyncMock(
            return_value=AsyncStreamMock([
                _make_chunk(text="Some content."),
                _make_chunk(text=""),
            ])
        )
        mock_get3.return_value = mock_async

        events = []
        async for event in generate_book_pipeline("Test subject"):
            events.append(event)

    event_types = [e["type"] for e in events]
    assert "progress" in event_types
    assert "section_content" in event_types
    assert "complete" in event_types


# -- Markdown Assembly Tests --


def test_assemble_markdown():
    """Test markdown assembly from structure + content."""
    from services.bookshelf.tools.markdown import assemble_markdown

    structure = {
        "title": "My Book",
        "sections": [
            {"title": "Ch 1", "sections": [{"title": "Sec A"}]},
        ],
    }
    content = {"Sec A": "This is section A content."}

    md = assemble_markdown("My Book", structure, content)
    assert "# My Book" in md
    assert "## Ch 1" in md
    assert "### Sec A" in md
    assert "This is section A content." in md


# -- PDF Export Tests --


@pytest.mark.skip(reason="weasyprint version incompatibility: 'super' object has no attribute 'transform'")
def test_markdown_to_pdf():
    """Test PDF generation from markdown returns bytes."""
    from services.bookshelf.tools.pdf import markdown_to_pdf

    pdf_bytes = markdown_to_pdf("# Hello\n\nWorld.", title="Test")
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0
    assert pdf_bytes.startswith(b"%PDF")


# -- Flattener tests --


def test_flatten_sections():
    """Test flattening nested structure."""
    from services.bookshelf.engine import _flatten_sections

    structure = {
        "sections": [
            {"title": "Ch 1", "sections": [{"title": "Sec 1.1"}, {"title": "Sec 1.2"}]},
            {"title": "Ch 2", "sections": []},
        ],
    }
    flat = _flatten_sections(structure)
    assert len(flat) == 3
    assert flat[0] == ("Ch 1", "Sec 1.1")
    assert flat[2] == ("Ch 2", "Ch 2")
