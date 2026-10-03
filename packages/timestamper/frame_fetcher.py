import cv2, struct, subprocess, sys, threading, time, urllib.error, urllib.request
import numpy as np
from concurrent.futures import ThreadPoolExecutor

FORMAT_ID = "134"
INDEX_BYTES = 200000
FRAGMENT_BYTES = 100000
WORKERS = 8


def parse_sidx(head):
  position = 0
  while position < len(head):
    size, kind = struct.unpack(">I4s", head[position:position + 8])
    if kind == b"sidx":
      version = head[position + 8]
      timescale = struct.unpack(">I", head[position + 16:position + 20])[0]
      cursor = position + 20
      fmt = ">QQ" if version else ">II"
      earliest, first_offset = struct.unpack(fmt, head[cursor:cursor + struct.calcsize(fmt)])
      cursor += struct.calcsize(fmt)
      count = struct.unpack(">H", head[cursor + 2:cursor + 4])[0]
      cursor += 4
      fragments = []
      offset = position + size + first_offset
      elapsed = earliest
      for _ in range(count):
        word, duration, _ = struct.unpack(">III", head[cursor:cursor + 12])
        fragments.append((elapsed / timescale, offset, word & 0x7FFFFFFF))
        offset += word & 0x7FFFFFFF
        elapsed += duration
        cursor += 12
      return position, fragments, elapsed / timescale
    position += size
  raise ValueError(f"sidx box not found in first {len(head)} bytes")


class StreamSource:
  def __init__(self, video_id):
    self.video_id = video_id
    self.lock = threading.Lock()
    self.bytes_downloaded = 0
    self.refresh_count = 0
    self._load()

  def _load(self):
    result = subprocess.run(["yt-dlp", "-g", "-f", FORMAT_ID, "--no-warnings", f"https://www.youtube.com/watch?v={self.video_id}"], capture_output=True, text=True)
    self.url = result.stdout.strip()
    if not self.url:
      raise RuntimeError(f"yt-dlp returned no stream url for {self.video_id}: {result.stderr.strip()[-200:]}")
    head = self._range(0, INDEX_BYTES)
    sidx_position, self.fragments, self.duration_s = parse_sidx(head)
    self.init_segment = head[:sidx_position]

  def _range(self, start, length):
    request = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{start + length - 1}"})
    data = urllib.request.urlopen(request).read()
    self.bytes_downloaded += len(data)
    return data

  def _range_with_refresh(self, start, length):
    try:
      return self._range(start, length)
    except urllib.error.HTTPError as error:
      print(f"warn http {error.code} on range request; refreshing stream url", file=sys.stderr, flush=True)
      with self.lock:
        self.refresh_count += 1
        self._load()
      return self._range(start, length)

  def frame_at(self, time_s):
    start_s, offset, size = next(f for f in reversed(self.fragments) if f[0] <= time_s)
    data = self._range_with_refresh(offset, min(FRAGMENT_BYTES, size))
    decoded = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], input=self.init_segment + data, capture_output=True).stdout
    frame = cv2.imdecode(np.frombuffer(decoded, np.uint8), cv2.IMREAD_GRAYSCALE) if decoded else None
    return start_s, frame


def fetch_frames(video_id, step_s=60, start_s=0, end_s=None, workers=WORKERS):
  began = time.time()
  source = StreamSource(video_id)
  end_s = min(end_s or source.duration_s, source.duration_s)
  times = list(range(int(start_s), int(end_s), step_s))
  print(f"config video={video_id} format={FORMAT_ID} duration={source.duration_s:.0f}s fragments={len(source.fragments)} step={step_s}s frames={len(times)} workers={workers}", flush=True)
  failed = 0
  with ThreadPoolExecutor(workers) as pool:
    for fragment_start_s, frame in pool.map(source.frame_at, times):
      if frame is None:
        failed += 1
        print(f"warn no frame decoded for fragment at {fragment_start_s:.0f}s", file=sys.stderr, flush=True)
      yield fragment_start_s, frame
  print(f"summary frames={len(times)} failed={failed} downloaded={source.bytes_downloaded / 1e6:.1f}MB url_refreshes={source.refresh_count} wall={time.time() - began:.1f}s", flush=True)


if __name__ == "__main__":
  video_id, step_s = sys.argv[1], int(sys.argv[2])
  frames = list(fetch_frames(video_id, step_s))
  print(f"first 3 times: {[round(t) for t, _ in frames[:3]]} frame_shape={frames[0][1].shape if frames[0][1] is not None else None}")
