
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function fetchMcpHederaClient(): Promise<Client> {
    const transport = new StdioClientTransport({
        command: "node",
        args: ["src/hedera/index.js"]
    });

    const client = new Client(
        {
            name: "example-client",
            version: "1.0.0"
        }
    );

    await client.connect(transport)
    return client

}
