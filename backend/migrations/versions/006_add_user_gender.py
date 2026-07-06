"""add user gender column

Revision ID: add_user_gender
Revises: align_rag_chunks
Create Date: 2026-07-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'add_user_gender'
down_revision: Union[str, Sequence[str], None] = 'align_rag_chunks'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('gender', sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'gender')
