import { useState, useEffect } from "react";
import {
  fetchRuntimeConfig,
  updateRuntimeConfig,
  resetRuntimeConfig,
  fetchApiKeys,
  updateApiKey,
  deleteApiKey,
  type ApiKeyEntry,
} from "../api/client";
import { Input, Button, Select, Spinner, Tab, Toast } from "../components/UI";

const CATEGORIES = [
  "provider",
  "ai_param",
  "timeout",
  "retry",
  "queue",
  "retention",
  "rate_limit",
  "hpas",
] as const;

interface ConfigItem {
  category: string;
  key: string;
  value: unknown;
}

export default function DynamicPricingPage() {
  const [activeTab, setActiveTab] = useState<"config" | "apikeys">("config");
  const [configData, setConfigData] = useState<Record<string, Record<string, unknown>> | null>(
    null,
  );
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // API keys
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);

  // Add API key form
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  // Edit config
  const [editingConfig, setEditingConfig] = useState<{
    category: string;
    key: string;
    value: string;
  } | null>(null);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  useEffect(() => {
    loadConfig();
    loadApiKeys();
  }, []);

  function showToast(message: string, type: "success" | "error" | "info") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadConfig() {
    setConfigLoading(true);
    try {
      const data = await fetchRuntimeConfig();
      setConfigData(data);
      setConfigError(null);
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setConfigLoading(false);
    }
  }

  async function loadApiKeys() {
    setApiKeysLoading(true);
    try {
      const data = await fetchApiKeys();
      setApiKeys(data);
      setApiKeysError(null);
    } catch (e) {
      setApiKeysError(
        e instanceof Error ? e.message : "Failed to load API keys",
      );
    } finally {
      setApiKeysLoading(false);
    }
  }

  async function handleSaveConfig(category: string, key: string, valueStr: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(valueStr);
    } catch {
      parsed = valueStr;
    }
    try {
      await updateRuntimeConfig(category, key, parsed);
      showToast(`Config "${category}/${key}" saved`, "success");
      setEditingConfig(null);
      await loadConfig();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }

  async function handleResetConfig(category: string, key: string) {
    try {
      await resetRuntimeConfig(category, key);
      showToast(`Config "${category}/${key}" reset`, "info");
      await loadConfig();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Reset failed", "error");
    }
  }

  async function handleAddKey() {
    if (!newKeyName.trim() || !newKeyValue.trim()) return;
    setSavingKey(true);
    try {
      await updateApiKey(newKeyName.trim(), newKeyValue.trim());
      showToast(`API key "${newKeyName}" saved`, "success");
      setNewKeyName("");
      setNewKeyValue("");
      await loadApiKeys();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save key", "error");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleDeleteKey(name: string) {
    try {
      await deleteApiKey(name);
      showToast(`API key "${name}" deleted`, "info");
      await loadApiKeys();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete key", "error");
    }
  }

  function formatValue(val: unknown): string {
    if (val === null || val === undefined) return "—";
    if (typeof val === "object") return JSON.stringify(val, null, 2);
    return String(val);
  }

  function displayValue(val: unknown, maxLen = 60): string {
    const s = formatValue(val);
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">⚙️ Runtime Configuration</h1>
        <p className="text-text-muted text-sm mt-1">
          Manage system configuration categories and API keys. Changes take effect immediately.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface-hover/50 rounded-lg p-1 w-fit">
        <Tab
          label="⚙️ Config"
          active={activeTab === "config"}
          onClick={() => setActiveTab("config")}
        />
        <Tab
          label="🔑 API Keys"
          active={activeTab === "apikeys"}
          onClick={() => setActiveTab("apikeys")}
        />
      </div>

      {/* ── Config Tab ── */}
      {activeTab === "config" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-text-muted text-sm">
              {configData
                ? Object.values(configData).reduce((s, c) => s + Object.keys(c).length, 0)
                : "—"}{" "}
              config entries across {CATEGORIES.length} categories
            </span>
            <Button variant="ghost" onClick={loadConfig} disabled={configLoading}>
              🔃 Reload
            </Button>
          </div>

          {configLoading && !configData && (
            <div className="flex items-center justify-center py-16">
              <Spinner size={32} />
            </div>
          )}
          {configError && (
            <div className="bg-red-500/10 text-red-400 rounded-xl p-4 mb-4">{configError}</div>
          )}

          {configData &&
            CATEGORIES.map((cat) => {
              const entries = configData[cat];
              const keys = entries ? Object.keys(entries) : [];
              if (keys.length === 0) return null;
              return (
                <div key={cat} className="bg-surface border border-border rounded-xl mb-4 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surface-hover">
                    <h3 className="text-sm font-semibold text-text-primary capitalize">
                      {cat.replace(/_/g, " ")}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {keys.length} entries
                    </p>
                  </div>
                  <div className="divide-y divide-border/50">
                    {keys.map((key) => {
                      const val = entries[key];
                      const isEditing =
                        editingConfig?.category === cat && editingConfig?.key === key;
                      return (
                        <div key={key} className="px-4 py-3 flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <code className="text-xs font-mono text-text-primary bg-black/30 px-1.5 py-0.5 rounded">
                              {key}
                            </code>
                            {isEditing ? (
                              <textarea
                                className="mt-2 w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-border text-text-primary text-sm font-mono outline-none focus:border-accent/50 resize-y min-h-[60px]"
                                value={editingConfig.value}
                                onChange={(e) =>
                                  setEditingConfig({ ...editingConfig, value: e.target.value })
                                }
                              />
                            ) : (
                              <div className="mt-1 text-sm text-text-muted font-mono break-all">
                                {displayValue(val)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 pt-0.5">
                            {isEditing ? (
                              <>
                                <Button onClick={() => handleSaveConfig(cat, key, editingConfig.value)}>
                                  Save
                                </Button>
                                <Button variant="ghost" onClick={() => setEditingConfig(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    setEditingConfig({
                                      category: cat,
                                      key,
                                      value: formatValue(val),
                                    })
                                  }
                                >
                                  ✏️
                                </Button>
                                <Button variant="ghost" onClick={() => handleResetConfig(cat, key)}>
                                  🗑️
                                </Button>
                              </>
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
      )}

      {/* ── API Keys Tab ── */}
      {activeTab === "apikeys" && (
        <div>
          {/* Add Key Form */}
          <div className="bg-surface border border-border rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-1">Add / Update API Key</h3>
            <p className="text-text-muted text-xs mb-4">
              Set an API key value. Existing keys with the same name will be overwritten.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                  Key Name
                </label>
                <select
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-border text-text-primary text-sm outline-none focus:border-accent/50"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                >
                  <option value="">— Select a key —</option>
                  {apiKeys.map((ak) => (
                    <option key={ak.key} value={ak.key}>
                      {ak.label} ({ak.key})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-[2] w-full">
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                  Value
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-border text-text-primary text-sm outline-none focus:border-accent/50 font-mono"
                  placeholder="Enter API key value…"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                />
              </div>
              <Button onClick={handleAddKey} disabled={savingKey || !newKeyName || !newKeyValue}>
                {savingKey ? "Saving…" : "Save Key"}
              </Button>
            </div>
          </div>

          {/* Keys Table */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-text-muted text-sm">{apiKeys.length} known keys</span>
            <Button variant="ghost" onClick={loadApiKeys} disabled={apiKeysLoading}>
              🔃 Reload
            </Button>
          </div>

          {apiKeysLoading && apiKeys.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <Spinner size={32} />
            </div>
          )}
          {apiKeysError && (
            <div className="bg-red-500/10 text-red-400 rounded-xl p-4 mb-4">{apiKeysError}</div>
          )}

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs border-b border-border bg-surface-hover">
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium">Label</th>
                  <th className="text-left py-3 px-4 font-medium">Value</th>
                  <th className="text-left py-3 px-4 font-medium">Source</th>
                  <th className="text-right py-3 px-4 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-text-muted text-sm text-center py-8">
                      No API keys found
                    </td>
                  </tr>
                ) : (
                  apiKeys.map((ak) => (
                    <tr
                      key={ak.key}
                      className="border-b border-border/50 text-text-secondary hover:bg-surface-hover/50"
                    >
                      <td className="py-3 px-4 font-mono text-xs text-text-primary">{ak.key}</td>
                      <td className="py-3 px-4">{ak.label}</td>
                      <td className="py-3 px-4">
                        {ak.hasValue ? (
                          <span className="font-mono text-xs text-text-muted">{ak.masked}</span>
                        ) : (
                          <span className="text-text-muted/50 italic">Not set</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                            ak.source === "db"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : ak.source === "env"
                                ? "bg-blue-500/15 text-blue-400"
                                : "bg-gray-500/15 text-text-muted"
                          }`}
                        >
                          {ak.source}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setNewKeyName(ak.key);
                              setNewKeyValue("");
                            }}
                          >
                            ✏️
                          </Button>
                          <Button variant="ghost" onClick={() => handleDeleteKey(ak.key)}>
                            🗑️
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} visible />}
    </div>
  );
}
