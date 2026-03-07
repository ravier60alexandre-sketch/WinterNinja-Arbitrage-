"""Initial schema with all tables and indexes.

Revision ID: 0001
Revises:
Create Date: 2026-01-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── bots ──
    op.create_table(
        "bots",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
        sa.Column("pair_a", sa.String(20), nullable=False),
        sa.Column("pair_b", sa.String(20), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="IDLE"),
        sa.Column("account_address", sa.String(66), nullable=False),
        sa.Column("api_key_encrypted", sa.Text, nullable=False),
        sa.Column("sub_account_address", sa.String(66), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # ── bot_configs ──
    op.create_table(
        "bot_configs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("bot_id", sa.Integer, sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("percentile", sa.Float, nullable=False, server_default="0.75"),
        sa.Column("timeframe_hours", sa.Integer, nullable=False, server_default="6"),
        sa.Column("profit_margin_bps", sa.Float, nullable=False, server_default="5"),
        sa.Column("max_slippage_ticks", sa.Integer, nullable=False, server_default="2"),
        sa.Column("max_position_size", sa.Numeric(20, 8), nullable=True),
        sa.Column("funding_rate_threshold", sa.Float, nullable=False, server_default="0.5"),
        sa.Column("one_leg_protection", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("exit_mode", sa.String(20), nullable=False, server_default="on_profit"),
        sa.Column("min_edge_bps", sa.Float, nullable=False, server_default="2"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # ── trades ──
    op.create_table(
        "trades",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("bot_id", sa.Integer, sa.ForeignKey("bots.id"), nullable=False),
        sa.Column("entry_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exit_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pair_a", sa.String(20), nullable=False),
        sa.Column("pair_b", sa.String(20), nullable=False),
        sa.Column("size", sa.Numeric(20, 8), nullable=False),
        sa.Column("entry_price_a", sa.Numeric(20, 8), nullable=False),
        sa.Column("entry_price_b", sa.Numeric(20, 8), nullable=False),
        sa.Column("exit_price_a", sa.Numeric(20, 8), nullable=True),
        sa.Column("exit_price_b", sa.Numeric(20, 8), nullable=True),
        sa.Column("gross_pnl", sa.Numeric(20, 8), nullable=True),
        sa.Column("fees_paid", sa.Numeric(20, 8), nullable=True),
        sa.Column("funding_paid", sa.Numeric(20, 8), server_default="0"),
        sa.Column("net_pnl", sa.Numeric(20, 8), nullable=True),
        sa.Column("slippage_a", sa.Numeric(20, 8), nullable=True),
        sa.Column("slippage_b", sa.Numeric(20, 8), nullable=True),
        sa.Column("entry_spread", sa.Numeric(20, 8), nullable=True),
        sa.Column("exit_spread", sa.Numeric(20, 8), nullable=True),
        sa.Column("edge_at_entry", sa.Numeric(20, 8), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("close_reason", sa.String(50), nullable=True),
    )
    op.create_index("ix_trades_bot_entry", "trades", ["bot_id", sa.text("entry_time DESC")])
    op.create_index(
        "ix_trades_bot_open",
        "trades",
        ["bot_id", "status"],
        postgresql_where=sa.text("status = 'open'"),
    )

    # ── spread_snapshots ──
    op.create_table(
        "spread_snapshots",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("bot_id", sa.Integer, sa.ForeignKey("bots.id"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("spread", sa.Numeric(20, 8), nullable=False),
        sa.Column("mid_a", sa.Numeric(20, 8), nullable=False),
        sa.Column("mid_b", sa.Numeric(20, 8), nullable=False),
        sa.Column("edge", sa.Numeric(20, 8), nullable=True),
        sa.Column("p50", sa.Numeric(20, 8), nullable=True),
        sa.Column("p75", sa.Numeric(20, 8), nullable=True),
        sa.Column("p80", sa.Numeric(20, 8), nullable=True),
        sa.Column("p95", sa.Numeric(20, 8), nullable=True),
    )
    op.create_index("ix_snapshots_bot_ts", "spread_snapshots", ["bot_id", sa.text("timestamp DESC")])
    op.execute("ALTER TABLE spread_snapshots SET (autovacuum_vacuum_scale_factor = 0.01)")

    # ── bot_metrics ──
    op.create_table(
        "bot_metrics",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("bot_id", sa.Integer, sa.ForeignKey("bots.id"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("total_trades", sa.Integer, server_default="0"),
        sa.Column("winning_trades", sa.Integer, server_default="0"),
        sa.Column("total_volume", sa.Numeric(20, 8), server_default="0"),
        sa.Column("total_fees_paid", sa.Numeric(20, 8), server_default="0"),
        sa.Column("total_funding", sa.Numeric(20, 8), server_default="0"),
        sa.Column("gross_pnl", sa.Numeric(20, 8), server_default="0"),
        sa.Column("net_pnl", sa.Numeric(20, 8), server_default="0"),
        sa.Column("avg_slippage", sa.Numeric(20, 8), server_default="0"),
        sa.Column("max_drawdown", sa.Numeric(20, 8), server_default="0"),
        sa.Column("one_leg_events", sa.Integer, server_default="0"),
        sa.UniqueConstraint("bot_id", "date", name="uq_bot_metrics_bot_date"),
    )

    # ── deployer_stats ──
    op.create_table(
        "deployer_stats",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("deployer", sa.String(10), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("total_volume", sa.Numeric(20, 8), nullable=True),
        sa.Column("open_interest", sa.Numeric(20, 8), nullable=True),
        sa.Column("funding_rate", sa.Numeric(20, 8), nullable=True),
        sa.Column("mark_price", sa.Numeric(20, 8), nullable=True),
    )
    op.create_index("ix_deployer_stats_deployer_ts", "deployer_stats", ["deployer", sa.text("timestamp DESC")])


def downgrade() -> None:
    op.drop_table("deployer_stats")
    op.drop_table("bot_metrics")
    op.drop_table("spread_snapshots")
    op.drop_table("trades")
    op.drop_table("bot_configs")
    op.drop_table("bots")
