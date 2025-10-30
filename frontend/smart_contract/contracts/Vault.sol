// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GIVEXVault
 * @dev ERC4626 Vault for AI-powered market making on Hedera
 * Users deposit HBAR tokens and receive vault shares representing their portion of the pool
 */
contract GIVEXVault is ERC4626, Ownable, ReentrancyGuard, Pausable {
    
    // ===== EVENTS =====
    event LiquidityAdded(address indexed user, uint256 assets, uint256 shares);
    event LiquidityRemoved(address indexed user, uint256 assets, uint256 shares);
    event LiquidityMoved(address indexed user, address indexed tradingWallet, uint256 amount);
    event ProfitsReturned(address indexed user, address indexed fromWallet, uint256 amount);
    event SpecificAmountReturned(address indexed user, address indexed fromWallet, uint256 amount);
    event LiquidityReturned(address indexed user, address indexed fromWallet, uint256 amount);
    event AllCapitalReturned(address indexed user, address indexed fromWallet, uint256 amount);
    event ProfitsDeposited(uint256 amount);
    event WithdrawalFeeSet(uint256 newFeeBps, uint256 oldFeeBps);
    event FeeRecipientSet(address indexed newRecipient, address indexed oldRecipient);
    event FeesWithdrawn(address indexed recipient, uint256 withdrawalFees);
    event ImpactPoolSet(address indexed newPool, address indexed oldPool);
    event ImpactPoolAllocation(address indexed user, uint256 profitAmount, uint256 allocationAmount);
  
    
    // ===== STATE VARIABLES =====
    
    /// @notice Mapping of authorized trading agents
    mapping(address => bool) public authorizedAgents;

    /// @notice Mapping of share's users
    mapping(address => uint256) public shareToUser;
    
    /// @notice Minimum deposit amount
    uint256 public minDeposit = 1e18; // 1 HBAR minimum

    /// @notice Maximum allocation percentage (basis points, 10000 = 100%)
    uint256 public maxAllocationBps = 9000; // 90% max allocation

    /// @notice Total assets allocated to agents for trading
    uint256 public totalAllocated;

    /// @notice Array to keep track of all authorized agents
    address[] public authorizedAgentsList;

    /// @notice Withdrawal fee (basis points, 10000 = 100%)
    uint256 public withdrawalFeeBps = 10; // 0.1% on withdrawal

    /// @notice Fee recipient address
    address public feeRecipient;

    /// @notice Accumulated withdrawal fees (remain in vault but excluded from share calculations)
    uint256 public accumulatedWithdrawalFees;

    /// @notice Impact pool address for profit allocation
    address public impactPool;

    /// @notice Track total amount deposited by each user (for accurate profit calculation)
    mapping(address => uint256) public userTotalDeposited;

    
    // ===== CONSTRUCTOR =====
    
    /**
     * @dev Constructor
     * @param _asset The underlying asset (HBAR token address)
     */
    constructor(
        IERC20 _asset
    ) 
        ERC4626(_asset) 
        ERC20("GIVEX Vault Shares", "GIVEX")
        Ownable(msg.sender)
    {
    }
    

    /**
     * @notice Override totalAssets to exclude accumulated fees from share price calculation
     * @return Total assets available to shareholders (excluding fees)
     */
    function totalAssets() public view override returns (uint256) {
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        // Exclude accumulated fees from share calculations
        return vaultBalance > accumulatedWithdrawalFees ? vaultBalance - accumulatedWithdrawalFees : 0;
    }

    /**
     * @notice Override previewRedeem to ensure complete withdrawal when vault becomes empty
     */
    function previewRedeem(uint256 shares) public view override returns (uint256) {
        // If this is the last withdrawal (user has all shares), return all assets
        if (shares == totalSupply()) {
            return totalAssets();
        }
        return super.previewRedeem(shares);
    }
    
    // ===== LIQUIDITY FUNCTIONS =====
    
    /**
     * @notice Add liquidity to the vault
     * @param assets Amount of HBAR tokens to deposit
     * @return shares Number of vault shares minted
     */
    function depositLiquidity(uint256 assets) 
        external 
        nonReentrant 
        whenNotPaused 
        returns (uint256 shares) 
    {
        
        require(assets >= minDeposit, "GIVEXVault: Below minimum deposit");
        require(assets > 0, "GIVEXVault: Cannot deposit zero");
        
        // Calculate shares to mint using ERC4626 logic
        shares = previewDeposit(assets);
        require(shares > 0, "GIVEXVault: Zero shares calculated");

        // Update shareToUser mapping
        shareToUser[msg.sender] += shares;  
        
        // Track total deposited amount for profit calculation
        userTotalDeposited[msg.sender] += assets;
        
        // Transfer assets from user to vault
        IERC20(asset()).transferFrom(msg.sender, address(this), assets);
        
        // Mint shares to user
        _mint(msg.sender, shares);
        
        emit LiquidityAdded(msg.sender, assets, shares);
        
        return shares;
    }
    
    /**
     * @notice Remove liquidity from the vault with withdrawal fee and optional impact pool allocation
     * @param impactAllocationBps Percentage of profits to allocate to impact pool (basis points, 0-10000)
     * @return assets Amount of tokens returned after withdrawal fee and impact allocation
     */
    function withdrawProfits(uint256 impactAllocationBps) 
        external 
        nonReentrant 
        whenNotPaused 
        returns (uint256 assets) 
    {
        require(impactAllocationBps <= 10000, "GIVEXVault: Impact allocation cannot exceed 100%");
        uint256 shares = shareToUser[msg.sender];
        require(shares > 0, "GIVEXVault: Cannot redeem zero shares");
        require(balanceOf(msg.sender) >= shares, "GIVEXVault: Insufficient shares");

        // Calculate gross assets to return using ERC4626 logic
        uint256 grossAssets = previewRedeem(shares);
        require(grossAssets > 0, "GIVEXVault: Zero assets calculated");

        // Calculate profits: current value - total deposited
        uint256 totalDeposited = userTotalDeposited[msg.sender];
        uint256 profitAmount = grossAssets > totalDeposited ? grossAssets - totalDeposited : 0;
        
        // Calculate impact pool allocation from profits only
        uint256 impactAllocation = 0;
        if (profitAmount > 0 && impactAllocationBps > 0 && impactPool != address(0)) {
            impactAllocation = (profitAmount * impactAllocationBps) / 10000;
        }

        // Calculate withdrawal fee on gross assets
        uint256 withdrawalFee = (grossAssets * withdrawalFeeBps) / 10000;
        
        // User receives: gross assets - withdrawal fee - impact allocation
        assets = grossAssets - withdrawalFee - impactAllocation;

        // Update user state first
        shareToUser[msg.sender] -= shares;
        
        // Reset user total deposited when fully withdrawing
        userTotalDeposited[msg.sender] = 0;
        
        // Burn shares from user
        _burn(msg.sender, shares);
        
        // Accumulate fees (they stay in vault but don't count for share price)
        if (withdrawalFee > 0) {
            accumulatedWithdrawalFees += withdrawalFee;
        }
        
        // Transfer impact allocation to impact pool if applicable
        if (impactAllocation > 0) {
            IERC20(asset()).transfer(impactPool, impactAllocation);
            emit ImpactPoolAllocation(msg.sender, profitAmount, impactAllocation);
        }
        
        // Transfer net assets to user
        IERC20(asset()).transfer(msg.sender, assets);
        
        emit LiquidityRemoved(msg.sender, assets, shares);
        
        return assets;
    }
    
    // ===== AGENT MANAGEMENT =====

    /**
     * @notice Move liquidity from vault to agent trading wallet
     * @param amount Amount to transfer to agent
     * @param tradingWallet Destination wallet for trading
     */
    function moveFromVaultToWallet(
        uint256 amount, 
        address tradingWallet
    ) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(authorizedAgents[msg.sender], "GIVEXVault: Agent not authorized");
        require(amount > 0, "GIVEXVault: Cannot move zero amount");
        require(tradingWallet != address(0), "GIVEXVault: Invalid trading wallet");
        
        // Check available liquidity (not already allocated, excluding fees)
        uint256 availableAssets = totalAssets() - totalAllocated;
        require(amount <= availableAssets, "GIVEXVault: Insufficient available liquidity");
        
        // Check allocation limits (90% max)
        uint256 newTotalAllocated = totalAllocated + amount;
        uint256 maxAllocation = (totalAssets() * maxAllocationBps) / 10000;
        require(newTotalAllocated <= maxAllocation, "GIVEXVault: Exceeds max allocation");
        
        // Update allocations
        totalAllocated += amount;
        
        // Transfer to trading wallet
        IERC20(asset()).transfer(tradingWallet, amount);
        
        emit LiquidityMoved(msg.sender, tradingWallet, amount);
    }

    /**
     * @notice Move funds from trading wallet back to vault
     * @param amount Amount to transfer back to vault
     * @param profitAmount Amount of profit (for tracking)
     * @param fromWallet Source wallet address
     */
    function moveFromWalletToVault(
        uint256 amount, 
        uint256 profitAmount,
        address fromWallet
    ) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        
        require(authorizedAgents[msg.sender], "GIVEXVault: Agent not authorized");
        require(amount > 0, "GIVEXVault: Cannot move zero amount");
        require(fromWallet != address(0), "GIVEXVault: Invalid source wallet");

        uint256 capitalReturned = amount - profitAmount; 
        
        // Transfer tokens from wallet to vault
        IERC20(asset()).transferFrom(fromWallet, address(this), amount);

        // Update allocations (reduce by capital returned)
        totalAllocated -= capitalReturned;
        
        emit SpecificAmountReturned(msg.sender, fromWallet, amount);
    }
    
    /**
     * @notice Return all allocated capital back to vault (end trading session)
     * @param fromWallet Source wallet address
     */
    function returnAllCapital(address fromWallet) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(authorizedAgents[msg.sender], "GIVEXVault: Agent not authorized");
        require(fromWallet != address(0), "GIVEXVault: Invalid source wallet");
        
        uint256 allocatedAmount = totalAllocated;
        
        // Check wallet balance
        uint256 walletBalance = IERC20(asset()).balanceOf(fromWallet);
        require(walletBalance >= allocatedAmount, "GIVEXVault: Insufficient balance in wallet");
        
        // Calculate profit/loss
        uint256 totalToReturn = walletBalance; // Return everything in wallet
        uint256 profitOrLoss = totalToReturn > allocatedAmount ? 
                              totalToReturn - allocatedAmount : 0;
        
        // Transfer all funds back
        IERC20(asset()).transferFrom(fromWallet, address(this), totalToReturn);
        
        // Reset agent allocation
        totalAllocated -= allocatedAmount;
        
        emit ProfitsReturned(msg.sender, fromWallet, profitOrLoss);
        emit LiquidityReturned(msg.sender, fromWallet, totalToReturn);
        emit AllCapitalReturned(msg.sender, fromWallet, totalToReturn);
        
        if (profitOrLoss > 0) {
            emit ProfitsDeposited(profitOrLoss);
        }
    }
    
    // ===== ADMIN FUNCTIONS =====
    
    /**
     * @notice Add authorized agent
     * @param agent Agent address to authorize
     */
    function addAuthorizedAgent(address agent) external onlyOwner {
        require(agent != address(0), "GIVEXVault: Invalid agent address");
        authorizedAgents[agent] = true;
        authorizedAgentsList.push(agent);
    }

    function removeAuthorizedAgent(address agent) external onlyOwner {
        uint256 index = type(uint256).max;
        for (uint256 i = 0; i < authorizedAgentsList.length; i++) {
            if (authorizedAgentsList[i] == agent) {
                index = i;
                break;
            }
        }
        
        require(index != type(uint256).max, "Not found");
        
        authorizedAgentsList[index] = authorizedAgentsList[authorizedAgentsList.length - 1];
        authorizedAgentsList.pop();
        authorizedAgents[agent] = false;
    }
    
    /**
     * @notice Set maximum allocation percentage
     * @param newMaxBps New maximum allocation in basis points
     */
    function setMaxAllocation(uint256 newMaxBps) external onlyOwner {
        require(newMaxBps <= 10000, "GIVEXVault: Cannot exceed 100%");
        maxAllocationBps = newMaxBps;
    }
    
    /**
     * @notice Set minimum deposit amount
     * @param newMinDeposit New minimum deposit amount
     */
    function setMinDeposit(uint256 newMinDeposit) external onlyOwner {
        minDeposit = newMinDeposit;
    }
    
    /**
     * @notice Emergency pause
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Set impact pool address
     * @param newImpactPool Address of the impact pool
     */
    function setImpactPool(address newImpactPool) external onlyOwner {
        require(newImpactPool != address(0), "GIVEXVault: Invalid impact pool address");
        address oldImpactPool = impactPool;
        impactPool = newImpactPool;
        emit ImpactPoolSet(newImpactPool, oldImpactPool);
    }

    /**
     * @notice Deposit liquidity directly to vault without creating shares (simulate profits)
     * @param amount Amount of tokens to deposit
     */
    function depositLiquidityWithoutShares(uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(authorizedAgents[msg.sender] || msg.sender == owner(), "GIVEXVault: Not authorized");
        require(amount > 0, "GIVEXVault: Cannot deposit zero");
        
        // Transfer tokens to vault without minting shares (increases share price)
        IERC20(asset()).transferFrom(msg.sender, address(this), amount);
        
        emit ProfitsDeposited(amount);
    }

    // ===== FEE MANAGEMENT =====

    /**
     * @notice Set withdrawal fee rate
     * @param newFeeBps New withdrawal fee in basis points (max 100 = 1%)
     */
    function setWithdrawalFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 100, "GIVEXVault: Withdrawal fee too high"); // Max 1%
        uint256 oldFeeBps = withdrawalFeeBps;
        withdrawalFeeBps = newFeeBps;
        emit WithdrawalFeeSet(newFeeBps, oldFeeBps);
    }

    /**
     * @notice Set fee recipient address
     * @param newRecipient Address to receive fees
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "GIVEXVault: Invalid fee recipient");
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientSet(newRecipient, oldRecipient);
    }


    /**
     * @notice Withdraw accumulated fees to fee recipient
     */
    function withdrawFees() external {
        require(
            msg.sender == feeRecipient || msg.sender == owner(), 
            "GIVEXVault: Not authorized to withdraw fees"
        );
        require(feeRecipient != address(0), "GIVEXVault: No fee recipient set");
        
        uint256 withdrawalFees = accumulatedWithdrawalFees;
        require(withdrawalFees > 0, "GIVEXVault: No fees to withdraw");
        
        // Reset accumulated fees
        accumulatedWithdrawalFees = 0;
        
        // Transfer fees
        IERC20(asset()).transfer(feeRecipient, withdrawalFees);
        
        emit FeesWithdrawn(feeRecipient, withdrawalFees);
    }
    
    // ===== VIEW FUNCTIONS =====
    
    /**
     * @notice Get available liquid assets (not allocated to agents, excluding fees)
     * @return Available assets amount
     */
    function getAvailableAssets() external view returns (uint256) {
        return totalAssets() - totalAllocated;
    }
    
    /**
     * @notice Calculate current share price
     * @return Price of 1 share in underlying assets (with 18 decimals)
     */
    function getSharePrice() external view returns (uint256) {
        if (totalSupply() == 0) return 1e18; // Initial price = 1:1
        return (totalAssets() * 1e18) / totalSupply();
    }
    
    /**
     * @notice Get all authorized agent addresses
     * @return Array of authorized agent addresses
     */
    function getAuthorizedAgents() external view returns (address[] memory) {
        return authorizedAgentsList;
    }

    /** 
     * @notice Get user's share of total assets
     * @param user User address
     * @return User's share in underlying assets
     */
    function getUserShareBalance(address user) external view returns (uint256) {
        return shareToUser[user];
    }

    /**
     * @notice Get balance of vault
     * @return Balance of vault
     */
    function getBalanceVault() external view returns (uint256) {
        return balanceOf(address(this));
    }

    /**
     * @notice Get balance of user
     * @param user User address
     * @return Balance of user
     */
    function getBalanceUser(address user) external view returns (uint256) {
        return balanceOf(user);
    }

    /**
     * @notice Get total accumulated withdrawal fees
     * @return Total withdrawal fees accumulated
     */
    function getTotalAccumulatedFees() external view returns (uint256) {
        return accumulatedWithdrawalFees;
    }

    /** 
     * @notice Get vault state for debugging
     * @return vaultBalance The vault's actual token balance
     * @return totalAssetsValue Total assets available to shareholders (excluding fees)
     * @return totalSupplyValue Total supply of vault shares
     * @return sharePrice Current price of 1 share
     * @return accumulatedFees Total accumulated withdrawal fees
     */
    function getVaultState() external view returns (
        uint256 vaultBalance,
        uint256 totalAssetsValue,
        uint256 totalSupplyValue,
        uint256 sharePrice,
        uint256 accumulatedFees
    ) {
        vaultBalance = IERC20(asset()).balanceOf(address(this));
        totalAssetsValue = totalAssets();
        totalSupplyValue = totalSupply();
        sharePrice = totalSupply() == 0 ? 1e18 : (totalAssets() * 1e18) / totalSupply();
        accumulatedFees = accumulatedWithdrawalFees;
    }

    /**
     * @notice Preview withdrawal fee for a given amount
     * @param assets Amount of assets to preview fee for
     * @return Fee amount that would be charged
     */
    function previewWithdrawalFee(uint256 assets) external view returns (uint256) {
        return (assets * withdrawalFeeBps) / 10000;
    }

    /**
     * @notice Calculate user's current profit amount
     * @param user User address
     * @return profitAmount Current profit in underlying assets
     */
    function getUserProfits(address user) external view returns (uint256 profitAmount) {
        uint256 shares = shareToUser[user];
        if (shares == 0) return 0;
        
        uint256 currentValue = (shares * totalAssets()) / totalSupply();
        uint256 totalDeposited = userTotalDeposited[user];
        
        if (currentValue > totalDeposited) {
            profitAmount = currentValue - totalDeposited;
        }
        
        return profitAmount;
    }

    /**
     * @notice Get user's total deposited amount
     * @param user User address
     * @return Total amount deposited by user
     */
    function getUserTotalDeposited(address user) external view returns (uint256) {
        return userTotalDeposited[user];
    }
}