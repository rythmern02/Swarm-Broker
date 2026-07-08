import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SWARM BROKER — Contract Deployment");
  console.log("═══════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`  Network:   ${network.name} (chainId: ${network.chainId})`);
  console.log(`  Deployer:  ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:   ${ethers.formatEther(balance)} ETH\n`);

  // ── Deploy MockUSDC ──────────────────────────────────────────────
  console.log("  [1/2] Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy(deployer.address);
  await mockUSDC.waitForDeployment();

  const usdcAddress = await mockUSDC.getAddress();
  console.log(`  ✓ MockUSDC deployed at: ${usdcAddress}\n`);

  // ── Verify initial supply ────────────────────────────────────────
  const totalSupply = await mockUSDC.totalSupply();
  const decimals = await mockUSDC.decimals();
  console.log(
    `  Total Supply: ${ethers.formatUnits(totalSupply, decimals)} USDC`
  );

  // ── Fund agent wallet if configured ──────────────────────────────
  const agentWallet = process.env.AGENT_WALLET;
  if (agentWallet) {
    console.log(`\n  [2/2] Funding agent wallet: ${agentWallet}`);
    const fundAmount = ethers.parseUnits("10000", decimals); // 10,000 USDC
    const tx = await mockUSDC.mint(agentWallet, fundAmount);
    await tx.wait();
    console.log(
      `  ✓ Minted ${ethers.formatUnits(fundAmount, decimals)} USDC to agent`
    );
  } else {
    console.log(
      "  [2/2] Skipped — set AGENT_WALLET in .env to auto-fund agent"
    );
  }

  // ── Write deployment manifest ────────────────────────────────────
  const manifest = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: {
      MockUSDC: {
        address: usdcAddress,
        decimals: Number(decimals),
      },
    },
    deployedAt: new Date().toISOString(),
  };

  const manifestDir = path.resolve(__dirname, "../../..");
  const manifestPath = path.join(manifestDir, "deployment.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n  ✓ Manifest written to: deployment.json`);

  // ── Also write ABI for other apps ────────────────────────────────
  const abiDir = path.resolve(__dirname, "../artifacts/contracts/MockUSDC.sol");
  if (fs.existsSync(path.join(abiDir, "MockUSDC.json"))) {
    const artifact = JSON.parse(
      fs.readFileSync(path.join(abiDir, "MockUSDC.json"), "utf-8")
    );
    const sharedAbiDir = path.join(manifestDir, "shared");
    if (!fs.existsSync(sharedAbiDir)) {
      fs.mkdirSync(sharedAbiDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(sharedAbiDir, "MockUSDC.json"),
      JSON.stringify(
        { address: usdcAddress, abi: artifact.abi, decimals: Number(decimals) },
        null,
        2
      )
    );
    console.log("  ✓ ABI exported to: shared/MockUSDC.json");
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ✅ Deployment complete!");
  console.log("═══════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n  ❌ Deployment failed:", error);
    process.exit(1);
  });
