import time
from decimal import ROUND_HALF_UP, Decimal

from app.core.logging import get_logger

logger = get_logger("services.orderbook")


class OrderbookEntry:
    __slots__ = ("price", "size")

    def __init__(self, price: Decimal, size: Decimal) -> None:
        self.price = price
        self.size = size


class Orderbook:
    __slots__ = ("asset", "bids", "asks", "last_update")

    def __init__(self, asset: str) -> None:
        self.asset = asset
        self.bids: list[OrderbookEntry] = []
        self.asks: list[OrderbookEntry] = []
        self.last_update: float = 0

    @property
    def best_bid(self) -> Decimal | None:
        return self.bids[0].price if self.bids else None

    @property
    def best_ask(self) -> Decimal | None:
        return self.asks[0].price if self.asks else None

    @property
    def mid_price(self) -> Decimal | None:
        if self.best_bid is None or self.best_ask is None:
            return None
        return ((self.best_bid + self.best_ask) / 2).quantize(
            Decimal("0.00000001"), rounding=ROUND_HALF_UP
        )

    @property
    def spread_bps(self) -> Decimal | None:
        if self.best_bid is None or self.best_ask is None or self.best_bid == 0:
            return None
        return ((self.best_ask - self.best_bid) / self.best_bid * Decimal("10000")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )


class OrderbookService:
    def __init__(self) -> None:
        self._books: dict[str, Orderbook] = {}

    def get(self, asset: str) -> Orderbook | None:
        return self._books.get(asset)

    def update(self, asset: str, data: dict) -> Orderbook:
        if asset not in self._books:
            self._books[asset] = Orderbook(asset)

        book = self._books[asset]
        levels = data.get("levels", [[], []])

        if len(levels) >= 2:
            book.bids = [
                OrderbookEntry(
                    price=Decimal(str(level.get("px", "0"))),
                    size=Decimal(str(level.get("sz", "0"))),
                )
                for level in levels[0]
            ]
            book.asks = [
                OrderbookEntry(
                    price=Decimal(str(level.get("px", "0"))),
                    size=Decimal(str(level.get("sz", "0"))),
                )
                for level in levels[1]
            ]

        book.last_update = time.time()
        return book

    def get_executable_size(self, asset: str, side: str, min_size: Decimal = Decimal("1")) -> Decimal:
        book = self._books.get(asset)
        if book is None:
            return Decimal("0")

        levels = book.bids if side == "sell" else book.asks
        total = Decimal("0")
        for entry in levels:
            total += entry.size
            if total >= min_size:
                return total
        return total

    # ── VWAP helpers (ported from Replit orderbook.js) ──

    def buy_vwap(self, asset: str, notional_usd: Decimal, max_levels: int = 2) -> dict | None:
        """Walk the ask side consuming liquidity up to notional_usd."""
        book = self._books.get(asset)
        if book is None or not book.asks:
            return None

        filled = Decimal("0")
        qty = Decimal("0")
        best_price = book.asks[0].price

        for i, entry in enumerate(book.asks):
            if i >= max_levels:
                break
            level_notional = entry.price * entry.size
            if filled + level_notional >= notional_usd:
                remaining = notional_usd - filled
                partial_qty = remaining / entry.price
                qty += partial_qty
                filled = notional_usd
                break
            filled += level_notional
            qty += entry.size

        vwap = filled / qty if qty > 0 else best_price
        return {
            "vwap": vwap,
            "filled": filled,
            "qty": qty,
            "bestPrice": best_price,
        }

    def sell_vwap(self, asset: str, notional_usd: Decimal, max_levels: int = 2) -> dict | None:
        """Walk the bid side consuming liquidity up to notional_usd."""
        book = self._books.get(asset)
        if book is None or not book.bids:
            return None

        filled = Decimal("0")
        qty = Decimal("0")
        best_price = book.bids[0].price

        for i, entry in enumerate(book.bids):
            if i >= max_levels:
                break
            level_notional = entry.price * entry.size
            if filled + level_notional >= notional_usd:
                remaining = notional_usd - filled
                partial_qty = remaining / entry.price
                qty += partial_qty
                filled = notional_usd
                break
            filled += level_notional
            qty += entry.size

        vwap = filled / qty if qty > 0 else best_price
        return {
            "vwap": vwap,
            "filled": filled,
            "qty": qty,
            "bestPrice": best_price,
        }
