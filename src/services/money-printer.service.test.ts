import { MoneyPrinterService } from "./money-printer.service";

describe("MoneyPrinterService", () => {
  let service: MoneyPrinterService;

  beforeEach(() => {
    service = new MoneyPrinterService({
      pythonPath: "python",
      timeout: 60_000,
    });
  });

  it("constructs with defaults", () => {
    const s = new MoneyPrinterService();
    expect(s).toBeDefined();
  });

  it("generateVideo returns failed status on missing audio_file", async () => {
    const result = await service.generateVideo({
      audio_file: "/nonexistent/audio.mp3",
      output_dir: "/tmp/test",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
  });

  it("generateVideo returns failed status on invalid output_dir", async () => {
    const result = await service.generateVideo({
      audio_file: "/nonexistent/audio.mp3",
      output_dir: "",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
  });

  it("generateVideo requires audio_file", async () => {
    const result = await service.generateVideo({
      audio_file: "",
      output_dir: "/tmp/test",
    });

    expect(result.status).toBe("failed");
  });
});
