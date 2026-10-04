import argparse, json, statistics, sys, time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import clock_getter, frame_fetcher, icon_locator, label_getter, match_resolver, predict
from stage_timer import timer

AUTO_S = 30
TRANSITION_S = 8
TELEOP_S = 120
MATCH_CLOCK_S = 150
OUTLIER_S = 5
PROCESS_WORKERS = 8
DEFAULT_STEP_S = 120
COUNT_KEYS = ["frames", "no_frame", "no_icon", "no_clock", "no_label", "unparsed", "practice", "used"]


def match_start_s(frame_time_s, phase, clock_s):
  seconds_into_match = {
    "robot": MATCH_CLOCK_S - clock_s,
    "hand": AUTO_S + TRANSITION_S - clock_s,
    "gamepad": AUTO_S + TRANSITION_S + TELEOP_S - clock_s,
  }[phase]
  return frame_time_s - seconds_into_match


def merge(readings):
  by_match = defaultdict(list)
  descriptions = {}
  for key, description, start_s in readings:
    by_match[key].append(start_s)
    descriptions[key] = description
  results = []
  for key, starts in by_match.items():
    median = statistics.median(starts)
    agreeing = [s for s in starts if abs(s - median) <= OUTLIER_S] or starts
    results.append({"match_id": key, "description": descriptions[key], "start_s": round(statistics.median(agreeing)), "frames": len(starts), "agreeing": len(agreeing), "spread_s": round(max(agreeing) - min(agreeing)), "source": "read"})
  return sorted(results, key=lambda r: r["start_s"])


def hms(seconds):
  return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def process_frame(time_s, frame):
  if frame is None:
    return "no_frame", None
  with timer.time("locate_icon"):
    icon = icon_locator.locate_icon(frame)
  if not icon:
    return "no_icon", None
  with timer.time("read_clock"):
    clock_s = clock_getter.read_clock(frame, icon)
  if clock_s is None:
    return "no_clock", None
  with timer.time("read_label"):
    label = label_getter.read_label(frame, icon)
  if not label:
    return "no_label", None
  outcome, key, description = match_resolver.resolve_label(label)
  if outcome == "unparsed":
    print(f"warn unparsed label {label!r} at {time_s:.0f}s", flush=True)
  if outcome != "ok":
    return outcome, None
  return "used", (key, description, match_start_s(time_s, icon["phase"], clock_s))


def spread_order(times):
  bits = max(1, (len(times) - 1).bit_length())
  return [times[i] for i in sorted(range(len(times)), key=lambda i: int(format(i, f"0{bits}b")[::-1], 2))]


def read_frames(pool, frames, counts, readings):
  for outcome, reading in pool.map(lambda frame_args: process_frame(*frame_args), frames):
    counts["frames"] += 1
    counts[outcome] += 1
    if outcome == "used":
      readings.append(reading)


def full_sweep(video_id, step_s):
  counts = dict.fromkeys(COUNT_KEYS, 0)
  readings = []
  frames = timer.iterate("wait_for_frame", frame_fetcher.fetch_frames(video_id, step_s))
  with ThreadPoolExecutor(PROCESS_WORKERS) as pool:
    read_frames(pool, frames, counts, readings)
  with timer.time("merge"):
    return merge(readings), counts


def anchored_sweep(video_id, step_s, matches):
  counts = dict.fromkeys(COUNT_KEYS, 0)
  readings = []
  actual_by_id = dict(matches)
  source = frame_fetcher.StreamSource(video_id)
  times = spread_order(list(range(0, int(source.duration_s), step_s)))
  wall_start_s = None
  with ThreadPoolExecutor(PROCESS_WORKERS) as pool:
    for batch in frame_fetcher.fetch_frame_batches(source, times):
      read_frames(pool, batch, counts, readings)
      read_matches = merge(readings)
      anchors = [(actual_by_id[m["match_id"]], m["start_s"]) for m in read_matches if m["match_id"] in actual_by_id]
      if anchors:
        wall_start_s, residuals = predict.estimate_wall_start(anchors)
        print(f"anchor found: {len(anchors)} match(es) read from {counts['frames']} frames, wall start spread {max(residuals) - min(residuals):.1f}s", flush=True)
        break
  if wall_start_s is None:
    print(f"warn no match read from {counts['frames']} frames is in the database list; using the matches read", flush=True)
    return merge(readings), {**counts, "predicted": 0}

  read_ids = {m["match_id"] for m in read_matches}
  predictions = [p for p in predict.predict_offsets(matches, wall_start_s, source.duration_s) if p[0] not in read_ids]
  predicted = [{"match_id": match_id, "description": match_resolver.describe_match_id(match_id), "start_s": offset_s, "frames": 0, "agreeing": 0, "spread_s": 0, "source": "predicted"} for match_id, offset_s in predictions]
  return sorted(read_matches + predicted, key=lambda r: r["start_s"]), {**counts, "predicted": len(predicted)}


def timestamp_video(video_id, step_s=DEFAULT_STEP_S, matches=None):
  mode = f"anchored matches={len(matches)}" if matches else "full"
  print(f"config video={video_id} step={step_s}s transition={TRANSITION_S}s outlier={OUTLIER_S}s process_workers={PROCESS_WORKERS} mode={mode}", flush=True)
  return anchored_sweep(video_id, step_s, matches) if matches else full_sweep(video_id, step_s)


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("video_id")
  parser.add_argument("--step", type=int, default=DEFAULT_STEP_S)
  parser.add_argument("--event", help="event code: predict most matches from the database's actual start times")
  parser.add_argument("--season", type=int, default=2025)
  parser.add_argument("--json", action="store_true")
  args = parser.parse_args()

  matches = None
  if args.event:
    import event_matches
    matches = event_matches.load_event_matches(event_matches.connect(), args.season, args.event)
    print(f"loaded {len(matches)} matches with an actual start time for {args.event}", file=sys.stderr, flush=True)

  began = time.time()
  results, counts = timestamp_video(args.video_id, args.step, matches)
  if args.json:
    print(json.dumps(results))
  else:
    print(f"{'match':<28}{'start':>9}{'frames':>8}{'agree':>7}{'spread':>8}  source")
    for m in results:
      print(f"{m['description']:<28}{hms(m['start_s']):>9}{m['frames']:>8}{m['agreeing']:>7}{m['spread_s']:>7}s  {m['source']}")
  disagreements = sum(1 for m in results if m["agreeing"] < m["frames"])
  print(f"summary {counts} matches={len(results)} with_disagreement={disagreements} wall={time.time() - began:.1f}s", flush=True)
  print(f"timings (fetch.* and process stages are summed over {frame_fetcher.WORKERS} fetch and {PROCESS_WORKERS} process workers; wait_for_frame is main-thread time):\n{timer.report()}", flush=True)


if __name__ == "__main__":
  main()
