import { Button, Spinner } from "../../components/UI";
import { statusColor, pillColor } from "./ProviderTypes";
import type { ProviderInfo } from "./ProviderTypes";

export interface ProviderCardProps {
  p: ProviderInfo;
  isVideo: boolean;
  toggleProvider: (key: string, enabled: boolean) => void;
  resetCircuitBreaker: (key: string) => void;
  testProvider: (key: string) => void;
}

export function ProviderCard({ p, isVideo, toggleProvider, resetCircuitBreaker, testProvider }: ProviderCardProps) {
  return (
  <div
    key={p.key}
    className={`rounded-xl border border-border p-5 ${
      p.enabled ? "bg-[#0d0d14]" : "bg-[#0a0a0a] opacity-60"
    }`}
  >
    {/* Header */}
    <div className="flex items-start justify-between mb-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{p.name}</h3>
        <code className="text-xs text-text-muted">{p.key}</code>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${statusColor(p.enabled ? "enabled" : "disabled")}`}>
          {p.enabled ? "Enabled" : "Disabled"}
        </span>
        <Button
          variant="ghost"
          onClick={() => toggleProvider(p.key, p.enabled)}
          className="!px-2 !py-1 text-xs"
        >
          Toggle
        </Button>
      </div>
    </div>

    {/* API key indicator + priority */}
    <div className="flex items-center gap-3 mb-3">
      <span className="flex items-center gap-1 text-xs">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            p.hasApiKey ? "bg-green-400" : "bg-red-400"
          }`}
        />
        {p.hasApiKey ? "Has API Key" : "No API Key"}
      </span>
      <span className="text-xs text-text-muted">Priority: {p.priority}</span>
    </div>

    {/* Tags */}
    {p.strengths && p.strengths.length > 0 && (
      <div className="flex flex-wrap gap-1 mb-2">
        {p.strengths.map((s) => (
          <span
            key={s}
            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${pillColor("strengths")}`}
          >
            {s}
          </span>
        ))}
      </div>
    )}
    {(Array.isArray(p.quirks) ? p.quirks : p.quirks ? [p.quirks] : []).length > 0 && (
      <div className="flex flex-wrap gap-1 mb-2">
        {(Array.isArray(p.quirks) ? p.quirks : [p.quirks]).map((q) => (
          <span
            key={q}
            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${pillColor("quirks")}`}
          >
            {q}
          </span>
        ))}
      </div>
    )}
    {p.avoid && p.avoid.length > 0 && (
      <div className="flex flex-wrap gap-1 mb-2">
        {p.avoid.map((a) => (
          <span
            key={a}
            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${pillColor("avoid")}`}
          >
            {a}
          </span>
        ))}
      </div>
    )}

    {/* Video-specific indicators */}
    {isVideo && (
      <div className="flex flex-wrap gap-3 text-xs text-text-muted mb-3">
        {p.maxDuration != null && <span>Max Duration: {p.maxDuration}s</span>}
        {p.supportsRefImage && (
          <span className="text-purple-400">Supports Ref Image</span>
        )}
      </div>
    )}

    {/* Image-specific indicators */}
    {!isVideo && (
      <div className="flex flex-wrap gap-3 text-xs text-text-muted mb-3">
        {p.costPerGenerationUsd != null && (
          <span>Cost: ${p.costPerGenerationUsd.toFixed(4)}</span>
        )}
        {p.supportsImg2Img && (
          <span className="text-purple-400">Img2Img</span>
        )}
        {p.supportsIPAdapter && (
          <span className="text-purple-400">IP-Adapter</span>
        )}
      </div>
    )}

    {/* Actions */}
    <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
      <Button variant="ghost" onClick={() => resetCircuitBreaker(p.key)} className="!px-2 !py-1 text-xs">
        Reset CB
      </Button>
      <Button variant="ghost" onClick={() => testProvider(p.key)} className="!px-2 !py-1 text-xs">
        Test
      </Button>
    </div>
  </div>
);
}

export function SummaryCards({ providers }: { providers: ProviderInfo[] }) {
  const total = providers.length;
  const active = providers.filter((p) => p.enabled).length;
  const withKey = providers.filter((p) => p.hasApiKey).length;
  const erroring = providers.filter((p) => !p.hasApiKey).length;
  const cards = [
    { label: "Total Providers", value: total, color: "text-blue-400" },
    { label: "Active", value: active, color: "text-green-400" },
    { label: "With API Key", value: withKey, color: "text-purple-400" },
    { label: "Erroring", value: erroring, color: "text-red-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-surface border border-border rounded-xl p-4"
        >
          <div className="text-xs text-text-muted mb-1">{c.label}</div>
          <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

export interface ProviderGridProps {
  providers: ProviderInfo[];
  isVideo: boolean;
  loading: boolean;
  toggleProvider: (key: string, enabled: boolean) => void;
  resetCircuitBreaker: (key: string) => void;
  testProvider: (key: string) => void;
}

export function ProviderGrid({ providers, isVideo, loading, toggleProvider, resetCircuitBreaker, testProvider }: ProviderGridProps) {
  const renderProviderCard = (p: ProviderInfo, isVideo: boolean) => (
    <ProviderCard p={p} isVideo={isVideo} toggleProvider={toggleProvider} resetCircuitBreaker={resetCircuitBreaker} testProvider={testProvider} />
  );
  return (
  <div>
    {loading ? (
      <div className="flex justify-center py-12">
        <Spinner size={32} />
      </div>
    ) : providers.length === 0 ? (
      <p className="text-text-muted text-center py-8">No providers found.</p>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((p) => renderProviderCard(p, isVideo))}
      </div>
    )}
  </div>
);
}
