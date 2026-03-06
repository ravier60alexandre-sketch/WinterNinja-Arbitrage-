class OrderbookManager {
  constructor() {
    this.books = new Map();
  }

  update(coin, levels) {
    const bids = levels[0] || [];
    const asks = levels[1] || [];

    if (bids.length === 0 || asks.length === 0) {
      return null;
    }

    const book = {
      bestBid: parseFloat(bids[0].px),
      bestAsk: parseFloat(asks[0].px),
      bidSize: parseFloat(bids[0].sz),
      askSize: parseFloat(asks[0].sz),
      updatedAt: Date.now()
    };

    if (isNaN(book.bestBid) || isNaN(book.bestAsk) || isNaN(book.bidSize) || isNaN(book.askSize)) {
      return null;
    }

    if (book.bestBid <= 0 || book.bestAsk <= 0 || book.bidSize <= 0 || book.askSize <= 0) {
      return null;
    }

    this.books.set(coin, book);
    return book;
  }

  get(coin) {
    return this.books.get(coin) || null;
  }

  has(coin) {
    return this.books.has(coin);
  }

  getAll() {
    return this.books;
  }
}

module.exports = { OrderbookManager };
