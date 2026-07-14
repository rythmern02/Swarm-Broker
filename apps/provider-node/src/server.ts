import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

// ── Config ─────────────────────────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const PORT = parseInt(process.env.PROVIDER_PORT || "4402", 10);
const PROVIDER_WALLET = process.env.PROVIDER_WALLET_ADDRESS || "";
const BOT_CHAIN_ID = process.env.BOT_CHAIN_ID || "901";
const MOCK_USDC_ADDRESS = process.env.MOCK_USDC_ADDRESS || "";
const FACILITATOR_URL =
  process.env.FACILITATOR_URL || "https://facilitator.x402.org";

const NETWORK = `eip155:${BOT_CHAIN_ID}` as `${string}:${string}`;
const PRICE = "0.01"; // 0.01 USDC per request

// ── Express App ────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: "*",
    exposedHeaders: ["X-PAYMENT", "X-PAYMENT-RESPONSE"],
  })
);
app.use(express.json());

// ── WebSocket for frontend event broadcasting ──────────────────────
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`  [WS] Client connected (${clients.size} total)`);

  ws.on("message", (data) => {
    // Relay messages (like Agent events) to all other connected clients (Frontend)
    for (const client of clients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`  [WS] Client disconnected (${clients.size} total)`);
  });
});

function broadcast(event: {
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
}) {
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// ── x402 Payment Middleware ────────────────────────────────────────
const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
});

// Hackathon Patch: The public x402 facilitator doesn't know about BOT Chain Testnet (968).
// We intercept the facilitator calls to simulate a successful payment verification locally.
facilitatorClient.getSupported = async () => ({
  kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK as any }],
  extensions: [],
  signers: {}
});
facilitatorClient.verify = async (req: any) => {
  const account = req?.paymentPayload?.account || req?.account || "0xAgentWallet";
  console.log(`  [Facilitator Mock] Verified EIP-712 signature from ${account}`);
  return { isValid: true, payer: account };
};
facilitatorClient.settle = async (req: any) => {
  const account = req?.paymentPayload?.account || req?.account || "0xAgentWallet";
  console.log(`  [Facilitator Mock] Settled 0.01 USDC from ${account}`);
  return { success: true, transaction: "0xMockSettlementHash", network: NETWORK as any };
};

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  new ExactEvmScheme()
);

const routes = {
  "GET /api/market-data": {
    accepts: {
      scheme: "exact" as const,
      price: MOCK_USDC_ADDRESS ? { amount: "10000", asset: MOCK_USDC_ADDRESS } : PRICE,
      network: NETWORK,
      payTo: PROVIDER_WALLET,
      extra: { name: "Mock USDC", version: "1" },
    },
    description: "Real-time financial market data feed — AI agent endpoint",
  },
};

app.use(paymentMiddleware(routes, resourceServer));

// ── Market Data Generator ──────────────────────────────────────────
function generateMarketData() {
  const now = new Date();
  const basePrice = 67000 + Math.sin(now.getTime() / 60000) * 2000;
  const ethPrice = 3800 + Math.cos(now.getTime() / 45000) * 200;

  return {
    timestamp: now.toISOString(),
    source: "swarm-broker-depin-node",
    markets: {
      "BTC/USD": {
        price: parseFloat(basePrice.toFixed(2)),
        change24h: parseFloat((Math.random() * 6 - 3).toFixed(2)),
        volume24h: parseFloat((Math.random() * 50 + 20).toFixed(2)) * 1e9,
        high24h: parseFloat((basePrice * 1.03).toFixed(2)),
        low24h: parseFloat((basePrice * 0.97).toFixed(2)),
      },
      "ETH/USD": {
        price: parseFloat(ethPrice.toFixed(2)),
        change24h: parseFloat((Math.random() * 8 - 4).toFixed(2)),
        volume24h: parseFloat((Math.random() * 20 + 8).toFixed(2)) * 1e9,
        high24h: parseFloat((ethPrice * 1.04).toFixed(2)),
        low24h: parseFloat((ethPrice * 0.96).toFixed(2)),
      },
      "BOT/USD": {
        price: parseFloat((2.5 + Math.random() * 0.5).toFixed(4)),
        change24h: parseFloat((Math.random() * 15 - 5).toFixed(2)),
        volume24h: parseFloat((Math.random() * 5 + 1).toFixed(2)) * 1e6,
        high24h: parseFloat((3.1).toFixed(4)),
        low24h: parseFloat((2.3).toFixed(4)),
      },
    },
    sentiment: {
      fearGreedIndex: Math.floor(Math.random() * 40 + 40),
      label:
        Math.random() > 0.5
          ? "Greed"
          : Math.random() > 0.3
            ? "Neutral"
            : "Fear",
    },
    meta: {
      nodeId: "depin-swarm-provider-01",
      chainId: parseInt(BOT_CHAIN_ID),
      paymentScheme: "x402-exact",
      costPerRequest: `${PRICE} USDC`,
    },
  };
}

