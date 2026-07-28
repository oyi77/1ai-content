/**
 * Image Callbacks — BARREL
 *
 * Re-exports all public API from split sub-modules.
 * Consumers importing from "@/handlers/callbacks/image" keep working.
 */
export { handleImageGeneration } from './image/handle-generation';
export { handleImageCallbacks } from './image/callback-router';
export { detectImageElements, renderElementSelectionKeyboard, buildElementSelectionMessage } from './image/element-ui';
export type { } from './image/element-ui';
