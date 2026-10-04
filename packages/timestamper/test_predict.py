from predict import estimate_wall_start, predict_offsets

WALL_START = 1_000_000


def check(name, condition):
  print(f"{'ok  ' if condition else 'FAIL'} {name}")
  return condition


def anchors_at(*offsets, error_s=0):
  return [(WALL_START + offset + (error_s if i == 0 else 0), offset) for i, offset in enumerate(offsets)]


results = []

wall_start, residuals = estimate_wall_start(anchors_at(1961, 2272, 2617))
results.append(check("estimate: exact anchors give the wall start and zero residuals", wall_start == WALL_START and residuals == [0, 0, 0]))

wall_start, residuals = estimate_wall_start(anchors_at(1961, 2272, 2617, 3000, 3400, error_s=2))
results.append(check("estimate: one anchor 2 s off barely moves the median", wall_start == WALL_START and sorted(abs(r) for r in residuals)[-1] == 2))

wall_start, residuals = estimate_wall_start(anchors_at(1961))
results.append(check("estimate: a single anchor gives the wall start directly", wall_start == WALL_START and residuals == [0]))

wall_start, _ = estimate_wall_start(anchors_at(1961, 2272, 2617, error_s=30))
results.append(check("estimate: with three anchors one 30 s off, the median ignores it", wall_start == WALL_START))

matches = [(1, WALL_START + 1961), (2, WALL_START + 2272), (3, WALL_START - 500), (4, WALL_START + 99_999), (5, WALL_START + 100)]
predicted = predict_offsets(matches, WALL_START, duration_s=5000)
results.append(check("predict: keeps matches inside the video, sorted by position", predicted == [(5, 100), (1, 1961), (2, 2272)]))
results.append(check("predict: drops a match before the video and one after it", {3, 4}.isdisjoint({match_id for match_id, _ in predicted})))
results.append(check("predict: drops a match too close to the end to be visible", predict_offsets([(9, WALL_START + 4990)], WALL_START, 5000) == []))
results.append(check("predict: rounds to whole seconds", predict_offsets([(1, WALL_START + 100.6)], WALL_START, 5000) == [(1, 101)]))

print(f"summary cases={len(results)} failures={results.count(False)}")
raise SystemExit(0 if all(results) else 1)
