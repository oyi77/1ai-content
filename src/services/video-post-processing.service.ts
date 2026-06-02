/**
 * Video Post-Processing Service
 *
 * Professional FFmpeg-based post-processing pipeline that produces
 * CapCut-quality output with:
 *   - Dynamic xfade transitions for ANY number of clips (niche-aware)
 *   - Color grading presets per niche
 *   - Text overlay support (hook/CTA)
 *   - Full post-processing pipeline
 *
 * Uses ffprobe to get actual clip durations for precise offset calculation.
 * All methods are resilient — failures return gracefully so the raw video
 * can still be delivered.
 */

import { logger } from '@/utils/logger';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ProviderError, ValidationError } from '@/utils/app-errors';

const exec = promisify(execCallback);

// ── Niche-to-transition mapping ──
// Each niche maps to an array of FFmpeg xfade transition names.
// Transitions are cycled through for multi-clip sequences.

const NICHE_TRANSITIONS: Record<string, string[]> = {
  fnb: ['fadeblack', 'fade', 'zoomin'],
  food_culinary: ['fadeblack', 'fade', 'zoomin'],
  fnb_food_drink: ['fadeblack', 'fade', 'zoomin'],
  fashion: ['slideleft', 'slideright', 'fade'],
  fashion_lifestyle: ['slideleft', 'slideright', 'fade'],
  fashion_apparel: ['slideleft', 'slideright', 'fade'],
  tech: ['zoomin', 'circleopen', 'fadewhite'],
  tech_gadgets: ['zoomin', 'circleopen', 'fadewhite'],
  smartphone_gadget: ['zoomin', 'circleopen', 'fadewhite'],
  travel: ['fade', 'wipeleft', 'circleopen'],
  travel_adventure: ['fade', 'wipeleft', 'circleopen'],
  travel_lifestyle: ['fade', 'wipeleft', 'circleopen'],
  fitness: ['fadeblack', 'zoomin', 'wipedown'],
  fitness_health: ['fadeblack', 'zoomin', 'wipedown'],
  health_fitness: ['fadeblack', 'zoomin', 'wipedown'],
  realestate: ['fade', 'slideleft', 'fadewhite'],
  real_estate: ['fade', 'slideleft', 'fadewhite'],
  home_decor: ['fade', 'slideleft', 'fadewhite'],
  beauty: ['fade', 'fadewhite', 'circleopen'],
  beauty_skincare: ['fade', 'fadewhite', 'circleopen'],
  skincare_cosmetic: ['fade', 'fadewhite', 'circleopen'],
  education: ['fade', 'slideleft', 'slideright'],
  education_knowledge: ['fade', 'slideleft', 'slideright'],
  finance: ['fade', 'fadeblack', 'fadewhite'],
  business_finance: ['fade', 'fadeblack', 'fadewhite'],
  finance_business: ['fade', 'fadeblack', 'fadewhite'],
  entertainment: ['zoomin', 'circleopen', 'slidedown'],
  entertainment_art: ['zoomin', 'circleopen', 'slidedown'],
};

// Default transitions when niche is unknown
const DEFAULT_TRANSITIONS = ['fade', 'fadeblack', 'fadewhite'];

// All available xfade transitions for random selection
const ALL_TRANSITIONS = [
  'fade', 'fadeblack', 'fadewhite', 'slideleft', 'slideright',
  'slideup', 'slidedown', 'zoomin', 'circleopen', 'circleclose',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown',
];

// ── Color grading presets per niche ──

