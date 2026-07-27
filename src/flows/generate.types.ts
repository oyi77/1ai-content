/**
 * Generate Flow — Shared Types, Helpers & Constants
 *
 * Extracted from generate.ts to break up the god object.
 * Contains type definitions, utility functions, and imports shared across the flow modules.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { BotContext } from '@/types';
import type { DurationPreset, DurationPresetConfig, SceneConfig, SceneId } from '@/config/hpas-engine';

const execFileAsync = promisify(execFile);
const VIDEO_DIR = getConfig().VIDEO_DIR;

// ── Types ────────────────────────────────────────────────────────────────────

export type GenerateMode = 'basic' | 'smart' | 'pro';
export type GenerateAction = 'image_set' | 'video' | 'clone_style' | 'campaign';
export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'square';
export type GeneratedSceneData = { sceneId: SceneId; scene: SceneConfig; prompt: string; durationSeconds: number };
export type ManualSceneData = { sceneId: string; description: string; durationSeconds: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset all generate-flow session fields and return to DASHBOARD.
 *  Field list kept in sync with cleanup in showGenerateMode(). */
export function clearGenerateSession(ctx: BotContext): void {
  if (!ctx.session) return;
  const fields = ['generateMode','generateAction','generatePreset','generatePlatform',
    'generateProductDesc','generatePhotoUrl','generateAspectRatio','generateResolution',
    'generateCampaignSize','generateScenes','generateStoryboardMode',
    'generateManualStoryboard','generateManualTranscript','customPresetConfig',
    'generatePhotos','generatePhotoCount'] as const;
  for (const f of fields) delete (ctx.session as unknown as Record<string, unknown>)[f];
  ctx.session.state = 'DASHBOARD';
}

export function getStepIndicator(mode: string, step: number): string {
  const totalSteps: Record<string, number> = { basic: 4, smart: 6, pro: 11 };
  const total = totalSteps[mode] || 6;
  return `[${step}/${total}]`;
}

/** Download a URL to a local file. Returns the local path or null on failure. */
export async function downloadToLocal(url: string, filename: string): Promise<string | null> {
  try {
    if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });
    const localPath = path.join(VIDEO_DIR, filename);
    await execFileAsync('wget', ['-q', '-O', localPath, url]);
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) return localPath;
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch (err) {
    logger.warn('downloadToLocal failed:', err);
  }
  return null;
}
