# timestamper

Finds the start time of each match in a YouTube livestream VOD of an FTC event.

## How it works

1. `frame_fetcher.py` reads one frame every N seconds. It fetches only the first 100 KB of one 5 s piece of the 360p stream for each frame and decodes it in-process with PyAV.
2. `icon_locator.py` finds the robot, hand or gamepad icon above the match clock. The icon gives the match phase (auto, transition, teleop).
3. `clock_getter.py` reads the match clock below the icon by matching each digit against the templates in `tpl/digits/`.
4. `label_getter.py` reads the match label (for example "Qualification 9 of 50") above the icon.
5. `match_resolver.py` turns the label text into a match: it finds the level word and the number (ignoring junk letters around them) and computes the match id with the same formula as the server's `Match` entity (`level × 10000 + series × 1000 + matchNum`). Practice labels are skipped.
6. `timestamp.py` computes the match start from phase and clock, then merges the results for each match.
7. `predict.py` and `event_matches.py` (anchored mode, below) turn one read match into the video's wall start time.

## Anchored mode

The worker needs the event's matches and their `actual_start_time` values. It does not read every match:

1. It reads frames in a spread-out order (coarse to fine), 8 at a time in parallel, and stops after the first batch in which at least one match that is in the database list has been read (an "anchor").
2. For each anchor, `wall_start = actual_start_time − position in the video` (the real-world time at which the video began). It takes the median over the anchors found in that batch.
3. It saves one row in `event_video`: the season, event code, video id, `wall_start`, and the video length (`NULL` while the video is a live stream). It saves no per-match rows.

The server computes a match's link when it is asked for: `position = match.actual_start_time − wall_start`. The video qualifies if `0 <= position <= length − 30`. For a live stream the length is `now − wall_start`. Matches outside the video (other days, other videos) get no link.

There is no check on the anchors. If no frame shows a match from the database list, the job fails.

## Usage

```
python timestamp.py <youtube_video_id> [--step 120] [--event <event_code> [--season 2025]]
```

With `--event` the script loads that event's match times from the database, finds the anchor, and lists the matches inside the video. Without it every match is read from frames (a full read, for checking only). The video must belong to one event (for a division event, one division); the caller decides which event the ids refer to.

From Python, call `timestamp.anchor_video(video_id, step_s, matches)`. `matches` is a list of `(match_id, actual_start_epoch_seconds)` (see `event_matches.load_event_matches`). It returns `wall_start_s`, `duration_s` and the frame outcome counts, or raises `NoAnchorError`.

The pause between autonomous and teleop is fixed at 8 s (`TRANSITION_S` in `timestamp.py`).

## Worker

`worker.py` runs jobs from the `timestamp_job` table (created by the server's TypeORM entities):

1. It claims the oldest `Queued` job and marks it `Running`.
2. It loads the event's match times from the `match` table and runs `anchor_video` on the job's video.
3. In one transaction it upserts the `event_video` row and marks the job `Done` with `matches_found` (the matches inside the video). If the video fails, the job is marked `Failed` with the error text.

For a live stream, `frame_fetcher.LiveStreamSource` asks yt-dlp for the stream from its start (`live_from_start`). The 360p format is then a list of numbered 5 s pieces (`sq=0` to `sq=N`), so a frame at time T comes from piece `T // 5`. This works for the whole stream, not only the last hour (tested on a 60 h stream: 0.2–0.7 s per frame).

A second thread checks every 30 s each `event_video` row whose length is `NULL` (a live stream). When `live_status.py` finds that the video is no longer live, it saves the final length.

```
python worker.py          # polls every second until stopped
python worker.py --once   # exits when the queue is empty
```

It reads `DATABASE_URL` from the environment, or from `../server/.env`. It assumes a single worker: at startup it re-queues every job still marked `Running`. Under PM2 it is the `timestamper` app in `ecosystem.config.cjs` and `ecosystem_prod.config.cjs` (`pm2 start ecosystem_prod.config.cjs --only timestamper`).

## GraphQL and demo

The server (`packages/server/src/graphql/resolvers/Timestamper.ts`) exposes:

- `mutation requestTimestamps(season, eventCode, videoId)`: queues a job. It needs no key, so anyone can choose which video is linked from an event's matches. It returns the existing job if one for the same event and video is waiting, running, or finished within the last 10 minutes, and it refuses new jobs while 20 are already waiting.
- `query timestampJob(id)` and `query timestampJobs(season, eventCode)`: job status.
- `Match.videoTimestamps`: for each video, `startSeconds`, `frames`, `agreeingFrames` and a YouTube `url` with `&t=`.

`demo.html` is a single-file page that calls these: enter the event and a YouTube video, press "Timestamp this video", and click a match to play it from its start. "Show saved timestamps" only reads existing results. Serve it from any local static server (for example `python -m http.server 8791` in this folder) and open `http://127.0.0.1:8791/demo.html`.

## Requirements

- Python 3.10+ with `pip install -r requirements.txt`
- `node` and `tesseract` on the PATH (`node` runs the YouTube challenge solver for `yt-dlp`; `tesseract` reads the match label only)

## Known limits

- Fully run on the Pennsylvania Championship (Days 1 and 2) and one Michiana division day. Frames from Niagara and Worlds VODs were only sampled.
- Match labels "Qualification N" and "Playoff Match N" are mapped to match ids. Practice labels are skipped. Worlds Finale labels ("da Vinci Match N", "Finals N"), replays and 2-team finals are not handled yet.
- Hard-coded to the 360p format (YouTube format ID 134), the DECODE-season scoreboard icons and an 8 s transition.
- Without match times (full read), a match seen in only one frame has no cross-check and a match with no readable frame is missing.
- The wall start assumes the video is a continuous recording of the event, and that the video belongs to the event code given. It does not check this. A cut or restarted stream, a wrong event or video, a misread anchor label, or a match played while the stream was off (or on a field the stream did not show) all give wrong predicted times with no warning.
- Range requests to YouTube sometimes fail with HTTP 403 for a moment; the fetcher refreshes the stream address once and retries up to 3 times.
