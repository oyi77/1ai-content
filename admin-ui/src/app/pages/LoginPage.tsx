import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login: setAuthToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const verifyToken = searchParams.get("token");

  const [mode, setMode] = useState<"login" | "register" | "forgot" | "verify">(
    verifyToken
      ? "verify"
      : searchParams.get("register") === "1"
        ? "register"
        : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clear = () => { setMessage(""); setError(""); };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    try {
      const res = await fetch("/auth/email/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName: firstName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage(data.message);
      setMode("login");
    } catch { setError("Network error"); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    try {
      const res = await fetch("/auth/email/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setAuthToken(data.token);
      navigate("/app/dashboard", { replace: true });
    } catch { setError("Network error"); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    try {
      const res = await fetch("/auth/email/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage(data.message);
    } catch { setError("Network error"); }
  };

  const handleVerifyEmail = async () => {
    clear();
    try {
      const res = await fetch("/auth/email/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verifyToken }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage("Email verified! You can now log in.");
      setMode("login");
    } catch { setError("Network error"); }
  };

  if (mode === "verify") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-2xl font-bold">Verify Email</h1>
          {message && <p className="mb-4 text-center text-green-600">{message}</p>}
          {error && <p className="mb-4 text-center text-red-600">{error}</p>}
          <button
            onClick={handleVerifyEmail}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
          >
            Verify Email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold">
          {mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : "Reset Password"}
        </h1>

        {message && <p className="mb-4 text-center text-green-600">{message}</p>}
        {error && <p className="mb-4 text-center text-red-600">{error}</p>}

        {mode === "login" && (
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              className="mb-3 w-full rounded-lg border p-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              className="mb-3 w-full rounded-lg border p-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-purple-600 px-4 py-3 text-white hover:bg-purple-700"
            >
              Sign In
            </button>
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={handleRegister}>
            <input
              type="text"
              placeholder="First name (optional)"
              className="mb-3 w-full rounded-lg border p-3"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              type="email"
              placeholder="Email"
              className="mb-3 w-full rounded-lg border p-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              className="mb-3 w-full rounded-lg border p-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Confirm password"
              className="mb-3 w-full rounded-lg border p-3"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-purple-600 px-4 py-3 text-white hover:bg-purple-700"
            >
              Create Account
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleForgotPassword}>
            <input
              type="email"
              placeholder="Email"
              className="mb-3 w-full rounded-lg border p-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-purple-600 px-4 py-3 text-white hover:bg-purple-700"
            >
              Send Reset Link
            </button>
          </form>
        )}

        <div className="mt-4 flex flex-col items-center gap-2 text-sm text-gray-600">
          {mode === "login" && (
            <>
              <button onClick={() => setMode("forgot")} className="hover:underline">
                Forgot password?
              </button>
              <button onClick={() => setMode("register")} className="hover:underline">
                Don't have an account? Sign up
              </button>
            </>
          )}
          {mode === "register" && (
            <button onClick={() => setMode("login")} className="hover:underline">
              Already have an account? Sign in
            </button>
          )}
          {mode === "forgot" && (
            <button onClick={() => setMode("login")} className="hover:underline">
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
