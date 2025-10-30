import GIVEXMMClient, { GIVEXConfig } from "../client/hyper-fillmm-client"



interface IMarket {
    marketName: string,
    id: string,
}

export class MarketManager {
    constructor() {

    }

    _supportedMarkets = [

    ]

    _marketList: IMarket[] = [
        {
            marketName: "givex",
            id: "1"
        }
    ]

    getMarketList() {
        return this._marketList
    }

    getMarketClient(marketName: string): GIVEXMMClient | undefined {
        let client;
        for (let market of this._marketList) {
            if (market.marketName == marketName) {

                let config: GIVEXConfig = {
                    baseUrl: process.env.MARKET_MAKER_API || "http://localhost://8001",
                    privateKey: process.env.PRIVATE_KEY || "",
                    account: process.env.ACCOUNT_ADDRESS || ""
                }

                console.log(config, "FIIFIF")
                client = new GIVEXMMClient(config)
            }

        }

        return client
    }
}