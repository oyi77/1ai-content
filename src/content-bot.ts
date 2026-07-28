/**
 * Vilona Content Bot — Standalone Entry Point (BARREL)
 *
 * Re-exports main() and auto-launches when run directly.
 */
import { main } from "./content-bot/main";

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
