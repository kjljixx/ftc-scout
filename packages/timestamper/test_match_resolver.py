from match_resolver import describe_match_id, resolve_label

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
  ("= da Vinci Match 12 ,", ("unparsed", None, None)),
  ("", ("unparsed", None, None)),
]

DESCRIBE_CASES = {9: "Q-9", 120: "Q-120", 21001: "M-1", 34001: "M-14", 25002: "M-5.2", 20001: "F-1", 11002: "SF1-2"}

if __name__ == "__main__":
  failures = [(text, expected, resolve_label(text)) for text, expected in CASES if resolve_label(text) != expected]
  failures += [(match_id, expected, describe_match_id(match_id)) for match_id, expected in DESCRIBE_CASES.items() if describe_match_id(match_id) != expected]
  print(f"summary cases={len(CASES) + len(DESCRIBE_CASES)} failures={len(failures)}")
  for text, expected, actual in failures:
    print(f"  {text!r}: expected {expected}, got {actual}")
  raise SystemExit(1 if failures else 0)
