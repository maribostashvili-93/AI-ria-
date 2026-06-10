/**
 * Memory Engine schemas (v0.1). Single source of truth lives in core/types.ts;
 * this module re-exports them so the memory engine is self-contained to import.
 */
export {
  MemoryTypeSchema,
  MemoryEntrySchema,
  MemoryIndexSchema,
  MemorySearchHitSchema,
  MemoryPackSchema,
} from "../core/types.js";
export type { MemoryType, MemoryEntry, MemoryIndex, MemorySearchHit, MemoryPack } from "../core/types.js";

/** All valid memory types, for CLI help and validation messages. */
export const MEMORY_TYPES = ["decision", "task", "design-rule", "architecture-note", "warning", "security-note", "figma-note"] as const;
