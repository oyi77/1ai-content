/**
 * Social Media Commands
 *
 * Telegram bot commands for connecting social accounts and publishing content.
 * All social media management is delegated to 1ai-social via SocialBridgeService.
 *
 * Commands:
 * - /connect — Connect social media accounts
 * - /publish — Publish content to social media
 * - /schedule — Schedule content for later
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { socialBridge } from '@/services/social-bridge.service';

const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok', emoji: '🎵' },
  { id: 'instagram', name: 'Instagram', emoji: '📸' },
  { id: 'facebook', name: 'Facebook', emoji: '📘' },
  { id: 'youtube', name: 'YouTube', emoji: '▶️' },
  { id: 'x', name: 'X/Twitter', emoji: '🐦' },
  { id: 'linkedin', name: 'LinkedIn', emoji: '💼' },
];

// ══════════════════════════════════════════════════════════════
// /connect — Connect social media accounts
// ══════════════════════════════════════════════════════════════

export async function connectCommand(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) { await ctx.reply('❌ User not found.'); return; }

  // Check 1ai-social availability
  const available = await socialBridge.isAvailable();
  if (!available) {
    await ctx.reply('❌ Social media service sedang tidak tersedia. Coba lagi nanti.');
    return;
  }

  // Get connected accounts
  const accounts = await socialBridge.getConnectedAccounts(user.id);

  const lines = [
    '🔗 *Connect Social Media*\n',
    accounts.length > 0
      ? '*Connected Accounts:*\n' + accounts.map(a => {
          const p = PLATFORMS.find(p => p.id === a.platform);
          return `${p?.emoji ?? '📱'} ${p?.name ?? a.platform} — @${a.account_name} (${a.status})`;
        }).join('\n')
      : 'Belum ada akun yang terhubung.',
    '',
    'Pilih platform untuk connect:',
  ];

  const buttons = PLATFORMS.map(p => {
    const connected = accounts.some(a => a.platform === p.id);
    return [{
      text: connected ? `✅ ${p.emoji} ${p.name}` : `${p.emoji} Connect ${p.name}`,
      callback_data: connected ? `social_connected_${p.id}` : `social_connect_${p.id}`,
    }];
  });

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [...buttons, [{ text: '🔙 Menu', callback_data: 'menu_main' }]] },
  });
}

// ══════════════════════════════════════════════════════════════
// /publish — Publish content to social media
// ══════════════════════════════════════════════════════════════

export async function publishCommand(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) { await ctx.reply('❌ User not found.'); return; }

  const text = 'text' in (ctx.message ?? {}) ? (ctx.message as { text: string }).text : '';
  const args = text.replace(/^\/publish(?:@\S+)?\s*/, '').trim();

  // Get connected accounts
  const accounts = await socialBridge.getConnectedAccounts(user.id);

  if (accounts.length === 0) {
    await ctx.reply(
      '📤 *Publish Content*\n\n' +
      'Belum ada akun social media yang terhubung.\n\n' +
      'Ketik `/connect` untuk hubungkan akun dulu.',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // Show platform selection
  const buttons = accounts.map(a => {
    const p = PLATFORMS.find(p => p.id === a.platform);
    return [{
      text: `${p?.emoji ?? '📱'} ${p?.name ?? a.platform} (@${a.account_name})`,
      callback_data: `publish_to_${a.platform}`,
    }];
  });

  await ctx.reply(
    '📤 *Publish Content*\n\n' +
    'Pilih platform untuk publish konten terakhir yang kamu buat:\n\n' +
    'Atau kirim video/foto langsung lalu pilih platform.',
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...buttons, [{ text: '🔙 Menu', callback_data: 'menu_main' }]] },
    },
  );
}

// ══════════════════════════════════════════════════════════════
// /schedule — Schedule content
// ══════════════════════════════════════════════════════════════

export async function scheduleCommand(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) { await ctx.reply('❌ User not found.'); return; }

  await ctx.reply(
    '📅 *Schedule Content*\n\n' +
    'Untuk schedule konten, gunakan:\n\n' +
    '1. `/calendar schedule <topic> | <YYYY-MM-DD HH:MM>` — Schedule via calendar\n' +
    '2. `/autopilot create <niche>` — Auto-generate & publish harian\n\n' +
    'Atau buka Mini App untuk visual calendar:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Open Calendar App', url: 'https://content.aitradepulse.com/app/mini' }],
          [{ text: '🤖 Setup AutoPilot', callback_data: 'autopilot_create' }],
          [{ text: '🔙 Menu', callback_data: 'menu_main' }],
        ],
      },
    },
  );
}

