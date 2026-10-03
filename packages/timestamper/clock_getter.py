import cv2, glob, os, sys
import numpy as np
import icon_locator

DIGIT_TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "tpl", "digits")
CLOCK_WIDTH_IN_ICONS = 3.2
CLOCK_HEIGHT_IN_ICONS = 2.0
LEFT_TRIM_IN_ICONS = 0.18
MIN_GLYPH_HEIGHT_RATIO = 0.5
GLYPH_HEIGHT = 20
GLYPH_WIDTH = 14
DIGITS_IN_CLOCK = 3
DIGIT_TEMPLATES = {d: cv2.imread(f"{DIGIT_TEMPLATE_DIR}/{d}.png", cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255 for d in range(10)}


def clock_crop(frame_gray, icon):
  center_x = icon["x"] + icon["w"] / 2
  width = icon["w"] * CLOCK_WIDTH_IN_ICONS
  left = int(center_x - width / 2 + icon["w"] * LEFT_TRIM_IN_ICONS)
  top = int(icon["y"] + icon["h"])
  return frame_gray[top:top + int(icon["h"] * CLOCK_HEIGHT_IN_ICONS), left:int(center_x + width / 2)]


def normalize_glyph(glyph):
  scale = GLYPH_HEIGHT / glyph.shape[0]
  resized = cv2.resize(glyph, (max(1, round(glyph.shape[1] * scale)), GLYPH_HEIGHT), interpolation=cv2.INTER_AREA)
  width = min(resized.shape[1], GLYPH_WIDTH)
  offset = (GLYPH_WIDTH - width) // 2
  canvas = np.zeros((GLYPH_HEIGHT, GLYPH_WIDTH), np.float32)
  canvas[:, offset:offset + width] = resized[:, :width] / 255
  return canvas


def find_digit_glyphs(crop_gray):
  _, binary = cv2.threshold(crop_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
  count, _, stats, _ = cv2.connectedComponentsWithStats(binary)
  boxes = [tuple(stats[i][:4]) for i in range(1, count)]
  if not boxes:
    return []
  tallest = max(height for _, _, _, height in boxes)
  digit_boxes = sorted(box for box in boxes if box[3] >= tallest * MIN_GLYPH_HEIGHT_RATIO)
  return [normalize_glyph(binary[y:y + h, x:x + w]) for x, y, w, h in digit_boxes]


def closest_digit(glyph):
  return min(DIGIT_TEMPLATES, key=lambda digit: np.sum((glyph - DIGIT_TEMPLATES[digit]) ** 2))


def read_clock(frame_gray, icon):
  glyphs = find_digit_glyphs(clock_crop(frame_gray, icon))
  if len(glyphs) != DIGITS_IN_CLOCK:
    return None
  minutes, tens, ones = (closest_digit(glyph) for glyph in glyphs)
  return minutes * 60 + tens * 10 + ones


if __name__ == "__main__":
  frames_dir = sys.argv[1]
  print(f"config frames={frames_dir} crop_height={CLOCK_HEIGHT_IN_ICONS} icons glyph={GLYPH_WIDTH}x{GLYPH_HEIGHT} digits_expected={DIGITS_IN_CLOCK}")
  files = sorted(glob.glob(f"{frames_dir}/*.png"))
  no_icon = unreadable = 0
  readings = []
  for path in files:
    frame = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    icon = icon_locator.locate_icon(frame)
    if not icon:
      no_icon += 1
      continue
    seconds = read_clock(frame, icon)
    unreadable += seconds is None
    readings.append((path[-8:-4], icon["phase"], seconds))
  print(f"summary frames={len(files)} no_icon={no_icon} unreadable={unreadable} read={len(readings) - unreadable}")
  print(f"first 8: {readings[:8]}")
