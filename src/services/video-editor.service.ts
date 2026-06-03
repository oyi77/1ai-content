import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink, mkdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { logger } from '@/utils/logger';

const execFileAsync = promisify(execFile);

/**
 * Safely parse frame rate string (e.g., "30/1", "30000/1001") to number.
 * Replaces eval() which was a security vulnerability.
 */
function parseFrameRate(fps: string | undefined): number {
  if (!fps) return 0;
  const parts = fps.split('/');
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
  }
  const direct = parseFloat(fps);
  return isNaN(direct) ? 0 : direct;
}

export interface EditOptions {
  inputPath: string;
  outputPath?: string;
  startTime?: string;
  endTime?: string;
  duration?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: string;
  codec?: string;
  audioCodec?: string;
  audioBitrate?: string;
  volume?: number; // 0-2, 1 = normal
  speed?: number; // 0.5-2, 1 = normal
  rotate?: number; // degrees
  flip?: 'horizontal' | 'vertical';
  crop?: string; // WxH+X+Y
  filters?: string[]; // ffmpeg filter strings
}

export interface MergeOptions {
  inputs: string[];
  outputPath?: string;
  transition?: 'none' | 'fade' | 'dissolve';
  transitionDuration?: number; // seconds
  audio?: string; // background audio path
  audioVolume?: number;
}

export interface WatermarkOptions {
  inputPath: string;
  watermarkPath: string;
  outputPath?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity?: number; // 0-1
  scale?: number; // 0-1, percentage of video width
}

export class VideoEditorService {
  private workDir: string;

  constructor() {
    this.workDir = join(tmpdir(), '1ai-content', 'editor');
    this.ensureDir();
  }

  getWorkDir(): string {
    return this.workDir;
  }

  private async ensureDir() {
    await mkdir(this.workDir, { recursive: true });
  }

  /**
   * Trim/cut video
   */
  async trim(options: EditOptions): Promise<string> {
    const { inputPath, outputPath, startTime, endTime, duration } = options;
    const output = outputPath || this.getOutputPath('trim');

    logger.info(`Trimming video: ${inputPath}`);

    const args = ['-y', '-i', inputPath];

    if (startTime) args.push('-ss', startTime);
    if (endTime) args.push('-to', endTime);
    if (duration && !endTime) args.push('-t', duration);

    args.push('-c', 'copy', output);

    await execFileAsync('ffmpeg', args, { timeout: 120000 });
    return output;
  }

