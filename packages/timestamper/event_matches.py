import os
from pathlib import Path
import psycopg
from dotenv import load_dotenv

LOAD_MATCHES_SQL = """
  SELECT id, extract(epoch FROM actual_start_time)
  FROM match
  WHERE event_season = %s AND event_code = %s AND actual_start_time IS NOT NULL
"""


def connect():
  load_dotenv(Path(__file__).resolve().parent.parent / "server" / ".env")
  return psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)


def load_event_matches(conn, season, event_code):
  return [(match_id, float(actual_s)) for match_id, actual_s in conn.execute(LOAD_MATCHES_SQL, (season, event_code)).fetchall()]