// ══════════════════════════════════════════════════════════════
// Callback Handlers
// ══════════════════════════════════════════════════════════════

export async function handleSocialCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  const user = ctx.from;
  if (!user) return false;

  try {
    // ── Social Connect Menu (from dashboard) ──────────────
    if (data === 'social_connect_menu') {
      await ctx.answerCbQuery();
      // Redirect to connect command
      await connectCommand(ctx);
      return true;
    }

    // ── Publish Menu (from dashboard) ─────────────────────
    if (data === 'publish_menu') {
      await ctx.answerCbQuery();
      await publishCommand(ctx);
      return true;
    }

    // ── Connect platform ───────────────────────────────────
    if (data.startsWith('social_connect_')) {
      const platform = data.replace('social_connect_', '');
      await ctx.answerCbQuery();

      const url = await socialBridge.getConnectUrl(user.id, platform);
      if (url) {
        const p = PLATFORMS.find(p => p.id === platform);
        await ctx.reply(
          `🔗 *Connect ${p?.name ?? platform}*\n\nKlik link di bawah untuk authorize:\n\n${url}\n\n` +
          'Setelah authorize, akun akan otomatis terhubung.',
          { parse_mode: 'Markdown' },
        );
      } else {
        await ctx.reply(`❌ Gagal membuat link connect untuk ${platform}. Coba lagi nanti.`);
      }
      return true;
    }

    // ── Already connected ──────────────────────────────────
    if (data.startsWith('social_connected_')) {
      const platform = data.replace('social_connected_', '');
      await ctx.answerCbQuery();
      const p = PLATFORMS.find(p => p.id === platform);
      await ctx.reply(`✅ ${p?.emoji ?? '📱'} ${p?.name ?? platform} sudah terhubung!`);
      return true;
    }

    // ── Publish to platform ────────────────────────────────
    if (data.startsWith('publish_to_')) {
      const platform = data.replace('publish_to_', '');
      await ctx.answerCbQuery();

      // Check if user has a last generated video/image
      const lastVideo = ctx.session?.stateData?.lastVideoPath as string | undefined;
      const lastImage = ctx.session?.stateData?.lastImagePath as string | undefined;

      if (!lastVideo && !lastImage) {
        await ctx.reply(
          '📤 Belum ada konten untuk di-publish.\n\n' +
          'Buat video/gambar dulu, lalu kembali ke sini untuk publish.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎬 Buat Video', callback_data: 'menu_create' }],
                [{ text: '🖼️ Buat Gambar', callback_data: 'menu_image' }],
              ],
            },
          },
        );
        return true;
      }

      // Upload media to 1ai-social
      const mediaPath = lastVideo || lastImage;
      const mediaType = lastVideo ? 'video' : 'image';

      if (mediaPath) {
        await ctx.reply(`📤 Uploading ke ${platform}...`);

        const uploaded = await socialBridge.uploadMedia(user.id, mediaPath);
        if (!uploaded) {
          await ctx.reply('❌ Gagal upload media. Coba lagi.');
          return true;
        }

        // Generate caption
        const caption = String(ctx.session?.stateData?.lastCaption ?? 'Check out this content! #viral #fyp');

        const result = await socialBridge.publish(user.id, {
          platform,
          mediaUrl: uploaded.url,
          caption,
          mediaType: mediaType as 'video' | 'image',
        });

        if (result.success) {
          const p = PLATFORMS.find(p => p.id === platform);
          await ctx.reply(
            `✅ *Published ke ${p?.name ?? platform}!*\n\n` +
            `📤 Post ID: ${result.post_id}\n` +
            `📊 Status: ${result.status}`,
            { parse_mode: 'Markdown' },
          );
        } else {
          await ctx.reply(`❌ Gagal publish: ${result.error}`);
        }
      }
      return true;
    }

    return false;
  } catch (err: unknown) {
    logger.error(`[Social] Callback error: ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }
}
