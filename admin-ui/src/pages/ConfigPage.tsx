import { useState, useEffect, useCallback } from "react";
import {
  fetchEnvConfig,
  fetchRuntimeConfig,
  updateRuntimeConfig,
  resetRuntimeConfig,
  fetchApiKeys,
  updateApiKey,
  deleteApiKey,
  type EnvConfigEntry,
  type ApiKeyEntry,
} from "../api/client";
import { Tab, Button, Spinner, Toast } from "../components/UI";

/* ── Helpers ── */

const DEFAULTS: Record<string, string> = {
  NODE_ENV: "development",
  PORT: "3000",
  LOG_LEVEL: "info",
  FORCE_POLLING: "false",
  DEMO_MODE: "false",
  VIDEO_DIR: "/tmp/videos",
  AUDIO_DIR: "/tmp/audio",
  MIDTRANS_ENVIRONMENT: "sandbox",
  TRIPAY_ENVIRONMENT: "sandbox",
  DUITKU_ENVIRONMENT: "sandbox",
  USD_TO_IDR_RATE: "16000",
  FEATURE_PAYMENT: "false",
  FEATURE_REFERRAL: "false",
  FEATURE_VIDEO_GENERATION: "false",
  REDIS_URL: "redis://localhost:6379",
};

function isDefaultValue(key: string, val: string): boolean {
  return DEFAULTS[key] !== undefined && val === DEFAULTS[key];
}

function getStatusBadge(
  key: string,
  value: string,
  sensitive: boolean
): { label: string; cls: string } {
  if (value === "(not set)")
    return { label: "not set", cls: "bg-red-900/40 text-red-400 border-red-800/50" };
  if (!sensitive && isDefaultValue(key, value))
    return { label: "default", cls: "bg-yellow-900/40 text-yellow-400 border-yellow-800/50" };
  return { label: "set", cls: "bg-green-900/40 text-green-400 border-green-800/50" };
}

/** Known category labels for runtime config — unknown categories get their raw key. */
const CATEGORY_LABELS: Record<string, string> = {
  provider: "Provider Config",
  ai_param: "AI Parameters",
  timeout: "Timeouts",
  retry: "Retry / Poll",
  queue: "Queue",
  retention: "Retention",
  rate_limit: "Rate Limits",
  hpas: "HPAS",
};

/** Preferred category display order for runtime config. */
const CATEGORY_ORDER = [
  "provider",
  "ai_param",
  "timeout",
  "retry",
  "queue",
  "retention",
  "rate_limit",
  "hpas",
];

/** Human-readable group labels for API keys. */
const AK_GROUP_LABELS: Record<string, string> = {
  core: "Core",
  ai_llm: "AI / LLM",
  video_providers: "Video Providers",
  image_providers: "Image Providers",
  payment: "Payment",
  storage: "Storage",
};

/** Known keys per group for API keys (used to assign unknown keys to "Other"). */
const AK_GROUP_KEYS: Record<string, string[]> = {
  core: [
    "BOT_TOKEN",
    "ADMIN_PASSWORD",
    "DATABASE_URL",
    "REDIS_URL",
    "WEBHOOK_URL",
    "WEBHOOK_SECRET",
    "USD_TO_IDR_RATE",
  ],
  ai_llm: [
    "OMNIROUTE_API_KEY",
    "OMNIROUTE_URL",
    "GEMINI_API_KEY",
    "OPENAI_API_KEY",
    "XAI_API_KEY",
    "GROQ_API_KEY",
    "AGENTROUTER_API_KEY",
  ],
  video_providers: [
    "BYTEPLUS_API_KEY",
    "LAOZHANG_API_KEY",
    "EVOLINK_API_KEY",
    "HYPEREAL_API_KEY",
    "SILICONFLOW_API_KEY",
    "FALAI_API_KEY",
    "KIE_API_KEY",
    "PIAPI_API_KEY",
    "GEMINIGEN_API_KEY",
    "LINGYAAI_API_KEY",
    "GETGOAPI_API_KEY",
    "APIYI_API_KEY",
    "ZAI_API_KEY",
    "DID_API_KEY",
  ],
  image_providers: [
    "RUNWARE_API_KEY",
    "WAVESPEED_API_KEY",
    "TOGETHER_API_KEY",
    "SEGMIND_API_KEY",
    "NVIDIA_API_KEY",
  ],
  payment: [
    "MIDTRANS_SERVER_KEY",
    "MIDTRANS_CLIENT_KEY",
    "TRIPAY_API_KEY",
    "TRIPAY_PRIVATE_KEY",
    "DUITKU_MERCHANT_CODE",
    "DUITKU_API_KEY",
    "NOWPAYMENTS_API_KEY",
  ],
  storage: [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_BUCKET",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ENDPOINT",
  ],
};

