#!/usr/bin/env python3
"""
Comprehensive end-to-end test for BerkahKarya Bot
Tests all functionality including webapp, multi-language, cancel flows
"""

import asyncio
import os
import json
import aiohttp
from telethon import TelegramClient
from datetime import datetime

API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"
SESSION_PATH = "/home/openclaw/.openclaw/workspace/.vilona/sessions/paijo"
BOT_USERNAME = "berkahkarya_saas_bot"
BASE_URL = "http://localhost:3000"


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    YELLOW = "\033[93m"
    MAGENTA = "\033[95m"
    END = "\033[0m"
    BOLD = "\033[1m"


class ComprehensiveTester:
    def __init__(self):
        self.client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
        self.bot_entity = None
        self.test_results = []
        self.me = None
        self.issues_found = []

    def log(self, message, color=Colors.END):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"{color}[{timestamp}] {message}{Colors.END}")

    def log_success(self, message):
        self.log(f"✅ {message}", Colors.GREEN)
        self.test_results.append({"test": message, "status": "PASS"})

    def log_error(self, message, issue_type="ERROR"):
        self.log(f"❌ {message}", Colors.RED)
        self.test_results.append({"test": message, "status": "FAIL"})
        self.issues_found.append({"type": issue_type, "message": message})

    def log_info(self, message):
        self.log(f"ℹ️  {message}", Colors.BLUE)

    def log_test(self, message):
        self.log(f"🧪 {message}", Colors.CYAN)

    def log_warn(self, message):
        self.log(f"⚠️  {message}", Colors.YELLOW)

    def log_section(self, message):
        self.log(f"\n{'='*60}", Colors.MAGENTA)
        self.log(f"🔍 {message}", Colors.MAGENTA + Colors.BOLD)
        self.log(f"{'='*60}\n", Colors.MAGENTA)

    async def start(self):
        self.log_info("Connecting with existing session...")
        await self.client.connect()

        if not await self.client.is_user_authorized():
            self.log_error("Session not authorized!")
            raise Exception("Session authorization failed")

        self.me = await self.client.get_me()
        self.log_success(f"Logged in as: {self.me.first_name} (@{self.me.username})")

        self.log_info(f"Finding bot: @{BOT_USERNAME}")
        self.bot_entity = await self.client.get_entity(BOT_USERNAME)
        self.log_success(f"Found bot: {self.bot_entity.first_name}")

    async def send_command(self, command, wait_time=4):
        self.log_test(f"Sending: {command}")
        await self.client.send_message(self.bot_entity, command)
        await asyncio.sleep(wait_time)

    async def get_bot_messages(self, count=5):
        messages = []
        async for msg in self.client.iter_messages(self.bot_entity, limit=count):
            if msg.out == False:
                messages.append(msg)
        return messages

    async def get_last_bot_message(self):
        messages = await self.get_bot_messages(3)
        return messages[0] if messages else None

    async def click_button(self, message, button_text, wait_time=4):
        if not message or not message.buttons:
            return False, None
        for row in message.buttons:
            for button in row:
                if button_text.lower() in button.text.lower():
                    self.log_test(f"Clicking: {button.text}")
                    await button.click()
                    await asyncio.sleep(wait_time)
                    return True, button.data
        return False, None

    async def test_webapp_comprehensive(self):
        self.log_section("WEBAPP COMPREHENSIVE TEST")

        endpoints = [
            ("/", "Landing Page", 200),
            ("/health", "Health Check", 200),
            ("/app", "WebApp (no auth)", 401),
            ("/api/user", "API User (no auth)", 401),
            ("/api/packages", "API Packages", 200),
            ("/go7u73s641jq2jtd8gfh2ecbl94kmy.html", "FB Verification", 200),
        ]

        async with aiohttp.ClientSession() as session:
            for endpoint, name, expected_status in endpoints:
                try:
                    async with session.get(f"{BASE_URL}{endpoint}") as resp:
                        if resp.status == expected_status:
                            self.log_success(
                                f"{name} ({endpoint}) - Status {resp.status}"
                            )
                        else:
                            self.log_error(
                                f"{name} ({endpoint}) - Expected {expected_status}, got {resp.status}",
                                "WEBAPP",
                            )
                except Exception as e:
                    self.log_error(f"{name} ({endpoint}) - Error: {str(e)}", "WEBAPP")

    async def test_multi_language(self):
        self.log_section("MULTI-LANGUAGE TEST")

        self.log_info("Testing if bot responds in different languages...")

        await self.send_command("/settings")
        msg = await self.get_last_bot_message()

        if msg and msg.buttons:
            lang_buttons = [
                btn
                for row in msg.buttons
                for btn in row
                if "bahasa" in btn.text.lower() or "language" in btn.text.lower()
            ]
            if lang_buttons:
                self.log_success("Language setting button found")
            else:
                self.log_warn("No obvious language button found - may be in submenu")

        await self.send_command("/start")
        msg = await self.get_last_bot_message()

        if msg and msg.text:
            has_indonesian = any(
                word in msg.text.lower()
                for word in ["halo", "selamat", "kredit", "buat", "video"]
            )
            has_english = any(
                word in msg.text.lower()
                for word in ["hello", "welcome", "credit", "create"]
            )

            if has_indonesian:
                self.log_success("Bot responds in Indonesian (default)")
            elif has_english:
                self.log_success("Bot responds in English")
            else:
                self.log_warn("Language detection unclear")

    async def test_cancel_flow(self):
        self.log_section("CANCEL FLOW TEST")

        self.log_info("Starting video creation to test cancel functionality...")
        await self.send_command("/create", wait_time=5)
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /create", "CANCEL_FLOW")
            return

        has_cancel = False
        if msg.buttons:
            for row in msg.buttons:
                for button in row:
                    if any(
                        word in button.text.lower()
                        for word in ["cancel", "batal", "stop", "back", "kembali"]
                    ):
                        self.log_success(f"Cancel/Back button found: {button.text}")
                        has_cancel = True

        if not has_cancel:
            self.log_error(
                "No cancel/back button found in create flow - users cannot exit!",
                "CANCEL_FLOW",
            )

        await self.send_command("/cancel")
        msg = await self.get_last_bot_message()

        if msg and any(
            word in (msg.text or "").lower()
            for word in ["cancelled", "dibatalkan", "stopped", "stopped"]
        ):
            self.log_success("Bot has /cancel command that works")
        else:
            self.log_warn("Bot may not have /cancel command or it doesn't respond")

    async def test_support_contact(self):
        self.log_section("SUPPORT CONTACT TEST")

        await self.send_command("/support")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /support", "SUPPORT")
            return

        response_text = msg.text or ""

        if "@codergaboets" in response_text:
            self.log_success("Support username is @codergaboets")
        elif "@" in response_text and "support" in response_text.lower():
            self.log_warn(f"Support contact may be different: {response_text[:100]}")
        else:
            self.log_error("Support contact not found in response", "SUPPORT")

        if msg.buttons:
            for row in msg.buttons:
                for button in row:
                    if "t.me/codergaboets" in (button.url or ""):
                        self.log_success("Support button links to @codergaboets")

    async def test_referral_system(self):
        self.log_section("REFERRAL SYSTEM TEST")

        await self.send_command("/referral")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /referral", "REFERRAL")
            return

        response_text = msg.text or ""

        if (
            "don't have an account" in response_text.lower()
            or "belum memiliki akun" in response_text.lower()
        ):
            self.log_error(
                "Referral shows 'no account' error - referral system broken!",
                "REFERRAL",
            )
        elif any(
            word in response_text.lower()
            for word in ["referral", "refer", "komisi", "commission"]
        ):
            self.log_success("Referral system works")

            if "ref_" in response_text or "start=ref" in response_text:
                self.log_success("Referral link generated")
        else:
            self.log_error(
                f"Unexpected referral response: {response_text[:100]}", "REFERRAL"
            )

    async def test_video_flow_with_cancel(self):
        self.log_section("VIDEO FLOW WITH CANCEL OPTIONS")

        await self.send_command("/create", wait_time=5)
        msg = await self.get_last_bot_message()

        if not msg or not msg.buttons:
            self.log_error("Create flow has no buttons", "VIDEO_FLOW")
            return

        self.log_info(f"Create flow has {sum(len(r) for r in msg.buttons)} buttons")

        cancel_found = False
        for row in msg.buttons:
            for button in row:
                if any(
                    word in button.text.lower()
                    for word in ["cancel", "batal", "stop", "exit", "quit", "×", "x"]
                ):
                    self.log_success(f"Cancel option found: {button.text}")
                    cancel_found = True

        if not cancel_found:
            self.log_error(
                "No cancel option in video creation flow! Users cannot exit.",
                "VIDEO_FLOW",
            )

    async def test_all_buttons_and_flows(self):
        self.log_section("TESTING ALL MENU BUTTONS")

        await self.send_command("/start")
        msg = await self.get_last_bot_message()

        if not msg or not msg.buttons:
            self.log_error("Main menu has no buttons", "MENU")
            return

        buttons_to_test = []
        for row in msg.buttons:
            for button in row:
                buttons_to_test.append((button.text, button.data))

        self.log_info(f"Found {len(buttons_to_test)} main menu buttons")

        for btn_text, btn_data in buttons_to_test[:3]:
            self.log_test(f"Testing button: {btn_text}")

            await self.send_command("/start")
            msg = await self.get_last_bot_message()

            if msg and msg.buttons:
                clicked, data = await self.click_button(
                    msg,
                    btn_text.replace("🎬 ", "")
                    .replace("🖼 ", "")
                    .replace("💳 ", "")
                    .replace("🎞 ", "")
                    .replace("👤 ", ""),
                    wait_time=4,
                )

                if clicked:
                    new_msg = await self.get_last_bot_message()
                    if new_msg and new_msg.id != msg.id:
                        self.log_success(f"Button '{btn_text}' works")
                    else:
                        self.log_warn(f"Button '{btn_text}' may not have responded")

    async def run_all_tests(self):
        self.log_info("=" * 60)
        self.log_info("🔬 COMPREHENSIVE BOT TESTING")
        self.log_info(f"Session: {SESSION_PATH}")
        self.log_info(f"Bot: @{BOT_USERNAME}")
        self.log_info("=" * 60)

        try:
            await self.start()

            tests = [
                self.test_webapp_comprehensive,
                self.test_multi_language,
                self.test_cancel_flow,
                self.test_support_contact,
                self.test_referral_system,
                self.test_video_flow_with_cancel,
                self.test_all_buttons_and_flows,
            ]

            for test in tests:
                try:
                    await test()
                except Exception as e:
                    self.log_error(f"Test {test.__name__} crashed: {str(e)}", "CRASH")
                await asyncio.sleep(2)

        except Exception as e:
            self.log_error(f"Fatal error: {str(e)}", "FATAL")
            import traceback

            traceback.print_exc()
        finally:
            await self.print_summary()
            await self.client.disconnect()

    async def print_summary(self):
        self.log_info("=" * 60)
        self.log_info("📊 FINAL SUMMARY")
        self.log_info("=" * 60)

        passed = sum(1 for r in self.test_results if r["status"] == "PASS")
        failed = sum(1 for r in self.test_results if r["status"] == "FAIL")
        total = len(self.test_results)

        print(f"\n{Colors.BOLD}Total Tests: {total}{Colors.END}")
        print(f"{Colors.GREEN}Passed: {passed}{Colors.END}")
        print(f"{Colors.RED}Failed: {failed}{Colors.END}")
        print(f"Success Rate: {(passed/total*100):.1f}%\n")

        if self.issues_found:
            print(f"{Colors.RED}Issues Found ({len(self.issues_found)}):{Colors.END}")
            for issue in self.issues_found:
                print(f"  [{issue['type']}] {issue['message']}")
        else:
            print(f"{Colors.GREEN}No critical issues found!{Colors.END}")

        print(f"\n{Colors.CYAN}All Results:{Colors.END}")
        for result in self.test_results:
            icon = "✅" if result["status"] == "PASS" else "❌"
            print(f"  {icon} {result['test']}")

        with open(
            "/mnt/data/openclaw/projects/openclaw-saas-bot/tests/comprehensive_results.json",
            "w",
        ) as f:
            json.dump(
                {
                    "timestamp": datetime.now().isoformat(),
                    "user": self.me.username if self.me else "unknown",
                    "summary": {
                        "total": total,
                        "passed": passed,
                        "failed": failed,
                        "success_rate": (passed / total * 100) if total > 0 else 0,
                    },
                    "issues": self.issues_found,
                    "results": self.test_results,
                },
                f,
                indent=2,
            )

        self.log_info("Results saved to comprehensive_results.json")


async def main():
    tester = ComprehensiveTester()
    await tester.run_all_tests()


if __name__ == "__main__":
    asyncio.run(main())
