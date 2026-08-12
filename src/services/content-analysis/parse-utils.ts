/**
 * Parse utilities — Gemini response text to structured AnalysisResult + storyboard.
 */
import type { AnalysisResult } from "./types";

/**
 * Parse Gemini response text into structured AnalysisResult.
 */
export function parseGeminiResponse(text: string): AnalysisResult {
  // Extract style from the response
  const styleMatch = text.match(/(?:style|aesthetic|mood)[:\s]*([^\n.]+)/i);
  const style = styleMatch ? styleMatch[1].trim() : "commercial";

  // Extract elements — look for list items or comma-separated keywords
  const elements: string[] = [];
  const listMatches = text.match(/[-*]\s*(.+)/g);
  if (listMatches) {
    listMatches.slice(0, 6).forEach((item) => {
      elements.push(item.replace(/^[-*]\s*/, "").trim());
    });
  }

  if (elements.length === 0) {
    // Fallback: extract key phrases
    const sentences = text.split(/[.\n]/).filter((s) => s.trim().length > 10);
    sentences.slice(0, 5).forEach((s) => elements.push(s.trim()));
  }

  return {
    success: true,
    prompt: text.trim(),
    style,
    elements,
  };
}

/**
 * Parse storyboard section from Gemini response text.
 * Looks for "STORYBOARD:" followed by "Scene N | Xs | Description" lines.
 */
export function parseStoryboard(
  text: string,
): Array<{ scene: number; duration: number; description: string }> {
  const storyboard: Array<{
    scene: number;
    duration: number;
    description: string;
  }> = [];

  const storyboardMatch = text.match(/STORYBOARD[:\s]*\n([\s\S]+?)(?:\n\n|$)/i);
  if (!storyboardMatch) return storyboard;

  const lines = storyboardMatch[1].split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const match = line.match(/Scene\s*(\d+)\s*\|\s*(\d+)s?\s*\|\s*(.+)/i);
    if (match) {
      storyboard.push({
        scene: parseInt(match[1], 10),
        duration: parseInt(match[2], 10),
        description: match[3].trim(),
      });
    }
  }

  return storyboard;
}
