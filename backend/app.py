from fastapi import FastAPI, Form, Request
from fastapi.concurrency import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from typing import Optional

from dotenv import load_dotenv

# import asyncio
import logging
from helper.api_service import APIService

# Import the TradeSettlementClient
from src.trade_settlement_client import (
    SettlementClient,
    # AllowanceChecker,
    # AllowanceManager,
)
from helper.api_helper import APIHelper
import httpx

# Configure logging
root = logging.getLogger()
if root.handlers:
    root.handlers.clear()

LOG_FORMAT = (
    "%(asctime)s %(levelname)s " "[%(filename)s:%(lineno)d %(funcName)s] " "%(message)s"
)

logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger(__name__)
load_dotenv()

order_books = {}  # Dictionary to store multiple order books, keyed by symbol

# Configuration - you should move these to environment variables
# WEB3_PROVIDER = os.getenv("WEB3_PROVIDER", "https://your-ethereum-node.com")
TRADE_SETTLEMENT_CONTRACT_ADDRESS = os.getenv(
    "TRADE_SETTLE_CONTRACT_ADDRESS", "0x237458E2cF7593084Ae397a50166A275A3928bA7"
)

# Supported networks mapping. Each entry contains the RPC URL, the numeric
# chain id (used when building the CrossChainTradeData struct) and an optional
# per-network settlement contract address. Values can be overridden with
# environment variables for deployment.
SUPPORTED_NETWORKS = {
    "hedera": {
        "rpc": os.getenv("WEB3_PROVIDER_HEDERA", "https://testnet.hashio.io/api"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_HEDERA", "296")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_HEDERA", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
    "ethereum": {
        "rpc": os.getenv("WEB3_PROVIDER_ETHEREUM", "https://mainnet.infura.io/v3/YOUR_KEY"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_ETHEREUM", "1")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_ETHEREUM", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
    "polygon": {
        "rpc": os.getenv("WEB3_PROVIDER_POLYGON", "https://polygon-rpc.com"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_POLYGON", "137")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_POLYGON", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
    "bsc": {
        "rpc": os.getenv("WEB3_PROVIDER_BSC", "https://bsc-dataseed.binance.org"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_BSC", "56")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_BSC", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
    "celo": {
        "rpc": os.getenv("WEB3_PROVIDER_CELO", "https://forno.celo.org"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_CELO", "42220")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_CELO", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
    "base": {
        "rpc": os.getenv("WEB3_PROVIDER_BASE", "https://mainnet.base.org"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_BASE", "8453")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_BASE", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.error("SHOULD RUN ON STARTUP!")
    api_service.register_startup_event(
        WEB3_PROVIDER=SUPPORTED_NETWORKS["hedera"]["rpc"],
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        PRIVATE_KEY=PRIVATE_KEY,
    )
    yield


app = FastAPI(lifespan=lifespan)


api_service = APIService()
# Add CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Global settlement client - initialize on startup
settlement_client: Optional[SettlementClient] = None
# allowance_checker: Optional[AllowanceChecker] = None
# allowance_manager: Optional[AllowanceManager] = None


PRIVATE_KEY = os.getenv("PRIVATE_KEY")  # Should be loaded securely
try:
    CONTRACT_ABI = APIHelper.load_abi("orderbook/settlement_abi.json")
except Exception:
    CONTRACT_ABI = []  # fallback

TOKEN_ADDRESSES = {
    "HBAR": os.getenv(
        "HBAR_TOKEN_ADDRESS", "0xb1F616b8134F602c3Bb465fB5b5e6565cCAd37Ed"
    ),
    "USDT": os.getenv(
        "USDT_TOKEN_ADDRESS", "0xc8B47803222A02F4FFF1727C6b8A4F2E779F672E"
    ),
    "xZAR_ETH": os.getenv(
        "XZAR_ETH_ADDRESS", "0x48f07301e9e29c3c38a80ae8d9ae771f224f1054"
    ),
    "xZAR_POLYGON": os.getenv(
        "XZAR_POLYGON_ADDRESS", "0x30DE46509Dbc3a491128F97be0aaf70dc7ff33cb"
    ),
    "cNGN_ETH": os.getenv(
        "CNGN_ETH_ADDRESS", "0x17CDB2a01e7a34CbB3DD4b83260B05d0274C8dab"
    ),
    "cNGN_BSC": os.getenv(
        "CNGN_BSC_ADDRESS", "0xa8AEA66B361a8d53e8865c62D142167Af28Af058"
    ),
    "cNGN_POLYGON": os.getenv(
        "CNGN_POLYGON_ADDRESS", "0x52828daa48C1a9A06F37500882b42daf0bE04C3B"
    ),
    "cNGN_BASE": os.getenv(
        "CNGN_BASE_ADDRESS", "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F"
    ),
    "cKES_CELO": os.getenv(
        "CKES_CELO_ADDRESS", "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0"
    ),
    "cZAR_CELO": os.getenv(
        "CZAR_CELO_ADDRESS", "0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6"
    ),
    "cGHS_CELO": os.getenv(
        "CGHS_CELO_ADDRESS", "0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313"
    ),
}


print(SUPPORTED_NETWORKS, "SUPPORTED NETWORKS IN APP.PY")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global settlement_client
    logger.error("SHOULD RUN ON STARTUP!")
    settlement_client = api_service.register_startup_event(
        WEB3_PROVIDER=SUPPORTED_NETWORKS["hedera"]["rpc"],
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        PRIVATE_KEY=PRIVATE_KEY,
    )
    yield


@app.post("/api/register_order")
async def register_order(request: Request):
    logger.info("Got here")
 
    settlement_client = SettlementClient(
        web3_provider=SUPPORTED_NETWORKS["hedera"]["rpc"],
        contract_address=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        private_key=PRIVATE_KEY,
    )
    return await api_service.register_order(
        request=request,
        order_books=order_books,
        WEB3PROVIDER=SUPPORTED_NETWORKS["hedera"]["rpc"],
        TOKEN_ADDRESSES=TOKEN_ADDRESSES,
        SUPPORTED_NETWORKS=SUPPORTED_NETWORKS,
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        CONTRACT_ABI=CONTRACT_ABI,
        PRIVATE_KEY=PRIVATE_KEY,
        settlement_client=settlement_client,
    )


@app.post("/api/cancel_order")
async def cancel_order(request: Request):
    return await api_service.cancel_order(request, order_books=order_books)


@app.post("/api/order")
async def get_order(payload: str = Form(...)):
    return await api_service.get_order(payload=payload, order_books=order_books)


@app.post("/api/orderbook")
async def get_orderbook(request: Request):
    return await api_service.get_orderbook(request=request, order_books=order_books)


@app.get("/api/get_settlement_address")
async def get_settlement_address():
    return api_service.get_settlement_address(
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS
    )


@app.post("/api/check_available_funds")
async def check_available_funds(payload: str = Form(...)):
    return api_service.check_available_funds(
        order_books=order_books, payload=payload
    )


# Price proxy to avoid CORS from frontend
@app.get("/api/price")
async def get_price(currency_pair: str):
    url = f"https://api.gateio.ws/api/v4/spot/tickers?currency_pair={currency_pair}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers={"Accept": "application/json"})
            r.raise_for_status()
            # Pass-through JSON
            return r.json()
    except httpx.HTTPError as e:
        logger.error(f"Price proxy error: {e}")
        return {"error": "failed_to_fetch_price", "details": str(e)}

# Add a health check endpoint for the settlement system
@app.get("/api/settlement_health")
async def settlement_health():
    return await api_service.settlement_health(
        settlement_client=settlement_client,
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
