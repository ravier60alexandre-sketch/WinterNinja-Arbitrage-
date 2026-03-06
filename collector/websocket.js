const WebSocket = require('ws');

class HyperliquidWS {
  constructor(url, onMessage) {
    this.url = url;
    this.onMessage = onMessage;
    this.ws = null;
    this.subscriptions = [];
    this.reconnectAttempt = 0;
    this.maxReconnectDelay = 30000;
    this.pingInterval = null;
    this.isClosing = false;
    this.connected = false;
  }

  connect() {
    if (this.isClosing) return;

    console.log(`[WS] Connecting to ${this.url}...`);

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('[WS] Connected');
      this.connected = true;
      this.reconnectAttempt = 0;
      this.startPingInterval();
      this.resubscribeAll();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.channel === 'l2Book') {
          this.onMessage(msg);
        }
      } catch (err) {
        // Ignore parse errors for pong/ack messages
      }
    });

    this.ws.on('close', (code, reason) => {
      this.connected = false;
      this.stopPingInterval();
      if (!this.isClosing) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
      this.connected = false;
    });

    this.ws.on('pong', () => {
      // Heartbeat acknowledged
    });
  }

  startPingInterval() {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  scheduleReconnect() {
    this.reconnectAttempt++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt - 1), this.maxReconnectDelay);
    console.warn(`[WARN] WebSocket disconnected. Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempt})`);
    setTimeout(() => this.connect(), delay);
  }

  subscribe(coin) {
    const sub = {
      method: 'subscribe',
      subscription: {
        type: 'l2Book',
        coin: coin
      }
    };

    if (!this.subscriptions.includes(coin)) {
      this.subscriptions.push(coin);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(sub));
    }
  }

  resubscribeAll() {
    console.log(`[WS] Resubscribing to ${this.subscriptions.length} coins...`);
    for (const coin of this.subscriptions) {
      const sub = {
        method: 'subscribe',
        subscription: {
          type: 'l2Book',
          coin: coin
        }
      };
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(sub));
      }
    }
  }

  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  close() {
    this.isClosing = true;
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log('[WS] Connection closed');
  }
}

module.exports = { HyperliquidWS };
