import { Prisma } from '@prisma/client';

/**
 * Safely cast a Record to Prisma's InputJsonValue type.
 * Centralizes the cast so JSON field writes don't need `as any`.
 */
export function toJsonValue(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  return value as unknown as Prisma.InputJsonValue;
}
