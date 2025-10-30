// import { getHederaUsdtPrice } from "./client/descreener-price-oracle-client";
import { getMidPriceGate } from "./client/price-oracle-client";
import { fetchMcpHederaClient } from "./client/MCPSSEClient";
import App from "./server/server"
import { config } from "./services/config"
// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
]

async function main() {
    const mcp_servers = [App]
    mcp_servers.map((server, index) => {
        let port = process.env.PORT || (index + 3) * 1000
        server.listen(port, () => {

            try {

                // clientCallTest()
                // example()
                fetchMcpHederaClient().then(async (client) => {
                    // List tools
                    const tools = await client.listTools();


                    // Call a tool
                    const result = await client.callTool({
                        name: "read_contract",
                        arguments: {
                            contractAddress: process.env.VAULT_CONTRACT_ADDRESS || config.vaultContractAddress,
                            abi: givexAbi,
                            functionName: "totalSupply",
                            args: [],
                            network: config.network,

                        }
                    });
                    console.log(result, "TOOLS")

                    // const p = await getHederaUsdtPrice();
                    const j = await getMidPriceGate({ quote: "USDT", base: "HBAR" })
                    // if (!p) {
                    //     console.log("HBAR/USDT pair not found on DexScreener (hedera).");
                    //     return;
                    // }
                    // console.log("HBAR/USDT price USD:", p.priceUsd);
                    // console.log("priceNative:", p.priceNative);
                    // console.log("pairAddress:", p.pairAddress);
                    console.log("dexId:", j);
                })


            } catch (err) {
                console.log(JSON.stringify(err), "ERRRR")
            }
            console.log(server.get("name") + " MCP server listening on :" + port)
        })
    })
}

main().then(res => console.log("happening...", res)).catch(err => {
    console.log(err)
})