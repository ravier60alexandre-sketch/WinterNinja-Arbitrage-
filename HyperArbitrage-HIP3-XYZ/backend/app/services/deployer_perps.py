"""
Deployer Perps Discovery & SDK Patching.

Ports the loadDeployerPerps / patchSdkForDeployerPerps logic from
the Replit Node.js bot to Python.

This module:
1. Discovers all HiP-3 builder DEXes via the perpDexs API
2. Loads universe metadata (szDecimals, etc.) for each deployer DEX
3. Patches the Hyperliquid Python SDK's internal name-to-index maps
   so that Exchange.order() / bulk_orders() can resolve deployer
   perp names like "flx:SILVER" to their correct asset indices.
"""
import asyncio
import logging
import time
from dataclasses import dataclass, field

import aiohttp

logger = logging.getLogger("deployer_perps")

API_URL = "https://api.hyperliquid.xyz/info"

# Known deployer DEX names we care about
KNOWN_DEPLOYERS = {"xyz", "flx", "km", "cash", "vntl", "hyna", "abcd"}

# Rate limiter: max 6 concurrent, min 80ms between requests
_semaphore = asyncio.Semaphore(6)
_last_request_time = 0.0
_rate_lock = asyncio.Lock()


@dataclass
class DeployerAsset:
    """A single asset listed on a deployer DEX."""
    coin: str           # e.g. "flx:SILVER"
    asset_index: int    # e.g. 110005
    sz_decimals: int    # size decimal precision
    max_leverage: int
    deployer: str       # e.g. "flx"
    base_name: str      # e.g. "SILVER"


@dataclass
class DeployerRegistry:
    """Registry of all discovered deployer perps."""
    assets: dict[str, DeployerAsset] = field(default_factory=dict)  # coin -> DeployerAsset
    deployer_names: list[str] = field(default_factory=list)  # ordered list of DEX names
    last_loaded: float = 0.0

    def get_sz_decimals(self, coin: str) -> int | None:
        asset = self.assets.get(coin)
        return asset.sz_decimals if asset else None

    def get_asset_index(self, coin: str) -> int | None:
        asset = self.assets.get(coin)
        return asset.asset_index if asset else None

    def get_deployer_coins(self, deployer: str) -> list[str]:
        return [a.coin for a in self.assets.values() if a.deployer == deployer]


async def _rate_limited_post(session: aiohttp.ClientSession, payload: dict) -> dict:
    """POST to HL API with rate limiting: max 6 concurrent, 80ms min gap."""
    global _last_request_time

    async with _rate_lock:
        now = time.monotonic()
        elapsed = now - _last_request_time
        if elapsed < 0.08:
            await asyncio.sleep(0.08 - elapsed)
        _last_request_time = time.monotonic()

    async with _semaphore:
        async with session.post(API_URL, json=payload) as resp:
            resp.raise_for_status()
            return await resp.json()


