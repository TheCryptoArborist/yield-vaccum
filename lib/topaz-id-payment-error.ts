// Only a mined, definitively reverted operation may clear a submitted payment.
// Timeouts, network errors, and unmatched receipts must retain it for recheck.
export class TopazIdPaymentFailedError extends Error {
  constructor() {
    super("The Topaz ID payment reverted. No flight was authorized. Refresh your balance or quote to retry; network gas fees may still apply.");
    this.name = "TopazIdPaymentFailedError";
  }
}
