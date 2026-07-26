/**
 * MoneyPrinterTurbo Service — Subprocess Runner
 *
 * Spawns MPT as a subprocess with JSON stdin/stdout communication.
 * No persistent server needed — MPT runs on-demand for ~50-500 jobs/month.
 *
 * Input: JSON with audio_file, output_dir, materials_query
 * Output: JSON with video_paths, duration, errors
 */

import { spawn } from "child_process";
import { resolve as resolvePath } from "path";
import { logger } from "@/utils/logger";



export interface VideoGenerationParams {
	audio_file: string;
	output_dir: string;
	materials_source?: "pexels" | "pixabay";
	materials_api_key?: string;
	materials_query?: string;
	video_aspect?: "16:9" | "9:16";
	video_concat_mode?: "random" | "sequential";
	max_clip_duration?: number;
	subtitle_enabled?: boolean;
	bgm_type?: string;
	font_size?: number;
	n_threads?: number;
}

export interface VideoGenerationResult {
	status: "completed" | "failed";
	video_paths?: string[];
	audio_file?: string;
	subtitle_path?: string;
	error?: string;
}

export interface MPTConfig {
	pythonPath?: string;
	mptPath?: string;
	timeout?: number;
}

const DEFAULT_TIMEOUT = 600_000; // 10 minutes
const DEFAULT_PYTHON = "python";
const DEFAULT_MPT_PATH = resolvePath(__dirname, "../../services/money-printer-turbo");

export class MoneyPrinterService {
	readonly #pythonPath: string;
	readonly #mptPath: string;
	readonly #timeout: number;

	constructor(config: MPTConfig = {}) {
		this.#pythonPath = config.pythonPath ?? DEFAULT_PYTHON;
		this.#mptPath = config.mptPath ?? DEFAULT_MPT_PATH;
		this.#timeout = config.timeout ?? DEFAULT_TIMEOUT;
	}

	/**
	 * Generate video synchronously via subprocess.
	 * Spawns MPT CLI, pipes JSON params via stdin, collects result from stdout.
	 */
	async generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
		const input = JSON.stringify(params);

		try {
			const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
				const proc = spawn(this.#pythonPath, ['-m', 'app.cli'], {
					cwd: this.#mptPath,
					timeout: this.#timeout,
				});
				let out = '';
				let err = '';
				proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
				proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
				proc.on('close', (code) => {
					if (code === 0) resolve({ stdout: out, stderr: err });
					else reject(new Error(`MPT exited with code ${code}: ${err}`));
				});
				proc.on('error', reject);
				proc.stdin.write(input);
				proc.stdin.end();
			});

			if (stderr) {
        logger.warn("MPT stderr:", stderr);
			}

			const result = JSON.parse(stdout) as VideoGenerationResult;
			return result;
		} catch (err: unknown) {
			const error = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
			let errorMsg = "MPT subprocess error";

			if (error.code === "ETIMEDOUT") {
				errorMsg = "MPT video generation timed out";
			} else if (error.stderr) {
				errorMsg = error.stderr;
			} else if (error.message) {
				errorMsg = error.message;
			}

			return {
				status: "failed",
				error: errorMsg,
			};
		}
	}
}

export default MoneyPrinterService;
