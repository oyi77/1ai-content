/**
 * Content Factory Callback Handler
 *
 * Handles callbacks for Suno, Voice, Music, Loop, and Publish flows.
 */

import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { contentFactoryService } from '@/services/content-factory.service';
import fs from 'fs';
import path from 'path';

/**
 * Handle content factory callbacks.
 * Returns true if the callback was handled.
 */
export async function handleContentFactoryCallbacks(ctx: BotContext, data: string): Promise<boolean> {
  try {
    // ── Suno Presets ──────────────────────────────────────────
    if (data.startsWith('suno_preset_')) {
      const presetMap: Record<string, { prompt: string; style: string }> = {
        lofi: { prompt: 'lo-fi hip hop chill beats, relaxing study music', style: 'lofi' },
        piano: { prompt: 'romantic piano instrumental, soft and emotional', style: 'classical' },
        corporate: { prompt: 'upbeat corporate background music, positive and motivational', style: 'corporate' },
        cinematic: { prompt: 'epic cinematic trailer music, dramatic orchestral', style: 'cinematic' },
        meditation: { prompt: 'calming meditation music, zen ambient sounds', style: 'ambient' },
        retro: { prompt: '8-bit retro game music, chiptune', style: 'retro' },
      };

      const preset = presetMap[data.replace('suno_preset_', '')];
      if (!preset) return false;

      await ctx.answerCbQuery('🎵 Generating...');
      await ctx.reply(`🎵 Generating: *${preset.prompt}*...\n⏳ Mohon tunggu 1-2 menit...`, { parse_mode: 'Markdown' });

      try {
        const result = await contentFactoryService.generateSunoMusic(preset.prompt, {
          style: preset.style,
          instrumental: true,
        });

        if (result.success && result.audio_path) {
          await ctx.reply('✅ Music generated!');
          if (fs.existsSync(result.audio_path)) {
            await ctx.replyWithAudio(
              { source: result.audio_path },
              { title: `Suno: ${preset.prompt}` },
            );
          }
        } else {
          await ctx.reply(`❌ ${result.error || 'Gagal generate music'}`);
        }
      } catch (err: unknown) {
        logger.error(`[Suno Callback] Error: ${err instanceof Error ? err.message : String(err)}`);
        await ctx.reply('❌ Error generating music.');
      }
      return true;
    }

    // ── Voice Selection ───────────────────────────────────────
    if (data.startsWith('voice_select_')) {
      const voiceMap: Record<string, { voice: string; lang: string; label: string }> = {
        id_male: { voice: 'id-ID-ArdiNeural', lang: 'id', label: 'Indonesia Male' },
        id_female: { voice: 'id-ID-GadisNeural', lang: 'id', label: 'Indonesia Female' },
        en_male: { voice: 'en-US-GuyNeural', lang: 'en', label: 'English Male' },
        en_female: { voice: 'en-US-JennyNeural', lang: 'en', label: 'English Female' },
      };

      const voiceKey = data.replace('voice_select_', '');
      const voiceConfig = voiceMap[voiceKey];
      if (!voiceConfig) return false;

      await ctx.answerCbQuery(`🗣️ Voice: ${voiceConfig.label}`);
      ctx.session.state = 'VOICE_TEXT_WAITING';
      ctx.session.stateData = { voice: voiceConfig.voice, language: voiceConfig.lang };
      await ctx.reply(
        `🗣️ Voice dipilih: *${voiceConfig.label}*\n\n` +
        `Ketik text yang mau dijadikan voiceover:`,
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (data === 'voice_regenerate') {
      await ctx.answerCbQuery('🔄 Regenerate');
      ctx.session.state = 'VOICE_TEXT_WAITING';
      await ctx.reply('🎙️ Ketik text baru untuk voiceover:');
      return true;
    }

    // ── Music Presets ─────────────────────────────────────────
    if (data.startsWith('music_preset_')) {
      const presetMap: Record<string, string> = {
        corporate: 'upbeat corporate motivational background music',
        chill: 'chill lo-fi study beats, relaxing',
        dramatic: 'dramatic cinematic orchestral music',
        upbeat: 'upbeat tropical summer vibes dance music',
      };

      const preset = presetMap[data.replace('music_preset_', '')];
      if (!preset) return false;

      await ctx.answerCbQuery('🎶 Generating...');
      await ctx.reply(`🎶 Generating: *${preset}*...`, { parse_mode: 'Markdown' });

      try {
        const result = await contentFactoryService.generateMusic(preset, { duration: 60 });

        if (result.success && result.audio_path) {
          await ctx.reply('✅ Background music generated!');
          if (fs.existsSync(result.audio_path)) {
            await ctx.replyWithAudio(
              { source: result.audio_path },
              { title: `BGM: ${preset}` },
            );
          }
        } else {
          await ctx.reply(`❌ ${result.error || 'Gagal generate music'}`);
        }
      } catch (err: unknown) {
        logger.error(`[Music Callback] Error: ${err instanceof Error ? err.message : String(err)}`);
        await ctx.reply('❌ Error generating music.');
      }
      return true;
    }

    // ── Loop Visual Type Selection ────────────────────────────
    if (data.startsWith('loop_type_') || data.startsWith('loop_create_')) {
      const visualType = data.replace(/^(loop_type_|loop_create_)/, '');
      const validTypes = ['gradient', 'stars', 'waves', 'solid', 'image'];
      if (!validTypes.includes(visualType)) return false;

      await ctx.answerCbQuery(`🔁 Visual: ${visualType}`);
      ctx.session.state = 'LOOP_AUDIO_WAITING';
      ctx.session.stateData = { visualType };
      await ctx.reply(
        `🔁 Visual type: *${visualType}*\n\n` +
        `Kirim file audio (.mp3/.wav) yang mau dijadikan looping video.\n` +
        `Duration default: 60 menit.`,
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    // ── Loop from audio file ──────────────────────────────────
    if (data.startsWith('loop_from_')) {
      const filename = data.replace('loop_from_', '');

      await ctx.answerCbQuery('🔁 Creating loop...');
      await ctx.reply('🔁 Creating looping video...\n⏳ Proses ini butuh beberapa menit...');

      // Find the actual file
      let actualPath = '';
      for (const dir of ['/tmp/suno_output', '/tmp/music_output', '/tmp/tts_output']) {
        const p = path.join(dir, filename);
        if (fs.existsSync(p)) { actualPath = p; break; }
      }

      if (!actualPath) {
        await ctx.reply('❌ File audio tidak ditemukan. Generate ulang dulu.');
        return true;
      }

      try {
        const result = await contentFactoryService.createLoop(actualPath, {
          durationMinutes: 60,
          visualType: 'gradient',
        });

        if (result.success && result.video_path) {
          await ctx.reply('✅ Looping video created!');
          if (fs.existsSync(result.video_path)) {
            await ctx.replyWithVideo(
              { source: result.video_path },
              { caption: `🔁 Looping video (${result.duration || 60} min)` },
            );
          }
        } else {
          await ctx.reply(`❌ ${result.error || 'Gagal membuat looping video'}`);
        }
      } catch (err: unknown) {
        logger.error(`[Loop Callback] Error: ${err instanceof Error ? err.message : String(err)}`);
        await ctx.reply('❌ Error creating loop.');
      }
      return true;
    }

    // ── Publish Platform Selection ────────────────────────────
    if (data.startsWith('publish_select_')) {
      const platform = data.replace('publish_select_', '');
      await ctx.answerCbQuery(`📤 ${platform}`);

      // List available profiles
      try {
        const platformMap: Record<string, string> = {
          fb: 'facebook',
          x: 'twitter',
          ig: 'instagram',
          tiktok: 'tiktok',
          yt: 'youtube',
          linkedin: 'linkedin',
          all: '',
        };

        const platformName = platformMap[platform];
        const profiles = await contentFactoryService.listProfiles(platformName || undefined);

        if (profiles.profiles.length === 0) {
          await ctx.reply(
            `❌ Belum ada profile CloakBrowser untuk platform ini.\n\n` +
            `Setup CloakBrowser dulu di http://localhost:8090`,
          );
          return true;
        }

        let profileList = `📤 *Available Profiles (${platform})*\n\n`;
        const buttons = [];
        for (const p of profiles.profiles.slice(0, 10)) {
          profileList += `• ${p.name || p.id} (${p.platform || platform})\n`;
          buttons.push([{ text: `${p.name || p.id}`, callback_data: `publish_profile_${p.id}` }]);
        }

        await ctx.reply(profileList, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons },
        });
      } catch (err: unknown) {
        logger.error(`[Publish Callback] Error: ${err instanceof Error ? err.message : String(err)}`);
        await ctx.reply('❌ CloakBrowser tidak tersedia. Pastikan berjalan di port 8090.');
      }
      return true;
    }

    return false;
  } catch (err: unknown) {
    logger.error(`[ContentFactory Callback] Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
