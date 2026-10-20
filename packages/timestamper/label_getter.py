import cv2, ctypes, os, shutil, threading, time

UPSCALE = 5
BORDER_PX = 20
LABEL_LEFT_IN_ICONS = 25 / 22
LABEL_TOP_IN_ICONS = -28 / 22
LABEL_WIDTH_IN_ICONS = 230 / 22
LABEL_HEIGHT_IN_ICONS = 24 / 22
LANGUAGE = b"eng"
PAGE_SEG_MODE_SINGLE_LINE = 7


class Tesseract:
  def __init__(self):
    began = time.time()
    install_dir = os.path.dirname(shutil.which("tesseract"))
    os.add_dll_directory(install_dir)
    library_name = next(name for name in os.listdir(install_dir) if name.lower().startswith("libtesseract"))
    self.lib = ctypes.CDLL(os.path.join(install_dir, library_name))
    self.lib.TessBaseAPICreate.restype = ctypes.c_void_p
    self.lib.TessBaseAPIInit3.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p]
    self.lib.TessBaseAPISetPageSegMode.argtypes = [ctypes.c_void_p, ctypes.c_int]
    self.lib.TessBaseAPISetImage.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int]
    self.lib.TessBaseAPIGetUTF8Text.argtypes = [ctypes.c_void_p]
    self.lib.TessBaseAPIGetUTF8Text.restype = ctypes.c_void_p
    self.lib.TessDeleteText.argtypes = [ctypes.c_void_p]
    self.api = self.lib.TessBaseAPICreate()
    if self.lib.TessBaseAPIInit3(self.api, os.path.join(install_dir, "tessdata").encode(), LANGUAGE) != 0:
      raise RuntimeError(f"Tesseract could not load language data from {install_dir}")
    self.lib.TessBaseAPISetPageSegMode(self.api, PAGE_SEG_MODE_SINGLE_LINE)
    self.lock = threading.Lock()
    print(f"config tesseract loaded in-process from {install_dir} in {time.time() - began:.2f}s", flush=True)

  def read(self, gray_image):
    height, width = gray_image.shape
    with self.lock:
      self.lib.TessBaseAPISetImage(self.api, gray_image.tobytes(), width, height, 1, width)
      text_pointer = self.lib.TessBaseAPIGetUTF8Text(self.api)
      text = ctypes.string_at(text_pointer).decode()
      self.lib.TessDeleteText(text_pointer)
    return text.strip()


tesseract = None
tesseract_creation_lock = threading.Lock()


def get_tesseract():
  global tesseract
  with tesseract_creation_lock:
    if tesseract is None:
      tesseract = Tesseract()
  return tesseract


def label_crop(frame_gray, icon):
  scale = icon["w"]
  left = int(icon["x"] + scale * LABEL_LEFT_IN_ICONS)
  top = max(int(icon["y"] + scale * LABEL_TOP_IN_ICONS), 0)
  crop = frame_gray[top:top + int(scale * LABEL_HEIGHT_IN_ICONS), left:left + int(scale * LABEL_WIDTH_IN_ICONS)]
  crop = cv2.bitwise_not(cv2.resize(crop, None, fx=UPSCALE, fy=UPSCALE, interpolation=cv2.INTER_CUBIC))
  return cv2.copyMakeBorder(crop, BORDER_PX, BORDER_PX, BORDER_PX, BORDER_PX, cv2.BORDER_CONSTANT, value=255)


def read_label(frame_gray, icon):
  return get_tesseract().read(label_crop(frame_gray, icon)) or None
