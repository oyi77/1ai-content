/**
 * Content Bot — Pipeline state machine
 */
import {
  detectInputType,
  analyzeInput,
  generateScript,
  formatAnalysis,
  formatScript,
  type PipelineState,
  type AnalysisResult,
  type ContentScript,
} from "@/services/content-pipeline.service";

export type { PipelineState, AnalysisResult, ContentScript };

// Per-user pipeline state (in-memory)
const pipelines = new Map<number, PipelineState>();

export function getPipeline(userId: number): PipelineState {
  if (!pipelines.has(userId)) pipelines.set(userId, { step: "input" });
  return pipelines.get(userId)!;
}

export function renderStep(userId: number): { text: string; buttons: unknown[][] } {
  const p = getPipeline(userId);
  switch (p.step) {
    case "input":
      return {
        text: "🎬 *Buat Konten*\n\nKirim salah satu:\n• URL YouTube/TikTok\n• File .md / .txt\n• Prompt text\n\nBot akan analisa dan buatkan script + video.",
        buttons: [],
      };
    case "analyzing":
      return { text: "⏳ Sedang analisa...", buttons: [] };
    case "analysis_done": {
      const a = p.analysis!;
      return {
        text: formatAnalysis(a) + "\n\nMau lanjut buat script?",
        buttons: [
          [{ text: "📝 Buat Script", callback_data: "pipe_script" }],
          [{ text: "🔄 Analisa Ulang", callback_data: "pipe_reanalyze" }],
          [{ text: "❌ Batal", callback_data: "pipe_cancel" }],
        ],
      };
    }
    case "script_done": {
      const s = p.script!;
      return {
        text: formatScript(s),
        buttons: [
          [{ text: "🎬 Generate Video", callback_data: "pipe_generate" }],
          [{ text: "✏️ Edit Script", callback_data: "pipe_edit_script" }],
          [{ text: "🔄 Buat Ulang Script", callback_data: "pipe_script" }],
          [{ text: "◀️ Kembali ke Analysis", callback_data: "pipe_back_analysis" }],
        ],
      };
    }
    case "generate":
      return { text: "🎬 Generating video... Mohon tunggu.", buttons: [] };
    case "done":
      return {
        text: "✅ Video selesai! Mau publish ke sosmed?",
        buttons: [
          [{ text: "📤 Publish", callback_data: "pipe_publish" }],
          [{ text: "🎬 Buat Lagi", callback_data: "pipe_new" }],
        ],
      };
    default:
      return { text: "Ketik /create untuk mulai.", buttons: [] };
  }
}
