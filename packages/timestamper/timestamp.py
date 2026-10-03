import argparse, json, statistics, time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import clock_getter, frame_fetcher, icon_locator, label_getter, match_resolver
from stage_timer import timer

AUTO_S = 30
TELEOP_S = 120
MATCH_CLOCK_S = 150
OUTLIER_S = 5
PROCESS_WORKERS = 8


def match_start_s(frame_time_s, phase, clock_s, transition_s):
  seconds_into_match = {
    "robot": MATCH_CLOCK_S - clock_s,
    "hand": AUTO_S + transition_s - clock_s,
    "gamepad": AUTO_S + transition_s + TELEOP_S - clock_s,
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
    agreeing = [s for s in starts if abs(s - median) <= OUTLIER_S]
    results.append({"key": key, "match": descriptions[key], "start_s": round(statistics.median(agreeing)), "frames": len(starts), "agreeing": len(agreeing), "spread_s": round(max(agreeing) - min(agreeing))})
  return sorted(results, key=lambda r: r["start_s"])


def hms(seconds):
  return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def process_frame(time_s, frame, transition_s):
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
  return "used", (key, description, match_start_s(time_s, icon["phase"], clock_s, transition_s))


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("video_id")
  parser.add_argument("--step", type=int, default=120)
  parser.add_argument("--transition", type=int, default=8)
  parser.add_argument("--json", action="store_true")
  args = parser.parse_args()
  print(f"config video={args.video_id} step={args.step}s transition={args.transition}s outlier={OUTLIER_S}s process_workers={PROCESS_WORKERS}", flush=True)

  began = time.time()
  counts = {"frames": 0, "no_frame": 0, "no_icon": 0, "no_clock": 0, "no_label": 0, "unparsed": 0, "practice": 0, "used": 0}
  readings = []
  frames = timer.iterate("wait_for_frame", frame_fetcher.fetch_frames(args.video_id, args.step))
  with ThreadPoolExecutor(PROCESS_WORKERS) as pool:
    for outcome, reading in pool.map(lambda frame_args: process_frame(*frame_args, args.transition), frames):
      counts["frames"] += 1
      counts[outcome] += 1
      if outcome == "used":
        readings.append(reading)

  with timer.time("merge"):
    matches = merge(readings)
  if args.json:
    print(json.dumps(matches))
  else:
    print(f"{'match':<28}{'start':>9}{'frames':>8}{'agree':>7}{'spread':>8}")
    for m in matches:
      print(f"{m['match']:<28}{hms(m['start_s']):>9}{m['frames']:>8}{m['agreeing']:>7}{m['spread_s']:>7}s")
  disagreements = sum(1 for m in matches if m["agreeing"] < m["frames"])
  print(f"summary {counts} matches={len(matches)} with_disagreement={disagreements} wall={time.time() - began:.1f}s", flush=True)
  print(f"timings (fetch.* and process stages are summed over {frame_fetcher.WORKERS} fetch and {PROCESS_WORKERS} process workers; wait_for_frame is main-thread time):\n{timer.report()}", flush=True)


if __name__ == "__main__":
  main()
