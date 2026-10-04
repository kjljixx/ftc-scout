import statistics

MIN_VISIBLE_S = 30


def estimate_wall_start(anchors):
  wall_starts = [actual_s - offset_s for actual_s, offset_s in anchors]
  median = statistics.median(wall_starts)
  return median, [wall_start - median for wall_start in wall_starts]


def predict_offsets(matches, wall_start_s, duration_s):
  predictions = [(match_id, round(actual_s - wall_start_s)) for match_id, actual_s in matches]
  return sorted(((match_id, offset_s) for match_id, offset_s in predictions if 0 <= offset_s <= duration_s - MIN_VISIBLE_S), key=lambda p: p[1])
