import av, io, re, struct, sys, threading, time, urllib.error, urllib.request, yt_dlp
from concurrent.futures import ThreadPoolExecutor
from stage_timer import timer

FORMAT_ID = "134"
YDL_OPTIONS = {"quiet": True, "no_warnings": True, "skip_download": True, "js_runtimes": {"node": {}}, "live_from_start": True}
LIVE_STATUSES = ("is_live", "post_live")
LIVE_FRAGMENT_S = 5
SEQUENCE_PATTERN = re.compile(r"([?&])sq=\d+")
INDEX_BYTES = 200000
FRAGMENT_BYTES = 100000
WORKERS = 8
RANGE_ATTEMPTS = 3
EXTRACT_ATTEMPTS = 3
RETRY_DELAY_S = 1


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


def extract_info(video_id):
  for attempt in range(1, EXTRACT_ATTEMPTS + 1):
    try:
      with timer.time("fetch.yt_dlp_url"):
        with yt_dlp.YoutubeDL(YDL_OPTIONS) as ydl:
          return ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    except yt_dlp.utils.DownloadError as error:
      if attempt == EXTRACT_ATTEMPTS:
        raise
      print(f"warn yt-dlp failed (attempt {attempt} of {EXTRACT_ATTEMPTS}): {str(error)[-90:]}", file=sys.stderr, flush=True)
      time.sleep(RETRY_DELAY_S * attempt)


def pick_format(info, format_id):
  found = next((f for f in info["formats"] if f["format_id"] == format_id), None)
  if not found:
    raise ValueError(f"format {format_id} is not available for this video")
  return found["url"]


def live_fragment_template(info):
  fragments = next(f for f in info["formats"] if f["format_id"] == FORMAT_ID).get("fragments")
  if not fragments:
    raise ValueError("this live stream cannot be read from its start")
  first = next(iter(fragments({})))
  return SEQUENCE_PATTERN.sub(r"\g<1>sq={}", first["url"]), int(first["fragment_count"])


class RefreshableSource:
  def __init__(self, video_id, info):
    self.video_id = video_id
    self.lock = threading.Lock()
    self.bytes_downloaded = 0
    self.refresh_count = 0
    self.is_live = False
    self._load(info)

  def _download(self, url, headers=None):
    with timer.time("fetch.http_range"):
      data = urllib.request.urlopen(urllib.request.Request(url, headers=headers or {})).read()
    self.bytes_downloaded += len(data)
    return data

  def _fetch_with_refresh(self, fetch):
    for attempt in range(1, RANGE_ATTEMPTS + 1):
      stale_load = self.load_id
      try:
        return fetch()
      except urllib.error.HTTPError as error:
        if attempt == RANGE_ATTEMPTS:
          raise
        print(f"warn http {error.code} on request (attempt {attempt} of {RANGE_ATTEMPTS}); refreshing stream url", file=sys.stderr, flush=True)
        with self.lock:
          if self.load_id == stale_load:
            self.refresh_count += 1
            self._load(extract_info(self.video_id))
        time.sleep(RETRY_DELAY_S * attempt)

  def _decode(self, video_bytes, start_s):
    with timer.time("fetch.decode"):
      try:
        return decode_first_frame(video_bytes)
      except av.error.FFmpegError as error:
        print(f"warn decode error at {start_s:.0f}s: {error}", file=sys.stderr, flush=True)
        return None


class StreamSource(RefreshableSource):
  def _load(self, info):
    self.url = pick_format(info, FORMAT_ID)
    self.load_id = self.url
    head = self._download(self.url, {"Range": f"bytes=0-{INDEX_BYTES - 1}"})
    sidx_position, self.fragments, self.duration_s = parse_sidx(head)
    self.init_segment = head[:sidx_position]

  def _range(self, start, length):
    return self._download(self.url, {"Range": f"bytes={start}-{start + length - 1}"})

  def frame_at(self, time_s):
    start_s, offset, size = next(f for f in reversed(self.fragments) if f[0] <= time_s)
    data = self._fetch_with_refresh(lambda: self._range(offset, min(FRAGMENT_BYTES, size)))
    return start_s, self._decode(self.init_segment + data, start_s)


class LiveStreamSource(RefreshableSource):
  def _load(self, info):
    self.is_live = True
    self.url_template, fragment_count = live_fragment_template(info)
    self.load_id = self.url_template
    self.duration_s = fragment_count * LIVE_FRAGMENT_S

  def frame_at(self, time_s):
    sequence = min(int(time_s // LIVE_FRAGMENT_S), int(self.duration_s // LIVE_FRAGMENT_S) - 1)
    data = self._fetch_with_refresh(lambda: self._download(self.url_template.format(sequence)))
    start_s = sequence * LIVE_FRAGMENT_S
    return start_s, self._decode(data, start_s)


def open_source(video_id):
  info = extract_info(video_id)
  source_class = LiveStreamSource if info.get("live_status") in LIVE_STATUSES else StreamSource
  source = source_class(video_id, info)
  print(f"config video={video_id} source={source_class.__name__} duration={source.duration_s:.0f}s", flush=True)
  return source


def fetch_frames(video_id, step_s=60, start_s=0, end_s=None, workers=WORKERS):
  began = time.time()
  source = open_source(video_id)
  end_s = min(end_s or source.duration_s, source.duration_s)
  times = list(range(int(start_s), int(end_s), step_s))
  print(f"config step={step_s}s frames={len(times)} workers={workers}", flush=True)
  failed = 0
  with ThreadPoolExecutor(workers) as pool:
    for fragment_start_s, frame in pool.map(source.frame_at, times):
      if frame is None:
        failed += 1
        print(f"warn no frame decoded for fragment at {fragment_start_s:.0f}s", file=sys.stderr, flush=True)
      yield fragment_start_s, frame
  print(f"summary frames={len(times)} failed={failed} downloaded={source.bytes_downloaded / 1e6:.1f}MB url_refreshes={source.refresh_count} wall={time.time() - began:.1f}s", flush=True)


def fetch_frame_batches(source, times, batch_size=WORKERS):
  with ThreadPoolExecutor(batch_size) as pool:
    for start in range(0, len(times), batch_size):
      yield list(pool.map(source.frame_at, times[start:start + batch_size]))


if __name__ == "__main__":
  video_id, step_s = sys.argv[1], int(sys.argv[2])
  frames = list(fetch_frames(video_id, step_s))
  print(f"first 3 times: {[round(t) for t, _ in frames[:3]]} frame_shape={frames[0][1].shape if frames[0][1] is not None else None}")
