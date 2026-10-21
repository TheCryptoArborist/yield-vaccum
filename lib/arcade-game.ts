export type ArcadeGame = "mint-flyer" | "mint-invaders" | "mint-stack";
export function arcadeGame(value: unknown): ArcadeGame {
  if (value === undefined || value === "mint-flyer") return "mint-flyer";
  if (value === "mint-invaders" || value === "mint-stack") return value;
  throw new Error("Choose a supported arcade game.");
}
export function assertPaymentGame(quote: { game?: ArcadeGame }, expected: ArcadeGame = "mint-flyer") {
  if ((quote.game ?? "mint-flyer") !== expected) throw new Error("This entry payment belongs to a different arcade game.");
}
