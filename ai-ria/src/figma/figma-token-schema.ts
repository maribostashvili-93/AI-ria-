import { z } from "zod";
import { DesignTokenSchema } from "../core/types.js";

/**
 * Extended Figma token pack (v0.2 Figma Intelligence foundation).
 * Superset of the extract-format: adds shadows and components.
 * Later this becomes the wire format for the Figma MCP bridge.
 */
export const FigmaTokenPackSchema = z.object({
  source: z.string().default("figma"),
  importedAt: z.string(),
  colors: z.array(DesignTokenSchema).default([]),
  typography: z.array(z.object({ name: z.string(), fontFamily: z.string().default(""), fontSize: z.number().default(0) })).default([]),
  spacing: z.array(DesignTokenSchema).default([]),
  radius: z.array(DesignTokenSchema).default([]),
  shadows: z.array(DesignTokenSchema).default([]),
  components: z.array(z.object({ name: z.string(), type: z.string().default("COMPONENT") })).default([]),
});
export type FigmaTokenPack = z.infer<typeof FigmaTokenPackSchema>;
