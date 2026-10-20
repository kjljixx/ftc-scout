import json, sys, time, urllib.request
from datetime import datetime

PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
CLIENT = {"clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "en"}
TIMEOUT_S = 20


def fetch_start_s(video_id):
  began = time.time()
  body = json.dumps({"videoId": video_id, "context": {"client": CLIENT}}).encode()
  request = urllib.request.Request(PLAYER_URL, data=body, headers={"Content-Type": "application/json"})
  response = json.load(urllib.request.urlopen(request, timeout=TIMEOUT_S))
  broadcast = response.get("microformat", {}).get("playerMicroformatRenderer", {}).get("liveBroadcastDetails")
  if not broadcast or "startTimestamp" not in broadcast:
    status = response.get("playabilityStatus", {})
    raise ValueError(f"YouTube gave no live broadcast start time for {video_id} (playability {status.get('status')}: {status.get('reason')})")
  print(f"youtube broadcast start video={video_id} start={broadcast['startTimestamp']} wall={time.time() - began:.2f}s", flush=True)
  return datetime.fromisoformat(broadcast["startTimestamp"]).timestamp()


if __name__ == "__main__":
  print(fetch_start_s(sys.argv[1]))
