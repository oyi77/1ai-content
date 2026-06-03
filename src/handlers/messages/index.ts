/**
 * Message Sub-Handlers — Index
 *
 * Exports all message handler functions for the various session states.
 * The main `messageHandler` in `src/handlers/message.ts` dispatches to these.
 */

// Session utilities
export { updateSessionDirectly, SESSION_TTL } from "./session";

// V3 flow
export {
  handleCustomDurationV3,
  handleAwaitingGenerateImage,
  handleCustomDurationInput,
} from "./v3-flow";

// Text input
export {
  handleCustomPromptCreation,
  handleCustomPromptInput,
  handleWaitingAccountId,
  handleEbookStates,
} from "./text-input";

// Photo upload
export {
  handleCreateVideoUpload,
  handleImageReferenceWaiting,
  handleAvatarUploadWaiting,
  handleAvatarNameWaiting,
  handleAvatarTalkPhoto,
} from "./photo-upload";

// Image generation
export {
  handleImageGenerationWaiting,
  handleCloneEditDescWaiting,
  handleCloneVideoWaiting,
} from "./image-gen";

// Menu router
export { routeMenuButton, detectVideoIntent } from "./menu-router";

// AI chat fallback
export { tryAIChat } from "./ai-chat";
