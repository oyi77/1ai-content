/* ── Types ── */

export interface ProviderInfo {
  key: string;
  type: "video" | "image";
  name: string;
  priority: number;
  enabled: boolean;
  hasApiKey: boolean;
  strengths?: string[];
  quirks?: string | string[];
  avoid?: string[];
  maxDuration?: number;
  supportsRefImage?: boolean;
  costPerGenerationUsd?: number;
  supportsImg2Img?: boolean;
  supportsIPAdapter?: boolean;
}

interface ProviderAllResponse {
  video: ProviderInfo[];
  image: ProviderInfo[];
}

/* ── Helpers ── */

export function statusColor(status: string): string {
  switch (status) {
    case "enabled":
      return "text-green-400";
    case "disabled":
      return "text-red-400";
    default:
      return "text-yellow-400";
  }
}

export function pillColor(cat: string): string {
  switch (cat) {
    case "strengths":
    case "strength":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "quirks":
    case "quirk":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "avoid":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    default:
      return "bg-slate-500/10 text-slate-400 border-slate-500/30";
  }
}
