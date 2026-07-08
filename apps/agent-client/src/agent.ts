import axios from "axios";
import { wrapAxiosWithPaymentFromConfig } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import chalk from "chalk";
import WebSocket from "ws";
import dotenv from "dotenv";
import path from "path";

// ── Config ─────────────────────────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const BOT_CHAIN_ID = process.env.BOT_CHAIN_ID || "901";
const PROVIDER_URL = process.env.PROVIDER_URL || "http://localhost:4402";
const WS_URL = PROVIDER_URL.replace(/^http/, "ws") + "/ws";

if (!PRIVATE_KEY) {
  console.error(chalk.red("❌ PRIVATE_KEY is not set in .env"));
  process.exit(1);
}

const NETWORK = `eip155:${BOT_CHAIN_ID}` as `${string}:${string}`;

// Ensure private key has 0x prefix for viem
const formattedPrivateKey = PRIVATE_KEY.startsWith("0x")
  ? (PRIVATE_KEY as `0x${string}`)
  : (`0x${PRIVATE_KEY}` as `0x${string}`);

// ── Setup Account & x402 Client ────────────────────────────────────
const account = privateKeyToAccount(formattedPrivateKey);

// We use viem for the x402 scheme, but we could use ethers for other on-chain interactions
const exactEvmScheme = new ExactEvmScheme(account);

const api = wrapAxiosWithPaymentFromConfig(axios.create({ baseURL: PROVIDER_URL }), {
  schemes: [
    {
      network: NETWORK,
      client: exactEvmScheme,
    },
  ],
});

// ── WebSocket Broadcaster ──────────────────────────────────────────
let ws: WebSocket;

function connectWebSocket() {
  ws = new WebSocket(WS_URL);
  
  ws.on("open", () => {
    broadcast({
      type: "AGENT_ONLINE",
      source: "agent",
      timestamp: new Date().toISOString(),
      data: {
        address: account.address,
        network: NETWORK,
        targetProvider: PROVIDER_URL,
      },
    });
  });

  ws.on("error", () => {
    // Silent fail if provider not up yet
  });
}

function broadcast(event: {
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
}) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

// ── Custom Axios Interceptor for Logging ───────────────────────────
// We add an interceptor BEFORE the x402 wrapper to log the 402 challenge
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 402) {
      console.log(chalk.yellow(`\n  ⚡ [Agent] Received 402 Payment Required`));
      console.log(chalk.gray(`     Provider requested payment. Auto-signing with x402...`));
      
      broadcast({
        type: "CHALLENGE_RECEIVED",
        source: "agent",
        timestamp: new Date().toISOString(),
        data: {
          endpoint: error.config?.url || "/api/market-data",
          status: 402,
        },
      });
      
      // We also want to simulate logging the payment signature.
      // The x402 interceptor handles this automatically, but we can emit a mock event 
      // just for the visualizer to show the signing step right after.
      setTimeout(() => {
        broadcast({
          type: "PAYMENT_SIGNED",
          source: "agent",
          timestamp: new Date().toISOString(),
          data: {
            method: "EIP-712",
            account: account.address,
          },
        });
        console.log(chalk.magenta(`  ✍️  [Agent] Cryptographically signed payment payload`));
      }, 300); // Slight delay for visual effect
    }
    return Promise.reject(error);
  }
);

// ── Runner Loop ────────────────────────────────────────────────────
async function runAgent() {
  console.log(chalk.blue.bold("═══════════════════════════════════════════════════════"));
  console.log(chalk.blue.bold("  SWARM BROKER — Agent Client"));
  console.log(chalk.blue.bold("═══════════════════════════════════════════════════════\n"));
  console.log(chalk.white(`  ▸ Agent Wallet:   ${account.address}`));
  console.log(chalk.white(`  ▸ Network:        ${NETWORK}`));
  console.log(chalk.white(`  ▸ Provider Node:  ${PROVIDER_URL}`));
  console.log(chalk.blue.bold("\n═══════════════════════════════════════════════════════\n"));

  connectWebSocket();

  const fetchInterval = 10000; // 10 seconds

  setInterval(async () => {
    console.log(chalk.cyan(`\n  [Agent] Attempting to fetch market data from provider...`));
    
    broadcast({
      type: "FETCH_ATTEMPT",
      source: "agent",
      timestamp: new Date().toISOString(),
      data: {
        endpoint: "/api/market-data",
      },
    });

    try {
      const response = await api.get("/api/market-data");
      
      console.log(chalk.green(`  ✓ [Agent] Successfully fetched data:`));
      
      const btc = response.data.markets["BTC/USD"];
      const eth = response.data.markets["ETH/USD"];
      const bot = response.data.markets["BOT/USD"];
      
      console.log(chalk.gray(`     BTC: $${btc.price} | ETH: $${eth.price} | BOT: $${bot.price}`));
      console.log(chalk.gray(`     Sentiment: ${response.data.sentiment.label} (Index: ${response.data.sentiment.fearGreedIndex})`));
      
    } catch (error: any) {
      console.log(chalk.red(`  ❌ [Agent] Fetch failed: ${error.message}`));
    }
  }, fetchInterval);
}

runAgent();
