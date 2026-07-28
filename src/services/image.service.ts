/**
 * Image Generation Service — BARREL
 *
 * Re-exports ImageGenerationService and types from split modules.
 * Consumers importing from "@/services/image.service" keep working.
 */
export { ImageGenerationService } from './image/image-generation.service';
export type { ImageGenerationMode, ImageGenerationResult, ImageGenerationParams } from './image/types';
export type { ImageProvider, ProviderFn } from './image/providers/providers-registry';
export { getProviders as getProviderList } from './image/providers/providers-registry';
