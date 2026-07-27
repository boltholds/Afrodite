import {
  uiDocumentSchema,
  type UiDocument,
  type UiDocumentInput,
} from "@afrodite/ui-ir";
import { z } from "zod";

export const uiDocumentProtocolSchema: z.ZodType<
  UiDocument,
  z.ZodTypeDef,
  UiDocumentInput
> = uiDocumentSchema;
