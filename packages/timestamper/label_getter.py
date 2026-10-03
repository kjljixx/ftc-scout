import cv2, subprocess

UPSCALE = 5
BORDER_PX = 20
LABEL_LEFT_IN_ICONS = 25 / 22
LABEL_TOP_IN_ICONS = -28 / 22
LABEL_WIDTH_IN_ICONS = 230 / 22
LABEL_HEIGHT_IN_ICONS = 24 / 22
TESSERACT_CMD = ["tesseract", "stdin", "stdout", "--psm", "7"]


def label_crop(frame_gray, icon):
  scale = icon["w"]
  left = int(icon["x"] + scale * LABEL_LEFT_IN_ICONS)
  top = max(int(icon["y"] + scale * LABEL_TOP_IN_ICONS), 0)
  crop = frame_gray[top:top + int(scale * LABEL_HEIGHT_IN_ICONS), left:left + int(scale * LABEL_WIDTH_IN_ICONS)]
  crop = cv2.bitwise_not(cv2.resize(crop, None, fx=UPSCALE, fy=UPSCALE, interpolation=cv2.INTER_CUBIC))
  return cv2.copyMakeBorder(crop, BORDER_PX, BORDER_PX, BORDER_PX, BORDER_PX, cv2.BORDER_CONSTANT, value=255)


def read_label(frame_gray, icon):
  _, png = cv2.imencode(".png", label_crop(frame_gray, icon))
  text = subprocess.run(TESSERACT_CMD, input=png.tobytes(), capture_output=True).stdout.decode().strip()
  return text or None