// Build reverse lookup: key → group
const KEY_TO_GROUP: Record<string, string> = {};
for (const [g, keys] of Object.entries(AK_GROUP_KEYS)) {
  for (const k of keys) KEY_TO_GROUP[k] = g;
}

/* ── Inline Input for runtime config inline editing ── */

function InlineEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <input
      className="bg-surface border border-border rounded px-2 py-1 text-text-primary font-mono text-xs w-full"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onSave(val)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave(val);
        if (e.key === "Escape") onCancel();
      }}
      autoFocus
    />
  );
}

/* ── Toast state ── */

interface ToastState {
  msg: string;
  type: "success" | "error";
}

/* ── Component ── */

export default function ConfigPage() {
  const [tab, setTab] = useState<"env" | "runtime" | "apikeys">("env");

  /* Env config */
  const [envData, setEnvData] = useState<Record<string, EnvConfigEntry> | null>(null);
  const [envFilter, setEnvFilter] = useState("");
  const [envLoading, setEnvLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  /* Runtime config */
  const [runtimeData, setRuntimeData] = useState<Record<string, Record<string, unknown>> | null>(null);
  const [runtimeFilter, setRuntimeFilter] = useState("");
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeExpanded, setRuntimeExpanded] = useState<Set<string> | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  /* API keys */
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);

  /* Toast */
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ── Load env config ── */
  const loadEnv = useCallback(async () => {
    setEnvLoading(true);
    try {
      const data = await fetchEnvConfig();
      setEnvData(data);
      // Expand all groups initially
      const gs = new Set<string>();
      for (const e of Object.values(data)) gs.add(e.group);
      setExpandedGroups(gs);
    } catch (e) {
      showToast("Failed to load env config", "error");
    } finally {
      setEnvLoading(false);
    }
  }, [showToast]);

  /* ── Load runtime config ── */
  const loadRuntime = useCallback(async () => {
    setRuntimeLoading(true);
    try {
      const data = await fetchRuntimeConfig();
      setRuntimeData(data);
      // Expand all groups initially
      setRuntimeExpanded(new Set(Object.keys(data)));
    } catch (e) {
      showToast("Failed to load runtime config", "error");
    } finally {
      setRuntimeLoading(false);
    }
  }, [showToast]);

  /* ── Load API keys ── */
  const loadApiKeys = useCallback(async () => {
    setApiKeysLoading(true);
    try {
      const data = await fetchApiKeys();
      setApiKeys(data);
    } catch (e) {
      showToast("Failed to load API keys", "error");
    } finally {
      setApiKeysLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadEnv(); }, [loadEnv]);
  useEffect(() => { if (tab === "runtime") loadRuntime(); }, [tab, loadRuntime]);
  useEffect(() => { if (tab === "apikeys") loadApiKeys(); }, [tab, loadApiKeys]);

  /* ── Runtime config save ── */
  const handleRuntimeSave = async (cat: string, key: string, raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      showToast("Invalid JSON value", "error");
      return;
    }
    try {
      await updateRuntimeConfig(cat, key, parsed);
      if (runtimeData) {
        setRuntimeData({
          ...runtimeData,
          [cat]: { ...runtimeData[cat], [key]: parsed },
        });
      }
      showToast(`Saved ${key}`, "success");
    } catch {
      showToast(`Failed to save ${key}`, "error");
    }
  };

  /* ── Runtime config reset ── */
  const handleRuntimeReset = async (cat: string, key: string) => {
    if (!confirm(`Reset "${key}" to compiled default?`)) return;
    try {
      await resetRuntimeConfig(cat, key);
      loadRuntime();
      showToast(`Reset ${key}`, "success");
    } catch {
      showToast(`Failed to reset ${key}`, "error");
    }
  };

  /* ── API key save ── */
  const handleApiKeySave = async (name: string) => {
    const newVal = prompt(`New value for ${name}:`);
    if (!newVal || !newVal.trim()) return;
    try {
      await updateApiKey(name, newVal.trim());
      showToast(`API key updated: ${name}`, "success");
      loadApiKeys();
    } catch {
      showToast(`Failed to update ${name}`, "error");
    }
  };

  /* ── API key delete ── */
  const handleApiKeyDelete = async (name: string) => {
    if (!confirm(`Remove DB override for ${name}? Will revert to env var.`)) return;
    try {
      await deleteApiKey(name);
      showToast(`Reset to env: ${name}`, "success");
      loadApiKeys();
    } catch {
      showToast(`Failed to reset ${name}`, "error");
    }
  };

  /* ── Render env tab ── */
  const renderEnv = () => {
    if (!envData) return <div className="text-text-muted text-center py-8"><Spinner /></div>;

    // Group entries
    const groups: Record<string, Array<{ key: string } & EnvConfigEntry>> = {};
    for (const [key, entry] of Object.entries(envData)) {
      if (!groups[entry.group]) groups[entry.group] = [];
      groups[entry.group].push({ key, ...entry });
    }

    const ft = envFilter.toLowerCase();

    const groupEntries = Object.entries(groups).filter(([_, entries]) => {
      if (!ft) return true;
      return entries.some((e) => e.key.toLowerCase().includes(ft));
    });

    return (
      <div>
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm max-w-[320px]"
            placeholder="Filter by key name..."
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
          />
          <Button variant="ghost" onClick={() => setExpandedGroups(new Set(Object.keys(groups)))}>
            Expand All
          </Button>
          <Button variant="ghost" onClick={() => setExpandedGroups(new Set())}>
            Collapse All
          </Button>
          <Button onClick={loadEnv} disabled={envLoading}>
            {envLoading ? "Loading..." : "↻ Refresh"}
          </Button>
          <span className="text-xs text-text-muted">
            {Object.values(envData).filter((e) => e.value !== "(not set)").length} set ·{" "}
            {Object.values(envData).filter(
              (e) =>
                e.value !== "(not set)" &&
                !e.sensitive &&
                isDefaultValue(e.key, e.value)
            ).length}{" "}
            default ·{" "}
            {Object.values(envData).filter((e) => e.value === "(not set)").length} not set
          </span>
        </div>

        {groupEntries.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <p className="text-lg mb-1">No matching variables</p>
            <p className="text-sm">Try adjusting your filter</p>
          </div>
        ) : (
          groupEntries.map(([group, entries]) => {
            const filtered = ft
              ? entries.filter((e) => e.key.toLowerCase().includes(ft))
              : entries;
            if (filtered.length === 0) return null;

            const isOpen = expandedGroups.has(group);

            return (
              <div key={group} className="mb-4">
                <div
                  className="flex items-center justify-between cursor-pointer py-3 select-none"
                  onClick={() => {
                    const next = new Set(expandedGroups);
                    if (isOpen) next.delete(group);
                    else next.add(group);
                    setExpandedGroups(next);
                  }}
                >
                  <h2 className="text-sm font-semibold text-text-primary">
                    {group}{" "}
                    <span className="font-normal text-xs text-text-muted">
                      ({filtered.length})
                    </span>
                  </h2>
                  <span
                    className="text-text-muted text-xs transition-transform"
                    style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                  >
                    ▼
                  </span>
                </div>
                {isOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map((entry) => {
                      const badge = getStatusBadge(entry.key, entry.value, entry.sensitive);
                      return (
                        <div
                          key={entry.key}
                          className="bg-surface border border-border rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-xs text-text-primary font-medium truncate mr-2">
                              {entry.key}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div className="text-xs text-text-muted font-mono truncate max-w-[300px]">
                            {entry.value}
                          </div>
                          {entry.sensitive && (
                            <div className="text-[10px] text-yellow-400 mt-1">
                              Secret (masked)
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };

  /* ── Render runtime config tab ── */
  const renderRuntime = () => {
    if (!runtimeData || runtimeExpanded === null)
      return <div className="text-text-muted text-center py-8"><Spinner /></div>;

    const ft = runtimeFilter.toLowerCase();

    // Build ordered category list: known categories first (in order), then unknown ones alphabetically
    const categoryOrder = CATEGORY_ORDER.filter((c) => c in runtimeData);
    const unknownCats = Object.keys(runtimeData)
      .filter((c) => !CATEGORY_ORDER.includes(c))
      .sort();
    const orderedCats = [...categoryOrder, ...unknownCats];

    return (
      <div>
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm max-w-[280px]"
            placeholder="Filter by key..."
            value={runtimeFilter}
            onChange={(e) => setRuntimeFilter(e.target.value)}
          />
          <Button variant="ghost" onClick={() => setRuntimeExpanded(new Set(Object.keys(runtimeData)))}>
            Expand All
          </Button>
          <Button variant="ghost" onClick={() => setRuntimeExpanded(new Set())}>
            Collapse All
          </Button>
          <Button onClick={loadRuntime} disabled={runtimeLoading}>
            {runtimeLoading ? "Loading..." : "↻ Refresh"}
          </Button>
          <span className="text-xs text-text-muted">
            {Object.values(runtimeData).reduce((s, v) => s + Object.keys(v).length, 0)}{" "}
            stored in DB
          </span>
        </div>

        {orderedCats.map((cat) => {
          const entries = runtimeData[cat] || {};
          const rows = Object.entries(entries)
            .filter(([k]) => !ft || k.toLowerCase().includes(ft))
            .sort(([a], [b]) => a.localeCompare(b));

          if (rows.length === 0 && ft) return null;

          const isOpen = runtimeExpanded.has(cat);
          const label = CATEGORY_LABELS[cat] || cat;

          return (
            <div key={cat} className="mb-4">
              <div
                className="flex items-center justify-between cursor-pointer bg-surface border border-border rounded-t-lg px-4 py-3 select-none"
                onClick={() => {
                  const next = new Set(runtimeExpanded);
                  if (isOpen) next.delete(cat);
                  else next.add(cat);
                  setRuntimeExpanded(next);
                }}
              >
                <span className="text-sm font-semibold text-text-primary">
                  {label}{" "}
                  <span className="font-normal text-xs text-text-muted">
                    ({rows.length})
                  </span>
                </span>
                <span className="text-text-muted text-xs">
                  {isOpen ? "▼" : "▶"}
                </span>
              </div>
              {isOpen && (
                <div className="border-x border-b border-border rounded-b-lg overflow-hidden">
                  {rows.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-text-muted">
                      No values stored (all using defaults)
                    </div>
                  ) : (
                    rows.map(([key, value]) => {
                      const displayVal = JSON.stringify(value);
                      const editId = `${cat}:${key}`;
                      const isEditing = editingKey === editId;
                      return (
                        <div
                          key={key}
                          className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center px-4 py-2.5 border-b border-border/50 text-sm last:border-b-0 hover:bg-slate-700/30"
                        >
                          <span className="font-mono text-[11px] text-text-muted break-all">
                            {key}
                          </span>
                          <div className="font-mono text-xs text-text-primary">
                            {isEditing ? (
                              <InlineEditor
                                initial={displayVal}
                                onSave={(v) => {
                                  setEditingKey(null);
                                  handleRuntimeSave(cat, key, v);
                                }}
                                onCancel={() => setEditingKey(null)}
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:text-accent hover:underline"
                                onClick={() => setEditingKey(editId)}
                                title="Click to edit"
                              >
                                {displayVal}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 items-center">
                            <span className="text-[10px] bg-purple-900/40 text-purple-400 border border-purple-800/50 rounded px-1.5 py-0.5">
                              db
                            </span>
                            <button
                              className="text-[11px] text-red-400 hover:text-red-300"
                              onClick={() => handleRuntimeReset(cat, key)}
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  /* ── Render API Keys tab ── */
  const renderApiKeys = () => {
    if (apiKeysLoading) return <div className="text-text-muted text-center py-8"><Spinner /></div>;

    const keyMap = Object.fromEntries(apiKeys.map((k) => [k.key, k]));

    // Group keys from API response: known keys go in their group, unknown keys go to "Other"
    const groups: Record<string, string[]> = {};
    for (const entry of apiKeys) {
      const g = KEY_TO_GROUP[entry.key] || "other";
      if (!groups[g]) groups[g] = [];
      groups[g].push(entry.key);
    }

    // Determine group order: known groups first, then "other"
    const knownGroups = Object.keys(AK_GROUP_LABELS).filter((g) => g in groups);
    const otherGroup = groups["other"] ? ["other"] : [];
    const groupOrder = [...knownGroups, ...otherGroup];

    return (
      <div>
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <Button onClick={loadApiKeys} disabled={apiKeysLoading}>
            {apiKeysLoading ? "Loading..." : "↻ Refresh"}
          </Button>
          <span className="text-xs text-text-muted">
            DB values override env vars immediately. Masked display only — full values
            never shown.
          </span>
        </div>

        {groupOrder.map((group) => {
          const gid = "akgrp-" + group.replace(/\W/g, "_");
          const keyList = groups[group] || [];
          return (
            <div key={group} className="mb-4">
              <div
                className="flex items-center justify-between cursor-pointer bg-surface border border-border rounded-t-lg px-4 py-3 select-none"
                onClick={() => {
                  const body = document.getElementById(gid);
                  if (body) body.style.display = body.style.display === "none" ? "" : "none";
                }}
              >
                <span className="text-sm font-semibold text-text-primary">
                  {AK_GROUP_LABELS[group] || group}
                </span>
                <span className="text-text-muted text-xs">▼</span>
              </div>
              <div className="border-x border-b border-border rounded-b-lg overflow-hidden" id={gid}>
                {keyList.map((k) => {
                  const d = keyMap[k];
                  if (!d) return null;
                  const srcBadge =
                    d.source === "db" ? (
                      <span className="text-[10px] bg-purple-900/40 text-purple-400 border border-purple-800/50 rounded px-1.5 py-0.5">
                        DB
                      </span>
                    ) : d.source === "env" ? (
                      <span className="text-[10px] bg-blue-900/40 text-blue-400 border border-blue-800/50 rounded px-1.5 py-0.5">
                        ENV
                      </span>
                    ) : (
                      <span className="text-[10px] text-red-400">not set</span>
                    );

                  return (
                    <div
                      key={k}
                      className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center px-4 py-2.5 border-b border-border/50 text-sm last:border-b-0 hover:bg-slate-700/30"
                    >
                      <div>
                        <div className="font-mono text-[11px] text-text-muted break-all">
                          {k}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5">
                          {d.label}
                        </div>
                      </div>
                      <div className="font-mono text-xs text-text-primary">
                        {d.hasValue ? (
                          <span className="text-yellow-400">{d.masked}</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        {srcBadge}
                        <button
                          className="text-[11px] text-accent hover:text-accent-light"
                          onClick={() => handleApiKeySave(k)}
                        >
                          Edit
                        </button>
                        {d.source === "db" && (
                          <button
                            className="text-[11px] text-red-400 hover:text-red-300"
                            onClick={() => handleApiKeyDelete(k)}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold text-text-primary">System Configuration</h1>
        <p className="text-sm text-text-muted mt-1">
          Environment variables, runtime config keys, and API keys
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border">
        <Tab label="Environment Config" active={tab === "env"} onClick={() => setTab("env")} />
        <Tab label="Runtime Config" active={tab === "runtime"} onClick={() => setTab("runtime")} />
        <Tab label="API Keys" active={tab === "apikeys"} onClick={() => setTab("apikeys")} />
      </div>

      <div className="min-h-[200px]">
        {tab === "env" && renderEnv()}
        {tab === "runtime" && renderRuntime()}
        {tab === "apikeys" && renderApiKeys()}
      </div>

      {toast && (
        <Toast message={toast.msg} type={toast.type} visible={true} />
      )}
    </div>
  );
}
