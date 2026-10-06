import { getAddress, keccak256 } from "ethers";
import artifact from "../../../deployment/mss2-entry-router/Mss2EntryRouter.artifact.json";

const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const EXPECTED_DEPLOYER = "0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7";

type RpcResponse<T> = { result?: T; error?: { message?: string } };
type Transaction = { from?: string; to?: string | null; input?: string; value?: string };
type Receipt = { status?: string; contractAddress?: string | null; blockNumber?: string };

async function rpc<T>(method: string, params: unknown[]) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`);
  const payload = await response.json() as RpcResponse<T>;
  if (payload.error) throw new Error(payload.error.message || `${method} failed`);
  return payload.result;
}

export async function GET(request: Request) {
  const txHash = new URL(request.url).searchParams.get("txHash") || "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return Response.json({ error: "A valid deployment transaction hash is required." }, { status: 400 });
  }

  try {
    const [transaction, receipt] = await Promise.all([
      rpc<Transaction | null>("eth_getTransactionByHash", [txHash]),
      rpc<Receipt | null>("eth_getTransactionReceipt", [txHash]),
    ]);
    if (!transaction) return Response.json({ state: "pending", message: "Waiting for the transaction to reach Robinhood Chain." });
    if (getAddress(transaction.from || "") !== getAddress(EXPECTED_DEPLOYER)) throw new Error("The deployment sender did not match the approved wallet.");
    if (transaction.to !== null) throw new Error("The transaction was not a contract creation.");
    if ((transaction.input || "").toLowerCase() !== artifact.bytecode.toLowerCase()) throw new Error("The deployment bytecode did not match the reviewed artifact.");
    if (BigInt(transaction.value || "0x0") !== BigInt(0)) throw new Error("The deployment transaction included an unexpected native value.");
    if (!receipt) return Response.json({ state: "pending", message: "Transaction submitted. Waiting for its receipt." });
    if (receipt.status !== "0x1") throw new Error("The deployment transaction failed on-chain.");
    if (!receipt.contractAddress) throw new Error("The successful receipt did not contain a contract address.");

    const contractAddress = getAddress(receipt.contractAddress);
    const code = await rpc<string>("eth_getCode", [contractAddress, "latest"]);
    if (!code || code === "0x") return Response.json({ state: "pending", message: "Receipt confirmed. Waiting for deployed bytecode." });
    const runtimeCodeHash = keccak256(code);
    if (runtimeCodeHash !== artifact.runtimeCodeHash) throw new Error("The deployed runtime bytecode did not match the reviewed router.");

    return Response.json({
      state: "verified",
      network: "Robinhood Chain",
      chainId: 4663,
      txHash,
      contractAddress,
      blockNumber: receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : null,
      runtimeCodeHash,
      explorerUrl: `https://robinhoodchain.blockscout.com/address/${contractAddress}`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Deployment verification failed." }, { status: 422 });
  }
}
