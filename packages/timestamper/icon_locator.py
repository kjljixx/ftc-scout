import cv2, os, sys, glob
import numpy as np

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "tpl")
SCALES = [0.75, 1.0, 1.25, 1.5, 2.0]
MIN_SCORE = 0.9
TEMPLATES = {n: cv2.imread(f"{TEMPLATE_DIR}/{n}.png", cv2.IMREAD_GRAYSCALE) for n in ["robot", "hand", "gamepad"]}


H_BAND = (0.40, 0.60)
V_BANDS = [(0.0, 0.25), (0.75, 1.0)]


def match_icon(region_gray):
  best = None
  for name, tpl in TEMPLATES.items():
    for s in SCALES:
      t = cv2.resize(tpl, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
      if t.shape[0] >= region_gray.shape[0] or t.shape[1] >= region_gray.shape[1]:
        continue
      res = cv2.matchTemplate(region_gray, t, cv2.TM_CCOEFF_NORMED)
      _, score, _, loc = cv2.minMaxLoc(res)
      if best is None or score > best["score"]:
        best = {"phase": name, "score": float(score), "x": loc[0], "y": loc[1], "w": t.shape[1], "h": t.shape[0], "scale": s}
  return best if best and best["score"] >= MIN_SCORE else None


def locate_icon(frame_gray):
  height, width = frame_gray.shape
  left, right = int(width * H_BAND[0]), int(width * H_BAND[1])
  best = None
  for v_start, v_end in V_BANDS:
    top = int(height * v_start)
    icon = match_icon(frame_gray[top:int(height * v_end), left:right])
    if icon and (best is None or icon["score"] > best["score"]):
      icon["x"] += left
      icon["y"] += top
      best = icon
  return best


if __name__ == "__main__":
  frames_dir, expected = sys.argv[1], sys.argv[2]
  phases = [(int(a), int(b), n) for a, b, n in (p.split(":") for p in expected.split(","))]
  print(f"config frames={frames_dir} min_score={MIN_SCORE} scales={SCALES} h_band={H_BAND} v_bands={V_BANDS} expected={phases}")
  files = sorted(glob.glob(f"{frames_dir}/*.png"))
  hits = {"correct": 0, "wrong": 0, "found_outside": 0, "missed_inside": 0, "none_outside": 0}
  positions = set()
  wrong = []
  for i, f in enumerate(files):
    icon = locate_icon(cv2.imread(f, cv2.IMREAD_GRAYSCALE))
    expect = next((n for a, b, n in phases if a <= i <= b), None)
    if icon:
      positions.add((icon["x"] // 4, icon["y"] // 4, icon["scale"]))
    if expect and icon and icon["phase"] == expect:
      hits["correct"] += 1
    elif expect and icon:
      hits["wrong"] += 1
      wrong.append((i, expect, icon["phase"], round(icon["score"], 2)))
    elif expect:
      hits["missed_inside"] += 1
    elif icon:
      hits["found_outside"] += 1
    else:
      hits["none_outside"] += 1
  print(f"summary frames={len(files)} {hits} distinct_positions={len(positions)}")
  print(f"wrong={wrong[:10]}")
