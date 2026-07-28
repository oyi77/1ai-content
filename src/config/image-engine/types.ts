/**
 * Image Engine — Shared Types
 */

export interface ProductDetectionEntry {
  keywords: string[];
  label: string;
  focus: string;
  default_style: string;
}

export interface StyleEntry {
  label: string;
  prompt_val: string;
}

export interface MaterialEntry {
  label: string;
  prompt_val: string;
}

export interface ImagePromptResult {
  full: string;
  style: string;
  effects: string[];
  category: string;
}

export interface DetectedCategory {
  module: string;
  category_key: string;
  label: string;
  default_style_key: string;
  default_style_prompt: string;
  focus_prompt: string;
  effects: string[];
}