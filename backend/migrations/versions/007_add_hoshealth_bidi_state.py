"""add sync_hoshealth_state for bidi LWW tracking

Revision ID: add_hoshealth_bidi_state
Revises: add_user_gender
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_hoshealth_bidi_state"
down_revision: Union[str, Sequence[str], None] = "add_user_gender"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sync_hoshealth_state",
        sa.Column("entity", sa.String(length=32), nullable=False),
        sa.Column("row_id", sa.Integer(), nullable=False),
        sa.Column("legacy_hash", sa.String(length=64), nullable=False),
        sa.Column("app_hash", sa.String(length=64), nullable=False),
        sa.Column("last_origin", sa.String(length=16), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("entity", "row_id"),
    )


def downgrade() -> None:
    op.drop_table("sync_hoshealth_state")
