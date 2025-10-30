// src/readTools.ts - Comprehensive Trading Tools
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import GIVEXMMClient from "../../client/hyper-fillmm-client";
import { MarketManager } from "../../services/market-manager";
import { config } from "../../services/config";
import { getMidPriceGate } from "../../client/price-oracle-client";
import { MarketMakerBotClient } from "../../client/givex-mm-bot-client";
import * as dotenv from 'dotenv'
dotenv.config()

// Schema definitions for read tool inputs
const marketSelectionSchema = z.object({
    marketName: z.string().describe("Name of the market (e.g., 'givex')")
});

const getOrderSchema = z.object({
    marketName: z.string().describe("Name of the market"),
    orderId: z.string().describe("Order ID to retrieve")
});

const getOrderBookSchema = z.object({
    marketName: z.string().describe("Name of the market"),
    symbol: z.string().describe("Trading pair symbol (e.g., 'HBAR_USDT')")
});

const getBestOrderSchema = z.object({
    marketName: z.string().describe("Name of the market"),
    baseAsset: z.string().describe("Base asset (e.g., 'HBAR')"),
    quoteAsset: z.string().describe("Quote asset (e.g., 'USDT')"),
    side: z.enum(['bid', 'ask']).describe("Order side - 'bid' for buy orders, 'ask' for sell orders")
});

const checkFundsSchema = z.object({
    marketName: z.string().describe("Name of the market"),
    asset: z.string().describe("Asset to check funds for (e.g., 'HBAR', 'USDT')")
});

const moveAssetAmountSchema = z.object({
    assetAmountToMove: z.string().describe("Asset amount to move from vault"),
});

const botConfigSchema = z.object({
    baseAsset: z.string().describe("Base asset symbol (e.g., HBAR)"),
    quoteAsset: z.string().describe("Quote asset symbol (e.g., USDT)"),
    quantity: z.number().describe("Order quantity"),
    side: z.enum(["bid", "ask"]).describe("Order side - bid or ask"),
    spreadPercentage: z.number().optional().describe("Spread percentage (default 0.5%)"),
    referencePrice: z.number().optional().describe("Manual reference price override"),
});

const botModifySchema = z.object({
    spreadPercentage: z.number().optional().describe("New spread percentage"),
    quantity: z.number().optional().describe("New order quantity"),
    referencePrice: z.number().optional().describe("New reference price"),
});

const fetchOraclePriceSchema = z.object({
    base: z.string().describe("This is the base currency of the asset pair"),
    quote: z.string().describe("this is the quote currency of the asset pair")
});

// Contract ABIs
const givexOrderBookAbi = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "internalType": "address", "name": "tradingWallet", "type": "address" }
        ],
        "name": "moveFromVaultToWallet",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "internalType": "uint256", "name": "profitAmount", "type": "uint256" },
            { "internalType": "address", "name": "fromWallet", "type": "address" }
        ],
        "name": "moveFromWalletToVault",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