const COLOR_GRADES: Record<string, string> = {
  fnb: 'eq=brightness=0.06:contrast=1.1:saturation=1.3',
  food_culinary: 'eq=brightness=0.06:contrast=1.1:saturation=1.3',
  fnb_food_drink: 'eq=brightness=0.06:contrast=1.1:saturation=1.3',
  fashion: 'eq=brightness=0.03:contrast=1.05:saturation=1.1',
  fashion_lifestyle: 'eq=brightness=0.03:contrast=1.05:saturation=1.1',
  fashion_apparel: 'eq=brightness=0.03:contrast=1.05:saturation=1.1',
  tech: 'eq=brightness=0.05:contrast=1.15:saturation=0.95',
  tech_gadgets: 'eq=brightness=0.05:contrast=1.15:saturation=0.95',
  smartphone_gadget: 'eq=brightness=0.05:contrast=1.15:saturation=0.95',
  travel: 'eq=brightness=0.08:contrast=1.1:saturation=1.2',
  travel_adventure: 'eq=brightness=0.08:contrast=1.1:saturation=1.2',
  travel_lifestyle: 'eq=brightness=0.08:contrast=1.1:saturation=1.2',
  fitness: 'eq=brightness=0.04:contrast=1.2:saturation=1.1',
  fitness_health: 'eq=brightness=0.04:contrast=1.2:saturation=1.1',
  health_fitness: 'eq=brightness=0.04:contrast=1.2:saturation=1.1',
  realestate: 'eq=brightness=0.1:contrast=1.05:saturation=1.0',
  real_estate: 'eq=brightness=0.1:contrast=1.05:saturation=1.0',
  home_decor: 'eq=brightness=0.1:contrast=1.05:saturation=1.0',
  beauty: 'eq=brightness=0.05:contrast=1.0:saturation=1.05',
  beauty_skincare: 'eq=brightness=0.05:contrast=1.0:saturation=1.05',
  skincare_cosmetic: 'eq=brightness=0.05:contrast=1.0:saturation=1.05',
  education: 'eq=brightness=0.04:contrast=1.08:saturation=1.0',
  education_knowledge: 'eq=brightness=0.04:contrast=1.08:saturation=1.0',
  finance: 'eq=brightness=0.03:contrast=1.1:saturation=0.95',
  business_finance: 'eq=brightness=0.03:contrast=1.1:saturation=0.95',
  finance_business: 'eq=brightness=0.03:contrast=1.1:saturation=0.95',
  entertainment: 'eq=brightness=0.06:contrast=1.15:saturation=1.15',
  entertainment_art: 'eq=brightness=0.06:contrast=1.15:saturation=1.15',
};

const DEFAULT_COLOR_GRADE = 'eq=brightness=0.04:contrast=1.08:saturation=1.05';

// ── Text overlay styles ──

interface TextStyle {
  fontsize: number;
  fontcolor: string;
  borderw: number;
  shadowcolor: string;
  shadowx: number;
  shadowy: number;
  font: string;
}

const TEXT_STYLES: Record<string, TextStyle> = {
  bold: {
    fontsize: 48,
    fontcolor: 'white',
    borderw: 3,
    shadowcolor: 'black@0.6',
    shadowx: 2,
    shadowy: 2,
    font: 'Arial',
  },
  subtle: {
    fontsize: 36,
    fontcolor: 'white@0.9',
    borderw: 2,
    shadowcolor: 'black@0.4',
    shadowx: 1,
    shadowy: 1,
    font: 'Helvetica',
  },
  viral: {
    fontsize: 56,
    fontcolor: 'yellow',
    borderw: 4,
    shadowcolor: 'black@0.8',
    shadowx: 3,
    shadowy: 3,
    font: 'Impact',
  },
};

// ── Helper: get clip duration via ffprobe ──

async function getClipDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await exec(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { timeout: 15000 }
    );
    const duration = parseFloat(stdout.trim());
    if (isNaN(duration) || duration <= 0) {
      throw new ProviderError('FFprobe', `Invalid duration: ${stdout.trim()}`);
    }
    return duration;
  } catch (err: any) {
    logger.warn(`ffprobe duration failed for ${filePath}: ${err.message}`);
    return 5; // Conservative fallback: assume 5s clip
  }
}

/**
 * Get transition names for a niche, cycling through them for N-1 transitions.
 */
function getTransitionsForNiche(
  niche: string | undefined,
  count: number,
  type?: 'fade' | 'slide' | 'zoom' | 'wipe' | 'random'
): string[] {
  let pool: string[];

  if (type === 'random') {
    pool = [...ALL_TRANSITIONS];
  } else if (type === 'fade') {
    pool = ['fade', 'fadeblack', 'fadewhite'];
  } else if (type === 'slide') {
    pool = ['slideleft', 'slideright', 'slideup', 'slidedown'];
  } else if (type === 'zoom') {
    pool = ['zoomin', 'circleopen', 'circleclose'];
  } else if (type === 'wipe') {
    pool = ['wipeleft', 'wiperight', 'wipeup', 'wipedown'];
  } else {
    // Use niche-specific transitions
    const nicheKey = niche?.toLowerCase() || '';
    pool = NICHE_TRANSITIONS[nicheKey] || DEFAULT_TRANSITIONS;
  }

  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    if (type === 'random') {
      result.push(pool[Math.floor(Math.random() * pool.length)]);
    } else {
      result.push(pool[i % pool.length]);
    }
  }
  return result;
}

