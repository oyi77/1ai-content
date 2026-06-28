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
// /connect — Connect social media accounts (tier-aware)
// ══════════════════════════════════════════════════════════════

type InlineButton = { text: string; callback_data: string };

export async function connectCommand(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) { await ctx.reply('❌ User not found.'); return; }

  const available = await socialBridge.isAvailable();
  if (!available) {
    await ctx.reply('❌ Social media service sedang tidak tersedia. Coba lagi nanti.');
    return;
  }

  // Get tier capabilities
  const caps = await socialBridge.getUserSocialCapabilities(user.id);
  const accounts = await socialBridge.getConnectedAccounts(user.id);

  const lines = [
    '🔗 *Connect Social Media*\n',
    `📦 *Plan: ${caps.tier.toUpperCase()}*`,
    `📱 Included: ${caps.includedPlatforms.length > 0 ? caps.includedPlatforms.join(', ') : 'None (add-on required)'}`,
    `📊 Posts/day: ${caps.maxPostsPerDay} | 📅 Schedule: ${caps.canSchedule ? '✅' : '❌'} | 🤖 AutoPilot: ${caps.canAutoPilot ? '✅' : '❌'}`,
    '',
  ];

  if (accounts.length > 0) {
    lines.push('*Connected:*');
    for (const a of accounts) {
      const p = PLATFORMS.find(p => p.id === a.platform);
      lines.push(`${p?.emoji ?? '📱'} ${p?.name ?? a.platform} — @${a.account_name}`);
    }
    lines.push('');
  }

  // Build buttons: included = connect, locked = upgrade
  const rows: InlineButton[][] = [];
  for (const p of PLATFORMS) {
    const connected = accounts.some(a => a.platform === p.id);
    const included = (caps.includedPlatforms as readonly string[]).includes(p.id);

    if (connected) {
      rows.push([{ text: `✅ ${p.emoji} ${p.name}`, callback_data: `social_connected_${p.id}` }]);
    } else if (included) {
      rows.push([{ text: `${p.emoji} Connect ${p.name}`, callback_data: `social_connect_${p.id}` }]);
    } else {
      rows.push([{ text: `🔒 ${p.name} (Upgrade)`, callback_data: `social_upgrade_${p.id}` }]);
    }
  }

  if (caps.tier !== 'agency') {
    rows.push([{ text: '⬆️ Upgrade / Add-ons', callback_data: 'social_upgrade_menu' }]);
  }
  rows.push([{ text: '🔙 Menu', callback_data: 'menu_main' }]);

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: rows },
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

    // ── Upgrade Menu ──────────────────────────────────────
    if (data === 'social_upgrade_menu') {
      await ctx.answerCbQuery();
      const caps = await socialBridge.getUserSocialCapabilities(user.id);

      const lines = [
        '⬆️ *Upgrade Your Plan*\n',
        `Current: *${caps.tier.toUpperCase()}*\n`,
        '*Plans:*',
        '• Lite Rp 99K — Content only, no social posting',
        '• Pro Rp 199K — +TikTok posting + scheduling',
        '• Agency Rp 499K — ALL platforms + AutoPilot',
        '',
        '*Add-ons:*',
        '• Single Platform Rp 49K/mo — +1 platform',
        '• Multi Platform Rp 99K/mo — +3 platforms',
        '• All Platforms Rp 199K/mo — unlimited',
        '• AutoPilot Rp 149K/mo — auto-generate & publish',
      ];

      await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬆️ Upgrade to Pro', callback_data: 'subscribe_pro' }],
            [{ text: '⬆️ Upgrade to Agency', callback_data: 'subscribe_agency' }],
            [{ text: '🛒 Buy Add-on', callback_data: 'social_addon_menu' }],
            [{ text: '🔙 Menu', callback_data: 'menu_main' }],
          ],
        },
      });
      return true;
    }

    // ── Add-on Menu ───────────────────────────────────────
    if (data === 'social_addon_menu') {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🛒 *Social Media Add-ons*\n\n' +
 'Pilih add-on yang sesuai kebutuhan kamu:\n\n' +
 '• 📱 Single Platform — Rp 49K/mo (+1 platform)\n' +
 '• 📱 Multi Platform — Rp 99K/mo (+3 platforms)\n' +
 '• 📱 All Platforms — Rp 199K/mo (unlimited)\n' +
 '• 🤖 AutoPilot — Rp 149K/mo (auto-generate & publish)',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📱 Single Platform Rp49K', callback_data: 'buy_addon_single_platform' }],
              [{ text: '📱 Multi Platform Rp99K', callback_data: 'buy_addon_multi_platform' }],
              [{ text: '📱 All Platforms Rp199K', callback_data: 'buy_addon_all_platforms' }],
              [{ text: '🤖 AutoPilot Rp149K', callback_data: 'buy_addon_autopilot_addon' }],
              [{ text: '🔙 Menu', callback_data: 'menu_main' }],
            ],
          },
        },
      );
      return true;
    }

    // ── Upgrade platform (locked) ─────────────────────────
    if (data.startsWith('social_upgrade_')) {
      const platform = data.replace('social_upgrade_', '');
      await ctx.answerCbQuery();
      const p = PLATFORMS.find(p => p.id === platform);
      await ctx.reply(
 `🔒 *${p?.emoji ?? '📱'} ${p?.name ?? platform}*\n\n` +
 `Platform ini belum termasuk di plan kamu.\n\n` +
 'Upgrade ke Pro/Agency atau beli add-on untuk connect.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬆️ Upgrade Plan', callback_data: 'social_upgrade_menu' }],
              [{ text: '🔙 Kembali', callback_data: 'social_connect_menu' }],
            ],
          },
        },
      );
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
