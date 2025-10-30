// Gate.io Price Service
// Fetches real-time prices from Gate.io public API

interface GateIOTicker {
  currency_pair: string;
  last: string;
  lowest_ask: string;
  highest_bid: string;
  change_percentage: string;
  base_volume: string;
  quote_volume: string;
  high_24h: string;
  low_24h: string;
}

interface PriceData {
  pair: string;
  price: number;
  bid: number;
  ask: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

class PriceService {
  private baseUrl = 'https://api.gateio.ws/api/v4';
  private proxyUrl = (import.meta as any).env?.VITE_ORDERBOOK_API_URL?.replace('0.0.0.0', 'localhost') || 'http://localhost:8001';
  private cache: Map<string, PriceData> = new Map();
  private listeners: Map<string, Set<(price: PriceData) => void>> = new Map();
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Map internal symbols to Gate.io pairs
  private symbolMapping: Record<string, string> = {
    'HBAR_USDT': 'HBAR_USDT',
    'BTC_USDT': 'BTC_USDT',
    'ETH_USDT': 'ETH_USDT',
    'MATIC_USDT': 'MATIC_USDT',
    // Add more mappings as needed
  };

  /**
   * Fetch current price for a trading pair from Gate.io
   */
  async fetchPrice(symbol: string): Promise<PriceData | null> {
    try {
      const gateSymbol = this.symbolMapping[symbol] || symbol;
      
      // Use backend proxy to avoid CORS issues
      const response = await fetch(`${this.proxyUrl}/api/price?currency_pair=${gateSymbol}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        console.warn(`Failed to fetch price for ${symbol}: ${response.status}`);
        // Return a default/mock price if Gate.io doesn't have the pair
        if (response.status === 404 || response.status === 400) {
          return this.getMockPrice(symbol);
        }
        return null;
      }

      const data = await response.json() as GateIOTicker[];
      
      if (!data || data.length === 0) {
        console.warn(`No price data for ${symbol}, using mock price`);
        return this.getMockPrice(symbol);
      }

      const ticker = data[0];
      
      const priceData: PriceData = {
        pair: symbol,
        price: parseFloat(ticker.last),
        bid: parseFloat(ticker.highest_bid),
        ask: parseFloat(ticker.lowest_ask),
        change24h: parseFloat(ticker.change_percentage),
        volume24h: parseFloat(ticker.base_volume),
        high24h: parseFloat(ticker.high_24h),
        low24h: parseFloat(ticker.low_24h),
        timestamp: Date.now()
      };

      // Update cache
      this.cache.set(symbol, priceData);
      
      // Notify listeners
      this.notifyListeners(symbol, priceData);

      return priceData;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      // Return mock price as fallback
      return this.getMockPrice(symbol);
    }
  }

  /**
   * Get mock price for testing or when API is unavailable
   */
  private getMockPrice(symbol: string): PriceData {
    // Provide realistic mock prices for testing
    const mockPrices: Record<string, number> = {
      'HBAR_USDT': 0.05,
      'BTC_USDT': 45000,
      'ETH_USDT': 2500,
      'MATIC_USDT': 0.8,
    };

    const basePrice = mockPrices[symbol] || 1.0;
    const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
    const price = basePrice * (1 + variation);

    return {
      pair: symbol,
      price: price,
      bid: price * 0.999,
      ask: price * 1.001,
      change24h: (Math.random() - 0.5) * 10, // Random ±5%
      volume24h: Math.random() * 1000000,
      high24h: price * 1.05,
      low24h: price * 0.95,
      timestamp: Date.now()
    };
  }

  /**
   * Subscribe to price updates for a symbol
   */
  subscribe(symbol: string, callback: (price: PriceData) => void, intervalMs: number = 30000): () => void {
    // Add listener
    if (!this.listeners.has(symbol)) {
      this.listeners.set(symbol, new Set());
    }
    this.listeners.get(symbol)!.add(callback);

    // Start update interval if not already running
    if (!this.updateIntervals.has(symbol)) {
      // Fetch immediately
      this.fetchPrice(symbol);
      
      // Then set up interval
      const interval = setInterval(() => {
        this.fetchPrice(symbol);
      }, intervalMs);
      
      this.updateIntervals.set(symbol, interval);
    } else {
      // If already running, send cached price immediately
      const cached = this.cache.get(symbol);
      if (cached) {
        callback(cached);
      }
    }

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(symbol);
      if (listeners) {
        listeners.delete(callback);
        
        // If no more listeners, clear the interval
        if (listeners.size === 0) {
          const interval = this.updateIntervals.get(symbol);
          if (interval) {
            clearInterval(interval);
            this.updateIntervals.delete(symbol);
          }
          this.listeners.delete(symbol);
        }
      }
    };
  }

  /**
   * Get cached price if available
   */
  getCachedPrice(symbol: string): PriceData | null {
    return this.cache.get(symbol) || null;
  }

  /**
   * Notify all listeners for a symbol
   */
  private notifyListeners(symbol: string, price: PriceData) {
    const listeners = this.listeners.get(symbol);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(price);
        } catch (error) {
          console.error('Error in price listener:', error);
        }
      });
    }
  }

  /**
   * Clear all subscriptions and intervals
   */
  cleanup() {
    // Clear all intervals
    this.updateIntervals.forEach(interval => clearInterval(interval));
    this.updateIntervals.clear();
    
    // Clear listeners
    this.listeners.clear();
    
    // Keep cache for potential future use
  }

  /**
   * Format price for display
   */
  static formatPrice(price: number, decimals: number = 4): string {
    if (price < 0.01) {
      return price.toFixed(6);
    } else if (price < 1) {
      return price.toFixed(4);
    } else if (price < 100) {
      return price.toFixed(3);
    } else {
      return price.toFixed(2);
    }
  }

  /**
   * Format percentage change
   */
  static formatChange(change: number): string {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  }
}

// Export singleton instance
export const priceService = new PriceService();
export type { PriceData };
export { PriceService };