const givexAbi = [
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

// Minimal read ABI for Vault balance queries
const vaultReadAbi = [
    {
        "inputs": [],
        "name": "getBalanceVault",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getAvailableAssets",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
];

export function registerTools(server: McpServer, marketManager: MarketManager, hederaClientFactory: () => Promise<Client>) {

    // Initialize bot client (normalize 0.0.0.0 -> localhost and fix URL scheme)
    const RAW_BOT_URL = process.env.BOT_MARKET_MAKER_API || "http://localhost:8000";
    const BOT_BASE_URL = RAW_BOT_URL.replace('0.0.0.0', 'localhost');
    const botClient = new MarketMakerBotClient(BOT_BASE_URL);

    // Helper function to get market client
    const getMarketClient = (marketName: string): GIVEXMMClient | null => {
        const client = marketManager.getMarketClient(marketName);
        if (!client) {
            throw new Error(`Market '${marketName}' not found or not supported`);
        }
        return client;
    };

    // ===== MARKET MANAGEMENT =====
    server.registerTool(
        "get_supported_markets",
        {
            title: "Get Supported Markets",
            description: "Get list of all supported markets",
        },
        async () => {
            try {
                const markets = marketManager.getMarketList();
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(markets, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error fetching supported markets: ${err.message}`
                    }]
                };
            }
        }
    );

    // ===== ORDER MANAGEMENT (READ) =====
    server.registerTool(
        "get_order",
        {
            title: "Get Order Details",
            description: "Retrieve details of a specific order by ID",
            inputSchema: getOrderSchema.shape,
        },
        async ({ marketName, orderId }) => {
            try {
                const client = getMarketClient(marketName);
                const result = await client!.getOrder(orderId);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error fetching order ${orderId} from ${marketName}: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "get_orderbook",
        {
            title: "Get Order Book",
            description: "Retrieve the order book for a trading pair",
            inputSchema: getOrderBookSchema.shape,
        },
        async ({ marketName, symbol }) => {
            try {
                const client = getMarketClient(marketName);
                const result = await client!.getOrderBook(symbol);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error fetching orderbook for ${symbol} from ${marketName}: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "get_best_order",
        {
            title: "Get Best Order",
            description: "Get the best bid or ask order for a trading pair",
            inputSchema: getBestOrderSchema.shape,
        },
        async ({ marketName, baseAsset, quoteAsset, side }) => {
            try {
                const client = getMarketClient(marketName);
                const result = await client!.getBestOrder(baseAsset, quoteAsset, side);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error fetching best ${side} for ${baseAsset}/${quoteAsset} from ${marketName}: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "get_best_bid",
        {
            title: "Get Best Bid",
            description: "Get the best bid (buy) order for a trading pair",
            inputSchema: z.object({
                marketName: z.string().describe("Name of the market"),
                baseAsset: z.string().describe("Base asset (e.g., 'HBAR')"),
                quoteAsset: z.string().describe("Quote asset (e.g., 'USDT')")
            }).shape,
        },
        async ({ marketName, baseAsset, quoteAsset }) => {
            try {
                const client = getMarketClient(marketName);
                const result = await client!.getBestBid(baseAsset, quoteAsset);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error fetching best bid for ${baseAsset}/${quoteAsset} from ${marketName}: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "get_best_ask",
        {
            title: "Get Best Ask",
            description: "Get the best ask (sell) order for a trading pair",
            inputSchema: z.object({
                marketName: z.string().describe("Name of the market"),
                baseAsset: z.string().describe("Base asset (e.g., 'HBAR')"),
                quoteAsset: z.string().describe("Quote asset (e.g., 'USDT')")
            }).shape,
        },
        async ({ marketName, baseAsset, quoteAsset }) => {
            try {
                const client = getMarketClient(marketName);
                const result = await client!.getBestAsk(baseAsset, quoteAsset);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error fetching best ask for ${baseAsset}/${quoteAsset} from ${marketName}: ${err.message}`
                    }]
                };
            }
        }
    );

    // ===== FUNDS MANAGEMENT (READ) =====
    server.registerTool(
        "check_available_funds",
        {
            title: "Check Available Funds",
            description: "Check locked/available funds for a specific asset",
            inputSchema: checkFundsSchema.shape,
        },
        async ({ marketName, asset }) => {
            try {
                const client = getMarketClient(marketName);
                const result = await client!.checkAvailableFunds(asset);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error checking funds for ${asset} in ${marketName}: ${err.message}`
                    }]
                };
            }
        }
    );

    // ===== ASSET MANAGEMENT TOOLS =====
    server.registerTool(
        "move_assets_from_vault_to_wallet",
        {
            title: "Move to Agent Wallet",
            description: "Move a particular asset amount from vault to agent wallet",
            inputSchema: moveAssetAmountSchema.shape,
        },
        async ({ assetAmountToMove }) => {
            try {
                const client = await hederaClientFactory();
                const result = await client.callTool({
                    name: "write_contract",
                    arguments: {
                        contractAddress: config.vaultContractAddress,
                        abi: givexOrderBookAbi,
                        functionName: "moveFromVaultToWallet",
                        args: [assetAmountToMove, config.agentWallet],
                        network: config.network,
                    }
                });
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error moving assets from vault: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "move_assets_from_wallet_to_vault",
        {
            title: "Move to Vault",
            description: "Move a particular asset amount from agent wallet to vault",
            inputSchema: moveAssetAmountSchema.shape,
        },
        async ({ assetAmountToMove }) => {
            try {
                console.log("CALLED", "READ BALANCE")

                const client = await hederaClientFactory();
                const result = await client.callTool({
                    name: "write_contract",
                    arguments: {
                        contractAddress: config.vaultContractAddress,
                        abi: givexOrderBookAbi,
                        functionName: "moveFromWalletToVault",
                        args: [assetAmountToMove, "0", config.agentWallet],
                        network: config.network,
                    }
                });
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error moving assets to vault: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "fetch_vault_asset_balance",
        {
            title: "Vault Balance",
            description: "Fetches Vault Available Balance",
        },
        async () => {
            try {
                const client = await hederaClientFactory();
                const [balanceRes, availableRes] = await Promise.all([
                    client.callTool({
                        name: "read_contract",
                        arguments: {
                            contractAddress: config.vaultContractAddress,
                            abi: vaultReadAbi,
                            functionName: "getBalanceVault",
                            args: [],
                            network: config.network,
                        }
                    }),
                    client.callTool({
                        name: "read_contract",
                        arguments: {
                            contractAddress: config.vaultContractAddress,
                            abi: vaultReadAbi,
                            functionName: "getAvailableAssets",
                            args: [],
                            network: config.network,
                        }
                    })
                ]);

                const payload = {
                    balanceVault: balanceRes,
                    availableAssets: availableRes
                };
                return {
                    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error fetching vault balance: ${err.message}`
                    }]
                };
            }
        }
    );

    // ===== MARKET MAKER BOT CONTROL TOOLS =====
    server.registerTool(
        "start_market_maker_bot",
        {
            title: "Start Market Maker Bot",
            description: "Start the market maker bot with specified configuration",
            inputSchema: botConfigSchema.shape,
        },
        async ({ baseAsset, quoteAsset, quantity, side, spreadPercentage = 0.5, referencePrice }) => {
            console.log("BOT BUSINESS", baseAsset, quoteAsset, quantity, side, spreadPercentage)
            try {
                const result = await botClient.startBot(
                    config.agentWallet,
                    baseAsset,
                    quoteAsset,
                    config.agentPrivateKey,
                    quantity,
                    side,
                    "limit",
                    spreadPercentage,
                    referencePrice
                );

                return {
                    content: [{
                        type: "text",
                        text: `Market maker bot started successfully:\n${JSON.stringify(result, null, 2)}`
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error starting market maker bot: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "stop_market_maker_bot",
        {
            title: "Stop Market Maker Bot",
            description: "Stop the running market maker bot and cancel all orders",
        },
        async () => {
            try {
                const result = await botClient.stopBot();
                return {
                    content: [{
                        type: "text",
                        text: `Market maker bot stopped successfully:\n${JSON.stringify(result, null, 2)}`
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error stopping market maker bot: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "get_market_maker_bot_status",
        {
            title: "Get Bot Status",
            description: "Get the current status and configuration of the market maker bot",
        },
        async () => {
            try {
                const result = await botClient.getStatus();
                return {
                    content: [{
                        type: "text",
                        text: `Market maker bot status:\n${JSON.stringify(result, null, 2)}`
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error getting bot status: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "modify_market_maker_bot_config",
        {
            title: "Modify Bot Configuration",
            description: "Modify the running bot's configuration (spread, quantity, reference price)",
            inputSchema: botModifySchema.shape,
        },
        async ({ spreadPercentage, quantity, referencePrice }) => {
            try {
                const result = await botClient.modifyConfig(
                    config.agentWallet,
                    "HBAR", // You might want to make these configurable
                    "USDT",
                    "bid", // You might want to track current side
                    "limit",
                    config.agentPrivateKey,
                    spreadPercentage,
                    quantity,
                    referencePrice
                );

                return {
                    content: [{
                        type: "text",
                        text: `Bot configuration modified successfully:\n${JSON.stringify(result, null, 2)}`
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error modifying bot configuration: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "force_register_orders",
        {
            title: "Force Register Orders",
            description: "Force the bot to register/update orders immediately",
        },
        async () => {
            try {
                const result = await botClient.registerOrders(
                    config.agentWallet,
                    "HBAR", // You might want to make these configurable
                    "USDT",
                    config.agentPrivateKey,
                    "bid", // You might want to track current side
                    "limit"
                );

                return {
                    content: [{
                        type: "text",
                        text: `Orders registered successfully:\n${JSON.stringify(result, null, 2)}`
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error registering orders: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "cancel_all_bot_orders",
        {
            title: "Cancel All Orders",
            description: "Cancel all current bot orders without stopping the bot",
        },
        async () => {
            try {
                const result = await botClient.cancelOrders(
                    config.agentWallet,
                    "HBAR", // You might want to make these configurable
                    "USDT",
                    config.agentPrivateKey,
                    "bid", // You might want to track current side
                    "limit"
                );

                return {
                    content: [{
                        type: "text",
                        text: `All orders cancelled successfully:\n${JSON.stringify(result, null, 2)}`
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error cancelling orders: ${err.message}`
                    }]
                };
            }
        }
    );

    // ===== MARKET OVERVIEW HELPER =====
    server.registerTool(
        "get_market_overview",
        {
            title: "Get Market Overview",
            description: "Get comprehensive market data including orderbook, best orders, and locked funds for a trading pair",
            inputSchema: z.object({
                marketName: z.string().describe("Name of the market"),
                baseAsset: z.string().describe("Base asset (e.g., 'HBAR')"),
                quoteAsset: z.string().describe("Quote asset (e.g., 'USDT')")
            }).shape,
        },
        async ({ marketName, baseAsset, quoteAsset }) => {
            try {
                const client = getMarketClient(marketName);
                const result = await client!.getMarketOverview(baseAsset, quoteAsset);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error fetching market overview for ${baseAsset}/${quoteAsset} from ${marketName}: ${err.message}`
                    }]
                };
            }
        }
    );

    // ===== SETTLEMENT HEALTH =====
    server.registerTool(
        "get_settlement_health",
        {
            title: "Get Settlement Health",
            description: "Check the health status of the settlement system",
            inputSchema: marketSelectionSchema.shape,
        },
        async ({ marketName }) => {
            try {
                const client = getMarketClient(marketName);
                const result = await client!.getSettlementHealth();
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error checking settlement health for ${marketName}: ${err.message}`
                    }]
                };
            }
        }
    );

    // ===== ORACLE AND PRICE TOOLS =====
    server.registerTool(
        "fetch_oracle_price",
        {
            title: "Fetch Oracle Price",
            description: "Fetch Oracle Price for asset pair",
            inputSchema: fetchOraclePriceSchema.shape
        },
        async ({ base, quote }) => {
            try {
                const result = await getMidPriceGate({ base, quote });
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error fetching oracle price: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "get_market_price",
        {
            title: "Get Market Price",
            description: "Get current market price for a trading pair",
            inputSchema: z.object({
                baseAsset: z.string().describe("Base asset symbol"),
                quoteAsset: z.string().describe("Quote asset symbol"),
            }).shape,
        },
        async ({ baseAsset, quoteAsset }) => {
            try {
                const price = await getMidPriceGate({ base: baseAsset, quote: quoteAsset });
                return {
                    content: [{
                        type: "text",
                        text: `Current market price for ${baseAsset}/${quoteAsset}: ${price}`
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error getting market price: ${err.message}`
                    }]
                };
            }
        }
    );

    // ===== UTILITY HELPERS =====
    server.registerTool(
        "format_symbol",
        {
            title: "Format Trading Symbol",
            description: "Format base and quote assets into a trading symbol",
            inputSchema: z.object({
                baseAsset: z.string().describe("Base asset (e.g., 'HBAR')"),
                quoteAsset: z.string().describe("Quote asset (e.g., 'USDT')")
            }).shape,
        },
        async ({ baseAsset, quoteAsset }) => {
            try {
                const symbol = GIVEXMMClient.formatSymbol(baseAsset, quoteAsset);
                return {
                    content: [{
                        type: "text",
                        text: `Formatted symbol: ${symbol}`
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error formatting symbol: ${err.message}`
                    }]
                };
            }
        }
    );

    server.registerTool(
        "parse_symbol",
        {
            title: "Parse Trading Symbol",
            description: "Parse a trading symbol into base and quote assets",
            inputSchema: z.object({
                symbol: z.string().describe("Trading symbol (e.g., 'HBAR_USDT')")
            }).shape,
        },
        async ({ symbol }) => {
            try {
                const parsed = GIVEXMMClient.parseSymbol(symbol);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(parsed, null, 2)
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error parsing symbol: ${err.message}`
                    }]
                };
            }
        }
    );

    // ===== COMBINED WORKFLOW TOOLS =====
    server.registerTool(
        "start_market_making_workflow",
        {
            title: "Start Market Making Workflow",
            description: "Complete workflow: move assets from vault, start bot, begin market making",
            inputSchema: z.object({
                assetAmount: z.string().describe("Amount to move from vault"),
                baseAsset: z.string().describe("Base asset symbol"),
                quoteAsset: z.string().describe("Quote asset symbol"),
                quantity: z.number().describe("Order quantity"),
                side: z.enum(["bid", "ask"]).describe("Order side"),
                spreadPercentage: z.number().optional().describe("Spread percentage"),
                referencePrice: z.number().optional().describe("Reference price"),
            }).shape,
        },
        async ({ assetAmount, baseAsset, quoteAsset, quantity, side, spreadPercentage, referencePrice }) => {
            try {
                const steps = [];

                // Step 1: Move assets from vault to wallet
                const client = await hederaClientFactory();
                const moveResult = await client.callTool({
                    name: "write_contract",
                    arguments: {
                        contractAddress: config.vaultContractAddress,
                        abi: givexOrderBookAbi,
                        functionName: "moveFromVaultToWallet",
                        args: [assetAmount, config.agentWallet],
                        network: config.network,
                    }
                });
                steps.push(`✅ Moved ${assetAmount} assets from vault to wallet`);

                // Step 2: Start the market maker bot
                const botResult = await botClient.startBot(
                    config.agentWallet,
                    baseAsset,
                    quoteAsset,
                    config.agentPrivateKey,
                    quantity,
                    side,
                    "limit",
                    spreadPercentage || 0.5,
                    referencePrice
                );
                steps.push(`✅ Started market maker bot for ${baseAsset}/${quoteAsset}`);

                return {
                    content: [{
                        type: "text",
                        text: `Market making workflow completed successfully:\n\n${steps.join('\n')}\n\nBot Status: ${JSON.stringify(botResult, null, 2)}`
                    }]
                };
            } catch (err: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error in market making workflow: ${err.message}`
                    }]
                };
            }
        }
    );
}