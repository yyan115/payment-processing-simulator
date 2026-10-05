import { ApiError } from "../api/types";
import type { Intent } from "../api/types";
const currencies: Record<string, number> = {
  SGD: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
  KWD: 3,
};

// Convert from decimal text, because binary floating-point amounts lose precision.
export function minorUnits(amount: string, currency: string): bigint {
  const digits = currencies[currency];
  if (digits === undefined)
    throw new ApiError("Choose a supported demo currency.");
  if (!/^\d+(\.\d+)?$/.test(amount))
    throw new ApiError("Enter a positive amount, for example 100.00.");
  const [whole, rawFraction = ""] = amount.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  if (fraction.length > digits)
    throw new ApiError(
      `${currency} supports at most ${digits} decimal places.`,
    );
  const units =
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, "0") || "0");
  if (units <= 0n || units > 1000000n * 10n ** BigInt(digits))
    throw new ApiError(
      "Use an amount greater than 0 and at most 1,000,000 for this demo.",
    );
  return units;
}
export function normalizeIntent(intent: Intent): Intent {
  const currency = intent.currency.toUpperCase();
  const units = minorUnits(intent.amount.trim(), currency);
  const digits = currencies[currency];
  const text = units.toString().padStart(digits + 1, "0");
  const recipientReference = intent.recipientReference.trim();
  if (!recipientReference || recipientReference.length > 255)
    throw new ApiError("Recipient reference must contain 1–255 characters.");
  return {
    recipientReference,
    currency,
    provider: intent.provider,
    amount: digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text,
  };
}
// Formats a decimal string without converting it to a binary float. Text that is not a
// number, such as an amount that is still being typed, is shown as it is.
export function money(amount: string | number, currency: string) {
  const text = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return `${currency} ${text || "0"}`;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(text as `${number}`);
}
