export const MINT_FLYER_PLAYER_KEY = "yield-vacuum-mint-flyer-player";

export function ensureMintFlyerPlayerKey() {
  const existing = window.localStorage.getItem(MINT_FLYER_PLAYER_KEY);
  if (existing && /^[a-zA-Z0-9-]{16,80}$/.test(existing)) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(MINT_FLYER_PLAYER_KEY, created);
  return created;
}