async def load_deployer_perps() -> DeployerRegistry:
    """Discover all deployer perps from Hyperliquid API.

    Equivalent to loadDeployerPerps() in the Node.js bot:
    1. Call perpDexs to get all builder DEXes
    2. For each DEX, call meta to get the asset universe
    3. Compute asset indices: 110000 + (dex_index * 10000) + asset_position
    """
    registry = DeployerRegistry()

    async with aiohttp.ClientSession() as session:
        # Step 1: Get all builder DEXes
        try:
            dex_list = await _rate_limited_post(session, {"type": "perpDexs"})
        except Exception as e:
            logger.error(f"Failed to fetch perpDexs: {e}")
            return registry

        if not isinstance(dex_list, list):
            logger.error(f"Unexpected perpDexs response: {type(dex_list)}")
            return registry

        logger.info(f"Found {len(dex_list)} builder DEXes")

        # Step 2: Load meta for each DEX
        for i, dex_info in enumerate(dex_list):
            dex_name = dex_info if isinstance(dex_info, str) else dex_info.get("name", "")
            if not dex_name:
                continue

            registry.deployer_names.append(dex_name)

            # Only load full meta for deployers we care about
            if dex_name.lower() not in KNOWN_DEPLOYERS:
                continue

            try:
                meta = await _rate_limited_post(session, {"type": "meta", "dex": dex_name})
            except Exception as e:
                logger.warning(f"Failed to fetch meta for DEX '{dex_name}': {e}")
                continue

            universe = meta.get("universe", [])

            # Asset index offset: 110000 + (1-based dex index) * 10000
            # In the JS bot: 110000 + (i - 1) * 10000 where i is 1-based
            # Here i is 0-based from enumerate, so: 110000 + i * 10000
            base_offset = 110000 + i * 10000

            for j, asset_info in enumerate(universe):
                base_name = asset_info.get("name", "")
                sz_decimals = int(asset_info.get("szDecimals", 0))
                max_leverage = int(asset_info.get("maxLeverage", 1))

                coin = f"{dex_name}:{base_name}"
                asset_index = base_offset + j

                registry.assets[coin] = DeployerAsset(
                    coin=coin,
                    asset_index=asset_index,
                    sz_decimals=sz_decimals,
                    max_leverage=max_leverage,
                    deployer=dex_name,
                    base_name=base_name,
                )

            logger.info(f"DEX '{dex_name}': {len(universe)} assets, offset {base_offset}")

    registry.last_loaded = time.time()
    logger.info(f"Deployer registry loaded: {len(registry.assets)} total assets")
    return registry


def patch_sdk(info_instance, registry: DeployerRegistry) -> None:
    """Patch the Hyperliquid SDK's Info instance to recognize deployer perps.

    Injects deployer perp names into:
    - info.coin_to_asset  (coin name -> asset index)
    - info.name_to_coin   (name -> canonical coin name)
    - info.asset_to_sz_decimals  (asset index -> sz decimals)

    After patching, Exchange.order("flx:SILVER", ...) will work.
    """
    if info_instance is None:
        logger.warning("Cannot patch SDK: info_instance is None")
        return

    patched = 0
    for coin, asset in registry.assets.items():
        # Inject into coin_to_asset
        if hasattr(info_instance, 'coin_to_asset'):
            info_instance.coin_to_asset[coin] = asset.asset_index

        # Inject into name_to_coin (identity mapping)
        if hasattr(info_instance, 'name_to_coin'):
            info_instance.name_to_coin[coin] = coin

        # Inject szDecimals
        if hasattr(info_instance, 'asset_to_sz_decimals'):
            info_instance.asset_to_sz_decimals[asset.asset_index] = asset.sz_decimals

        patched += 1

    logger.info(f"SDK patched: {patched} deployer perps injected")


async def get_deployer_positions(
    session: aiohttp.ClientSession,
    address: str,
    dex: str,
) -> list[dict]:
    """Get positions for a specific deployer DEX.

    The Replit bot calls:
    {"type":"clearinghouseState","user":"<addr>","dex":"<dex>"}
    """
    try:
        result = await _rate_limited_post(session, {
            "type": "clearinghouseState",
            "user": address,
            "dex": dex,
        })
        positions = result.get("assetPositions", [])
        # Prefix coin names with deployer
        for pos in positions:
            item = pos.get("position", {})
            coin = item.get("coin", "")
            if ":" not in coin:
                item["coin"] = f"{dex}:{coin}"
        return positions
    except Exception as e:
        logger.warning(f"Failed to get positions for dex={dex}: {e}")
        return []


async def get_deployer_fills(
    session: aiohttp.ClientSession,
    address: str,
    dex: str,
    start_time_ms: int,
) -> list[dict]:
    """Get fills for a specific deployer DEX.

    The Replit bot calls:
    {"type":"userFillsByTime","user":"<addr>","startTime":<ms>,"dex":"<dex>"}
    """
    try:
        result = await _rate_limited_post(session, {
            "type": "userFillsByTime",
            "user": address,
            "startTime": start_time_ms,
            "dex": dex,
        })
        return result if isinstance(result, list) else []
    except Exception as e:
        logger.warning(f"Failed to get fills for dex={dex}: {e}")
        return []
