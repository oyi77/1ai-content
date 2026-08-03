#!/usr/bin/env node
/**
 * Webhook simulation harness for 1ai-content bot (prod :3002).
 *
 * Sends a fake Telegram Update to the local webhook endpoint so we can
 * verify command/message/callback handling WITHOUT a real Telegram client.
 * Replies DO go out via the real Telegram API (bot token) — this only
 * simulates the inbound update.
 *
 * Usage (run from repo root; loads .env via dotenv):
 *   node scripts/webhook-sim.mjs --cmd /start [--user sim_batch_a] [--update-id 900000001]
 *   node scripts/webhook-sim.mjs --callback menu_main [--user sim_batch_b]
 *   node scripts/webhook-sim.mjs --text "hello" [--user sim_batch_c]
 *   node scripts/webhook-sim.mjs --photo [--user sim_batch_d]
 *   node scripts/webhook-sim.mjs --admin-username alwayscuanbos --cmd /system_status
 *
 * Prints the HTTP status + body. Processing is async — check PM2 logs
 * afterwards (pm2 logs 1ai-content --lines N --nostream) for the
 * "Incoming update" → handler output → "Update processed" sequence.
 */

const WEBHOOK_PATH = "http://localhost:3002/webhook/telegram";
const CHAT_ID = Number(process.env.SIM_CHAT_ID || 157228659); // admin alwayscuanbos

function parseArgs(argv) {
  const out = { user: "sim_sweep", updateId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cmd") out.cmd = argv[++i];
    else if (a === "--callback") out.callback = argv[++i];
    else if (a === "--text") out.text = argv[++i];
    else if (a === "--photo") out.photo = true;
    else if (a === "--user") out.user = argv[++i];
    else if (a === "--update-id") out.updateId = Number(argv[++i]);
    else if (a === "--admin-username") out.adminUsername = argv[++i];
  }
  if (!out.updateId) out.updateId = Math.floor(Math.random() * 900000000) + 100000000;
  return out;
}

function buildUpdate(args) {
  const now = Math.floor(Date.now() / 1000);
  const username = args.adminUsername || args.user;
  const from = {
    id: args.adminUsername ? CHAT_ID : CHAT_ID, // same real admin chat
    is_bot: false,
    first_name: "Sim",
    username,
    language_code: "id",
  };
  const chat = { id: CHAT_ID, first_name: "Sim", username, type: "private" };

  if (args.callback) {
    return {
      update_id: args.updateId,
      callback_query: {
        id: `simcb_${args.updateId}`,
        from,
        chat_instance: `simci_${args.updateId}`,
        data: args.callback,
        message: {
          message_id: Math.floor(Math.random() * 100000),
          from,
          chat,
          date: now,
          text: "sim",
        },
      },
    };
  }

  const message = {
    message_id: Math.floor(Math.random() * 100000),
    from,
    chat,
    date: now,
  };
  if (args.cmd) message.text = args.cmd;
  else if (args.text) message.text = args.text;
  else if (args.photo) message.photo = [{ file_id: "sim_photo", file_unique_id: "simu", width: 512, height: 512, file_size: 1024 }];
  else message.text = "/start";

  return { update_id: args.updateId, message };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const update = buildUpdate(args);

  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("FATAL: WEBHOOK_SECRET not loaded — run with `node -r dotenv/config` from repo root.");
    process.exit(2);
  }

  const res = await fetch(WEBHOOK_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": webhookSecret,
    },
    body: JSON.stringify(update),
  });

  const body = await res.text();
  console.log(`HTTP ${res.status} ${res.statusText}`);
  console.log(`update_id=${update.update_id} user=${args.user} mode=${args.cmd ? `cmd:${args.cmd}` : args.callback ? `callback:${args.callback}` : args.text ? `text:${JSON.stringify(args.text)}` : args.photo ? "photo" : "?"}`);
  console.log(`body: ${body}`);
  console.log(`\nNext: pm2 logs 1ai-content --lines 40 --nostream | grep "${args.user}"`);
}

main().catch((e) => {
  console.error("Harness error:", e);
  process.exit(1);
});
