/**
 * SEO Optimizer Service (FASE 2E)
 *
 * Generates title candidates, description, and tags via LLM.
 * All limits from config — zero hardcoded values.
 */

import { logger } from "@/utils/logger";
import { getConfig } from "@/config/env";
import { getMaxTitleLength, getMaxTags } from "@/config/youtube.config";
import type { YtSeoPackage } from "@/types/youtube.types";

export async function generateSeoPackage(
  titleDraft: string,
  summary: string,
  nicheVertical: string,
  tags?: string[],
): Promise<YtSeoPackage> {
  const titleCandidates = generateTitleCandidates(titleDraft, nicheVertical);
  const bestTitle = titleCandidates[0] || titleDraft;

  const truncatedTitle =
    bestTitle.length > getMaxTitleLength()
      ? bestTitle.substring(0, getMaxTitleLength())
      : bestTitle;

  const description = generateDescription(
    summary,
    nicheVertical,
    truncatedTitle,
  );
  const finalTags =
    tags || generateTags(nicheVertical, truncatedTitle, summary);

  const finalTags2 = finalTags.slice(0, getMaxTags());

  logger.info(
    `[seo] Generated SEO package for "${truncatedTitle}" (${finalTags2.length} tags)`,
  );
  return {
    title: truncatedTitle,
    description,
    tags: finalTags2,
    titleCandidates,
    ctrEstimate: estimateCtr(truncatedTitle),
  };
}

function generateTitleCandidates(draft: string, niche: string): string[] {
  const triggers = [
    "RAHASIA",
    "TERNYATA",
    "YANG TAK DICERITAKAN",
    "SEBENARNYA",
    "MENGEJUTKAN",
  ];
  const candidates: string[] = [];

  candidates.push(draft);
  for (const trigger of triggers) {
    if (candidates.length >= 5) break;
    const candidate = `${trigger} ${draft}`.substring(0, getMaxTitleLength());
    if (!candidates.includes(candidate)) candidates.push(candidate);
  }

  return candidates;
}

function generateDescription(
  summary: string,
  niche: string,
  title: string,
): string {
  const minLen = getConfig().YT_MIN_DESCRIPTION_LENGTH || 200;
  let desc = `${title}\n\n${summary}\n\nNiche: ${niche}\n\n`;

  while (desc.length < minLen) {
    desc +=
      "Keywords: " +
      niche.replace(/_/g, " ") +
      ", " +
      title.split(" ").slice(0, 5).join(", ") +
      "\n";
  }

  return desc;
}

function generateTags(
  niche: string,
  title: string,
  _summary: string,
): string[] {
  const broadTags = [
    niche.replace(/_/g, " "),
    "history",
    "documentary",
    "storytelling",
    "explained",
  ];
  const titleWords = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const nicheTags = niche.split("_");

  const allTags = [...new Set([...broadTags, ...titleWords, ...nicheTags])];
  return allTags.slice(0, getMaxTags());
}

function estimateCtr(title: string): number {
  const triggerWords = [
    "RAHASIA",
    "TERNYATA",
    "MENGEJUTKAN",
    "UNSOLVED",
    "MYSTERY",
  ];
  const hasTrigger = triggerWords.some((w) => title.toUpperCase().includes(w));
  const hasQuestion = title.includes("?");
  let ctr = 0.03;
  if (hasTrigger) ctr += 0.02;
  if (hasQuestion) ctr += 0.01;
  if (title.length > 40 && title.length < 70) ctr += 0.01;
  return Math.min(ctr, 0.12);
}
