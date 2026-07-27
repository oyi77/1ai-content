import { useState, useEffect } from "react";
import {
  fetchPricingOverview,
  fetchPricingRecommendation,
  savePricingConfig,
  deletePricingConfig,
  type PricingOverview,
  type PricingRecommendation,
} from "../api/client";

interface SubscriptionPlan {
  name: string;
  monthlyIdr: number;
  yearlyIdr: number;
  monthlyCredits: number;
  dailyLimit: number;
}

const UNIT_COST_KEYS = [
  "VIDEO_15S",
  "VIDEO_30S",
  "VIDEO_60S",
  "VIDEO_120S",
  "IMAGE_UNIT",
  "IMAGE_SET_7_SCENE",
  "CLONE_STYLE",
  "CAMPAIGN_5_VIDEO",
  "CAMPAIGN_10_VIDEO",
];


interface InputProps {
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number";
  readOnly?: boolean;
  style?: React.CSSProperties;
  className?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  placeholder?: string;
}

function Input({ value, onChange, type = "text", readOnly, style, className, min, max, step, placeholder }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      style={style}
      className={`w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 ${className || ""}`}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
    />
  );
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

function Select({ value, onChange, children, className }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 ${className || ""}`}
    >
      {children}
    </select>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "danger" | "success" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

function Button({ children, onClick, variant = "primary", size = "md", disabled, className = "", ...props }: ButtonProps) {
  const base = "px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-purple-600 text-white hover:bg-purple-700",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-green-600 text-white hover:bg-green-700",
    secondary: "bg-slate-700 text-slate-100 border border-slate-600 hover:bg-slate-600",
    ghost: "bg-transparent text-slate-300 hover:bg-slate-800",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === "success" ? "bg-green-900/90 text-green-300 border-green-700" : "bg-red-900/90 text-red-300 border-red-700";
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border ${bg} shadow-lg animate-in slide-in-from-bottom-4`}>
      {message}
    </div>
  );
}

