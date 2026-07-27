import React from "react";

/* ── Input ── */
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

export function Input({ value, onChange, type = "text", readOnly, style, className, min, max, step, placeholder }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className={`w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 ${className ?? ""}`}
      style={style}
    />
  );
}

/* ── Textarea ── */
interface TextareaProps {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  className?: string;
  placeholder?: string;
  rows?: number;
}

export function Textarea({ value, onChange, style, className, placeholder, rows }: TextareaProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 resize-none ${className ?? ""}`}
      style={style}
    />
  );
}

/* ── Select ── */
interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export function Select({ value, onChange, children, style, className }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 ${className ?? ""}`}
      style={style}
    >
      {children}
    </select>
  );
}

/* ── Button ── */
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
}

export function Button({ children, onClick, variant = "primary", disabled, className, style, type }: ButtonProps) {
  const base = "px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2";
  const variants = {
    primary: "bg-purple-600 text-white hover:bg-purple-700",
    secondary: "bg-slate-700 text-slate-100 border border-slate-600 hover:bg-slate-600",
    ghost: "bg-transparent text-slate-300 hover:bg-slate-800",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type ?? "button"}
      className={`${base} ${variants[variant]} ${className ?? ""}`}
      style={style}
    >
      {children}
    </button>
  );
}

/* ── Tab ── */
interface TabProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function Tab({ label, active, onClick }: TabProps) {
  return (
    <div
      className={`px-4 py-2 rounded-t-lg text-sm font-medium cursor-pointer transition-colors ${
        active
          ? "bg-slate-800 text-white border-b-2 border-purple-500"
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
      }`}
      onClick={onClick}
    >
      {label}
    </div>
  );
}

/* ── Spinner ── */
export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent text-current"
      style={{ width: size, height: size }}
    />
  );
}

/* ── StatusBadge ── */
interface StatusBadgeProps {
  status: string;
  good?: string[];
  bad?: string[];
}

export function StatusBadge({ status, good, bad }: StatusBadgeProps) {
  const goodList = good ?? ["active", "enabled", "success", "running", "completed"];
  const badList = bad ?? ["inactive", "disabled", "error", "failed", "stopped"];
  const isGood = goodList.includes(status.toLowerCase());
  const isBad = badList.includes(status.toLowerCase());
  const color = isGood ? "bg-green-500/20 text-green-400" : isBad ? "bg-red-500/20 text-red-400" : "bg-slate-600/20 text-slate-400";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

/* ── Toast ── */
interface ToastProps {
  message: string | null;
  type?: "success" | "error" | "info";
  visible: boolean;
}

export function Toast({ message, type = "success", visible }: ToastProps) {
  if (!visible || !message) return null;
  const colors = {
    success: "bg-green-500/10 text-green-400 border-green-500/30",
    error: "bg-red-500/10 text-red-400 border-red-500/30",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };
  return (
    <div
      className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg border text-sm ${colors[type]} animate-in slide-in-from-top-2 duration-200`}
    >
      {message}
    </div>
  );
}
