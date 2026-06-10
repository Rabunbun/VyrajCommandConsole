export const srpStatusOptions = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_INFO",
  "APPROVED",
  "DENIED",
  "PAID",
  "CANCELLED"
] as const;

export type SrpStatus = (typeof srpStatusOptions)[number];

export function normalizeSrpStatus(value: string) {
  const normalized = value.trim().replace(/\s+/g, "_").toUpperCase();

  if (normalized === "NEW") {
    return "SUBMITTED";
  }

  if (normalized === "CANCELED") {
    return "CANCELLED";
  }

  return normalized || "SUBMITTED";
}
