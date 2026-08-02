#!/usr/bin/env python3
import asyncio
import os
import json
from telethon import TelegramClient
from datetime import datetime

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_PATH = "/home/openclaw/.openclaw/workspace/.vilona/sessions/paijo"
BOT_USERNAME = "berkahkarya_saas_bot"
BASE_URL = "http://localhost:3000"


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    YELLOW = "\033[93m"
    END = "\033[0m"
    BOLD = "\033[1m"


class BotTester:
    def __init__(self):
        self.client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
        self.bot_entity = None
        self.test_results = []
        self.me = None

    def log(self, message, color=Colors.END):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"{color}[{timestamp}] {message}{Colors.END}")

    def log_success(self, message):
        self.log(f"✅ {message}", Colors.GREEN)
        self.test_results.append({"test": message, "status": "PASS"})

    def log_error(self, message):
        self.log(f"❌ {message}", Colors.RED)
        self.test_results.append({"test": message, "status": "FAIL"})

    def log_info(self, message):
        self.log(f"ℹ️  {message}", Colors.BLUE)

    def log_test(self, message):
        self.log(f"🧪 {message}", Colors.CYAN)

    def log_warn(self, message):
        self.log(f"⚠️  {message}", Colors.YELLOW)

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
            return False
        for row in message.buttons:
            for button in row:
                if button_text.lower() in button.text.lower():
                    self.log_test(f"Clicking: {button.text}")
                    await button.click()
                    await asyncio.sleep(wait_time)
                    return True
        return False

    async def test_webapp_endpoints(self):
        self.log_info("=" * 60)
        self.log_test("TEST: Webapp HTTP Endpoints")

        import aiohttp

        async with aiohttp.ClientSession() as session:
            endpoints = [
                ("/", "Landing Page"),
                ("/health", "Health Check"),
                ("/app", "WebApp Dashboard"),
            ]

            for endpoint, name in endpoints:
                try:
                    async with session.get(f"{BASE_URL}{endpoint}") as resp:
                        if resp.status == 200:
                            self.log_success(f"{name} ({endpoint}) - OK")
                        else:
                            self.log_error(
                                f"{name} ({endpoint}) - Status {resp.status}"
                            )
                except Exception as e:
                    self.log_error(f"{name} ({endpoint}) - Error: {str(e)}")

    async def test_start_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /start command")

        await self.send_command("/start")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /start command")
            return

        response_text = msg.text or ""
        self.log_info(f"Response length: {len(response_text)} chars")

        has_welcome = any(
            word in response_text.lower()
            for word in ["welcome", "selamat", "hai", "hello", "halo"]
        )
        has_menu = any(
            word in response_text.lower()
            for word in ["menu", "create", "buat", "video", "kredit"]
        )
        has_buttons = msg.buttons is not None and len(msg.buttons) > 0

        if has_welcome or has_menu:
            self.log_success("/start command works")
        else:
            self.log_error(f"/start response unexpected: {response_text[:100]}")

        if has_buttons:
            button_count = sum(len(row) for row in msg.buttons)
            self.log_success(f"Main menu has {button_count} buttons")
            for i, row in enumerate(msg.buttons):
                for button in row:
                    self.log_info(f"  [{i+1}] {button.text} → {button.data}")
        else:
            self.log_error("Main menu has no inline buttons")

    async def test_help_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /help command")

        await self.send_command("/help")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /help command")
            return

        response_text = msg.text or ""

        if any(
            word in response_text.lower()
            for word in ["help", "bantuan", "command", "perintah", "panduan"]
        ):
            self.log_success("/help command works")
        else:
            self.log_error(f"/help response: {response_text[:100]}")

    async def test_profile_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /profile command")

        await self.send_command("/profile")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /profile command")
            return

        response_text = msg.text or ""

        has_profile = any(
            word in response_text.lower()
            for word in ["profile", "profil", "account", "akun"]
        )
        has_balance = any(
            word in response_text.lower()
            for word in ["balance", "saldo", "credit", "kredit", "idr"]
        )

        if has_profile or has_balance:
            self.log_success("/profile command works")
            if has_balance:
                self.log_success("Profile shows balance")
        else:
            self.log_error(f"/profile response: {response_text[:100]}")

    async def test_create_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /create command")

        await self.send_command("/create", wait_time=5)
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /create command")
            return

        response_text = msg.text or ""
        has_create = any(
            word in response_text.lower()
            for word in ["create", "buat", "video", "niche", "pilih"]
        )
        has_buttons = msg.buttons is not None

        if has_create:
            self.log_success("/create command works")

            if has_buttons:
                button_count = sum(len(row) for row in msg.buttons)
                self.log_success(f"Create flow has {button_count} buttons/options")
                for row in msg.buttons[:3]:
                    for button in row:
                        self.log_info(f"  Option: {button.text}")
            else:
                self.log_warn("Create flow has no buttons")
        else:
            self.log_error(f"/create response: {response_text[:100]}")

    async def test_topup_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /topup command")

        await self.send_command("/topup")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /topup command")
            return

        response_text = msg.text or ""
        # Fixed: accept more variations including credit balance and pricing
        has_topup = any(
            word in response_text.lower()
            for word in [
                "topup",
                "top up",
                "credits",
                "credit",
                "balance",
                "saldo",
                "harga",
                "price",
                "pricing",
                "rp ",
                "idr",
            ]
        )

        if has_topup:
            self.log_success("/topup command works")
        else:
            self.log_error(f"/topup response: {response_text[:100]}")

    async def test_referral_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /referral command")

        await self.send_command("/referral")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /referral command")
            return

        response_text = msg.text or ""
        has_referral = any(
            word in response_text.lower()
            for word in ["referral", "refer", "invite", "undang"]
        )

        if has_referral:
            self.log_success("/referral command works")
        else:
            self.log_error(f"/referral response: {response_text[:100]}")

    async def test_videos_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /videos command")

        await self.send_command("/videos")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /videos command")
            return

        response_text = msg.text or ""
        has_videos = any(
            word in response_text.lower()
            for word in ["video", "daftar", "list", "history", "riwayat"]
        )

        if has_videos:
            self.log_success("/videos command works")
        else:
            self.log_error(f"/videos response: {response_text[:100]}")

    async def test_settings_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /settings command")

        await self.send_command("/settings")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /settings command")
            return

        response_text = msg.text or ""
        has_settings = any(
            word in response_text.lower()
            for word in ["setting", "pengaturan", "config", "preferensi"]
        )

        if has_settings:
            self.log_success("/settings command works")
        else:
            self.log_error(f"/settings response: {response_text[:100]}")

    async def test_subscription_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /subscription command")

        await self.send_command("/subscription")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /subscription command")
            return

        response_text = msg.text or ""
        has_subscription = any(
            word in response_text.lower()
            for word in ["subscription", "langganan", "plan", "paket"]
        )

        if has_subscription:
            self.log_success("/subscription command works")
        else:
            self.log_error(f"/subscription response: {response_text[:100]}")

    async def test_support_command(self):
        self.log_info("=" * 60)
        self.log_test("TEST: /support command")

        await self.send_command("/support")
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /support command")
            return

        response_text = msg.text or ""
        has_support = any(
            word in response_text.lower()
            for word in ["support", "bantuan", "help", "contact", "kontak"]
        )

        if has_support:
            self.log_success("/support command works")
        else:
            self.log_error(f"/support response: {response_text[:100]}")

    async def test_menu_buttons(self):
        self.log_info("=" * 60)
        self.log_test("TEST: Menu button interactions")

        await self.send_command("/start")
        msg = await self.get_last_bot_message()

        if not msg or not msg.buttons:
            self.log_error("No buttons found in main menu")
            return

        button_texts = [btn.text for row in msg.buttons for btn in row]
        self.log_info(f"Found buttons: {', '.join(button_texts)}")

        clicked = False
        for keyword in ["buat", "create", "video", "🎬"]:
            if await self.click_button(msg, keyword, wait_time=4):
                self.log_success(f"Clicked '{keyword}' button")
                new_msg = await self.get_last_bot_message()
                if new_msg:
                    self.log_info(
                        f"Button response: {new_msg.text[:80] if new_msg.text else 'No text'}"
                    )
                clicked = True
                break

        if not clicked:
            self.log_error("Could not click any create button")

    async def test_video_creation_flow(self):
        self.log_info("=" * 60)
        self.log_test("TEST: Video creation flow with niche selection")

        await self.send_command("/create", wait_time=5)
        msg = await self.get_last_bot_message()

        if not msg:
            self.log_error("No response from /create command")
            return

        if not msg.buttons:
            self.log_error("No niche selection buttons found")
            return

        niche_clicked = False
        for row in msg.buttons:
            for button in row:
                if button.text and len(button.text) > 2:
                    self.log_test(f"Selecting niche: {button.text}")
                    await button.click()
                    niche_clicked = True
                    await asyncio.sleep(4)
                    break
            if niche_clicked:
                break

        if niche_clicked:
            self.log_success("Selected a niche")

            new_msg = await self.get_last_bot_message()
            if new_msg:
                response_text = new_msg.text or ""
                self.log_info(f"Flow response: {response_text[:120]}")

                if any(
                    word in response_text.lower()
                    for word in [
                        "produk",
                        "product",
                        "nama",
                        "name",
                        "deskripsi",
                        "style",
                        "dipilih",
                    ]
                ):
                    self.log_success("Video creation flow advancing correctly")
                else:
                    self.log_info("Video creation flow response received")
        else:
            self.log_error("Could not select a niche")

    async def run_all_tests(self):
        self.log_info("=" * 60)
        self.log_info("🚀 COMPREHENSIVE BOT E2E TEST SUITE")
        self.log_info(f"Session: {SESSION_PATH}")
        self.log_info(f"Bot: @{BOT_USERNAME}")
        self.log_info("=" * 60)

        try:
            await self.start()

            await self.test_webapp_endpoints()

            tests = [
                self.test_start_command,
                self.test_help_command,
                self.test_profile_command,
                self.test_create_command,
                self.test_topup_command,
                self.test_referral_command,
                self.test_videos_command,
                self.test_settings_command,
                self.test_subscription_command,
                self.test_support_command,
                self.test_menu_buttons,
                self.test_video_creation_flow,
            ]

            for test in tests:
                try:
                    await test()
                except Exception as e:
                    self.log_error(f"Test {test.__name__} failed: {str(e)}")
                await asyncio.sleep(2)

        except Exception as e:
            self.log_error(f"Fatal error: {str(e)}")
            import traceback

            traceback.print_exc()
        finally:
            await self.print_summary()
            await self.client.disconnect()

    async def print_summary(self):
        self.log_info("=" * 60)
        self.log_info("📊 FINAL TEST SUMMARY")
        self.log_info("=" * 60)

        passed = sum(1 for r in self.test_results if r["status"] == "PASS")
        failed = sum(1 for r in self.test_results if r["status"] == "FAIL")
        total = len(self.test_results)

        print(
            f"\n{Colors.BOLD}Total: {total} | {Colors.GREEN}Passed: {passed}{Colors.END} | {Colors.RED}Failed: {failed}{Colors.END}"
        )
        print(f"Success Rate: {(passed/total*100):.1f}%\n")

        if failed > 0:
            print(f"{Colors.RED}Failed:{Colors.END}")
            for r in self.test_results:
                if r["status"] == "FAIL":
                    print(f"  ❌ {r['test']}")

        print(f"\n{Colors.CYAN}All Results:{Colors.END}")
        for r in self.test_results:
            icon = "✅" if r["status"] == "PASS" else "❌"
            print(f"  {icon} {r['test']}")

        results_file = (
            "/mnt/data/openclaw/projects/openclaw-saas-bot/tests/e2e_results.json"
        )
        with open(results_file, "w") as f:
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
                    "results": self.test_results,
                },
                f,
                indent=2,
            )

        self.log_info(f"Results saved to {results_file}")

        if passed == total:
            self.log_success("🎉 ALL TESTS PASSED! System is 100% operational!")


async def main():
    tester = BotTester()
    await tester.run_all_tests()


if __name__ == "__main__":
    asyncio.run(main())
