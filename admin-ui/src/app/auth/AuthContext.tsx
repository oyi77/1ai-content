import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface User {
  id: string;
  telegramId: string | null;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  name: string;
  credits: number;
  isPremium: boolean;
  selectedNiche: string | null;
  userMode: string | null;
  welcomeBonusUsed: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  const login = (newToken: string) => {
    localStorage.setItem("token", newToken);
    // Set loading=true before token change so ProtectedRoute shows a spinner
    // instead of immediately redirecting before refreshUser() finishes.
    setLoading(true);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser({
          id: data.id,
          telegramId: data.telegramId ?? null,
          email: data.email ?? null,
          emailVerified: data.emailVerified ?? false,
          username: data.username ?? null,
          name: data.firstName ?? "",
          credits: data.credits ?? 0,
          isPremium: (data.tier ?? "free") === "pro" || (data.tier ?? "free") === "agency",
          selectedNiche: data.selectedNiche ?? null,
          userMode: data.userMode ?? null,
          welcomeBonusUsed: data.welcomeBonusUsed ?? false,
        });
      } else {
        logout();
      }
    } catch {
      // network error — keep stale user
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}