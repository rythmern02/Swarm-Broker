import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "path";

// Load .env from monorepo root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const BOT_CHAIN_RPC_URL = process.env.BOT_CHAIN_RPC_URL || "";
const BOT_CHAIN_ID = parseInt(process.env.BOT_CHAIN_ID || "901", 10);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    botchainTestnet: {
      url: BOT_CHAIN_RPC_URL,
      chainId: BOT_CHAIN_ID,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
  },
  paths: {
    sources: "./contracts",
    scripts: "./scripts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
