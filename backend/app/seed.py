"""元の15公開デモをIDで重複防止。既存レコードの日時や編集内容を上書きしない。"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import click
from .models import Event
from .extensions import db


def seed_events(now=None):
    now = now or datetime.now(timezone.utc)
    jst = timezone(timedelta(hours=9))
    anchor = datetime(2026,10,24,tzinfo=jst)
    future = datetime.combine(now.astimezone(jst).date(), datetime.min.time(), jst) + timedelta(days=5)
    shift = max(timedelta(), future - anchor)
    data = json.loads((Path(__file__).parent / "demo-events.json").read_text(encoding="utf-8"))
    fields = {"startAt":"start_at","endAt":"end_at","venueName":"venue_name","feeYen":"fee_yen",
              "organizerName":"organizer_name","participationRule":"participation_rule"}
    for item in data:
        if db.session.get(Event,item["id"]):
            continue
        row = {fields.get(k,k):v for k,v in item.items()}
        for name in ("start_at","end_at"):
            row[name] = (datetime.fromisoformat(row[name]) + shift).astimezone(timezone.utc).isoformat()
        db.session.add(Event(**row, is_demo=True))
    db.session.commit()


@click.command("seed-demo")
def seed_command():
    seed_events()
    click.echo("公開デモ15件を確認しました（既存IDは変更しません）。")
