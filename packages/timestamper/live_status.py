import re, urllib.request

WATCH_URL = "https://www.youtube.com/watch?v={}"
REQUEST_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept-Language": "en"}
TIMEOUT_S = 20


def fetch_ended_length_s(video_id):
  request = urllib.request.Request(WATCH_URL.format(video_id), headers=REQUEST_HEADERS)
  page = urllib.request.urlopen(request, timeout=TIMEOUT_S).read().decode("utf-8", errors="replace")
  if '"isLiveNow":true' in page:
    return None
  length = re.search(r'"lengthSeconds":"(\d+)"', page)
  return int(length.group(1)) or None if length else None
