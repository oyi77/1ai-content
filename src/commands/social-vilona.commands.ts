/**
 * Social Media Commands — Connect, Publish, Schedule
 *
 * Bridges 1ai-content to 1ai-social for social media management.
 * Uses 1ai-social API (port 8200) for OAuth, publishing, scheduling.
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import axios from 'axios';

// ── 1ai-social API client ───────────────────────────────────

function getSocialClient() {
  const config = getConfig();
  return axios.create({
    baseURL: config.SOCIAL_SERVICE_URL || 'http://localhost:8200',
    timeout: 30_000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.SOCIAL_SERVICE_KEY || ''}`,
    },
  });
}

const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok', emoji: '🎵' },
  { id: 'instagram', name: 'Instagram', emoji: '📸' },
  { id: 'facebook', name: 'Facebook', emoji: '📘' },
  { id: 'youtube', name: 'YouTube', emoji: '▶️' },
  { id: 'x', name: 'X/Twitter', emoji: '🐦' },
  { id: 'linkedin', name: 'LinkedIn', emoji: '💼' },
];

// ── /connect — Connect social media accounts ────────────────

export async function connectCommand(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) { await ctx.reply('❌ User not found.'); return; }

  // Try to get connected accounts from 1ai-social
  let accounts: Array<{ platform: string; account_name: string; status: string }> = [];
  try {
    const client = getSocialClient();
    const { data } = await client.get('/accounts', {
      headers: { 'X-User-Id': String(user.id) },
    });
    accounts = data.platforms || data.accounts || [];
  } catch {
    // 1ai-social might not be running — that's OK, show connect options anyway
  }

  const lines = [
    '🔗 *Connect Social Media*\n',
    accounts.length > 0
      ? '*Connected Accounts:*\n' + accounts.map((a: { platform: string; account_name: string }) => {
          const p = PLATFORMS.find(p => p.id === a.platform);
          return `${p?.emoji ?? '📱'} ${p?.name ?? a.platform} — @${a.account_name}`;
        }).join('\n') + '\n'
      : 'Belum ada akun yang terhubung.\n',
    'Pilih platform untuk connect:',
  ];

  const buttons = PLATFORMS.map(p => {
    const connected = accounts.some((a: { platform: string }) => a.platform === p.id);
    return [{
      text: connected ? `✅ ${p.emoji} ${p.name}` : `${p.emoji} Connect ${p.name}`,
      callback_data: connected ? `social_connected_${p.id}` : `social_connect_${p.id}`,
    }];
  });

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [...buttons, [{ text: '🔙 Menu', callback_data: 'main_menu' }]] },
  });
}

// ── /publish — Publish content to social media ──────────────

export async function publishCommand(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) { await ctx.reply('❌ User not found.'); return; }

  // Get connected accounts
  let accounts: Array<{ platform: string; account_name: string; id: string }> = [];
  try {
    const client = getSocialClient();
    const { data } = await client.get('/accounts', {
      headers: { 'X-User-Id': String(user.id) },
    });
    accounts = data.platforms || data.accounts || [];
  } catch { /* 1ai-social down */ }

  if (accounts.length === 0) {
    await ctx.reply(
      '📤 *Publish Content*\n\n' +
      'Belum ada akun social media yang terhubung.\n\n' +
      'Ketik `/connect` untuk hubungkan akun dulu.',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const buttons = accounts.map((a: { platform: string; account_name: string }) => {
    const p = PLATFORMS.find(p => p.id === a.platform);
    return [{
      text: `${p?.emoji ?? '📱'} ${p?.name ?? a.platform} (@${a.account_name})`,
      callback_data: `publish_to_${a.platform}`,
    }];
  });

  await ctx.reply(
    '📤 *Publish Content*\n\n' +
    'Pilih platform untuk publish konten terakhir yang kamu buat:',
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...buttons, [{ text: '🔙 Menu', callback_data: 'main_menu' }]] },
    },
  );
}

// ── /schedule — Schedule content for later ──────────────────