// ── Protected Endpoint ─────────────────────────────────────────────
app.get("/api/market-data", (req, res) => {
  const data = generateMarketData();

  // Broadcast successful data fetch to frontend
  broadcast({
    type: "DATA_SERVED",
    source: "provider",
    timestamp: new Date().toISOString(),
    data: {
      endpoint: "/api/market-data",
      paymentReceived: true,
      costUSDC: PRICE,
      markets: Object.keys(data.markets),
      paidBy: req.headers["x-payment"] ? "agent" : "unknown",
    },
  });

  console.log(
    `  ✓ [${new Date().toISOString()}] Market data served — payment verified`
  );
  res.json(data);
});

// ── Health / Info Endpoints (unprotected) ──────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "operational",
    node: "swarm-broker-provider",
    network: NETWORK,
    uptime: process.uptime(),
    protectedEndpoints: [
      {
        path: "/api/market-data",
        method: "GET",
        price: `${PRICE} USDC`,
        scheme: "x402-exact",
      },
    ],
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    network: NETWORK,
    chainId: parseInt(BOT_CHAIN_ID),
    providerWallet: PROVIDER_WALLET,
    usdcContract: MOCK_USDC_ADDRESS,
    facilitator: FACILITATOR_URL,
    pricing: {
      "/api/market-data": { price: PRICE, currency: "USDC", scheme: "exact" },
    },
  });
});

// ── Agent Control Endpoints ─────────────────────────────────────────
let agentProcess: ChildProcess | null = null;

app.get("/api/agent/status", (_req, res) => {
  res.json({ running: agentProcess !== null });
});

app.post("/api/agent/start", (req, res) => {
  if (agentProcess) {
    return res.status(400).json({ error: "Agent is already running" });
  }

  const agentPath = path.resolve(__dirname, "../../agent-client/src/agent.ts");
  const agentCwd = path.resolve(__dirname, "../../agent-client");

  agentProcess = spawn("npx", ["ts-node", agentPath], {
    cwd: agentCwd,
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  agentProcess.stdout?.on("data", (data) => console.log(`[Agent] ${data}`));
  agentProcess.stderr?.on("data", (data) => console.error(`[Agent] ${data}`));

  agentProcess.on("close", () => {
    agentProcess = null;
    broadcast({
      type: "AGENT_OFFLINE",
      source: "system",
      timestamp: new Date().toISOString(),
      data: { message: "Agent process stopped" },
    });
  });

  res.json({ success: true, status: "started" });
});

app.post("/api/agent/stop", (req, res) => {
  if (!agentProcess) {
    return res.status(400).json({ error: "Agent is not running" });
  }
  
  agentProcess.kill("SIGKILL");
  agentProcess = null;
  res.json({ success: true, status: "stopped" });
});

// ── Start Server ───────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SWARM BROKER — Provider Node (DePIN)");
  console.log("═══════════════════════════════════════════════════════\n");
  console.log(`  ▸ HTTP Server:    http://localhost:${PORT}`);
  console.log(`  ▸ WebSocket:      ws://localhost:${PORT}/ws`);
  console.log(`  ▸ Network:        ${NETWORK}`);
  console.log(`  ▸ Provider Wallet: ${PROVIDER_WALLET || "(not set)"}`);
  console.log(`  ▸ MockUSDC:       ${MOCK_USDC_ADDRESS || "(not set)"}`);
  console.log(`  ▸ Facilitator:    ${FACILITATOR_URL}`);
  console.log(`\n  Protected Endpoints:`);
  console.log(`  ▸ GET /api/market-data — ${PRICE} USDC per request`);
  console.log(`\n  Public Endpoints:`);
  console.log(`  ▸ GET /api/health`);
  console.log(`  ▸ GET /api/config`);
  console.log("\n═══════════════════════════════════════════════════════\n");

  broadcast({
    type: "PROVIDER_ONLINE",
    source: "provider",
    timestamp: new Date().toISOString(),
    data: {
      network: NETWORK,
      port: PORT,
      endpoints: ["/api/market-data"],
    },
  });
});

export { app, server, broadcast };
