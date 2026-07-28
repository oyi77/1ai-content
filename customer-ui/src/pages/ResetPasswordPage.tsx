import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(""); setError("");
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    try {
      const res = await fetch("/auth/email/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage("Password reset successful! Redirecting to sign in...");
      setTimeout(() => navigate("/login"), 2000);
    } catch { setError("Network error"); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold">Set New Password</h1>
        {message && <p className="mb-4 text-center text-green-600">{message}</p>}
        {error && <p className="mb-4 text-center text-red-600">{error}</p>}
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="New password (min 6 chars)"
            className="mb-3 w-full rounded-lg border p-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            className="mb-3 w-full rounded-lg border p-3"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-purple-600 px-4 py-3 text-white hover:bg-purple-700"
          >
            Reset Password
          </button>
        </form>
      </div>
    </div>
  );
}
