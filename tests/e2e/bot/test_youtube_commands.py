"""
E2E tests for YouTube workflow Telegram commands via Telethon.
"""

import pytest


@pytest.mark.asyncio
class TestYouTubeChannelCommands:
    async def test_yt_channels(self, client, bot):
        """Should respond to /yt_channels."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_channels")
        assert msg is not None, "Bot did not respond to /yt_channels"
        text = msg.text or ""
        assert len(text) > 5, f"Response too short: {text}"

    async def test_yt_status_no_args(self, client, bot):
        """Should respond to /yt_status without args."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_status")
        assert msg is not None, "Bot did not respond to /yt_status"
        text = msg.text or ""
        assert len(text) > 5, f"Response too short: {text}"

    async def test_yt_status_nonexistent(self, client, bot):
        """Should handle non-existent channel gracefully."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_status nonexistent_123")
        assert msg is not None, "Bot did not respond"
        text = msg.text or ""
        assert "not found" in text.lower() or "❌" in text or "tidak" in text.lower() or "usage" in text.lower()


@pytest.mark.asyncio
class TestYouTubeReportCommands:
    async def test_yt_report(self, client, bot):
        """Should respond to /yt_report."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_report")
        assert msg is not None, "Bot did not respond to /yt_report"
        text = msg.text or ""
        assert len(text) > 5

    async def test_yt_quarantine(self, client, bot):
        """Should respond to /yt_quarantine."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_quarantine")
        assert msg is not None, "Bot did not respond to /yt_quarantine"
        text = msg.text or ""
        assert "quarantine" in text.lower() or "✅" in text or "🔒" in text or "📭" in text

    async def test_yt_research(self, client, bot):
        """Should respond to /yt_research."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_research", timeout=30)
        assert msg is not None, "Bot did not respond to /yt_research"
        text = msg.text or ""
        assert len(text) > 10

    async def test_yt_research_results(self, client, bot):
        """Should respond to /yt_research_results."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_research_results")
        assert msg is not None, "Bot did not respond"
        text = msg.text or ""
        assert len(text) > 5


@pytest.mark.asyncio
class TestYouTubeVideoCommands:
    async def test_yt_approve_no_args(self, client, bot):
        """Should show usage for /yt_approve without args."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_approve")
        assert msg is not None
        text = msg.text or ""
        assert "usage" in text.lower() or "video" in text.lower() or "❌" in text

    async def test_yt_reject_no_args(self, client, bot):
        """Should show usage for /yt_reject without args."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_reject")
        assert msg is not None
        text = msg.text or ""
        assert "usage" in text.lower() or "video" in text.lower() or "❌" in text

    async def test_yt_edit_title_no_args(self, client, bot):
        """Should show usage for /yt_edit_title without args."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/yt_edit_title")
        assert msg is not None
        text = msg.text or ""
        assert "usage" in text.lower() or "video" in text.lower() or "❌" in text


@pytest.mark.asyncio
class TestNoRegression:
    async def test_start_still_works(self, client, bot):
        """/start should still work."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/start")
        assert msg is not None
        assert len(msg.text or "") > 10

    async def test_help_still_works(self, client, bot):
        """/help should still work."""
        from conftest import send_and_wait
        msg = await send_and_wait(client, bot, "/help")
        assert msg is not None
        assert len(msg.text or "") > 10
