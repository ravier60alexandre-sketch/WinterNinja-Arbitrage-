"""
Static definition of the 6 arbitrage bots.
Each bot trades XYZ against one counterpart (CASH, KM, or FLX).
"""

BOT_DEFINITIONS = [
    {
        "id": 1,
        "name": "Long XYZ / Short CASH",
        "exchange": "CASH",
        "pair_a": "XYZ",
        "pair_b": "CASH",
        "direction": "long_a_short_b",
        "env_prefix": "BOT_1",
    },
    {
        "id": 2,
        "name": "Long XYZ / Short KM",
        "exchange": "KM",
        "pair_a": "XYZ",
        "pair_b": "KM",
        "direction": "long_a_short_b",
        "env_prefix": "BOT_2",
    },
    {
        "id": 3,
        "name": "Long XYZ / Short FLX",
        "exchange": "FLX",
        "pair_a": "XYZ",
        "pair_b": "FLX",
        "direction": "long_a_short_b",
        "env_prefix": "BOT_3",
    },
    {
        "id": 4,
        "name": "Short XYZ / Long CASH",
        "exchange": "CASH",
        "pair_a": "XYZ",
        "pair_b": "CASH",
        "direction": "short_a_long_b",
        "env_prefix": "BOT_4",
    },
    {
        "id": 5,
        "name": "Short XYZ / Long KM",
        "exchange": "KM",
        "pair_a": "XYZ",
        "pair_b": "KM",
        "direction": "short_a_long_b",
        "env_prefix": "BOT_5",
    },
    {
        "id": 6,
        "name": "Short XYZ / Long FLX",
        "exchange": "FLX",
        "pair_a": "XYZ",
        "pair_b": "FLX",
        "direction": "short_a_long_b",
        "env_prefix": "BOT_6",
    },
]
