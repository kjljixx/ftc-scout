import argparse, os, signal, time, traceback
from pathlib import Path
import psycopg
from dotenv import load_dotenv
import timestamp

POLL_INTERVAL_S = 5
RECONNECT_DELAY_S = 10
ERROR_MAX_CHARS = 1000

REQUEUE_ORPHANED_SQL = "UPDATE timestamp_job SET status = 'Queued', started_at = NULL WHERE status = 'Running'"
CLAIM_JOB_SQL = """
  UPDATE timestamp_job SET status = 'Running', started_at = now()
  WHERE id = (SELECT id FROM timestamp_job WHERE status = 'Queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING id, season, event_code, video_id
"""
SAVE_MATCH_SQL = """
  INSERT INTO match_video_timestamp (season, event_code, match_id, video_id, start_seconds, frames, agreeing_frames)
  VALUES (%s, %s, %s, %s, %s, %s, %s)
  ON CONFLICT (season, event_code, match_id, video_id)
  DO UPDATE SET start_seconds = EXCLUDED.start_seconds, frames = EXCLUDED.frames, agreeing_frames = EXCLUDED.agreeing_frames, updated_at = now()
"""
FINISH_JOB_SQL = "UPDATE timestamp_job SET status = 'Done', matches_found = %s, error = NULL, finished_at = now() WHERE id = %s"
FAIL_JOB_SQL = "UPDATE timestamp_job SET status = 'Failed', error = %s, finished_at = now() WHERE id = %s"

stop_requested = False


def request_stop(signum, frame):
  global stop_requested
  stop_requested = True
  print(f"signal {signum} received; stopping after the current job", flush=True)


def run_job(conn, job):
  job_id, season, event_code, video_id = job
  began = time.time()
  print(f"job {job_id} started: season={season} event={event_code} video={video_id}", flush=True)
  try:
    matches, counts = timestamp.timestamp_video(video_id)
  except Exception as error:
    print(f"job {job_id} FAILED after {time.time() - began:.1f}s:\n{traceback.format_exc()}", flush=True)
    conn.execute(FAIL_JOB_SQL, (f"{type(error).__name__}: {error}"[:ERROR_MAX_CHARS], job_id))
    return
  with conn.transaction():
    for match in matches:
      conn.execute(SAVE_MATCH_SQL, (season, event_code, match["match_id"], video_id, match["start_s"], match["frames"], match["agreeing"]))
    conn.execute(FINISH_JOB_SQL, (len(matches), job_id))
  print(f"job {job_id} done in {time.time() - began:.1f}s: matches={len(matches)} counts={counts}", flush=True)


def work(database_url, once):
  with psycopg.connect(database_url, autocommit=True) as conn:
    orphaned = conn.execute(REQUEUE_ORPHANED_SQL).rowcount
    if orphaned:
      print(f"warn requeued {orphaned} job(s) left Running by a previous worker (assumes a single worker)", flush=True)
    while not stop_requested:
      job = conn.execute(CLAIM_JOB_SQL).fetchone()
      if job:
        run_job(conn, job)
      elif once:
        print("queue empty; exiting (--once)", flush=True)
        return
      else:
        time.sleep(POLL_INTERVAL_S)


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--once", action="store_true", help="exit when the queue is empty")
  args = parser.parse_args()
  load_dotenv(Path(__file__).resolve().parent.parent / "server" / ".env")
  database_url = os.environ["DATABASE_URL"]
  info = psycopg.conninfo.conninfo_to_dict(database_url)
  print(f"config db={info.get('dbname')}@{info.get('host')}:{info.get('port')} poll_interval={POLL_INTERVAL_S}s once={args.once} step={timestamp.DEFAULT_STEP_S}s", flush=True)
  signal.signal(signal.SIGINT, request_stop)
  signal.signal(signal.SIGTERM, request_stop)
  while not stop_requested:
    try:
      work(database_url, args.once)
      return
    except psycopg.OperationalError as error:
      print(f"warn database connection problem: {error}; retrying in {RECONNECT_DELAY_S}s", flush=True)
      time.sleep(RECONNECT_DELAY_S)


if __name__ == "__main__":
  main()
