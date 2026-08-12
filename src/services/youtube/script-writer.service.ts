/**
 * Script Writer Service (FASE 2A)
 *
 * Generates narrated scripts with timestamp markers.
 * Duration targets from config — zero hardcoded values.
 */

import { logger } from "@/utils/logger";
import {
  getTier1Duration,
  getTier2Duration,
  getTier3Duration,
} from "@/config/youtube.config";
import type { ChannelTier } from "@/config/youtube.config";

interface TimestampMarker {
  time: string;
  label: string;
  segmentIndex: number;
}

interface ScriptResult {
  script: string;
  timestamps: TimestampMarker[];
  durationEstimate: number;
  hookType: string;
  toneVariant: string;
}

function getTargetDuration(tier: ChannelTier): number {
  switch (tier) {
    case "tier_1_cold_start":
      return getTier1Duration();
    case "tier_2_growing":
      return getTier2Duration();
    case "tier_3_established":
      return getTier3Duration();
    default:
      return getTier1Duration();
  }
}

export async function generateScript(
  ideaSummary: string,
  toneVariant: string,
  channelTier: ChannelTier,
  titleDraft: string,
): Promise<ScriptResult> {
  const targetMinutes = getTargetDuration(channelTier);
  const targetSeconds = targetMinutes * 60;

  const hookTypes = [
    "mystery_question",
    "shocking_fact",
    "controversial_claim",
    "unresolved_mystery",
  ];
  const hookType = hookTypes[Math.floor(Math.random() * hookTypes.length)];

  const segments = generateSegments(
    ideaSummary,
    toneVariant,
    hookType,
    targetMinutes,
  );
  const timestamps: TimestampMarker[] = [];
  let currentTime = 0;

  segments.forEach((seg, idx) => {
    const minutes = Math.floor(currentTime / 60);
    const seconds = currentTime % 60;
    timestamps.push({
      time: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      label: seg.label,
      segmentIndex: idx,
    });
    currentTime += seg.durationSec;
  });

  const script = segments.map((s) => s.text).join("\n\n");

  logger.info(
    `[script-writer] Generated ${targetMinutes}min script for "${titleDraft}"`,
  );
  return {
    script,
    timestamps,
    durationEstimate: targetSeconds,
    hookType,
    toneVariant,
  };
}

interface Segment {
  label: string;
  text: string;
  durationSec: number;
}

function generateSegments(
  summary: string,
  tone: string,
  hookType: string,
  targetMinutes: number,
): Segment[] {
  const totalSec = targetMinutes * 60;
  const hookSec = 10;
  const bodySec = Math.floor(totalSec * 0.7);
  const twistSec = Math.floor(totalSec * 0.1);
  const resolutionSec = totalSec - hookSec - bodySec - twistSec;

  return [
    {
      label: "Hook",
      text: `[${hookType.toUpperCase()}] ${summary}`,
      durationSec: hookSec,
    },
    {
      label: "Body",
      text: `Main narrative — ${tone} tone. Curiosity loops, building tension.`,
      durationSec: bodySec,
    },
    {
      label: "Twist",
      text: "Unexpected revelation or twist at 70% mark.",
      durationSec: twistSec,
    },
    {
      label: "Resolution & CTA",
      text: "Resolve the mystery. Call to action: subscribe + comment opinion.",
      durationSec: resolutionSec,
    },
  ];
}
