import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";

/**
 * Onboarding Wizard — persona-first, pertama kali user masuk.
 * Data persona & niche di-hardcode paralel dengan PERSONA_CONFIG/NICHE_CONFIG
 * server (jangan import config server ke bundle UI — menarik database.js).
 */
interface Persona {
  key: string;
  name: string;
  emoji: string;
  description: string;
  allowedNiches: string[] | "ALL";
}

const PERSONAS: Persona[] = [
  {
    key: "umkm",
    name: "UMKM / Toko Kecil",
    emoji: "🏪",
    description: "For small business owners, local shops, and online stores",
    allowedNiches: ["food_culinary", "fashion_lifestyle", "home_decor", "beauty_skincare"],
  },
  {
    key: "content_creator",
    name: "Content Creator",
    emoji: "🎥",
    description: "For YouTubers, TikTokers, and influencers",
    allowedNiches: "ALL",
  },
  {
    key: "movie_director",
    name: "Movie Director",
    emoji: "🎬",
    description: "For short film makers and cinematic content creators",
    allowedNiches: ["cinematic", "travel_adventure", "entertainment"],
  },
  {
    key: "anime_studio",
    name: "Anime Studio",
    emoji: "🎌",
    description: "For anime and illustration content creators",
    allowedNiches: ["anime", "entertainment"],
  },
  {
    key: "corporate",
    name: "Corporate",
    emoji: "💼",
    description: "For company profiles and business marketing",
    allowedNiches: ["business_finance", "tech_gadgets", "education_knowledge"],
  },
  {
    key: "agency",
    name: "Agency",
    emoji: "🏢",
    description: "For agencies managing multiple clients",
    allowedNiches: "ALL",
  },
];

const NICHES: { key: string; label: string; emoji: string }[] = [
  { key: "fashion_lifestyle", label: "Fashion & Lifestyle", emoji: "👗" },
  { key: "food_culinary", label: "Food & Culinary", emoji: "🍜" },
  { key: "tech_gadgets", label: "Tech & Gadgets", emoji: "📱" },
  { key: "beauty_skincare", label: "Beauty & Skincare", emoji: "💄" },
  { key: "travel_adventure", label: "Travel & Adventure", emoji: "✈️" },
  { key: "fitness_health", label: "Fitness & Health", emoji: "💪" },
  { key: "home_decor", label: "Home & Decor", emoji: "🏠" },
  { key: "business_finance", label: "Business & Finance", emoji: "💼" },
  { key: "education_knowledge", label: "Education & Learning", emoji: "📚" },
  { key: "cinematic", label: "Cinematic & Film", emoji: "🎬" },
  { key: "anime", label: "Anime & Illustration", emoji: "🎌" },
  { key: "music_video", label: "Music Video", emoji: "🎤" },
  { key: "entertainment", label: "Entertainment", emoji: "🎭" },
];

const STEPS = ["Persona", "Niche", "Bonus"];

