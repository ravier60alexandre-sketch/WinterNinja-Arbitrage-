"""Add disabled_pairs column to bot_configs

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bot_configs",
        sa.Column("disabled_pairs", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bot_configs", "disabled_pairs")
