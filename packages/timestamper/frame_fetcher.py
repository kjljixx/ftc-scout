import av, io, struct, sys, threading, time, urllib.error, urllib.request, yt_dlp
from concurrent.futures import ThreadPoolExecutor
from stage_timer import timer

FORMAT_ID = "134"
YDL_OPTIONS = {"format": FORMAT_ID, "quiet": True, "no_warnings": True, "skip_download": True, "js_runtimes": {"node": {}}}
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


def decode_first_frame(video_bytes):
  with av.open(io.BytesIO(video_bytes)) as container:
    frame = next(container.decode(video=0), None)
    return frame.to_ndarray(format="gray") if frame else None


class StreamSource:
  def __init__(self, video_id):
    self.video_id = video_id
    self.lock = threading.Lock()
    self.bytes_downloaded = 0
    self.refresh_count = 0
    self._load()

  def _load(self):
    with timer.time("fetch.yt_dlp_url"):
      with yt_dlp.YoutubeDL(YDL_OPTIONS) as ydl:
        self.url = ydl.extract_info(f"https://www.youtube.com/watch?v={self.video_id}", download=False)["url"]
    head = self._range(0, INDEX_BYTES)
    sidx_position, self.fragments, self.duration_s = parse_sidx(head)
    self.init_segment = head[:sidx_position]

  def _range(self, start, length):
    request = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{start + length - 1}"})
    with timer.time("fetch.http_range"):
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
    with timer.time("fetch.decode"):
      try:
        frame = decode_first_frame(self.init_segment + data)
      except av.error.FFmpegError as error:
        print(f"warn decode error at fragment {start_s:.0f}s: {error}", file=sys.stderr, flush=True)
        frame = None
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