export default function Pricing() {
  const [overview, setOverview] = useState<PricingOverview | null>(null);
  const [recommendations, setRecommendations] = useState<PricingRecommendation["recommendations"]>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [marginPercent, setMarginPercent] = useState(30);
  const [defaultImageCost, setDefaultImageCost] = useState(1);

  // Editable data states
  const [packages, setPackages] = useState<Record<string, { name: string; price: number; credits: number; bonus: number; popular: boolean }>>({});
  const [subscriptions, setSubscriptions] = useState<Record<string, SubscriptionPlan>>({});
  const [providerCosts, setProviderCosts] = useState<Record<string, number>>({});
  const [videoCosts, setVideoCosts] = useState<Record<string, number>>({});
  const [imageCosts, setImageCosts] = useState<Record<string, number>>({});
  const [unitCosts, setUnitCosts] = useState<Record<string, number>>({});


  async function loadAll() {
    try {
      setLoading(true);
      const [overviewData, recData] = await Promise.all([
        fetchPricingOverview(),
        fetchPricingRecommendation(),
      ]);
      setOverview(overviewData);
      setRecommendations(recData.recommendations || {});

      // Initialize editable states
      const global = overviewData.global || {};
      const margin = global.margin_percent;
      setMarginPercent(typeof margin === "object" && margin !== null ? margin.value || 30 : margin || 30);
      setDefaultImageCost((global.default_image_credit_cost as number) || 1);
      // Transform packages: ensure all required fields have defaults
      const transformedPackages: Record<string, { name: string; price: number; credits: number; bonus: number; popular: boolean }> = {};
      for (const [key, pkg] of Object.entries(overviewData.packages || {})) {
        transformedPackages[key] = {
          name: pkg.name || "",
          price: pkg.price || 0,
          credits: pkg.credits || 0,
          bonus: pkg.bonus || 0,
          popular: pkg.popular || false,
        };
      }
      setPackages(transformedPackages);

      // Transform subscriptions
      const transformedSubscriptions: Record<string, SubscriptionPlan> = {};
      for (const [key, sub] of Object.entries(overviewData.subscriptions || {})) {
        transformedSubscriptions[key] = {
          name: sub.name || "",
          monthlyIdr: sub.monthlyIdr || 0,
          yearlyIdr: sub.yearlyIdr || 0,
          monthlyCredits: sub.monthlyCredits || 0,
          dailyLimit: sub.dailyLimit || 0,
        };
      }
      setSubscriptions(transformedSubscriptions);

      setProviderCosts(
        Object.fromEntries(
          Object.entries(overviewData.providerCosts || {}).map(([k, v]) => [k, typeof v === "object" && v !== null ? (v as { costUsd?: number }).costUsd || 0 : 0])
        )
      );
      setVideoCosts(overviewData.videoCosts || {});
      setImageCosts(overviewData.imageCosts || {});
      setUnitCosts(overviewData.unitCosts || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing");
    } finally {
      setLoading(false);
    }
  }

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSaveGlobal() {
    try {
      await savePricingConfig("global", "margin_percent", marginPercent);
      await savePricingConfig("global", "default_image_credit_cost", defaultImageCost);
      showToast("Global settings saved", "success");
      loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  }

  async function handleSavePackage(key: string, pkg: typeof packages[string]) {
    try {
      await savePricingConfig("package", key, pkg);
      showToast(`Package "${key}" saved`, "success");
      loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  }

  async function handleSaveSubscription(key: string, sub: typeof subscriptions[string]) {
    try {
      await savePricingConfig("subscription", key, sub);
      showToast(`Subscription "${key}" saved`, "success");
      loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  }

  async function handleSaveProviderCost(key: string, cost: number) {
    try {
      await savePricingConfig("provider_cost", key, cost);
      showToast(`Provider cost "${key}" saved`, "success");
      loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  }

  async function handleSaveCostRow(key: string, val: number, category: string) {
    try {
      await savePricingConfig(category, key, val);
      showToast(`Cost "${key}" saved`, "success");
      loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  }

  async function handleSaveUnitCosts() {
    try {
      for (const key of UNIT_COST_KEYS) {
        const val = unitCosts[key];
        if (val !== undefined) {
          await savePricingConfig("unit_cost", key, val);
        }
      }
      showToast("Unit costs saved!", "success");
      loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  }

  async function handleDelete(category: string, key: string) {
    if (!confirm(`Delete "${key}" from ${category}?`)) return;
    try {
      await deletePricingConfig(category, key);
      showToast(`Deleted "${key}"`, "success");
      loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete", "error");
    }
  }

  function applyRecommendation(key: string) {
    const rec = recommendations[key];
    if (!rec) return;
    setUnitCosts((prev) => ({ ...prev, [key]: rec.minUnits }));
    showToast(`Applied recommendation for ${key}`, "success");
  }

  function calcRecommendedCost(key: string) {
    const rec = recommendations[key];
    const cost = rec?.apiCostUsdMax || 0;
    return cost > 0 ? `$${cost.toFixed(3)}` : "-";
  }

  function getRecommendationStatus(key: string) {
    const rec = recommendations[key];
    const current = unitCosts[key] || 0;
    if (!rec) return { color: "text-slate-500", text: "loading..." };
    return current < rec.minUnits
      ? { color: "text-red-400", text: `≥ ${rec.minUnits} units (${(rec.minUnits / 10).toFixed(1)} cr)` }
      : { color: "text-green-400", text: `≥ ${rec.minUnits} units (${(rec.minUnits / 10).toFixed(1)} cr)` };
  }

  useEffect(() => {
    loadAll();
  }, []);

  if (loading) return <div className="text-text-muted text-center py-12">Loading pricing data...</div>;
  if (error) return <div className="bg-red-500/10 text-red-400 rounded-xl p-4">{error}</div>;
  if (!overview) return <div className="text-text-muted text-center py-12">No data</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pricing Management</h1>
          <p className="text-slate-400 mt-1">Manage credit packages, subscriptions, and provider costs</p>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Section: Unit Costs */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">💰 Unit Costs (User Credit Pricing)</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadAll} size="sm">🔄 Refresh Recommendations</Button>
            <Button onClick={handleSaveUnitCosts} size="sm">Save Unit Costs</Button>
          </div>
        </div>
        <p className="text-slate-400 text-sm mb-4">How many units (10 units = 1 credit) each action costs the user. Recommendations show minimum price to maintain target margin.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Current (units)</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">= Credits</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Recommended Min</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">API Cost (USD)</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {UNIT_COST_KEYS.map((key) => {
                const val = unitCosts[key] || 0;
                const status = getRecommendationStatus(key);
                return (
                  <tr key={key} className="border-b border-slate-800 hover:bg-slate-700/50">
                    <td className="px-4 py-3 font-mono text-slate-300">{key}</td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        value={val}
                        onChange={(v) => setUnitCosts((prev) => ({ ...prev, [key]: parseInt(v) || 0 }))}
                        min="1"
                        step="1"
                        style={{ width: "80px" }}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-300">{(val / 10).toFixed(1)}</td>
                    <td className="px-4 py-3">
                      <span className={status.color}>{status.text}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono">{calcRecommendedCost(key)}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => applyRecommendation(key)}>
                        Apply
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: Global Settings */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Global Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">Margin Percent (%)</label>
            <Input
              type="number"
              value={marginPercent}
              onChange={(v) => setMarginPercent(parseFloat(v) || 0)}
              step="0.1"
              min="0"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">Default Image Credit Cost</label>
            <Input
              type="number"
              value={defaultImageCost}
              onChange={(v) => setDefaultImageCost(parseInt(v) || 0)}
              step="1"
              min="0"
            />
          </div>
        </div>
        <Button onClick={handleSaveGlobal}>Save Global Settings</Button>
      </section>

      {/* Section: Credit Packages */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Credit Packages</h2>
          <Button variant="secondary" size="sm" onClick={() => setPackages((prev) => ({ ...prev, [`pkg_${Date.now()}`]: { name: "", price: 0, credits: 0, bonus: 0, popular: false } }))}>
            + Add Package
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">ID</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Price (IDR)</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Credits</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Bonus</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Popular</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(packages).map(([key, pkg]) => (
                <tr key={key} className="border-b border-slate-800 hover:bg-slate-700/50">
                  <td className="px-4 py-3"><Input value={key} onChange={(_v) => {}} readOnly className="bg-slate-900/50" /></td>
                  <td className="px-4 py-3"><Input value={pkg.name} onChange={(v) => setPackages((prev) => ({ ...prev, [key]: { ...pkg, name: v } }))} /></td>
                  <td className="px-4 py-3"><Input type="number" value={pkg.price} onChange={(v) => setPackages((prev) => ({ ...prev, [key]: { ...pkg, price: parseInt(v) || 0 } }))} /></td>
                  <td className="px-4 py-3"><Input type="number" value={pkg.credits} onChange={(v) => setPackages((prev) => ({ ...prev, [key]: { ...pkg, credits: parseInt(v) || 0 } }))} /></td>
                  <td className="px-4 py-3"><Input type="number" value={pkg.bonus} onChange={(v) => setPackages((prev) => ({ ...prev, [key]: { ...pkg, bonus: parseInt(v) || 0 } }))} /></td>
                  <td className="px-4 py-3">
                    <Select
                      value={pkg.popular ? "true" : "false"}
                      onChange={(v) => setPackages((prev) => ({ ...prev, [key]: { ...pkg, popular: v === "true" } }))}
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => handleSavePackage(key, pkg)}>Save</Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete("package", key)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: Subscription Plans */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Subscription Plans</h2>
          <Button variant="secondary" size="sm" onClick={() => setSubscriptions((prev) => ({ ...prev, [`plan_${Date.now()}`]: { name: "", monthlyIdr: 0, yearlyIdr: 0, monthlyCredits: 0, dailyLimit: 0 } }))}>
            + Add Plan
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Plan Key</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Monthly (IDR)</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Yearly (IDR)</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Monthly Credits</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Daily Limit</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(subscriptions).map(([key, sub]) => (
                <tr key={key} className="border-b border-slate-800 hover:bg-slate-700/50">
                  <td className="px-4 py-3"><Input value={key} onChange={(_v) => {}} readOnly className="bg-slate-900/50" /></td>
                  <td className="px-4 py-3"><Input value={sub.name} onChange={(v) => setSubscriptions((prev) => ({ ...prev, [key]: { ...sub, name: v } }))} /></td>
                  <td className="px-4 py-3"><Input type="number" value={sub.monthlyIdr} onChange={(v) => setSubscriptions((prev) => ({ ...prev, [key]: { ...sub, monthlyIdr: parseInt(v) || 0 } }))} /></td>
                  <td className="px-4 py-3"><Input type="number" value={sub.yearlyIdr} onChange={(v) => setSubscriptions((prev) => ({ ...prev, [key]: { ...sub, yearlyIdr: parseInt(v) || 0 } }))} /></td>
                  <td className="px-4 py-3"><Input type="number" value={sub.monthlyCredits} onChange={(v) => setSubscriptions((prev) => ({ ...prev, [key]: { ...sub, monthlyCredits: parseInt(v) || 0 } }))} /></td>
                  <td className="px-4 py-3"><Input type="number" value={sub.dailyLimit} onChange={(v) => setSubscriptions((prev) => ({ ...prev, [key]: { ...sub, dailyLimit: parseInt(v) || 0 } }))} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => handleSaveSubscription(key, sub)}>Save</Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete("subscription", key)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: Provider Costs */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Provider Costs</h2>
          <Button variant="secondary" size="sm" onClick={() => setProviderCosts((prev) => ({ ...prev, [`provider_${Date.now()}`]: 0 }))}>
            + Add Provider
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Provider Key</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Cost (USD)</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Calculated Credit Cost</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(providerCosts).map(([key, cost]) => {
                const creditCost = Math.ceil(cost * (1 + marginPercent / 100) * 100) / 100;
                return (
                  <tr key={key} className="border-b border-slate-800 hover:bg-slate-700/50">
                    <td className="px-4 py-3"><Input value={key} onChange={(_v) => {}} readOnly className="bg-slate-900/50" /></td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        step="0.001"
                        value={cost}
                        onChange={(v) => setProviderCosts((prev) => ({ ...prev, [key]: parseFloat(v) || 0 }))}
                      />
                    </td>
                    <td className="px-4 py-3 text-yellow-400 font-mono">{creditCost.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" onClick={() => handleSaveProviderCost(key, cost)}>Save</Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete("provider_cost", key)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: Video Credit Costs */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Video Credit Costs</h2>
          <Button variant="secondary" size="sm" onClick={() => setVideoCosts((prev) => ({ ...prev, [`video_${Date.now()}`]: 0 }))}>
            + Add Duration
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Duration (seconds)</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Credits</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(videoCosts).map(([key, val]) => (
                <tr key={key} className="border-b border-slate-800 hover:bg-slate-700/50">
                  <td className="px-4 py-3"><Input value={key} onChange={(_v) => {}} readOnly className="bg-slate-900/50" /></td>
                  <td className="px-4 py-3"><Input type="number" value={val} onChange={(v) => setVideoCosts((prev) => ({ ...prev, [key]: parseInt(v) || 0 }))} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => handleSaveCostRow(key, val, "video_credit")}>Save</Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete("video_credit", key)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: Image Credit Costs */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Image Credit Costs</h2>
          <Button variant="secondary" size="sm" onClick={() => setImageCosts((prev) => ({ ...prev, [`image_${Date.now()}`]: 0 }))}>
            + Add Image Cost
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Key</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">Credits</th>
                <th className="text-left px-4 py-2 text-xs text-slate-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(imageCosts).map(([key, val]) => (
                <tr key={key} className="border-b border-slate-800 hover:bg-slate-700/50">
                  <td className="px-4 py-3"><Input value={key} onChange={(_v) => {}} readOnly className="bg-slate-900/50" /></td>
                  <td className="px-4 py-3"><Input type="number" value={val} onChange={(v) => setImageCosts((prev) => ({ ...prev, [key]: parseInt(v) || 0 }))} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => handleSaveCostRow(key, val, "image_credit")}>Save</Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete("image_credit", key)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}