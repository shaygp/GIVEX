import * as dotenv from 'dotenv'
dotenv.config()

export const config = {
    account: process.env.ACCOUNT_ADDRESS || "",
    agentPrivateKey: process.env.PRIVATE_KEY || "",
    agentWallet: process.env.ACCOUNT_ADDRESS || "",
    vaultContractAddress: process.env.VAULT_CONTRACT_ADDRESS || "",
    // Network to target for MCP contract tools (e.g., 'testnet' for Hedera, 'mainnet')
    network: process.env.NETWORK || process.env.HEDERA_NETWORK || "testnet"
}