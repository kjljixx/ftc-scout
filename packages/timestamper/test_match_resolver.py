from match_resolver import LabelContext, describe_match_id, resolve_label

CASES = [
  ("Qualification 9 of 50 F", ("ok", 9, "Q-9")),
  ("oi Qualification 44 of 120 j", ("ok", 44, "Q-44")),
  ("t | Qualification 48 of 120 j", ("ok", 48, "Q-48")),
  ("Playoff Match 1", ("ok", 21001, "M-1")),
  ("Playoff Match 2 4", ("ok", 22001, "M-2")),
  ("ni Playoff Match 11 J", ("ok", 31001, "M-11")),
  ("3 Playoff Match 14 ;", ("ok", 34001, "M-14")),
  ("Practice 6 of 29 .", ("practice", None, None)),
  ("Example Match", ("unparsed", None, None)),
  ("= da Vinci Match 12 ,", ("wrong_kind", None, None)),
  ("da Vinci Finals 1", ("wrong_kind", None, None)),
  ("", ("unparsed", None, None)),
]

FINALS_CONTEXT = LabelContext(is_finals_event=True, finals_series=16)
FINALS_CASES = [
  ("Qualification 9 of 50 F", ("ok", 9, "Q-9")),
  ("= da Vinci Match 12 ,", ("ok", 32001, "M-12")),
  ("+ da Vinci Match 15", ("ok", 35001, "M-15")),
  ("> da Vinci Finals 1 j", ("ok", 36001, "M-16")),
  ("+ da Vinci Finals 2 J", ("ok", 36002, "M-16.2")),
  ("Playoff Match 14", ("wrong_kind", None, None)),
  ("Practice 6 of 29 .", ("practice", None, None)),
  ("Turing Match 3", ("unparsed", None, None)),
  ("Turing Finals 1", ("unparsed", None, None)),
]
NO_SERIES_CASES = [("da Vinci Finals 1", ("unparsed", None, None))]

DESCRIBE_CASES = {9: "Q-9", 120: "Q-120", 21001: "M-1", 34001: "M-14", 25002: "M-5.2", 20001: "F-1", 11002: "SF1-2"}

if __name__ == "__main__":
  failures = [(text, expected, resolve_label(text)) for text, expected in CASES if resolve_label(text) != expected]
  failures += [(text, expected, resolve_label(text, FINALS_CONTEXT)) for text, expected in FINALS_CASES if resolve_label(text, FINALS_CONTEXT) != expected]
  failures += [(text, expected, resolve_label(text, LabelContext(is_finals_event=True))) for text, expected in NO_SERIES_CASES if resolve_label(text, LabelContext(is_finals_event=True)) != expected]
  failures += [(match_id, expected, describe_match_id(match_id)) for match_id, expected in DESCRIBE_CASES.items() if describe_match_id(match_id) != expected]
  print(f"summary cases={len(CASES) + len(FINALS_CASES) + len(NO_SERIES_CASES) + len(DESCRIBE_CASES)} failures={len(failures)}")
  for text, expected, actual in failures:
    print(f"  {text!r}: expected {expected}, got {actual}")
  raise SystemExit(1 if failures else 0)
