"""Restore named event constraints after the SQLite batch copy."""
from alembic import op
revision='3a0_checks'
down_revision='55e2fecc5bb2'
branch_labels=None
depends_on=None
constraints={
    'ck_event_fee_nonnegative':'fee_yen >= 0',
    'ck_event_visibility':"visibility IN ('public','group')",
    'ck_event_status':"status IN ('scheduled','cancelled')",
    'ck_event_group_required':"visibility = 'public' OR group_id IS NOT NULL",
}


def upgrade():
    with op.batch_alter_table('event') as batch:
        for name,expression in constraints.items():
            batch.create_check_constraint(name,expression)
    # Phase2.2では書き込みAPI未提供なので、既存の15件は初期デモである。
    op.execute("UPDATE event SET is_demo=1 WHERE creator_id IS NULL AND id IN ('1','2','3','4','5','6','7','9','10','11','12','13','14','15','16')")


def downgrade():
    with op.batch_alter_table('event') as batch:
        for name in constraints:
            batch.drop_constraint(name,type_='check')
