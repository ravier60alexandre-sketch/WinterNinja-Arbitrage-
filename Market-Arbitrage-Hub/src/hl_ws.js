const WebSocket = require('ws');
const { parseBook } = require('./orderbook');

class MultiplexWS {
  constructor(id, config) {
    this.id = id;
    this.config = config;
    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.subscriptions = new Map();
    this.connected = false;
    this.debugCount = 0;
  }

  addSubscription(coin, stores, callback) {
    if (!this.subscriptions.has(coin)) {
      this.subscriptions.set(coin, { stores: [], callbacks: [] });
    }
    const sub = this.subscriptions.get(coin);
    for (const s of stores) {
      if (!sub.stores.includes(s)) sub.stores.push(s);
    }
    sub.callbacks.push(callback);

    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.subscribeCoin(coin);
    }
  }

  removeStoreSubscription(coin, store) {
    if (!this.subscriptions.has(coin)) return false;
    const sub = this.subscriptions.get(coin);
    sub.stores = sub.stores.filter(s => s !== store);
    if (sub.stores.length === 0 && sub.callbacks.length === 0) {
      this.subscriptions.delete(coin);
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.unsubscribeCoin(coin);
      }
      return true;
    }
    return false;
  }

  removeCallback(coin, callback) {
    if (!this.subscriptions.has(coin)) return;
    const sub = this.subscriptions.get(coin);
    sub.callbacks = sub.callbacks.filter(cb => cb !== callback);
  }

  subscribeCoin(coin) {
    const msg = {
      method: 'subscribe',
      subscription: { type: 'l2Book', coin },
    };
    this.ws.send(JSON.stringify(msg));
  }

  unsubscribeCoin(coin) {
    try {
      const msg = {
        method: 'unsubscribe',
        subscription: { type: 'l2Book', coin },
      };
      this.ws.send(JSON.stringify(msg));
      console.log(`[WS-${this.id}] Unsubscribed from ${coin}`);
    } catch (e) {}
  }

  connect() {
    const url = this.config.wsUrl || 'wss://api.hyperliquid.xyz/ws';
    console.log(`[WS-${this.id}] Connecting (${this.subscriptions.size} coins)...`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log(`[WS-${this.id}] Connected, subscribing to ${this.subscriptions.size} coins`);
      this.connected = true;
      this.reconnectDelay = 1000;

      for (const coin of this.subscriptions.keys()) {
        this.setConnectionStatus(coin, 'connected');
        this.subscribeCoin(coin);
      }

      this._startHeartbeat();
    });

    this.ws.on('message', (raw) => {
      this._lastPong = Date.now();
      try {
        const str = typeof raw === 'string' ? raw : raw.toString();
        if (str.length < 20 || str.indexOf('l2Book') === -1) {
          if (str.indexOf('subscriptionResponse') !== -1) {
            if (this.config.debugRawWs) {
              console.log(`[WS-${this.id}] Sub response:`, str.slice(0, 200));
            }
          }
          return;
        }
        const msg = JSON.parse(str);
        this.handleMessage(msg);
      } catch (e) {
        console.error(`[WS-${this.id}] Parse error:`, e.message);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[WS-${this.id}] Disconnected: ${code} ${reason}`);
      this.connected = false;
      this._stopHeartbeat();
      for (const coin of this.subscriptions.keys()) {
        this.setConnectionStatus(coin, 'disconnected');
      }
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error(`[WS-${this.id}] Error:`, err.message);
      for (const coin of this.subscriptions.keys()) {
        this.setConnectionStatus(coin, 'error');
      }
    });
  }

  setConnectionStatus(coin, status) {
    const sub = this.subscriptions.get(coin);
    if (!sub) return;
    for (const store of sub.stores) {
      store.setConnection(coin, status);
    }
  }

  handleMessage(msg) {
    if (msg.channel !== 'l2Book' || !msg.data) return;
    const bookData = msg.data;
    const coin = bookData.coin;
    if (!coin || !bookData.levels) return;

    const sub = this.subscriptions.get(coin);
    if (!sub) return;

    const parsed = parseBook(bookData);
    if (!parsed) return;

    const stores = sub.stores;
    for (let i = 0; i < stores.length; i++) {
      stores[i].updateBook(coin, parsed);
    }
    const callbacks = sub.callbacks;
    for (let i = 0; i < callbacks.length; i++) {
      callbacks[i](parsed);
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._lastPong = Date.now();
    this._heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (Date.now() - this._lastPong > 60000) {
          console.warn(`[WS-${this.id}] Stale connection detected (no data for 60s) — forcing reconnect`);
          try { this.ws.terminate(); } catch (e) {}
          return;
        }
        try {
          this.ws.send(JSON.stringify({ method: 'ping' }));
        } catch (e) {}
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  scheduleReconnect() {
    const jitter = Math.floor(Math.random() * 1000);
    const delay = this.reconnectDelay + jitter;
    console.log(`[WS-${this.id}] Reconnecting in ${delay}ms...`);
    setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, delay);
  }
}

class WSPool {
  constructor(config, maxConnections = 10) {
    this.config = config;
    this.maxConnections = maxConnections;
    this.connections = [];
    this.coinToConnection = new Map();
  }

  unregister(coin, store) {
    if (!this.coinToConnection.has(coin)) return;
    const conn = this.coinToConnection.get(coin);
    const removed = conn.removeStoreSubscription(coin, store);
    if (removed) {
      this.coinToConnection.delete(coin);
    }
  }

  register(coin, stores, callback) {
    if (this.coinToConnection.has(coin)) {
      const conn = this.coinToConnection.get(coin);
      conn.addSubscription(coin, stores, callback);
      return;
    }

    let target = null;
    let minSubs = Infinity;
    for (const conn of this.connections) {
      if (conn.subscriptions.size < minSubs) {
        minSubs = conn.subscriptions.size;
        target = conn;
      }
    }

    if (!target || (this.connections.length < this.maxConnections && minSubs > 0)) {
      const id = this.connections.length;
      target = new MultiplexWS(id, this.config);
      this.connections.push(target);
    }

    target.addSubscription(coin, stores, callback);
    this.coinToConnection.set(coin, target);
  }

  connectAll() {
    for (const conn of this.connections) {
      conn.connect();
    }
    const totalCoins = Array.from(this.coinToConnection.keys()).length;
    console.log(`[WSPool] ${this.connections.length} connections for ${totalCoins} unique coins (limit: ${this.maxConnections})`);
  }
}

module.exports = { WSPool };
