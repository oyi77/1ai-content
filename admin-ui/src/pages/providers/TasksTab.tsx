import type { Dispatch, SetStateAction } from "react";
import { Button, Spinner } from "../../components/UI";
import type { ModelsCatalogEntry, AITaskSettings } from "../../api/client";

export interface TasksTabProps {
  settingsLoading: boolean;
  taskSettings: AITaskSettings;
  handleSettingChange: (key: string, raw: string) => void;
  saveTaskSettings: () => void;
  resetAllCircuitBreakers: () => void;
  catalogLoading: boolean;
  catalogSearch: string;
  setCatalogSearch: Dispatch<SetStateAction<string>>;
  catalogFamily: string;
  setCatalogFamily: Dispatch<SetStateAction<string>>;
  catalog: ModelsCatalogEntry[];
  catalogVisionOnly: boolean;
  setCatalogVisionOnly: Dispatch<SetStateAction<boolean>>;
  catalogFiltered: ModelsCatalogEntry[];
  chatPrompt: string;
  setChatPrompt: Dispatch<SetStateAction<string>>;
  runAiChat: () => void;
  chatLoading: boolean;
  chatResult: string | null;
}

export function TasksTab({
  settingsLoading,
  taskSettings,
  handleSettingChange,
  saveTaskSettings,
  resetAllCircuitBreakers,
  catalogLoading,
  catalogSearch,
  setCatalogSearch,
  catalogFamily,
  setCatalogFamily,
  catalog,
  catalogVisionOnly,
  setCatalogVisionOnly,
  catalogFiltered,
  chatPrompt,
  setChatPrompt,
  runAiChat,
  chatLoading,
  chatResult,
}: TasksTabProps) {
  return (
  <div className="space-y-6">
    {/* Settings form */}
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
        AI Task Settings
      </h2>
      {settingsLoading ? (
        <div className="flex justify-center py-6">
          <Spinner size={24} />
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(taskSettings).length === 0 ? (
            <p className="text-text-muted text-sm">No settings available.</p>
          ) : (
            Object.entries(taskSettings).map(([key, val]) => (
              <div key={key} className="flex items-center gap-3">
                <label className="text-sm text-text-primary min-w-[160px] capitalize">
                  {key.replace(/_/g, " ")}
                </label>
                <input
                  className="flex-1 bg-[#0a0a14] border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500"
                  value={typeof val === "string" ? val : JSON.stringify(val)}
                  onChange={(e) => handleSettingChange(key, e.target.value)}
                />
              </div>
            ))
          )}
          <div className="flex gap-3 pt-3">
            <Button onClick={saveTaskSettings}>Save Settings</Button>
            <Button variant="secondary" onClick={resetAllCircuitBreakers}>
              Reset All Circuit Breakers
            </Button>
          </div>
        </div>
      )}
    </div>

    {/* Model Catalog Browser */}
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
        Model Catalog
      </h2>
      {catalogLoading ? (
        <div className="flex justify-center py-6">
          <Spinner size={24} />
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              className="bg-[#0a0a14] border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-purple-500 min-w-[200px]"
              placeholder="Search models..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
            />
            <select
              className="bg-[#0a0a14] border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-purple-500"
              value={catalogFamily}
              onChange={(e) => setCatalogFamily(e.target.value)}
            >
              <option value="">All Families</option>
              {[...new Set(catalog.map((m) => m.family))].sort().map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={catalogVisionOnly}
                onChange={(e) => setCatalogVisionOnly(e.target.checked)}
                className="rounded border-border bg-[#0a0a14]"
              />
              Vision only
            </label>
          </div>

          {/* Table */}
          {catalogFiltered.length === 0 ? (
            <p className="text-text-muted text-sm">No models match filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-text-muted font-medium">Name</th>
                    <th className="text-left py-2 px-2 text-text-muted font-medium">Provider</th>
                    <th className="text-left py-2 px-2 text-text-muted font-medium">Family</th>
                    <th className="text-center py-2 px-2 text-text-muted font-medium">Vision</th>
                    <th className="text-center py-2 px-2 text-text-muted font-medium">Reasoning</th>
                    <th className="text-center py-2 px-2 text-text-muted font-medium">Tools</th>
                    <th className="text-right py-2 px-2 text-text-muted font-medium">Context</th>
                    <th className="text-right py-2 px-2 text-text-muted font-medium">Output</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogFiltered.map((m) => (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-[#0a0a14]/50">
                      <td className="py-2 px-2 text-text-primary font-medium">{m.name}</td>
                      <td className="py-2 px-2 text-text-muted">{m.providerName}</td>
                      <td className="py-2 px-2 text-text-muted">{m.family}</td>
                      <td className="py-2 px-2 text-center">
                        {m.vision ? (
                          <span className="text-green-400">Yes</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {m.reasoning ? (
                          <span className="text-purple-400">Yes</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {m.toolCall ? (
                          <span className="text-blue-400">Yes</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-text-muted">
                        {m.contextWindow != null
                          ? `${(m.contextWindow / 1024).toFixed(0)}K`
                          : "-"}
                      </td>
                      <td className="py-2 px-2 text-right text-text-muted">
                        {m.outputLimit != null
                          ? `${(m.outputLimit / 1024).toFixed(0)}K`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-text-muted mt-2">
            Showing {catalogFiltered.length} of {catalog.length} models
            {catalog.length > 0 &&
              ` (${([...new Set(catalog.filter((m) => m.vision).map((m) => m.family))].length)} vision families)`}
          </p>
        </>
      )}
    </div>

    {/* AI Chat Test */}
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">
        AI Chat Test
      </h2>
      <textarea
        className="w-full bg-[#0a0a14] border border-border rounded-lg p-3 text-sm text-text-primary focus:outline-none focus:border-purple-500 mb-3"
        rows={4}
        placeholder="Enter a prompt to test AI chat..."
        value={chatPrompt}
        onChange={(e) => setChatPrompt(e.target.value)}
      />
      <div className="flex items-start gap-3">
        <Button onClick={runAiChat} disabled={chatLoading || !chatPrompt.trim()}>
          {chatLoading ? "Testing..." : "Send Test"}
        </Button>
      </div>
      {chatLoading && (
        <div className="mt-3">
          <Spinner size={20} />
        </div>
      )}
      {chatResult && (
        <div className="mt-3 bg-[#0a0a14] border border-border rounded-lg p-3">
          <p className="text-xs text-text-muted mb-1">Response:</p>
          <p className="text-sm text-text-primary whitespace-pre-wrap">{chatResult}</p>
        </div>
      )}
    </div>
  </div>
);
}
