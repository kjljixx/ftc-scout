import argparse, json, re, statistics, time
from collections import defaultdict
import clock_getter, frame_fetcher, icon_locator, label_getter

AUTO_S = 30
TELEOP_S = 120
MATCH_CLOCK_S = 150
OUTLIER_S = 5
LABEL_PATTERN = re.compile(r"([A-Za-z][A-Za-z' ]*?)\s*(\d+)(?:\s+of\s+\d+)?(?!\d)")


def match_key(label):
  found = LABEL_PATTERN.search(label)
  return f"{found.group(1).strip()} {found.group(2)}" if found else None


def match_start_s(frame_time_s, phase, clock_s, transition_s):
  seconds_into_match = {
    "robot": MATCH_CLOCK_S - clock_s,
    "hand": AUTO_S + transition_s - clock_s,
    "gamepad": AUTO_S + transition_s + TELEOP_S - clock_s,
  }[phase]
  return frame_time_s - seconds_into_match


def merge(readings):
  by_match = defaultdict(list)
  for key, start_s in readings:
    by_match[key].append(start_s)
  results = []
  for key, starts in by_match.items():
    median = statistics.median(starts)
    agreeing = [s for s in starts if abs(s - median) <= OUTLIER_S]
    results.append({"match": key, "start_s": round(statistics.median(agreeing)), "frames": len(starts), "agreeing": len(agreeing), "spread_s": round(max(agreeing) - min(agreeing))})
  return sorted(results, key=lambda r: r["start_s"])


def hms(seconds):
  return f"{seconds // 3600}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("video_id")
  parser.add_argument("--step", type=int, default=60)
  parser.add_argument("--transition", type=int, default=8)
  parser.add_argument("--json", action="store_true")
  args = parser.parse_args()
  print(f"config video={args.video_id} step={args.step}s transition={args.transition}s outlier={OUTLIER_S}s", flush=True)

  began = time.time()
  counts = {"frames": 0, "no_frame": 0, "no_icon": 0, "no_clock": 0, "no_label": 0, "bad_label": 0, "used": 0}
  readings = []
  for time_s, frame in frame_fetcher.fetch_frames(args.video_id, args.step):
    counts["frames"] += 1
    if frame is None:
      counts["no_frame"] += 1
      continue
    icon = icon_locator.locate_icon(frame)
    if not icon:
      counts["no_icon"] += 1
      continue
    clock_s = clock_getter.read_clock(frame, icon)
    if clock_s is None:
      counts["no_clock"] += 1
      continue
    label = label_getter.read_label(frame, icon)
    if not label:
      counts["no_label"] += 1
      continue
    key = match_key(label)
    if not key:
      counts["bad_label"] += 1
      print(f"warn unparseable label {label!r} at {time_s:.0f}s", flush=True)
      continue
    counts["used"] += 1
    readings.append((key, match_start_s(time_s, icon["phase"], clock_s, args.transition)))

  matches = merge(readings)
  if args.json:
    print(json.dumps(matches))
  else:
    print(f"{'match':<28}{'start':>9}{'frames':>8}{'agree':>7}{'spread':>8}")
    for m in matches:
      print(f"{m['match']:<28}{hms(m['start_s']):>9}{m['frames']:>8}{m['agreeing']:>7}{m['spread_s']:>7}s")
  disagreements = sum(1 for m in matches if m["agreeing"] < m["frames"])
  print(f"summary {counts} matches={len(matches)} with_disagreement={disagreements} wall={time.time() - began:.1f}s", flush=True)


if __name__ == "__main__":
  main()
