from match_resolver import resolve_label

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

if __name__ == "__main__":
  failures = [(text, expected, resolve_label(text)) for text, expected in CASES if resolve_label(text) != expected]
  print(f"summary cases={len(CASES)} failures={len(failures)}")
  for text, expected, actual in failures:
    print(f"  {text!r}: expected {expected}, got {actual}")
  raise SystemExit(1 if failures else 0)