  /**
   * Resize video
   */
  async resize(inputPath: string, width: number, height: number, outputPath?: string): Promise<string> {
    const output = outputPath || this.getOutputPath('resize');

    logger.info(`Resizing video: ${inputPath} → ${width}x${height}`);

    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:a', 'copy',
      output,
    ], { timeout: 120000 });

    return output;
  }

  /**
   * Change video speed
   */
  async changeSpeed(inputPath: string, speed: number, outputPath?: string): Promise<string> {
    const output = outputPath || this.getOutputPath('speed');

    logger.info(`Changing speed: ${inputPath} → ${speed}x`);

    const videoFilter = `setpts=${1 / speed}*PTS`;
    const audioFilter = `atempo=${speed}`;

    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', videoFilter,
      '-af', audioFilter,
      output,
    ], { timeout: 120000 });

    return output;
  }

  /**
   * Rotate video
   */
  async rotate(inputPath: string, degrees: number, outputPath?: string): Promise<string> {
    const output = outputPath || this.getOutputPath('rotate');

    logger.info(`Rotating video: ${inputPath} → ${degrees}°`);

    const transposeMap: Record<number, string> = {
      90: 'transpose=1',
      180: 'transpose=1,transpose=1',
      270: 'transpose=2',
    };

    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', transposeMap[degrees] || 'transpose=1',
      output,
    ], { timeout: 120000 });

    return output;
  }

  /**
   * Flip video
   */
  async flip(inputPath: string, direction: 'horizontal' | 'vertical', outputPath?: string): Promise<string> {
    const output = outputPath || this.getOutputPath('flip');

    logger.info(`Flipping video: ${inputPath} → ${direction}`);

    const filter = direction === 'horizontal' ? 'hflip' : 'vflip';

    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', filter,
      output,
    ], { timeout: 120000 });

    return output;
  }

  /**
   * Crop video
   */
  async crop(inputPath: string, width: number, height: number, x: number, y: number, outputPath?: string): Promise<string> {
    const output = outputPath || this.getOutputPath('crop');

    logger.info(`Cropping video: ${inputPath} → ${width}x${height}+${x}+${y}`);

    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', `crop=${width}:${height}:${x}:${y}`,
      output,
    ], { timeout: 120000 });

    return output;
  }

  /**
   * Adjust volume
   */
  async adjustVolume(inputPath: string, volume: number, outputPath?: string): Promise<string> {
    const output = outputPath || this.getOutputPath('volume');

    logger.info(`Adjusting volume: ${inputPath} → ${volume}x`);

    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-af', `volume=${volume}`,
      '-c:v', 'copy',
      output,
    ], { timeout: 120000 });

    return output;
  }

  /**
   * Merge multiple videos
   */
  async merge(options: MergeOptions): Promise<string> {
    const { inputs, outputPath, transition = 'none', transitionDuration = 1, audio, audioVolume = 0.5 } = options;
    const output = outputPath || this.getOutputPath('merge');

    logger.info(`Merging ${inputs.length} videos`);

    if (transition === 'none') {
      // Simple concatenation
      const listFile = join(this.workDir, `${randomUUID()}.txt`);
      const content = inputs.map(f => `file '${f}'`).join('\n');
      await import('fs/promises').then(fs => fs.writeFile(listFile, content));

      await execFileAsync('ffmpeg', [
        '-y', '-f', 'concat', '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        output,
      ], { timeout: 300000 });

      await unlink(listFile);
    } else {
      // Complex merge with transitions (xstack filter)
      // Simplified: just concat for now
      return this.merge({ inputs, outputPath: output, transition: 'none' });
    }

    // Add background audio if specified
    if (audio) {
      const withAudio = this.getOutputPath('merge-audio');
      await execFileAsync('ffmpeg', [
        '-y', '-i', output, '-i', audio,
        '-filter_complex', `[1:a]volume=${audioVolume}[a];[0:a][a]amix=inputs=2:duration=first[out]`,
        '-map', '0:v', '-map', '[out]',
        withAudio,
      ], { timeout: 120000 });

      await unlink(output);
      return withAudio;
    }

    return output;
  }

  /**
   * Add watermark
   */
  async addWatermark(options: WatermarkOptions): Promise<string> {
    const { inputPath, watermarkPath, outputPath, position = 'bottom-right', opacity = 0.5, scale = 0.1 } = options;
    const output = outputPath || this.getOutputPath('watermark');

    logger.info(`Adding watermark to: ${inputPath}`);

    const positionMap: Record<string, string> = {
      'top-left': '10:10',
      'top-right': 'main_w-overlay_w-10:10',
      'bottom-left': '10:main_h-overlay_h-10',
      'bottom-right': 'main_w-overlay_w-10:main_h-overlay_h-10',
      'center': '(main_w-overlay_w)/2:(main_h-overlay_h)/2',
    };

    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath, '-i', watermarkPath,
      '-filter_complex', `[1:v]scale=iw*${scale}:ih*${scale},format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${positionMap[position]}`,
      '-c:a', 'copy',
      output,
    ], { timeout: 120000 });

    return output;
  }

  /**
   * Add text overlay
   */
  async addTextOverlay(
    inputPath: string,
    text: string,
    options: {
      position?: 'top' | 'bottom' | 'center';
      fontSize?: number;
      fontColor?: string;
      backgroundColor?: string;
      outputPath?: string;
    } = {}
  ): Promise<string> {
    const { position = 'bottom', fontSize = 24, fontColor = 'white', backgroundColor = 'black@0.5', outputPath } = options;
    const output = outputPath || this.getOutputPath('text');

    logger.info(`Adding text overlay: ${inputPath}`);

    const yPosition = position === 'top' ? '10' : position === 'bottom' ? 'h-th-10' : '(h-th)/2';

    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', `drawtext=text='${text.replace(/'/g, "\\'")}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-tw)/2:y=${yPosition}:box=1:boxcolor=${backgroundColor}:boxborderw=5`,
      '-c:a', 'copy',
      output,
    ], { timeout: 120000 });

    return output;
  }

  /**
   * Create video from images
   */
  async imagesToVideo(
    imagePaths: string[],
    options: {
      duration?: number; // seconds per image
      fps?: number;
      resolution?: string; // WxH
      transition?: string;
      audio?: string;
      outputPath?: string;
    } = {}
  ): Promise<string> {
    const { duration = 3, fps = 30, resolution = '1920x1080', audio, outputPath } = options;
    const output = outputPath || this.getOutputPath('slideshow');

    logger.info(`Creating video from ${imagePaths.length} images`);

    // Create input file for concat
    const listFile = join(this.workDir, `${randomUUID()}.txt`);
    const content = imagePaths.map(f => `file '${f}'\nduration ${duration}`).join('\n');
    await import('fs/promises').then(fs => fs.writeFile(listFile, content));

    const [w, h] = resolution.split('x');

    await execFileAsync('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0',
      '-i', listFile,
      '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', 'fast',
      output,
    ], { timeout: 300000 });

    await unlink(listFile);

    // Add audio if specified
    if (audio) {
      const withAudio = this.getOutputPath('slideshow-audio');
      await execFileAsync('ffmpeg', [
        '-y', '-i', output, '-i', audio,
        '-c:v', 'copy', '-c:a', 'aac',
        '-shortest',
        withAudio,
      ], { timeout: 120000 });

      await unlink(output);
      return withAudio;
    }

    return output;
  }

  /**
   * Get video duration in seconds
   */
  async getDuration(inputPath: string): Promise<number> {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ], { timeout: 10000 });

    return parseFloat(stdout.trim()) || 0;
  }

  /**
   * Get video info
   */
  async getVideoInfo(inputPath: string): Promise<{
    width: number;
    height: number;
    duration: number;
    fps: number;
    bitrate: number;
    codec: string;
    size: number;
  }> {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,bit_rate,codec_name',
      '-show_entries', 'format=duration,size',
      '-of', 'json',
      inputPath,
    ], { timeout: 10000 });

    const info = JSON.parse(stdout);
    const stream = info.streams?.[0] || {};
    const format = info.format || {};

    return {
      width: stream.width || 0,
      height: stream.height || 0,
      duration: parseFloat(format.duration) || 0,
      fps: parseFrameRate(stream.r_frame_rate),
      bitrate: parseInt(stream.bit_rate) || 0,
      codec: stream.codec_name || 'unknown',
      size: parseInt(format.size) || 0,
    };
  }

  private getOutputPath(prefix: string): string {
    return join(this.workDir, `${prefix}-${randomUUID()}.mp4`);
  }
}

export const videoEditorService = new VideoEditorService();
