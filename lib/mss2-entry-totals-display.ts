export function formatEntryTotal(raw: string) {
  // Round with integer arithmetic so large totals never lose token precision.
  const scale = BigInt("1000000000000");
  const rounded = (BigInt(raw) + scale / BigInt(2)) / scale;
  const whole = rounded / BigInt(1_000_000);
  const fraction = (rounded % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
