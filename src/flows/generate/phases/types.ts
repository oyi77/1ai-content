import type { BotContext } from "@/types";
import type { UserService } from "@/services/user.service";
import type { redis } from "@/config/redis";
import type {
  DurationPreset,
  DurationPresetConfig,
  IndustryId,
} from "@/config/hpas-engine";
import type {
  GenerateAction,
  Platform,
} from "../../generate.types";

/** Values every execution phase needs. Built by executeGeneration, passed explicitly. */
export interface ExecSetup {
  ctx: BotContext;
  session: Exclude<BotContext["session"], undefined>;
  telegramId: bigint;
  action: GenerateAction;
  productDesc: string;
  photoUrl: string | undefined;
  preset: DurationPreset;
  presetConfig: DurationPresetConfig;
  platform: Platform;
  industry: IndustryId;
  lockKey: string;
  redis: typeof redis;
}

export type ExecUser = NonNullable<
  Awaited<ReturnType<typeof UserService.findByTelegramId>>
>;

/** Full context once gating resolved user, cost, language and free-trial slot. */
export interface ExecPhaseCtx extends ExecSetup {
  user: ExecUser;
  cost: number;
  useFreeSlot: boolean;
  lang: string;
}
