import cv2, glob, re, subprocess, sys
import icon_locator

UPSCALE = 5
BORDER_PX = 20
CLOCK_WIDTH_IN_ICONS = 3.2
CLOCK_HEIGHT_IN_ICONS = 1.8
LEFT_TRIM_IN_ICONS = 0.18
CLOCK_PATTERN = re.compile(r"^\d:\d\d$")
TESSERACT_CMD = ["tesseract", "stdin", "stdout", "--psm", "7", "-c", "tessedit_char_whitelist=0123456789:"]


def clock_crop(frame_gray, icon):
  center_x = icon["x"] + icon["w"] / 2
  width = icon["w"] * CLOCK_WIDTH_IN_ICONS
  left = int(center_x - width / 2 + icon["w"] * LEFT_TRIM_IN_ICONS)
  top = int(icon["y"] + icon["h"])
  crop = frame_gray[top:top + int(icon["h"] * CLOCK_HEIGHT_IN_ICONS), left:int(center_x + width / 2)]
  crop = cv2.resize(crop, None, fx=UPSCALE, fy=UPSCALE, interpolation=cv2.INTER_CUBIC)
  return cv2.copyMakeBorder(crop, BORDER_PX, BORDER_PX, BORDER_PX, BORDER_PX, cv2.BORDER_CONSTANT, value=255)


def read_clock(frame_gray, icon):
  _, png = cv2.imencode(".png", clock_crop(frame_gray, icon))
  text = subprocess.run(TESSERACT_CMD, input=png.tobytes(), capture_output=True).stdout.decode().strip()
  if not CLOCK_PATTERN.match(text):
    return None
  minutes, seconds = text.split(":")
  return int(minutes) * 60 + int(seconds)


if __name__ == "__main__":
  frames_dir = sys.argv[1]
  print(f"config frames={frames_dir} upscale={UPSCALE}x border={BORDER_PX}px pattern={CLOCK_PATTERN.pattern}")
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