export default function OnboardingWizard() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [persona, setPersona] = useState<string | null>(null);
  const [niche, setNiche] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bonusState, setBonusState] = useState<"idle" | "claimed" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // Sesi aktif sudah mengklaim bonus → jangan redirect sebelum step Bonus
  // sempat render sukses. Ref dibaca sinkron saat render (bukan state),
  // dan di-reset saat komponen remount (kunjungan baru → tetap redirect).
  const claimedRef = useRef(false);

  // Sudah onboarding lengkap → langsung ke dashboard (hanya kunjungan baru;
  // setelah klaim di sesi ini, claimedRef mencegah redirect prematur).
  if (!claimedRef.current && user?.selectedNiche && user?.welcomeBonusUsed) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const saveSelection = async (next: "persona" | "niche") => {
    setSaving(true);
    setError(null);
    try {
      const body: { selectedNiche?: string; userMode?: string } = {};
      if (next === "persona" && persona) body.userMode = persona;
      if (next === "niche" && niche) body.selectedNiche = niche;
      if (Object.keys(body).length === 0) return;
      await api.updateSettings({ ...body });
      await refreshUser();
      setStep((s) => s + 1);
    } catch (e: any) {
      setError(e?.message || "Gagal menyimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const claimBonus = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.claimWelcomeBonus();
      claimedRef.current = true; // sebelum refreshUser() memicu re-render
      await refreshUser();
      setBonusState("claimed");
    } catch (e: any) {
      setBonusState("error");
      setError(e?.message || "Gagal klaim bonus. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const selected = PERSONAS.find((p) => p.key === persona) ?? null;
  const visibleNiches =
    selected && selected.allowedNiches !== "ALL"
      ? NICHES.filter((n) => (selected.allowedNiches as string[]).includes(n.key))
      : NICHES;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1040] to-[#0a0a1a] p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6 text-white shadow-xl backdrop-blur">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Selamat datang di 1AI Content</h1>
          <p className="mt-1 text-sm text-white/60">Lengkapi profil untuk konten yang lebih relevan.</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    i === step ? "bg-purple-500 text-white" : i < step ? "bg-emerald-500/80 text-white" : "bg-white/10 text-gray-300"
                  }`}
                >
                  {s}
                </span>
                {i < STEPS.length - 1 && <span className="h-px w-6 bg-white/20" />}
              </div>
            ))}
          </div>
        </div>

        {step === 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">Pilih profil kamu</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PERSONAS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPersona(p.key)}
                  className={`rounded-xl border p-4 text-left transition ${
                    persona === p.key
                      ? "border-purple-400 bg-purple-500/20"
                      : "border-white/10 bg-white/5 hover:border-white/30"
                  }`}
                >
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="mt-1 font-semibold">{p.name}</div>
                  <div className="mt-1 text-xs text-gray-400">{p.description}</div>
                </button>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-[#ff5c5c]">{error}</p>}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => saveSelection("persona")}
                disabled={!persona || saving}
                className="rounded-lg bg-purple-600 px-5 py-2 font-medium text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Menyimpan..." : "Lanjut"}
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="mb-3 text-lg font-semibold uppercase tracking-wide text-gray-300">Pilih niche konten</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleNiches.map((n) => (
                <button
                  key={n.key}
                  onClick={() => setNiche(n.key)}
                  className={`rounded-xl border p-3 text-center transition ${
                    niche === n.key ? "border-purple-400 bg-purple-500/20" : "border-white/10 bg-white/5 hover:border-white/30"
                  }`}
                >
                  <div className="text-xl">{n.emoji}</div>
                  <div className="mt-1 text-xs font-medium">{n.label}</div>
                </button>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-[#ff5c5c]">{error}</p>}
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setStep(0)}
                className="rounded-lg px-4 py-2 text-sm text-gray-300 transition hover:text-white"
              >
                Kembali
              </button>
              <button
                onClick={() => saveSelection("niche")}
                disabled={!niche || saving}
                className="rounded-lg bg-purple-600 px-5 py-2 font-medium text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Menyimpan..." : "Lanjut"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center">
            <div className="text-4xl">🎁</div>
            <h2 className="mt-2 text-lg font-semibold">Kamu dapat bonus 1 kredit!</h2>
            <p className="mt-1 text-sm text-gray-400">
              Klaim kredit welcome bonus untuk membuat video pertamamu.
            </p>
            {bonusState === "claimed" ? (
              <div className="mt-5 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                Berhasil! Saldo kamu: <span className="font-bold">{(user as any)?.credits ?? 1} kredit</span>
              </div>
            ) : (
              <button
                onClick={claimBonus}
                disabled={saving}
                className="mt-5 rounded-lg bg-emerald-600 px-6 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Mengklaim..." : "Klaim bonus"}
              </button>
            )}
            {error && <p className="mt-3 text-sm text-[#ff5c5c]">{error}</p>}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => navigate("/app/create")}
                className="rounded-lg bg-purple-600 px-5 py-2 font-medium text-white transition hover:bg-purple-500"
              >
                Buat video
              </button>
              <button
                onClick={() => navigate("/app/dashboard")}
                className="rounded-lg border border-white/20 px-5 py-2 font-medium text-gray-200 transition hover:bg-white/10"
              >
                Ke dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}