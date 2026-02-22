import { ApiError } from "@/lib/errors";

export function ensureIntegerCents(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError(400, "INVALID_REQUEST", `${fieldName} must be an integer number of cents`);
  }
  return value;
}

export function numberToBigIntCents(value: number): bigint {
  return BigInt(value);
}

export function bigIntCentsToNumber(value: bigint): number {
  return Number(value);
}

export function usdCurrencyOrThrow(currency: unknown): "USD" {
  if (currency !== "USD") {
    throw new ApiError(400, "INVALID_REQUEST", "Only USD currency is supported");
  }
  return "USD";
}

export function dollarsToCents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}
