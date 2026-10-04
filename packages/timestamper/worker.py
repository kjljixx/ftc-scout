import argparse, os, signal, threading, time, traceback
from pathlib import Path
import psycopg
from dotenv import load_dotenv
import event_matches, live_status, predict, timestamp

POLL_INTERVAL_S = 1
LIVE_CHECK_INTERVAL_S = 30
RECONNECT_DELAY_S = 10
ERROR_MAX_CHARS = 1000

REQUEUE_ORPHANED_SQL = "UPDATE timestamp_job SET status = 'Queued', started_at = NULL WHERE status = 'Running'"
CLAIM_JOB_SQL = """
  UPDATE timestamp_job SET status = 'Running', started_at = now()
  WHERE id = (SELECT id FROM timestamp_job WHERE status = 'Queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING id, season, event_code, video_id
"""
SAVE_VIDEO_SQL = """
  INSERT INTO event_video (season, event_code, video_id, wall_start, duration_s)
  VALUES (%s, %s, %s, to_timestamp(%s), %s)
  ON CONFLICT (season, event_code, video_id)
  DO UPDATE SET wall_start = EXCLUDED.wall_start, duration_s = EXCLUDED.duration_s, updated_at = now()
"""
LIVE_VIDEOS_SQL = "SELECT season, event_code, video_id FROM event_video WHERE duration_s IS NULL"
END_VIDEO_SQL = "UPDATE event_video SET duration_s = %s, updated_at = now() WHERE season = %s AND event_code = %s AND video_id = %s"
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
    event_match_times = event_matches.load_event_matches(conn, season, event_code)
    anchor = timestamp.anchor_video(video_id, timestamp.DEFAULT_STEP_S, event_match_times)
  except Exception as error:
    print(f"job {job_id} FAILED after {time.time() - began:.1f}s:", flush=True)
    print(traceback.format_exc(), flush=True)
    conn.execute(FAIL_JOB_SQL, (f"{type(error).__name__}: {error}"[:ERROR_MAX_CHARS], job_id))
    return
  wall_start_s, duration_s = anchor["wall_start_s"], anchor["duration_s"]
  matches_in_video = len(predict.predict_offsets(event_match_times, wall_start_s, duration_s or time.time() - wall_start_s))
  with conn.transaction():
    conn.execute(SAVE_VIDEO_SQL, (season, event_code, video_id, wall_start_s, duration_s))
    conn.execute(FINISH_JOB_SQL, (matches_in_video, job_id))
  print(f"job {job_id} done in {time.time() - began:.1f}s: matches_in_video={matches_in_video} counts={anchor['counts']}", flush=True)


def check_live_videos(conn):
  live_videos = conn.execute(LIVE_VIDEOS_SQL).fetchall()
  ended = 0
  for season, event_code, video_id in live_videos:
    try:
      length_s = live_status.fetch_ended_length_s(video_id)
    except Exception as error:
      print(f"warn live check failed for {video_id}: {type(error).__name__}: {error}", flush=True)
      continue
    if length_s:
      conn.execute(END_VIDEO_SQL, (length_s, season, event_code, video_id))
      ended += 1
      print(f"video {video_id} ({event_code}) has ended; duration={length_s}s", flush=True)
  if live_videos:
    print(f"live check: {len(live_videos)} live video(s), {ended} ended", flush=True)


def watch_live_videos(database_url):
  while not stop_requested:
    try:
      with psycopg.connect(database_url, autocommit=True) as conn:
        while not stop_requested:
          check_live_videos(conn)
          time.sleep(LIVE_CHECK_INTERVAL_S)
    except psycopg.OperationalError as error:
      print(f"warn live check database problem: {error}; retrying in {RECONNECT_DELAY_S}s", flush=True)
      time.sleep(RECONNECT_DELAY_S)


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
  threading.Thread(target=watch_live_videos, args=(database_url,), daemon=True).start()
  while not stop_requested:
    try:
      work(database_url, args.once)
      return
    except psycopg.OperationalError as error:
      print(f"warn database connection problem: {error}; retrying in {RECONNECT_DELAY_S}s", flush=True)
      time.sleep(RECONNECT_DELAY_S)


if __name__ == "__main__":
  main()
