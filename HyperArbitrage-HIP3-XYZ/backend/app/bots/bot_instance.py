import asyncio
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from app.bots.base_bot import BaseBot, BotState
from app.bots.fee_calculator import FeeCalculator
from app.bots.funding_monitor import FundingMonitor
from app.bots.one_leg_guard import FillEvent, OneLegGuard
from app.bots.order_executor import OrderExecutor
from app.bots.position_manager import PositionManager
from app.bots.spread_calculator import SpreadCalculator
from app.core.exceptions import InsufficientEdgeError
from app.core.logging import get_logger

logger = get_logger("bots.bot_instance")


class BotInstance(BaseBot):
    def __init__(
        self,
        bot_id: int,
        name: str,
        pair_a: str,
        pair_b: str,
        direction: str,
        account_address: str,
        exchange: object,
        hl_info: object,
        config: dict,
    ) -> None:
        super().__init__(bot_id, name)
        self.pair_a = pair_a
        self.pair_b = pair_b
        self.direction = direction
        self.account_address = account_address
        self._exchange = exchange
        self._config = config

        self.spread_calculator = SpreadCalculator(bot_id)
        self.fee_calculator = FeeCalculator(bot_id, hl_info)
        self.order_executor = OrderExecutor(bot_id, exchange, config.get("max_retries", 3))
        self.one_leg_guard = OneLegGuard(bot_id, config.get("one_leg_timeout_ms", 500), exchange)
        self.funding_monitor = FundingMonitor(bot_id, hl_info, config.get("funding_threshold", 0.5))
        self.position_manager = PositionManager(bot_id, exchange, config.get("exit_mode", "on_profit"))

        self._stop_event = asyncio.Event()
        self._fill_queue: asyncio.Queue = asyncio.Queue(maxlen=100)
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        await self.transition(BotState.CONNECTING, "user_start")

        try:
            await self.transition(BotState.RUNNING, "connected")

            self._stop_event.clear()
            self._tasks = [
                asyncio.create_task(self._main_loop()),
                asyncio.create_task(
                    self.funding_monitor.run_loop(self.pair_a, self.pair_b, self._stop_event)
                ),
            ]

        except Exception as exc:
            await self.transition(BotState.STOPPED, f"connection_failed: {exc}")
            raise

    async def stop(self) -> None:
        await self.transition(BotState.PAUSED, "user_stop")
        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()

    async def liquidate(self) -> None:
        await self.transition(BotState.LIQUIDATING, "user_liquidate")
        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()

    async def reset(self) -> None:
        if self.state not in (BotState.PAUSED, BotState.STOPPED):
            await self.stop()
        await self.transition(BotState.STOPPED, "reset")
        self.spread_calculator = SpreadCalculator(self.bot_id)
        await self.transition(BotState.IDLE, "reset_complete")

    async def _main_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                if self.state != BotState.RUNNING:
                    await asyncio.sleep(0.5)
                    continue

                await self._tick()
                await asyncio.sleep(0.2)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("main_loop_error", bot_id=self.bot_id, error=str(exc))
                await asyncio.sleep(1.0)

    async def _tick(self) -> None:
        pass

    def update_config(self, config: dict) -> None:
        self._config.update(config)
        self.position_manager.exit_mode = config.get("exit_mode", self.position_manager.exit_mode)

    def on_fill(self, fill: FillEvent) -> None:
        try:
            self._fill_queue.put_nowait(fill)
        except asyncio.QueueFull:
            logger.warning("fill_queue_full", bot_id=self.bot_id)
