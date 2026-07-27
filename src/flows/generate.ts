/**
 * Generate Flow — Barrel Re-export
 *
 * Aggregates all sub-modules for backward compatibility.
 * Previously a 1565-line god object, now split into 5 focused modules.
 *
 * Sub-modules:
 *   generate.types.ts      — Types, helpers (clearGenerateSession, getStepIndicator, downloadToLocal)
 *   generate.ui.ts          — All show* UI/presentation functions
 *   generate.input.ts       — Input handlers & routing (handleProductInput, requestProductInput, etc.)
 *   generate.execution.ts   — executeGeneration — the core pipeline (~570 lines)
 *   generate.callback.ts    — handleGenerateCallback — callback data router
 */

export * from './generate.types';
export * from './generate.ui';
export * from './generate.input';
export * from './generate.execution';
export * from './generate.callback';
