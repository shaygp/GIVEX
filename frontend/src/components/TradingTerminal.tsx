import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Power,
  Terminal,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Zap,
  RefreshCw,
  Play,
  Pause,
  BarChart3,
  BookOpen,
  Heart,
  Users,
  Globe,
  HandHeart
} from 'lucide-react';

import { useWallet } from '../hooks/useWallet';
import { orderbookApi, botApi, mcpClientApi } from '../lib/api';
import { useTrade } from '../hooks/useTrade';
import { CONTRACTS } from '../lib/contracts';
import { priceService, type PriceData, PriceService } from '../lib/priceService';
import LabelTerminal from './ui/label-terminal';
import { AssetList } from './ui/asset-select';
import { NetworkList } from './ui/network-select';

// API moved to lib/api.ts

// UI Components
const Button = ({ children, variant = 'default', size = 'default', className = '', disabled = false, onClick, ...props }) => {
  const variants = {
    default: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    destructive: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    secondary: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    success: 'bg-green-600 hover:bg-green-700 text-white'
  };

  const sizes = {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 rounded-md px-3 text-xs',
    lg: 'h-10 rounded-md px-8'
  };

  return (
    <button
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }) => (
  <div className={`bg-card border border-border rounded-lg ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ children, className = '' }) => (
  <div className={`p-4 border-b border-border ${className}`}>{children}</div>
);

const CardTitle = ({ children, className = '' }) => (
  <h3 className={`text-lg font-semibold text-foreground ${className}`}>{children}</h3>
);

const CardContent = ({ children, className = '' }) => (
  <div className={`p-4 ${className}`}>{children}</div>
);

const Badge = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'bg-primary text-primary-foreground',
    success: 'bg-green-500 text-white',
    destructive: 'bg-red-500 text-white',
    secondary: 'bg-secondary text-secondary-foreground',
    outline: 'border border-border text-foreground'
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

const Input = ({ className = '', ...props }) => (
  <input
    className={`flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  />
);

// const Label = ({ children, className = '', ...props }) => (
//   <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`} {...props}>
//     {children}
//   </label>
// );

// Trading Components
const OrderBookPanel = ({ symbol, orderbook, onRefresh, loading, fromNetwork, toNetwork }) => {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Order Book</CardTitle>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-xs">
            {symbol}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="p-1"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="space-y-4">
          {/* Asks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-red-600 font-medium">Asks</span>
              <span className="text-xs text-muted-foreground">Price / Size / Total / Chain</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {orderbook?.asks?.length > 0 ? (
                orderbook.asks.map((ask, index) => {
                  const chain = (ask.from_network && ask.to_network)
                    ? [ask.from_network, ask.to_network].join(' → ')
                    : (fromNetwork && toNetwork ? `${fromNetwork} → ${toNetwork}` : '');
                  return (
                    <div key={index} className="flex justify-between text-xs">
                      <span className="text-red-600 font-medium">{ask.price.toFixed(4)}</span>
                      <span className="text-foreground">{ask.amount.toFixed(2)}</span>
                      <span className="text-muted-foreground">{ask.total.toFixed(2)}</span>
                      <Badge variant="outline" className="ml-2">{chain || '—'}</Badge>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-muted-foreground">No asks available</div>
              )}
            </div>
          </div>

          {/* Spread */}
          <div className="border-t border-b border-border py-2">
            <div className="text-center">
              <span className="text-xs text-muted-foreground">
                Spread: {orderbook?.asks?.[0] && orderbook?.bids?.[0]
                  ? (orderbook.asks[0].price - orderbook.bids[0].price).toFixed(4)
                  : 'N/A'
                }
              </span>
            </div>
          </div>

          {/* Bids */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-green-600 font-medium">Bids</span>
              <span className="text-xs text-muted-foreground">Price / Size / Total / Chain</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {orderbook?.bids?.length > 0 ? (
                orderbook.bids.map((bid, index) => {
                  const chain = (bid.from_network && bid.to_network)
                    ? [bid.from_network, bid.to_network].join(' → ')
                    : (fromNetwork && toNetwork ? `${fromNetwork} → ${toNetwork}` : '');
                  return (
                    <div key={index} className="flex justify-between text-xs">
                      <span className="text-green-600 font-medium">{bid.price.toFixed(4)}</span>
                      <span className="text-foreground">{bid.amount.toFixed(2)}</span>
                      <span className="text-muted-foreground">{bid.total.toFixed(2)}</span>
                      <Badge variant="outline" className="ml-2">{chain || '—'}</Badge>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-muted-foreground">No bids available</div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const TradingPanel = ({ account, onOrderSubmit, loading, fromNetwork, toNetwork, setFromNetwork, setToNetwork }) => {
  const [orderType, setOrderType] = useState('limit');
  const [side, setSide] = useState('buy');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [baseAsset, setBaseAsset] = useState('HBAR');
  const [quoteAsset, setQuoteAsset] = useState('USDT');
  const [marketPrice, setMarketPrice] = useState<PriceData | null>(null);
  const [autoUpdatePrice, setAutoUpdatePrice] = useState(true);

  // Subscribe to price updates
  useEffect(() => {
    const symbol = `${baseAsset}_${quoteAsset}`;
    
    const unsubscribe = priceService.subscribe(
      symbol,
      (priceData) => {
        setMarketPrice(priceData);
        
        // Auto-update price field if enabled
        if (autoUpdatePrice && !price) {
          setPrice(PriceService.formatPrice(priceData.price));
        }
      },
      30000 // Update every 30 seconds
    );

    return () => {
      unsubscribe();
    };
  }, [baseAsset, quoteAsset, autoUpdatePrice]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!price || !quantity || !account) return;
    
    try {
      await onOrderSubmit({
        account,
        baseAsset,
        quoteAsset,
        price: parseFloat(price),
        quantity: parseFloat(quantity),
        side: side === 'buy' ? 'bid' : 'ask',
        fromNetwork,
        toNetwork,
        receiveWallet: account // Using the same account for receiving, can be changed later
      });

      // Keep inputs to allow rapid subsequent orders; user can edit as needed
    } catch (error) {
      console.error('Order submission failed:', error);
      // Error handling should be done in the parent component
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Place Order</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={side === 'buy' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSide('buy')}
              className={side === 'buy' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              Buy
            </Button>
            <Button
              type="button"
              variant={side === 'sell' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSide('sell')}
              className={side === 'sell' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              Sell
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <AssetList asset={baseAsset} setAsset={setBaseAsset} label={"Base Asset"} />
            <AssetList asset={quoteAsset} setAsset={setQuoteAsset} label={"Quote Asset"} assetList={["USDT"]} />

          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <LabelTerminal htmlFor="price" className="text-sm">Price</LabelTerminal>
              {marketPrice && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Market:</span>
                  <span className="font-mono font-medium text-primary">
                    {PriceService.formatPrice(marketPrice.price)}
                  </span>
                  <span className={`font-semibold ${marketPrice.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {PriceService.formatChange(marketPrice.change24h)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPrice(PriceService.formatPrice(marketPrice.price));
                      setAutoUpdatePrice(!autoUpdatePrice);
                    }}
                    className={`p-1 rounded hover:bg-accent ${autoUpdatePrice ? 'text-primary' : 'text-muted-foreground'}`}
                    title={autoUpdatePrice ? 'Auto-update ON (click to toggle)' : 'Auto-update OFF (click to toggle)'}
                  >
                    <RefreshCw className={`h-3 w-3 ${autoUpdatePrice ? 'animate-pulse' : ''}`} />
                  </button>
                </div>
              )}
            </div>
            <Input
              id="price"
              type="number"
              step="0.0001"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setAutoUpdatePrice(false); // Disable auto-update when user types
              }}
              placeholder={marketPrice ? PriceService.formatPrice(marketPrice.price) : "0.0000"}
            />
            {marketPrice && (
              <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <span>Bid: {PriceService.formatPrice(marketPrice.bid)}</span>
                <span>Ask: {PriceService.formatPrice(marketPrice.ask)}</span>
                <span>Vol: {(marketPrice.volume24h / 1000000).toFixed(2)}M</span>
              </div>
            )}
          </div>

          <div>
            <LabelTerminal htmlFor="quantity" className="text-sm">Quantity</LabelTerminal>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {price && quantity && (
            <div className="text-xs text-muted-foreground">
              Total: {(parseFloat(price) * parseFloat(quantity)).toFixed(4)} {quoteAsset}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !account || !price || !quantity}
            variant={side === 'buy' ? 'success' : 'destructive'}
            onClick={handleSubmit}
          >
            {loading ? (
              <div className="flex items-center space-x-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Submitting...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                {side === 'buy' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span>{`${side.charAt(0).toUpperCase() + side.slice(1)} ${baseAsset}`}</span>
              </div>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

const AgentStatusPanel = ({ onStartAgent, agentRunning, agentLoading, statusText, lastMessage }) => {
  const agents = [
    {
      name: 'Market Research',
      status: agentRunning ? 'ACTIVE' : 'STANDBY',
      pnl: '+12.3%',
      trades: 47,
      strategy: 'Discovery & Analysis',
      message: "Analyzing supported markets, fundamentals, and liquidity to propose pairs."
    },
    {
      name: 'Price Strategist',
      status: agentRunning ? 'ACTIVE' : 'STANDBY',
      pnl: '+8.9%',
      trades: 23,
      strategy: 'Sizing & Mid-Price',
      message: "Computing order size, spread, and mid-price based on vault balance."
    },
    {
      name: 'Executive Trader',
      status: agentRunning ? 'ACTIVE' : 'STANDBY',
      pnl: '+15.7%',
      trades: 31,
      strategy: 'Execution & Ops',
      message: "Deploying bot, moving funds, and placing orders per strategy."
    }
  ];

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">
          Trading Agents
        </CardTitle>
        <Button
          variant={agentRunning ? "destructive" : "default"}
          size="sm"
          onClick={onStartAgent}
          disabled={agentLoading}
          className="text-xs"
        >
          {agentLoading ? (
            <RefreshCw className="h-3 w-3 animate-spin mr-1" />
          ) : agentRunning ? (
            <Pause className="h-3 w-3 mr-1" />
          ) : (
            <Play className="h-3 w-3 mr-1" />
          )}
          {agentLoading ? 'Loading...' : agentRunning ? 'Stop' : 'Start'}
        </Button>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Live status summary */}
        <div className="mb-3 text-xs text-muted-foreground">
          <span className="mr-2">Status:</span>
          <Badge variant={agentRunning ? 'success' : 'secondary'} className="text-[10px] mr-2">
            {agentRunning ? 'running' : 'standby'}
          </Badge>
          {statusText && <span className="truncate inline-block max-w-[75%] align-middle">{statusText}</span>}
        </div>
        <div className="space-y-4">
          {agents.map((agent, index) => (
            <div key={index} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${agent.status === 'ACTIVE' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                  <span className="text-sm font-medium">{agent.name}</span>
                  <Badge variant={agent.status === 'ACTIVE' ? 'success' : 'secondary'} className="text-xs">
                    {agent.status.toLowerCase()}
                  </Badge>
                </div>
                <div className="text-xs text-right">
                  <div className={`font-medium ${agent.pnl.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                    {agent.pnl}
                  </div>
                  <div className="text-muted-foreground">{agent.trades} trades</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-primary">{agent.strategy}</span>
                </div>
                <div className="bg-muted/30 rounded p-3 border border-border/50">
                  <p className="text-xs text-foreground leading-relaxed">
                    {index === 2 && lastMessage ? lastMessage : agent.message}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const TerminalLog = ({ logs }) => {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div ref={logRef} className="h-48 overflow-y-auto bg-muted/30 rounded p-3 text-xs">
          {logs.map((log, index) => (
            <div key={index} className={`mb-2 ${log.type === 'error' ? 'text-red-600' : log.type === 'success' ? 'text-green-600' : 'text-foreground'}`}>
              <span className="text-muted-foreground">{log.timestamp}</span> {log.message}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const MarketStats = ({ symbol, orderbook }) => {
  const stats = {
    lastPrice: orderbook?.asks?.[0]?.price || orderbook?.bids?.[0]?.price || 0,
    change24h: '+5.23%',
    volume24h: '2.4M',
    high24h: '0.3456',
    low24h: '0.3123'
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Market Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Last Price</div>
            <div className="text-lg font-semibold text-foreground">{stats.lastPrice.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">24H Change</div>
            <div className="text-lg font-semibold text-green-600">{stats.change24h}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">24H Volume</div>
            <div className="text-lg font-semibold text-foreground">{stats.volume24h}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">24H Range</div>
            <div className="text-sm font-medium text-foreground">{stats.low24h} - {stats.high24h}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Main Trading Terminal Component
export function TradingTerminal() {
  const {
    account,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    isOnHederaTestnet,
    switchToHederaTestnet
  } = useWallet();
  const [fromNetwork, setFromNetwork] = useState('hedera');
  const [toNetwork, setToNetwork] = useState('hedera');
  
  // Initialize trade hook at component level
  const { submitOrder, orderStatus } = useTrade();

  const [orderbook, setOrderbook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [currentMarketPrice, setCurrentMarketPrice] = useState<PriceData | null>(null);
  const [logs, setLogs] = useState([
    { timestamp: new Date().toLocaleTimeString(), message: 'System initialized', type: 'info' },
    { timestamp: new Date().toLocaleTimeString(), message: 'Waiting for wallet connection...', type: 'info' }
  ]);
  const [agentStatusText, setAgentStatusText] = useState('');
  const [agentLastMessage, setAgentLastMessage] = useState('');

  const currentSymbol = 'HBAR_USDT';

  const addLog = (message, type = 'info') => {
    const newLog = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => [...prev.slice(-49), newLog]);
  };

  const loadOrderbook = async () => {
    if (!isConnected) return; // Don't load if not connected
    
    setLoading(true);
    try {
      const response = await orderbookApi.getOrderbook(currentSymbol, fromNetwork, toNetwork);
      if (response.status_code === 1) {
        setOrderbook(response.orderbook);
        addLog(`Orderbook loaded: ${response.orderbook.asks?.length || 0} asks, ${response.orderbook.bids?.length || 0} bids`);
      } else {
        addLog(`Failed to load orderbook: ${response.message || 'Unknown error'}`, 'error');
      }
    } catch (error: any) {
      console.error('Orderbook error:', error);
      
      // Handle specific error types
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        addLog('Unable to connect to orderbook server. Please check your connection.', 'error');
      } else if (error.message.includes('CORS')) {
        addLog('Cross-origin request blocked. Please check server configuration.', 'error');
      } else {
        addLog(`Orderbook error: ${error.message}`, 'error');
      }
      
      // Clear stale orderbook data
      setOrderbook(null);
    } finally {
      setLoading(false);
    }
  };

  const handleOrderSubmit = async (orderData) => {
    setLoading(true);
    try {
      // First check wallet connection
      if (!account) {
        addLog('Please connect your wallet first', 'error');
        return;
      }

      // Log the order details
      addLog(`Preparing ${orderData.side} order: ${orderData.quantity} ${orderData.baseAsset} @ ${orderData.price}`);

      // Update log based on order status
      const statusInterval = setInterval(() => {
        if (orderStatus === 'approving') {
          addLog('Waiting for token approval...', 'info');
        } else if (orderStatus === 'depositing') {
          addLog('Depositing funds to escrow...', 'info');
        } else if (orderStatus === 'submitting') {
          addLog('Submitting order to orderbook...', 'info');
        }
      }, 2000);

      // Submit the order (hook handles all prerequisites)
      const result = await submitOrder(orderData);

      clearInterval(statusInterval);

      if (result.success) {
        addLog(`Order submitted successfully. ID: ${result.orderId}`, 'success');
        if (result.trades?.length > 0) {
          addLog(`Order matched! ${result.trades.length} trades executed`, 'success');
          result.trades.forEach((trade, idx) => {
            addLog(`Trade ${idx + 1}: ${trade.quantity} @ ${trade.price}`, 'success');
          });
        }
        // Refresh orderbook after successful order
        await loadOrderbook();
      } else {
        addLog(`Order failed`, 'error');
      }
    } catch (error: any) {
      console.error('Order error:', error);
      let errorMsg = typeof error?.message === 'string' ? error.message : 'Unknown error occurred';
      // Extra: decode Hedera hex-ASCII messages in the UI as fallback
      const dataHex = error?.data || error?.error?.data || error?.value?.data || error?.info?.error?.data;
      if (typeof dataHex === 'string' && dataHex.startsWith('0x')) {
        try {
          const clean = dataHex.slice(2);
          const bytes = clean.match(/.{1,2}/g) || [];
          const text = bytes.map(b => String.fromCharCode(parseInt(b, 16))).join('');
          if (/[A-Z_]/.test(text)) errorMsg = text;
        } catch {}
      }
      addLog(`Order error: ${errorMsg}`, 'error');
      
      // Provide user-friendly error messages
      if (errorMsg.includes('insufficient')) {
        addLog('Please deposit more tokens to your wallet or escrow', 'info');
      } else if (errorMsg.includes('allowance')) {
        addLog('Please approve token spending to settlement contract', 'info');
      } else if (errorMsg.includes('user rejected')) {
        addLog('Transaction was rejected in wallet', 'info');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartAgent = async () => {
    setAgentLoading(true);
    try {
      if (agentRunning) {
        // UI stop only – the Crew controls the market maker bot; no direct bot stop here
        setAgentRunning(false);
        setAgentStatusText('Crew paused (UI)');
        addLog('AI agents paused (UI only). Crew will manage bot lifecycle.', 'info');
      } else {
        addLog('Starting AI agents...');
        // Kick off MCP client workflow (crew)
        const mcpResp = await mcpClientApi.startBot();
          if (mcpResp?.status === 'success') {
          setAgentRunning(true);
          addLog('MCP agents kicked off', 'success');
          if (mcpResp.result) {
            const snippet = mcpResp.result.substring(0, 200);
            addLog(`Agent result: ${snippet}...`);
            setAgentStatusText('Crew started successfully');
            setAgentLastMessage(snippet);
          }
        } else {
          addLog(`MCP start failed: ${mcpResp?.message || 'Unknown error'}`, 'error');
            setAgentStatusText('Crew start failed');
        }
      }
    } catch (error) {
      addLog(`Agent error: ${error.message}`, 'error');
      setAgentStatusText('Agent error');
    }
    setAgentLoading(false);
  };

  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Auto-refresh orderbook
  useEffect(() => {
    if (isConnected) {
      loadOrderbook();
      const interval = setInterval(loadOrderbook, 5000);
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  // Add connection logs
  useEffect(() => {
    if (isConnected) {
      addLog(`Wallet connected: ${formatAddress(account)}`, 'success');
      addLog(`Settlement contract ready at ${formatAddress(CONTRACTS.SETTLEMENT_ADDRESS)}`, 'success');
    }
  }, [isConnected, account]);

  // Subscribe to market price for the main pair
  useEffect(() => {
    let firstUpdate = true;
    const unsubscribe = priceService.subscribe(
      'HBAR_USDT',
      (priceData) => {
        setCurrentMarketPrice(priceData);
        // Only log the first update, not every 30 seconds
        if (firstUpdate) {
          addLog(`Market price feed connected: HBAR/USDT @ ${PriceService.formatPrice(priceData.price)}`, 'success');
          firstUpdate = false;
        }
      },
      30000 // Update every 30 seconds
    );

    // Poll MCP client status periodically to surface agent outputs
    const statusInterval = setInterval(async () => {
      try {
        const st = await mcpClientApi.status();
        if (st?.status === 'success' && st?.result) {
          const summary = String(st.result);
          setAgentStatusText('Crew running');
          setAgentLastMessage(summary.substring(0, 200));
          addLog(`Agent status: ${summary.substring(0, 200)}...`);
        } else if (st?.status === 'error') {
          setAgentStatusText(`Crew error: ${st.message || ''}`);
        }
      } catch {}
    }, 15000);

    return () => {
      unsubscribe();
      clearInterval(statusInterval);
    };
  }, []);

  return (
    <div className="space-y-6">

      {/* Impact Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/30 dark:to-green-950/30 border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full">
              <HandHeart className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Trading with Purpose</h3>
              <p className="text-xs text-muted-foreground">Your profits contribute to verified social impact projects</p>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-xs">
            <div className="flex items-center space-x-1">
              <Users className="h-3 w-3 text-blue-500" />
              <span className="text-muted-foreground">2,847 beneficiaries</span>
            </div>
            <div className="flex items-center space-x-1">
              <Globe className="h-3 w-3 text-green-500" />
              <span className="text-muted-foreground">15 countries</span>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Status - Only show alerts for issues */}
      {!isConnected && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium">Wallet Not Connected</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Please connect your wallet to access trading features and contribute to impact projects.
          </p>
        </div>
      )}

      {isConnected && !isOnHederaTestnet && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium">Wrong Network</span>
            </div>
            <Button
              onClick={switchToHederaTestnet}
              variant="destructive"
              size="sm"
              className="flex items-center gap-2"
            >
              Switch to Hedera Testnet
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Please switch to Hedera Testnet to access trading features.
          </p>
        </div>
      )}

      {/* Market Stats Bar */}
      {currentMarketPrice && (
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">HBAR/USDT</span>
              </div>
              <div className="flex items-center space-x-3">
                <div>
                  <span className="text-xs text-muted-foreground">Price:</span>
                  <span className="ml-1 font-mono font-semibold text-lg">
                    ${PriceService.formatPrice(currentMarketPrice.price)}
                  </span>
                </div>
                <div className={`px-2 py-1 rounded ${currentMarketPrice.change24h >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  <span className="text-sm font-semibold">
                    {PriceService.formatChange(currentMarketPrice.change24h)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4 text-xs text-muted-foreground">
              <div>
                <span>24h Vol: </span>
                <span className="font-mono">${(currentMarketPrice.volume24h / 1000000).toFixed(2)}M</span>
              </div>
              <div className="flex items-center space-x-1 text-primary">
                <RefreshCw className="h-3 w-3 animate-pulse" />
                <span>Live from Gate.io</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Trading Interface */}
      <div className="space-y-6">

        {/* Top Row - Trading and Agents */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AgentStatusPanel
            onStartAgent={handleStartAgent}
            agentRunning={agentRunning}
            agentLoading={agentLoading}
            statusText={agentStatusText}
            lastMessage={agentLastMessage}
          />
          <TradingPanel
            account={account}
            onOrderSubmit={handleOrderSubmit}
            loading={loading}
            fromNetwork={fromNetwork}
            toNetwork={toNetwork}
            setFromNetwork={setFromNetwork}
            setToNetwork={setToNetwork}
          />
        </div>

        {/* Middle Row - Order Book and Market Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <OrderBookPanel
            symbol={currentSymbol}
            orderbook={orderbook}
            onRefresh={loadOrderbook}
            loading={loading}
            fromNetwork={fromNetwork}
            toNetwork={toNetwork}
          />
          <MarketStats
            symbol={currentSymbol}
            orderbook={orderbook}
          />
        </div>

        {/* Bottom Row - Activity Log */}
        <div className="grid grid-cols-1 gap-6">
          <TerminalLog logs={logs} />
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-between border-t border-border pt-6">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={loadOrderbook}
              disabled={loading}
              className="text-sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Data
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addLog('Settings accessed')}
              className="text-sm"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${isConnected && isOnHederaTestnet ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>System {isConnected && isOnHederaTestnet ? 'Active' : 'Standby'}</span>
          </div>
        </div>
      </div>

      {/* Status Footer */}
      <div className="bg-muted/30 border border-border rounded-lg p-3 mt-6">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected && isOnHederaTestnet ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-muted-foreground">Network:</span>
              <span className="font-medium">{isOnHederaTestnet ? 'Hedera Testnet' : 'Disconnected'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-muted-foreground">Agents:</span>
              <span className="font-medium">{agentRunning ? '4/4 Active' : '0/4 Active'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <span className="text-muted-foreground">Orders:</span>
              <span className="font-medium">{orderbook ? (orderbook.asks?.length || 0) + (orderbook.bids?.length || 0) : 0}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-muted-foreground">Latency:</span>
              <span className="font-medium">{isConnected ? '47ms' : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}