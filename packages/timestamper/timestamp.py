import argparse, statistics, time
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
    results.append({"match_id": key, "description": descriptions[key], "start_s": round(statistics.median(agreeing)), "frames": len(starts), "agreeing": len(agreeing), "spread_s": round(max(agreeing) - min(agreeing))})
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


class NoAnchorError(Exception):
  pass


def anchor_video(video_id, step_s, matches):
  counts = dict.fromkeys(COUNT_KEYS, 0)
  readings = []
  actual_by_id = dict(matches)
  source = frame_fetcher.open_source(video_id)
  times = spread_order(list(range(0, int(source.duration_s), step_s)))
  with ThreadPoolExecutor(PROCESS_WORKERS) as pool:
    for batch in frame_fetcher.fetch_frame_batches(source, times):
      read_frames(pool, batch, counts, readings)
      anchors = [(actual_by_id[m["match_id"]], m["start_s"]) for m in merge(readings) if m["match_id"] in actual_by_id]
      if anchors:
        wall_start_s, residuals = predict.estimate_wall_start(anchors)
        print(f"anchor found: {len(anchors)} match(es) read from {counts['frames']} frames, wall start spread {max(residuals) - min(residuals):.1f}s", flush=True)
        return {"wall_start_s": wall_start_s, "duration_s": None if source.is_live else source.duration_s, "counts": counts}
  raise NoAnchorError(f"None of the {counts['frames']} frames read showed a match that has a start time in the database")


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("video_id")
  parser.add_argument("--step", type=int, default=DEFAULT_STEP_S)
  parser.add_argument("--event", help="event code: find the video's wall start from one match and list the event's matches inside it")
  parser.add_argument("--season", type=int, default=2025)
  args = parser.parse_args()
  print(f"config video={args.video_id} step={args.step}s transition={TRANSITION_S}s outlier={OUTLIER_S}s process_workers={PROCESS_WORKERS} event={args.event}", flush=True)

  began = time.time()
  if args.event:
    import event_matches
    matches = event_matches.load_event_matches(event_matches.connect(), args.season, args.event)
    print(f"loaded {len(matches)} matches with an actual start time for {args.event}", flush=True)
    anchor = anchor_video(args.video_id, args.step, matches)
    visible = predict.predict_offsets(matches, anchor["wall_start_s"], anchor["duration_s"])
    for match_id, offset_s in visible:
      print(f"{match_resolver.describe_match_id(match_id):<12}{hms(offset_s):>9}")
    print(f"summary {anchor['counts']} wall_start={anchor['wall_start_s']:.0f} matches_in_video={len(visible)} wall={time.time() - began:.1f}s", flush=True)
  else:
    results, counts = full_sweep(args.video_id, args.step)
    print(f"{'match':<28}{'start':>9}{'frames':>8}{'agree':>7}{'spread':>8}")
    for m in results:
      print(f"{m['description']:<28}{hms(m['start_s']):>9}{m['frames']:>8}{m['agreeing']:>7}{m['spread_s']:>7}s")
    print(f"summary {counts} matches={len(results)} wall={time.time() - began:.1f}s", flush=True)
  print(f"timings (fetch.* and process stages are summed over {frame_fetcher.WORKERS} fetch and {PROCESS_WORKERS} process workers; wait_for_frame is main-thread time):", flush=True)
  print(timer.report(), flush=True)


if __name__ == "__main__":
  main()
