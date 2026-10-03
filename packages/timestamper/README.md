# timestamper

Finds the start time of each match in a YouTube livestream VOD of an FTC event.

## How it works

1. `frame_fetcher.py` reads one frame every N seconds. It fetches only the first 100 KB of one 5 s piece of the 360p stream for each frame and decodes it in-process with PyAV.
2. `icon_locator.py` finds the robot, hand or gamepad icon above the match clock. The icon gives the match phase (auto, transition, teleop).
3. `clock_getter.py` reads the match clock below the icon by matching each digit against the templates in `tpl/digits/`.
4. `label_getter.py` reads the match label (for example "Qualification 9 of 50") above the icon.
5. `timestamp.py` computes the match start from phase and clock, then merges the results for each match.

## Usage

```
python timestamp.py <youtube_video_id> [--step 120] [--transition 8] [--json]
```

`--transition` is the pause between autonomous and teleop in seconds: 8 at Pennsylvania, 15 at the 2026 FIRST Championship.

## Requirements

- Python 3.10+ with `pip install -r requirements.txt`
- `node` and `tesseract` on the PATH (`node` runs the YouTube challenge solver for `yt-dlp`; `tesseract` reads the match label only)

## Known limits

- Tested on the Pennsylvania Championship Day 1 VOD only (10 of 10 matches found, frames agree to the second).
- Matches are named by the label text. They are not yet matched to match IDs in the database.
- Hard-coded to the 360p format (YouTube format ID 134) and the DECODE-season scoreboard icons.
