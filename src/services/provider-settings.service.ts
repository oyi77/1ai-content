import { redis } from "@/config/redis";
import { prisma } from "@/config/database";
import {
  PROVIDER_CONFIG,
  VideoProviderConfig,
  ImageProviderConfig,
} from "@/config/providers";

const PROVIDER_KEY = "admin:provider_settings";
const PROVIDER_VERSION_KEY = "admin:provider_settings:version";
const PROVIDER_VERSIONED_PREFIX = "admin:provider_settings:v";
const PROVIDER_CACHE_TTL_SECONDS = 300;

function getVersionedProviderKey(version: string | number): string {
  return `${PROVIDER_VERSIONED_PREFIX}${version}`;
}

async function writeProviderSettingsCache(settings: {
  video?: Record<string, { priority: number; enabled?: boolean }>;
  image?: Record<string, { priority: number; enabled?: boolean }>;
}): Promise<void> {
  const serialized = JSON.stringify(settings);
  const version = await redis.incr(PROVIDER_VERSION_KEY);
  const versionedKey = getVersionedProviderKey(version);

  await Promise.all([
    redis.setex(versionedKey, PROVIDER_CACHE_TTL_SECONDS, serialized),
    // Keep legacy cache key for backward compatibility with older readers.
    redis.setex(PROVIDER_KEY, PROVIDER_CACHE_TTL_SECONDS, serialized),
  ]);
}

export class ProviderSettingsService {
  static async getDynamicSettings() {
    try {
      // Redis cache first: read current version, then resolve immutable versioned payload.
      const version = await redis.get(PROVIDER_VERSION_KEY);
      if (version) {
        const versionedKey = getVersionedProviderKey(version);
        const cachedVersioned = await redis.get(versionedKey);
        if (cachedVersioned) {
          return JSON.parse(cachedVersioned);
        }
      }

      // Backward-compatible fallback while versioned cache is warming up.
      const cached = await redis.get(PROVIDER_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Fall through to DB
    }
    try {
      // DB fallback (persistent store)
      const dbRow = await prisma.pricingConfig.findUnique({
        where: { category_key: { category: "provider", key: "settings" } },
      });
      if (dbRow) {
        const settings = dbRow.value as {
          video?: Record<string, { priority: number; enabled?: boolean }>;
          image?: Record<string, { priority: number; enabled?: boolean }>;
        };
        // Warm Redis cache with versioned + TTL entries.
        await writeProviderSettingsCache(settings);
        return settings;
      }
    } catch {
      // Return defaults if both Redis and DB fail
    }
    return { video: {}, image: {} }; // Empty overrides returns default sorting
  }

  static async updateSettings(settings: {
    video?: Record<string, { priority: number; enabled?: boolean }>;
    image?: Record<string, { priority: number; enabled?: boolean }>;
  }) {
    // Persist to DB (survives restarts)
    await prisma.pricingConfig.upsert({
      where: { category_key: { category: "provider", key: "settings" } },
      create: {
        category: "provider",
        key: "settings",
        value: settings,
        updatedBy: BigInt(0),
      },
      update: { value: settings, updatedBy: BigInt(0) },
    });

    // Refresh Redis cache using versioned key to avoid stale readers under concurrency.
    await writeProviderSettingsCache(settings);
  }

  static async getSortedVideoProviders(): Promise<
    Array<{ key: string } & VideoProviderConfig>
  > {
    const overrides = await this.getDynamicSettings();
    const activeOverrides = overrides.video || {};

    return Object.entries(PROVIDER_CONFIG.video)
      .map(([key, config]) => {
        const override = activeOverrides[key];
        return {
          key,
          ...config,
          priority: override?.priority ?? config.priority,
          enabled: override?.enabled ?? true, // Allow soft disabling
        };
      })
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  static async getSortedImageProviders(): Promise<
    Array<{ key: string } & ImageProviderConfig>
  > {
    const overrides = await this.getDynamicSettings();
    const activeOverrides = overrides.image || {};

    return Object.entries(PROVIDER_CONFIG.image)
      .map(([key, config]) => {
        const override = activeOverrides[key];
        return {
          key,
          ...config,
          priority: override?.priority ?? config.priority,
          enabled: override?.enabled ?? true, // Allow soft disabling
        };
      })
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }
}
