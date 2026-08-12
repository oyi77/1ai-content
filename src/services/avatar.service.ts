/**
 * Avatar Service
 *
 * Manages persistent user avatars for consistent character/identity
 * generation across multiple image and video sessions.
 */

import { prisma } from "@/config/database";
import { logger } from "@/utils/logger";
import {
  ConfigError,
  ProviderError,
  ProviderTimeoutError,
  ValidationError,
} from "@/utils/app-errors";
import { ContentAnalysisService } from "./content-analysis.service";

const MAX_AVATARS_PER_USER = 5;

export interface AvatarData {
  id: number;
  name: string;
  imageUrl: string;
  localPath?: string | null;
  description?: string | null;
  features?: Record<string, unknown> | null;
  isDefault: boolean;
}

export class AvatarService {
  /**
   * Save a new avatar for a user. Analyses the image with Gemini Vision
   * to extract a feature description for future prompt enrichment.
   */
  static async createAvatar(
    telegramId: bigint,
    name: string,
    imageUrl: string,
    localPath?: string,
  ): Promise<AvatarData> {
    // Check limit
    const count = await prisma.userAvatar.count({
      where: { userId: telegramId },
    });
    if (count >= MAX_AVATARS_PER_USER) {
      throw new ValidationError(
        `Maximum ${MAX_AVATARS_PER_USER} avatars allowed`,
        "avatarCount",
      );
    }

    // Analyse image to extract features
    let description = "";
    let features: Record<string, unknown> = {};
    try {
      const analysis = await ContentAnalysisService.extractPrompt(
        imageUrl,
        "image",
      );
      if (analysis.success && analysis.prompt) {
        description = analysis.prompt;
        features = {
          style: analysis.style || "",
          elements: analysis.elements || [],
        };
      }
    } catch (err) {
      logger.warn("Avatar analysis failed, saving without features:", err);
    }

    // If this is the user's first avatar, make it default
    const isDefault = count === 0;

    const avatar = await prisma.userAvatar.create({
      data: {
        userId: telegramId,
        name,
        imageUrl,
        localPath: localPath || null,
        description,
        features: features ? JSON.parse(JSON.stringify(features)) : null,
        isDefault,
      },
    });

    logger.info(`Avatar created: ${avatar.id} for user ${telegramId}`);

    return {
      id: avatar.id,
      name: avatar.name,
      imageUrl: avatar.imageUrl,
      localPath: avatar.localPath,
      description: avatar.description,
      features: avatar.features as Record<string, unknown> | null,
      isDefault: avatar.isDefault,
    };
  }

  /** List all avatars for a user */
  static async listAvatars(telegramId: bigint): Promise<AvatarData[]> {
    const avatars = await prisma.userAvatar.findMany({
      where: { userId: telegramId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return avatars.map((a) => ({
      id: a.id,
      name: a.name,
      imageUrl: a.imageUrl,
      localPath: a.localPath,
      description: a.description,
      features: a.features as Record<string, unknown> | null,
      isDefault: a.isDefault,
    }));
  }

  /** Get user's default avatar */
  static async getDefaultAvatar(
    telegramId: bigint,
  ): Promise<AvatarData | null> {
    const avatar = await prisma.userAvatar.findFirst({
      where: { userId: telegramId, isDefault: true },
    });
    if (!avatar) return null;

    return {
      id: avatar.id,
      name: avatar.name,
      imageUrl: avatar.imageUrl,
      localPath: avatar.localPath,
      description: avatar.description,
      features: avatar.features as Record<string, unknown> | null,
      isDefault: avatar.isDefault,
    };
  }

  /** Get avatar by ID */
  static async getAvatar(avatarId: number): Promise<AvatarData | null> {
    const avatar = await prisma.userAvatar.findUnique({
      where: { id: avatarId },
    });
    if (!avatar) return null;

    return {
      id: avatar.id,
      name: avatar.name,
      imageUrl: avatar.imageUrl,
      localPath: avatar.localPath,
      description: avatar.description,
      features: avatar.features as Record<string, unknown> | null,
      isDefault: avatar.isDefault,
    };
  }

  /** Set avatar as default (unset previous default) */
  static async setDefault(telegramId: bigint, avatarId: number): Promise<void> {
    await prisma.$transaction([
      prisma.userAvatar.updateMany({
        where: { userId: telegramId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.userAvatar.update({
        where: { id: avatarId },
        data: { isDefault: true },
      }),
    ]);
  }

  /** Generate a talking video from a photo URL and text script via D-ID */
  static async generateTalkingVideo(
    imageUrl: string,
    text: string,
  ): Promise<string> {
    const apiKey = process.env.D_ID_API_KEY;
    if (!apiKey) throw new ConfigError("D_ID_API_KEY");

    const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

    const createRes = await fetch("https://api.d-id.com/talks", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_url: imageUrl,
        script: {
          type: "text",
          input: text,
          provider: { type: "microsoft", voice_id: "en-US-JennyNeural" },
        },
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new ProviderError(
        "D-ID",
        `create failed: ${createRes.status} ${err}`,
      );
    }
    const { id } = (await createRes.json()) as { id: string };

    // Poll for result (max 30 × 3s = 90s)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.d-id.com/talks/${id}`, {
        headers: { Authorization: authHeader },
      });
      const data = (await pollRes.json()) as {
        status: string;
        result_url?: string;
        error?: { description: string };
      };
      if (data.status === "done" && data.result_url) return data.result_url;
      if (data.status === "error")
        throw new ProviderError("D-ID", `error: ${data.error?.description}`);
    }
    throw new ProviderTimeoutError("D-ID", 90000);
  }

  /** Delete an avatar */
  static async deleteAvatar(
    telegramId: bigint,
    avatarId: number,
  ): Promise<boolean> {
    const avatar = await prisma.userAvatar.findFirst({
      where: { id: avatarId, userId: telegramId },
    });
    if (!avatar) return false;

    await prisma.userAvatar.delete({ where: { id: avatarId } });

    // If deleted avatar was default, promote another one
    if (avatar.isDefault) {
      const next = await prisma.userAvatar.findFirst({
        where: { userId: telegramId },
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await prisma.userAvatar.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return true;
  }
}
