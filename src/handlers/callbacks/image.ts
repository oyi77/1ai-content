/**
 * Image Callbacks — BARREL
 *
 * Re-exports all image callback handlers from split modules.
 * Consumers importing from "@/handlers/callbacks/image" keep working.
 */
export { handleImageCallbacks } from './image/callback-router';
export { handleImageGeneration } from './image/handle-generation';
export { detectImageElements, renderElementSelectionKeyboard, buildElementSelectionMessage } from './image/element-ui';
