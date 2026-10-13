export function formatEntryTotal(raw: string) {
  // Round with integer arithmetic so large totals never lose token precision.
  const scale = BigInt("1000000000000");
  const rounded = (BigInt(raw) + scale / BigInt(2)) / scale;
  const whole = rounded / BigInt(1_000_000);
  const fraction = (rounded % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export function formatEntryUsdValue(raw: string, priceUsd: string): string | null {
  if (!/^\d{1,1000}$/.test(raw) || !/^\d{1,36}(\.\d{1,36})?$/.test(priceUsd)) return null;
  const [whole, fraction = ""] = priceUsd.split(".");
  const price = BigInt(whole + fraction);
  if (price <= BigInt(0)) return null;
  // Multiply unrounded 18-decimal tokens by the exact decimal price before rounding cents.
  const value = BigInt(raw) * price;
  const dollarScale = BigInt(10) ** BigInt(18 + fraction.length);
  if (value > BigInt(0) && value * BigInt(100) < dollarScale) return "<$0.01";
  const cents = (value * BigInt(100) + dollarScale / BigInt(2)) / dollarScale;
  return `$${(cents / BigInt(100)).toLocaleString("en-US")}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}
