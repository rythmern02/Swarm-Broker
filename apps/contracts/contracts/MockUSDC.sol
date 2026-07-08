// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice A mock USDC token for the BOT Chain testnet.
 *         Used as the settlement currency for x402 micropayments.
 * @dev    6 decimals to match real USDC. Includes ERC20Permit for
 *         gasless approve flows required by the x402 payment protocol.
 */
contract MockUSDC is ERC20, ERC20Burnable, ERC20Permit, Ownable {
    uint8 private constant _DECIMALS = 6;

    /// @notice Maximum faucet drip per call: 1,000 USDC
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** _DECIMALS;

    /// @notice Cooldown between faucet claims per address
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    /// @dev Tracks last faucet claim timestamp per address
    mapping(address => uint256) public lastFaucetClaim;

    event FaucetDrip(address indexed recipient, uint256 amount);

    constructor(
        address initialOwner
    ) ERC20("Mock USDC", "USDC") ERC20Permit("Mock USDC") Ownable(initialOwner) {
        // Mint 1,000,000 USDC to the deployer for initial liquidity
        _mint(initialOwner, 1_000_000 * 10 ** _DECIMALS);
    }

    /**
     * @notice Returns 6 decimals to match real USDC.
     */
    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /**
     * @notice Owner-only mint for provisioning agent wallets.
     * @param to     Recipient address
     * @param amount Amount in smallest unit (6 decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Public faucet for testnet. Claims 1,000 USDC with a 1-hour cooldown.
     */
    function faucet() external {
        require(
            block.timestamp >= lastFaucetClaim[msg.sender] + FAUCET_COOLDOWN,
            "MockUSDC: faucet cooldown active"
        );

        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);

        emit FaucetDrip(msg.sender, FAUCET_AMOUNT);
    }
}
