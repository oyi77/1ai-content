import { Context, NarrowedContext } from 'telegraf';
import { Message, Update } from 'telegraf/types';
import { videoClipperService } from '@/services/video-clipper.service';
import { videoEditorService } from '@/services/video-editor.service';
import { contentReworkService } from '@/services/content-rework.service';
import { viralScannerService } from '@/services/viral-scanner.service';
import { logger } from '@/utils/logger';

type MessageContext = NarrowedContext<Context, Update.MessageUpdate<Message>>;

export class ContentCommands {
  /**
   * /viral - Find viral videos in a niche
   */
  static async handleViral(ctx: MessageContext) {
    const text = 'text' in ctx.message ? ctx.message.text : '';
    const query = text.replace('/viral', '').trim();

    if (!query) {
      await ctx.reply(
        '🔍 *Viral Video Scanner*\n\n' +
        'Usage: `/viral [niche]`\n\n' +
        'Examples:\n' +
        '• `/viral fitness`\n' +
        '• `/viral cooking tips`\n' +
        '• `/viral tech review`\n\n' +
        'Finds trending videos across YouTube, TikTok, and Instagram.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await ctx.reply('🔍 Scanning for viral videos...');

    try {
      const videos = await viralScannerService.scanViralVideos({
        niche: query,
        limit: 10,
        minViews: 10000,
      });

      if (videos.length === 0) {
        await ctx.reply('❌ No viral videos found for this niche. Try a different search term.');
        return;
      }

      let response = `🔥 *Top ${videos.length} Viral Videos: ${query}*\n\n`;

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        response += `*${i + 1}. ${video.title.slice(0, 60)}...*\n`;
        response += `   👁 ${(video.views / 1000).toFixed(0)}K views | ❤️ ${(video.likes / 1000).toFixed(0)}K likes\n`;
        response += `   📊 Virality: ${video.viralityScore}/100\n`;
        response += `   🔗 ${video.url}\n\n`;
      }

      response += `\n💡 *Tip:* Reply with a number (1-${videos.length}) to download and rework that video.`;

      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (error: any) {
      logger.error('Viral scan error:', error);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * /clip - Download and clip a video
   */
  static async handleClip(ctx: MessageContext) {
    const text = 'text' in ctx.message ? ctx.message.text : '';
    const args = text.replace('/clip', '').trim().split(' ');

    if (!args || args.length === 0 || !args[0].startsWith('http')) {
      await ctx.reply(
        '✂️ *Video Clipper*\n\n' +
        'Usage: `/clip [url] [start] [end]`\n\n' +
        'Examples:\n' +
        '• `/clip https://youtube.com/watch?v=xxx`\n' +
        '• `/clip https://tiktok.com/xxx 0:10 0:30`\n' +
        '• `/clip https://instagram.com/reel/xxx 5 15`\n\n' +
        'Downloads video and optionally trims to specified time range.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const url = args[0];
    const startTime = args[1];
    const endTime = args[2];

    await ctx.reply('📥 Downloading video...');

    try {
      // Get video info first
      const info = await videoClipperService.getVideoInfo(url);

      await ctx.reply(
        `📹 *${info.title}*\n\n` +
        `👤 ${info.uploader}\n` +
        `⏱ ${info.duration}s | 👁 ${(info.viewCount / 1000).toFixed(0)}K views\n\n` +
        'Downloading...',
        { parse_mode: 'Markdown' }
      );

      // Download video
      const videoPath = await videoClipperService.downloadClip({
        url,
        startTime,
        endTime,
        format: 'mp4',
        quality: '720p',
      });

      // Send video
      await ctx.replyWithVideo({ source: videoPath }, {
        caption: `✅ Downloaded: ${info.title}`,
      });
    } catch (error: any) {
      logger.error('Clip error:', error);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * /edit - Edit a video
   */
  static async handleEdit(ctx: MessageContext) {
    const text = 'text' in ctx.message ? ctx.message.text : '';
    const args = text.replace('/edit', '').trim().split(' ');

    if (!args || args.length < 2) {
      await ctx.reply(
        '🎬 *Video Editor*\n\n' +
        'Usage: `/edit [action] [options]`\n\n' +
        'Actions:\n' +
        '• `/edit trim [start] [end]` - Trim video\n' +
        '• `/edit resize [WxH]` - Resize video\n' +
        '• `/edit speed [0.5-2]` - Change speed\n' +
        '• `/edit rotate [90|180|270]` - Rotate video\n' +
        '• `/edit volume [0.5-2]` - Adjust volume\n' +
        '• `/edit text [position] [text]` - Add text overlay\n\n' +
        'Reply to a video message with the edit command.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Get video from reply
    const replyMessage = 'reply_to_message' in ctx.message ? ctx.message.reply_to_message : undefined;
    if (!replyMessage || !('video' in replyMessage)) {
      await ctx.reply('❌ Please reply to a video message with the edit command.');
      return;
    }

    const video = replyMessage.video;
    const action = args[0];

    await ctx.reply(`🎬 Applying ${action}...`);

    try {
      // Download video first
      const fileLink = await ctx.telegram.getFileLink(video.file_id);
      const videoPath = `/tmp/input-${Date.now()}.mp4`;

      // Download file
      const response = await fetch(fileLink.href);
      const buffer = await response.arrayBuffer();
      const { writeFile } = await import('fs/promises');
      await writeFile(videoPath, Buffer.from(buffer));

      let outputPath: string;

      switch (action) {
        case 'trim':
          outputPath = await videoEditorService.trim({
            inputPath: videoPath,
            startTime: args[1],
            endTime: args[2],
          });
          break;

        case 'resize':
          const [w, h] = args[1].split('x').map(Number);
          outputPath = await videoEditorService.resize(videoPath, w, h);
          break;

        case 'speed':
          outputPath = await videoEditorService.changeSpeed(videoPath, parseFloat(args[1]));
          break;

        case 'rotate':
          outputPath = await videoEditorService.rotate(videoPath, parseInt(args[1]));
          break;

        case 'volume':
          outputPath = await videoEditorService.adjustVolume(videoPath, parseFloat(args[1]));
          break;

        case 'text':
          outputPath = await videoEditorService.addTextOverlay(videoPath, args.slice(2).join(' '), {
            position: args[1] as any,
          });
          break;

        default:
          await ctx.reply(`❌ Unknown action: ${action}`);
          return;
      }

      await ctx.replyWithVideo({ source: outputPath }, {
        caption: `✅ Applied: ${action}`,
      });
    } catch (error: any) {
      logger.error('Edit error:', error);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * /rework - Rework video to avoid copyright
   */
  static async handleRework(ctx: MessageContext) {
    const text = 'text' in ctx.message ? ctx.message.text : '';
    const args = text.replace('/rework', '').trim().split(' ');

    if (!args || args.length === 0) {
      await ctx.reply(
        '🔄 *Content Rework (Anti-Copyright)*\n\n' +
        'Usage: `/rework [options]`\n\n' +
        'Options:\n' +
        '• `mirror` - Flip horizontally\n' +
        '• `crop` - Crop edges (5%)\n' +
        '• `color` - Shift colors\n' +
        '• `speed` - Slight speed change (1.02x)\n' +
        '• `watermark [text]` - Add watermark\n' +
        '• `metadata [title]` - Change metadata\n\n' +
        'Example: `/rework mirror crop speed watermark @mybrand`\n\n' +
        'Reply to a video to rework it.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const replyMessage = 'reply_to_message' in ctx.message ? ctx.message.reply_to_message : undefined;
    if (!replyMessage || !('video' in replyMessage)) {
      await ctx.reply('❌ Please reply to a video message.');
      return;
    }

    const video = replyMessage.video;
    const options = args.join(' ');

    await ctx.reply('🔄 Reworking content...');

    try {
      // Download video
      const fileLink = await ctx.telegram.getFileLink(video.file_id);
      const videoPath = `/tmp/input-${Date.now()}.mp4`;

      const response = await fetch(fileLink.href);
      const buffer = await response.arrayBuffer();
      const { writeFile } = await import('fs/promises');
      await writeFile(videoPath, Buffer.from(buffer));

      // Parse options
      const reworkOptions: any = {
        inputPath: videoPath,
        mirror: options.includes('mirror'),
        cropPercent: options.includes('crop') ? 5 : 0,
        colorShift: options.includes('color') ? 10 : 0,
        speed: options.includes('speed') ? 1.02 : 1,
        addWatermark: options.includes('watermark'),
        watermarkText: options.match(/watermark\s+(\S+)/)?.[1] || '',
        changeMetadata: options.includes('metadata'),
        newTitle: options.match(/metadata\s+(.+?)(?:\s+mirror|\s+crop|\s+speed|\s+watermark|$)/)?.[1] || '',
      };

      // Apply rework
      const outputPath = await contentReworkService.reworkContent(reworkOptions);

      // Check copyright risk
      const risk = await contentReworkService.checkCopyrightRisk(outputPath);

      await ctx.replyWithVideo({ source: outputPath }, {
        caption: `✅ Content reworked!\n\n📊 Copyright risk: ${risk.riskLevel}\n${risk.issues.length > 0 ? '⚠️ ' + risk.issues.join(', ') : '✅ No issues detected'}`,
      });
    } catch (error: any) {
      logger.error('Rework error:', error);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * /trending - Show trending videos
   */
  static async handleTrending(ctx: MessageContext) {
    const text = 'text' in ctx.message ? ctx.message.text : '';
    const platform = text.replace('/trending', '').trim() || 'all';

    await ctx.reply('📈 Fetching trending videos...');

    try {
      const topics = await viralScannerService.getTrendingTopics(platform, 10);

      if (topics.length === 0) {
        await ctx.reply('❌ No trending topics found.');
        return;
      }

      let response = `📈 *Trending Topics (${platform})*\n\n`;

      for (let i = 0; i < topics.length; i++) {
        const topic = topics[i];
        response += `*${i + 1}. #${topic.topic}*\n`;
        response += `   📊 ${(topic.volume / 1000000).toFixed(1)}M total views\n`;
        response += `   🔥 ${topic.relatedVideos.length} related videos\n\n`;
      }

      response += `\n💡 Use \`/viral [topic]\` to see viral videos for a specific topic.`;

      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (error: any) {
      logger.error('Trending error:', error);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * /scrape - Scrape competitor videos
   */
  static async handleScrape(ctx: MessageContext) {
    const text = 'text' in ctx.message ? ctx.message.text : '';
    const url = text.replace('/scrape', '').trim();

    if (!url || !url.startsWith('http')) {
      await ctx.reply(
        '🕵️ *Competitor Scraper*\n\n' +
        'Usage: `/scrape [channel URL]`\n\n' +
        'Examples:\n' +
        '• `/scrape https://youtube.com/@competitor`\n' +
        '• `/scrape https://tiktok.com/@competitor`\n\n' +
        'Scrapes competitor\'s viral content for analysis.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await ctx.reply('🕵️ Scraping competitor content...');

    try {
      const videos = await viralScannerService.getCompetitorViralContent(url, 10);

      if (videos.length === 0) {
        await ctx.reply('❌ No videos found for this competitor.');
        return;
      }

      let response = `🕵️ *Competitor Analysis*\n\n`;
      response += `🔗 ${url}\n`;
      response += `📹 ${videos.length} videos found\n\n`;

      for (let i = 0; i < Math.min(videos.length, 5); i++) {
        const video = videos[i];
        response += `*${i + 1}. ${video.title.slice(0, 50)}...*\n`;
        response += `   👁 ${(video.views / 1000).toFixed(0)}K views | 🔥 ${video.viralityScore}/100\n\n`;
      }

      response += `\n💡 Reply with a number to download and rework that video.`;

      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (error: any) {
      logger.error('Scrape error:', error);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }
}