export async function scheduleCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(
    '📅 *Schedule Content*\n\n' +
    'Untuk schedule konten, gunakan:\n\n' +
    '• `/calendar schedule <topic> | <YYYY-MM-DD HH:MM>`\n' +
    '• `/autopilot create <niche>` — Auto-generate & publish harian\n\n' +
    'Atau buka Calendar di admin dashboard:\nhttps://content.aitradepulse.com/admin/calendar',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Open Calendar', url: 'https://content.aitradepulse.com/admin/calendar' }],
          [{ text: '🤖 Setup AutoPilot', callback_data: 'autopilot_create' }],
          [{ text: '🔙 Menu', callback_data: 'main_menu' }],
        ],
      },
    },
  );
}

// ── Callback handlers for social connect/publish ────────────

export async function handleSocialCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  const user = ctx.from;
  if (!user) return false;

  try {
    // Connect platform
    if (data.startsWith('social_connect_')) {
      const platform = data.replace('social_connect_', '');
      await ctx.answerCbQuery();
      const p = PLATFORMS.find(p => p.id === platform);
      try {
        const client = getSocialClient();
        const { data: resp } = await client.get(`/accounts/connect/${platform}`, {
          headers: { 'X-User-Id': String(user.id) },
        });
        if (resp.auth_url || resp.url) {
          await ctx.reply(
            `🔗 *Connect ${p?.name ?? platform}*\n\nKlik link di bawah untuk authorize:\n\n${resp.auth_url || resp.url}\n\nSetelah authorize, akun akan otomatis terhubung.`,
            { parse_mode: 'Markdown' },
          );
        } else {
          await ctx.reply(`❌ Gagal membuat link connect untuk ${p?.name ?? platform}.`);
        }
      } catch {
        await ctx.reply(`❌ 1ai-social service tidak tersedia. Hubungi admin.`);
      }
      return true;
    }

    // Already connected
    if (data.startsWith('social_connected_')) {
      const platform = data.replace('social_connected_', '');
      await ctx.answerCbQuery();
      const p = PLATFORMS.find(p => p.id === platform);
      await ctx.reply(`✅ ${p?.emoji ?? '📱'} ${p?.name ?? platform} sudah terhubung!`);
      return true;
    }

    // Publish to platform
    if (data.startsWith('publish_to_')) {
      const platform = data.replace('publish_to_', '');
      await ctx.answerCbQuery();
      const p = PLATFORMS.find(p => p.id === platform);

      // Check if user has a last generated video
      const lastVideo = ctx.session?.stateData?.lastVideoPath as string | undefined;
      if (!lastVideo) {
        await ctx.reply(
          '📤 Belum ada konten untuk di-publish.\n\nBuat video/gambar dulu, lalu kembali ke sini untuk publish.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎬 Buat Video', callback_data: 'create_video_new' }],
                [{ text: '🖼️ Buat Carousel', callback_data: 'carousel_regenerate' }],
              ],
            },
          },
        );
        return true;
      }

      // Upload and publish via 1ai-social
      try {
        const client = getSocialClient();

        // Upload media
        const fs = await import('fs');
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('file', fs.createReadStream(lastVideo));

        const { data: uploadResp } = await client.post('/media/upload', form, {
          headers: { ...form.getHeaders(), 'X-User-Id': String(user.id) },
          timeout: 60_000,
        });

        // Publish
        const caption = String(ctx.session?.stateData?.lastCaption ?? 'Check out this content! #viral #fyp');
        const { data: pubResp } = await client.post('/posts', {
          platform,
          media_url: uploadResp.url,
          content: caption,
          media_type: 'video',
        }, {
          headers: { 'X-User-Id': String(user.id) },
        });

        await ctx.reply(
          `✅ *Published ke ${p?.name ?? platform}!*\n\n📤 Post ID: ${pubResp.id ?? '—'}\n📊 Status: ${pubResp.status ?? 'published'}`,
          { parse_mode: 'Markdown' },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`❌ Gagal publish: ${msg}`);
      }
      return true;
    }

    return false;
  } catch (err: unknown) {
    logger.error(`[Social] Callback error: ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }
}
