/**
 * Generate Flow — Barrel Re-export
 *
 * This file used to be a 1565-line god object.
 * It has been split into 5 focused modules:
 *
 *   generate.types.ts       — Types, helpers, constants
 *   generate.ui.ts          — All show* UI/presentation functions
 *   generate.input.ts       — Input handlers + routing
 *   generate.execution.ts   — executeGeneration pipeline
 *   generate.callback.ts    — Callback router
 *
 * This barrel preserves backward compatibility for all
 * existing `import from '@/flows/generate'` statements.
 */

export * from "./generate.types";
export * from "./generate.ui";
export * from "./generate.input";
export * from "./generate.execution";
export * from "./generate.callback";
