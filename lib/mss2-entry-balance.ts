export type Mss2EntryBalance = {
  sufficient: boolean;
  balanceRaw: string;
  requiredRaw: string;
  shortfallRaw: string;
  balanceDisplay: string;
  requiredDisplay: string;
  shortfallDisplay: string;
  network: string;
};

function displayAmount(raw: bigint, roundUp = false) {
  const precision = BigInt("1000000000000");
  const scale = BigInt(1_000_000);
  const units = (raw + (roundUp ? precision - BigInt(1) : BigInt(0))) / precision;
  const fraction = (units % scale).toString().padStart(6, "0").replace(/0+$/, "");
  return `${(units / scale).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export function assessMss2EntryBalance(balanceRaw: string, requiredRaw: string, network: string): Mss2EntryBalance {
  if (!/^\d+$/.test(balanceRaw) || !/^\d+$/.test(requiredRaw)) throw new Error("Invalid MSS2 balance or entry amount.");
  const balance = BigInt(balanceRaw);
  const required = BigInt(requiredRaw);
  const shortfall = required > balance ? required - balance : BigInt(0);
  return {
    sufficient: balance >= required, balanceRaw, requiredRaw, shortfallRaw: shortfall.toString(),
    balanceDisplay: displayAmount(balance), requiredDisplay: displayAmount(required, true), shortfallDisplay: displayAmount(shortfall, true), network,
  };
}
