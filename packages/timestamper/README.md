# timestamper

Finds the start time of each match in a YouTube livestream VOD of an FTC event.

## How it works

1. `frame_fetcher.py` reads one frame every N seconds. It fetches only the first 100 KB of one 5 s piece of the 360p stream for each frame and decodes it in-process with PyAV.
2. `icon_locator.py` finds the robot, hand or gamepad icon above the match clock. The icon gives the match phase (auto, transition, teleop).
3. `clock_getter.py` reads the match clock below the icon by matching each digit against the templates in `tpl/digits/`.
4. `label_getter.py` reads the match label (for example "Qualification 9 of 50") above the icon.
5. `match_resolver.py` turns the label text into a match: it finds the level word and the number (ignoring junk letters around them) and computes the match id with the same formula as the server's `Match` entity (`level × 10000 + series × 1000 + matchNum`). Practice labels are skipped.
6. `timestamp.py` computes the match start from phase and clock, then merges the results for each match.

## Usage

```
python timestamp.py <youtube_video_id> [--step 120] [--json]
```

The table shows the match description (`Q-9`, `M-3`). The `--json` output also has the match id. The video must belong to one event (for a division event, one division); the caller decides which event the ids refer to.

From Python, call `timestamp.timestamp_video(video_id, step_s=120)`. It returns `(matches, counts)`: one dict per match (`match_id`, `description`, `start_s`, `frames`, `agreeing`, `spread_s`) and the frame outcome counts.

The pause between autonomous and teleop is fixed at 8 s (`TRANSITION_S` in `timestamp.py`).

## Worker

`worker.py` runs jobs from the `timestamp_job` table (created by the server's TypeORM entities):

1. It claims the oldest `Queued` job and marks it `Running`.
2. It runs `timestamp_video` on the job's video.
3. In one transaction it upserts one row per match into `match_video_timestamp` (key: season, event code, match id, video id) and marks the job `Done` with `matches_found`. If the video fails, the job is marked `Failed` with the error text.

```
python worker.py          # polls every 5 s until stopped
python worker.py --once   # exits when the queue is empty
```

It reads `DATABASE_URL` from the environment, or from `../server/.env`. It assumes a single worker: at startup it re-queues every job still marked `Running`. Under PM2 it is the `timestamper` app in `ecosystem.config.cjs` and `ecosystem_prod.config.cjs` (`pm2 start ecosystem_prod.config.cjs --only timestamper`).

## Requirements

- Python 3.10+ with `pip install -r requirements.txt`
- `node` and `tesseract` on the PATH (`node` runs the YouTube challenge solver for `yt-dlp`; `tesseract` reads the match label only)

## Known limits

- Fully run on the Pennsylvania Championship (Days 1 and 2) and one Michiana division day. Frames from Niagara and Worlds VODs were only sampled.
- Match labels "Qualification N" and "Playoff Match N" are mapped to match ids. Practice labels are skipped. Worlds Finale labels ("da Vinci Match N", "Finals N"), replays and 2-team finals are not handled yet.
- Hard-coded to the 360p format (YouTube format ID 134), the DECODE-season scoreboard icons and an 8 s transition.
- A match seen in only one frame has no cross-check. Matches with no readable frame are missing from the result.
