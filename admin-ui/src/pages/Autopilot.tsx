import { useState, useEffect } from "react";
import {
  fetchAutopilotStatus,
  createAutopilotJob,
  runAutopilotJobs,
} from "../api/client";
import type { AutopilotStatusResponse, AutopilotJob } from "../api/client";
import { Input, Button, Spinner } from "../components/UI";

const ALL_PLATFORMS = [
  { value: "tiktok", label: "🎵 TikTok" },
  { value: "instagram", label: "📸 Instagram" },
  { value: "youtube", label: "▶️ YouTube" },
  { value: "facebook", label: "📘 Facebook" },
  { value: "twitter", label: "🐦 Twitter / X" },
];

function statusBadge(s?: string): string {
  const st = (s || "").toLowerCase();
  if (st === "active" || st === "running") return "badge badge-green";
  if (st === "error" || st === "failed") return "badge badge-red";
  if (st === "completed") return "badge badge-blue";
  return "badge badge-gray";
}

function statusLabel(s?: string): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Autopilot() {
  /* Create job */
  const [jobName, setJobName] = useState("");
  const [jobNiche, setJobNiche] = useState("");
  const [jobPlatforms, setJobPlatforms] = useState<string[]>(["tiktok"]);
  const [creating, setCreating] = useState(false);

  /* Status */
  const [status, setStatus] = useState<AutopilotStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [running, setRunning] = useState(false);

  /* Result messages */
  const [createResult, setCreateResult] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ success: boolean; message?: string; jobsRun?: number } | null>(null);

  function togglePlatform(value: string) {
    setJobPlatforms((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );
  }

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const data = await fetchAutopilotStatus();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleCreate() {
    if (!jobName.trim() || !jobNiche.trim() || jobPlatforms.length === 0) return;
    setCreating(true);
    setCreateResult(null);
    try {
      const data = await createAutopilotJob({
        name: jobName.trim(),
        niche: jobNiche.trim(),
        platforms: jobPlatforms,
      });
      if (data.success || data.job_id) {
        setCreateResult(`✅ Job "${jobName}" created!`);
        setJobName("");
        setJobNiche("");
        setJobPlatforms(["tiktok"]);
        setTimeout(loadStatus, 500);
      } else {
        setCreateResult(`❌ ${data.error || "Creation failed"}`);
      }
    } catch (e) {
      setCreateResult(`❌ ${(e as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    setRunResult(null);
    try {
      const data = await runAutopilotJobs();
      if (data.success || data.jobs_run) {
        setRunResult({
          success: true,
          message: data.message || "Ready jobs are now running.",
          jobsRun: data.jobs_run || 0,
        });
        setTimeout(loadStatus, 1000);
      } else {
        setRunResult({
          success: false,
          message: data.error || "No jobs to run",
        });
      }
    } catch (e) {
      setRunResult({ success: false, message: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  const jobs = status?.jobs || status?.data || [];
  const activeCount = status?.active_jobs || 0;
  const totalCount = status?.total_jobs || jobs.length;
  const lastRun = status?.last_run || "—";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-text">🤖 AutoPilot</h1>
          <p className="text-text-muted mt-1">Create, manage, and run autopilot content jobs</p>
        </div>
        <Button variant="secondary" onClick={loadStatus} loading={loadingStatus}>
          📊 Refresh Status
        </Button>
      </div>

      {/* Create Job */}
      <div className="card">
        <h3 className="text-base font-bold mb-4">➕ Create Autopilot Job</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Job Name"
              name="jobName"
              value={jobName}
              onChange={(v) => setJobName(v)}
              placeholder="e.g. Daily Beauty Tips"
            />
          </div>
          <div className="md:col-span-2">
            <Input
              label="Niche"
              name="jobNiche"
              value={jobNiche}
              onChange={(v) => setJobNiche(v)}
              placeholder="e.g. kecantikan, teknologi, kesehatan"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text mb-2">Platforms</label>
            <div className="flex gap-3 flex-wrap">
              {ALL_PLATFORMS.map((p) => (
                <label
                  key={p.value}
                  className="flex items-center gap-1.5 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={jobPlatforms.includes(p.value)}
                    onChange={() => togglePlatform(p.value)}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5">
          <Button
            onClick={handleCreate}
            loading={creating}
            disabled={!jobName.trim() || !jobNiche.trim() || jobPlatforms.length === 0}
          >
            ➕ Create Autopilot Job
          </Button>
        </div>
        {createResult && (
          <div className={`mt-4 text-sm ${createResult.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>
            {createResult}
          </div>
        )}
      </div>

      {/* Jobs Status */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold">📋 Jobs Status</h3>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadStatus} loading={loadingStatus} size="small">
              📊 Refresh
            </Button>
            <Button onClick={handleRun} loading={running}>
              ▶️ Run Ready Jobs
            </Button>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex gap-4 flex-wrap mb-4">
          <span className="badge badge-blue">📊 Total: {totalCount}</span>
          <span className="badge badge-green">✅ Active: {activeCount}</span>
          <span className="text-xs text-text-muted">🕐 Last Run: {lastRun}</span>
        </div>

        {loadingStatus ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-10 text-text-muted text-sm">
            📭 No autopilot jobs yet. Create one above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="p-3 text-left text-text-muted text-xs uppercase">Name</th>
                  <th className="p-3 text-left text-text-muted text-xs uppercase">Niche</th>
                  <th className="p-3 text-left text-text-muted text-xs uppercase">Platforms</th>
                  <th className="p-3 text-left text-text-muted text-xs uppercase">Status</th>
                  <th className="p-3 text-left text-text-muted text-xs uppercase">Created</th>
                  <th className="p-3 text-left text-text-muted text-xs uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job: AutopilotJob, i: number) => {
                  const created = job.created_at || job.created || job.createdAt || "—";
                  const platformsStr = (job.platforms || []).join(", ") || "—";
                  return (
                    <tr key={job.job_id || i} className="border-b border-[var(--border)]">
                      <td className="p-3 font-semibold">{job.name || "Unnamed"}</td>
                      <td className="p-3">{job.niche || "—"}</td>
                      <td className="p-3">{platformsStr}</td>
                      <td className="p-3">
                        <span className={statusBadge(job.status)}>{statusLabel(job.status)}</span>
                      </td>
                      <td className="p-3 text-xs text-text-muted">{created}</td>
                      <td className="p-3">
                        {job.job_id ? (
                          <Button
                            variant="secondary"
                            onClick={() => {}}
                            size="small"
                          >
                            🔍 View
                          </Button>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {runResult && (
          <div
            className={`mt-4 p-4 rounded-xl text-sm ${
              runResult.success
                ? "bg-green-500/10 border border-green-500/30"
                : "text-red-400"
            }`}
          >
            {runResult.success ? (
              <>
                <div className="font-bold mb-1">✅ {runResult.jobsRun} job(s) triggered</div>
                <div className="text-text-muted">{runResult.message}</div>
              </>
            ) : (
              <div>❌ {runResult.message}</div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-base font-bold mb-4">⚡ Quick Actions</h3>
        <Button onClick={handleRun} loading={running}>
          ▶️ Run All Ready Jobs
        </Button>
      </div>
    </div>
  );
}