// ── Main Service ──

export class VideoPostProcessing {
  /**
   * Normalize all clips to match the resolution of the first clip.
   *
   * Uses ffprobe to detect each clip's resolution and re-encodes any clip
   * whose dimensions differ from the first clip, padding to preserve aspect
   * ratio. Returns the (potentially replaced) input paths; callers must
   * clean up any temp files listed in the returned array that differ from
   * the originals.
   */
  private static async normalizeResolutions(inputPaths: string[]): Promise<string[]> {
    if (inputPaths.length <= 1) return [...inputPaths];

    // Get resolution of the first clip (reference)
    let refWidth: number;
    let refHeight: number;
    try {
      const { stdout } = await exec(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${inputPaths[0]}"`,
        { timeout: 15000 }
      );
      const [w, h] = stdout.trim().split('x').map(Number);
      if (!w || !h || isNaN(w) || isNaN(h)) {
        throw new ProviderError('FFprobe', `Invalid resolution: ${stdout.trim()}`);
      }
      refWidth = w;
      refHeight = h;
    } catch (err: any) {
      logger.warn(`Failed to probe reference resolution, skipping normalization: ${err.message}`);
      return [...inputPaths];
    }

    logger.info(`Reference resolution: ${refWidth}x${refHeight} (from first clip)`);

    const normalized: string[] = [inputPaths[0]];

    for (let i = 1; i < inputPaths.length; i++) {
      try {
        const { stdout } = await exec(
          `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${inputPaths[i]}"`,
          { timeout: 15000 }
        );
        const [w, h] = stdout.trim().split('x').map(Number);

        if (w === refWidth && h === refHeight) {
          normalized.push(inputPaths[i]);
          continue;
        }

        logger.info(`Clip ${i} resolution ${w}x${h} differs from reference ${refWidth}x${refHeight}, re-encoding...`);
        const ext = path.extname(inputPaths[i]);
        const normalizedPath = inputPaths[i].replace(ext, `_normalized${ext}`);

        await exec(
          `ffmpeg -y -i "${inputPaths[i]}" ` +
          `-vf "scale=${refWidth}:${refHeight}:force_original_aspect_ratio=decrease,pad=${refWidth}:${refHeight}:(ow-iw)/2:(oh-ih)/2" ` +
          `-c:a copy "${normalizedPath}"`,
          { timeout: 120000 }
        );

        if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).size > 0) {
          normalized.push(normalizedPath);
        } else {
          logger.warn(`Normalization failed for clip ${i}, using original`);
          normalized.push(inputPaths[i]);
        }
      } catch (err: any) {
        logger.warn(`Resolution normalization failed for clip ${i}: ${err.message}, using original`);
        normalized.push(inputPaths[i]);
      }
    }

    return normalized;
  }

  /**
   * Concatenate clips with professional xfade transitions.
   *
   * Dynamically builds an FFmpeg filter chain for ANY number of clips:
   *   [0:v][1:v]xfade=transition=X:duration=D:offset=O1[v1];
   *   [v1][2:v]xfade=transition=Y:duration=D:offset=O2[v2];
   *   ...
   *
   * Uses ffprobe to get actual clip durations for precise offset calculation.
   */
  static async concatenateWithTransitions(
    inputPaths: string[],
    outputPath: string,
    options?: {
      transitionType?: 'fade' | 'slide' | 'zoom' | 'wipe' | 'random';
      transitionDuration?: number;
      niche?: string;
    }
  ): Promise<void> {
    if (inputPaths.length === 0) {
      throw new ValidationError('No input paths provided for concatenation', 'inputPaths');
    }

    if (inputPaths.length === 1) {
      fs.copyFileSync(inputPaths[0], outputPath);
      return;
    }

    // Normalize resolutions so all clips match the first clip's dimensions
    const normalizedPaths = await VideoPostProcessing.normalizeResolutions(inputPaths);
    const normalizedTempFiles = normalizedPaths.filter((p, i) => p !== inputPaths[i]);

    try {
      const transitionDuration = options?.transitionDuration ?? 0.5;
      const numTransitions = normalizedPaths.length - 1;

      // Get actual durations of all clips via ffprobe
      logger.info(`Probing durations for ${normalizedPaths.length} clips...`);
      const durations = await Promise.all(normalizedPaths.map(getClipDuration));
      logger.info(`Clip durations: ${durations.map(d => d.toFixed(2)).join(', ')}s`);

      // Get niche-appropriate transitions
      const transitions = getTransitionsForNiche(
        options?.niche,
        numTransitions,
        options?.transitionType
      );

      // Build the FFmpeg input arguments
      const inputArgs = normalizedPaths.map(p => `-i "${p}"`).join(' ');

      // Build the xfade filter chain
      const filterParts: string[] = [];
      let cumulativeDuration = 0;

      for (let i = 0; i < numTransitions; i++) {
        const transition = transitions[i];
        const inputA = i === 0 ? `[0:v]` : `[v${i}]`;
        const inputB = `[${i + 1}:v]`;
        const outputLabel = i === numTransitions - 1 ? `[vout]` : `[v${i + 1}]`;

        cumulativeDuration += durations[i];
        const offset = Math.max(0, cumulativeDuration - (transitionDuration * (i + 1)));

        filterParts.push(
          `${inputA}${inputB}xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${outputLabel}`
        );
      }

      const filterComplex = filterParts.join(';');

      const cmd =
        `ffmpeg -y ${inputArgs} ` +
        `-filter_complex "${filterComplex}" ` +
        `-map "[vout]" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "${outputPath}"`;

      logger.info(`FFmpeg xfade command (${numTransitions} transitions): ${transitions.join(', ')}`);
      logger.debug(`Full FFmpeg command: ${cmd}`);

      try {
        await exec(cmd, { timeout: 300000 });
      } catch (err: any) {
        logger.error(`FFmpeg xfade concatenation failed: ${err.message}`);
        logger.warn('Falling back to simple concat (no transitions)...');
        await VideoPostProcessing.simpleConcatenate(normalizedPaths, outputPath);
      }
    } finally {
      // Clean up normalized temp files
      for (const tmp of normalizedTempFiles) {
        try { fs.unlinkSync(tmp); } catch (err) { logger.debug("Temp file cleanup error:", err); }
      }
    }
  }

  /**
   * Simple concat fallback (no transitions) using concat demuxer.
   * Used when xfade fails.
   */
  private static async simpleConcatenate(
    inputPaths: string[],
    outputPath: string
  ): Promise<void> {
    const listPath = outputPath.replace('.mp4', `_concat_${Date.now()}.txt`);
    const listContent = inputPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(listPath, listContent);

    try {
      await exec(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`,
        { timeout: 120000 }
      );
    } finally {
      try { fs.unlinkSync(listPath); } catch (err) { logger.debug("Temp file cleanup error:", err); }
    }
  }

  /**
   * Add text overlays (hook/CTA) to a video using FFmpeg drawtext.
   */
  static async addTextOverlay(
    videoPath: string,
    outputPath: string,
    texts: Array<{
      text: string;
      startTime: number;
      endTime: number;
      position: 'top' | 'center' | 'bottom';
      style: 'bold' | 'subtle' | 'viral';
    }>
  ): Promise<void> {
    if (texts.length === 0) {
      fs.copyFileSync(videoPath, outputPath);
      return;
    }

    const drawFilters = texts.map(t => {
      const style = TEXT_STYLES[t.style] || TEXT_STYLES.bold;
      const escapedText = t.text.replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/\\/g, '\\\\');

      let yPos: string;
      switch (t.position) {
        case 'top': yPos = 'h*0.08'; break;
        case 'center': yPos = '(h-text_h)/2'; break;
        case 'bottom': yPos = 'h*0.85'; break;
        default: yPos = 'h*0.85';
      }

      return (
        `drawtext=text='${escapedText}'` +
        `:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` +
        `:fontsize=${style.fontsize}` +
        `:fontcolor=${style.fontcolor}` +
        `:borderw=${style.borderw}` +
        `:bordercolor=black` +
        `:shadowcolor=${style.shadowcolor}` +
        `:shadowx=${style.shadowx}` +
        `:shadowy=${style.shadowy}` +
        `:x=(w-text_w)/2` +
        `:y=${yPos}` +
        `:enable='between(t,${t.startTime},${t.endTime})'`
      );
    });

    const filterChain = drawFilters.join(',');

    try {
      await exec(
        `ffmpeg -y -i "${videoPath}" ` +
        `-vf "${filterChain}" ` +
        `-c:a copy -c:v libx264 -preset fast -crf 18 "${outputPath}"`,
        { timeout: 120000 }
      );
    } catch (err: any) {
      logger.error(`Text overlay failed: ${err.message}`);
      // Fallback: copy without text
      fs.copyFileSync(videoPath, outputPath);
    }
  }

  /**
   * Apply color grading using niche-specific EQ filter.
   */
  static async applyColorGrade(
    videoPath: string,
    outputPath: string,
    niche: string
  ): Promise<void> {
    const nicheKey = niche.toLowerCase();
    const grade = COLOR_GRADES[nicheKey] || DEFAULT_COLOR_GRADE;

    try {
      await exec(
        `ffmpeg -y -i "${videoPath}" ` +
        `-vf "${grade}" ` +
        `-c:a copy -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "${outputPath}"`,
        { timeout: 120000 }
      );

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        throw new ProviderError('FFmpeg', 'Color graded output is empty');
      }

      logger.info(`Color grade applied (${niche}): ${grade}`);
    } catch (err: any) {
      logger.error(`Color grading failed: ${err.message}`);
      // Fallback: copy original
      fs.copyFileSync(videoPath, outputPath);
    }
  }

  /**
   * Full post-processing pipeline:
   *   1. Optional text overlays (hook + CTA)
   *   2. Color grading
   *
   * Designed to be resilient — if any step fails, the previous output
   * (or original) is used.
   */
  static async postProcess(
    videoPath: string,
    outputPath: string,
    options: {
      niche: string;
      platform: string;
      addHookText?: string;
      addCTAText?: string;
      colorGrade?: boolean;
    }
  ): Promise<void> {
    let currentPath = videoPath;
    const tempFiles: string[] = [];

    try {
      // Step 1: Text overlays (hook + CTA)
      if (options.addHookText || options.addCTAText) {
        const texts: Array<{
          text: string;
          startTime: number;
          endTime: number;
          position: 'top' | 'center' | 'bottom';
          style: 'bold' | 'subtle' | 'viral';
        }> = [];

        // Get video duration for CTA timing
        const totalDuration = await getClipDuration(videoPath);

        if (options.addHookText) {
          texts.push({
            text: options.addHookText,
            startTime: 0,
            endTime: Math.min(3, totalDuration * 0.3),
            position: 'center',
            style: 'viral',
          });
        }

        if (options.addCTAText) {
          texts.push({
            text: options.addCTAText,
            startTime: Math.max(0, totalDuration - 3),
            endTime: totalDuration,
            position: 'bottom',
            style: 'bold',
          });
        }

        if (texts.length > 0) {
          const textOutputPath = videoPath.replace('.mp4', '_text.mp4');
          tempFiles.push(textOutputPath);
          await VideoPostProcessing.addTextOverlay(currentPath, textOutputPath, texts);
          if (fs.existsSync(textOutputPath) && fs.statSync(textOutputPath).size > 0) {
            currentPath = textOutputPath;
          }
        }
      }

      // Step 2: Color grading
      if (options.colorGrade !== false) {
        await VideoPostProcessing.applyColorGrade(currentPath, outputPath, options.niche);
      } else {
        // No color grading — just copy to output
        if (currentPath !== outputPath) {
          fs.copyFileSync(currentPath, outputPath);
        }
      }
    } catch (err: any) {
      logger.error(`Post-processing pipeline failed: ${err.message}`);
      // Ultimate fallback: copy original to output
      if (videoPath !== outputPath) {
        fs.copyFileSync(videoPath, outputPath);
      }
    } finally {
      // Cleanup temp files
      for (const tmp of tempFiles) {
        try { fs.unlinkSync(tmp); } catch (err) { logger.debug("Temp file cleanup error:", err); }
      }
    }
  }
}
