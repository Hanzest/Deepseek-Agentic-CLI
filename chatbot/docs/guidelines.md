# Test Guidelines — `helper.py` Token Estimation

## Quick start

```powershell
# Run all tests (verbose)
cd tests
python -m pytest test_estimate_tokens.py -v

# Run a single test class
python -m pytest test_estimate_tokens.py::TestEstimateTokens -v

# Run a single test method
python -m pytest test_estimate_tokens.py::TestEstimateTokens::test_full_multi_turn_conversation -v

# With coverage (if installed)
pip install pytest-cov
python -m pytest test_estimate_tokens.py --cov=helper --cov-report=term-missing
```

## What's tested

| Unit | Coverage |
|---|---|
| `_estimate_text_tokens` | None/empty, list (multimodal), short string (word-based), long string >10k (char-based), non-str fallback, multiplier variations, boundary at exactly 10 000 chars |
| `_estimate_tool_call_tokens` | Full dict, non-dict fallback, missing `id`, missing `function`, empty arguments |
| `estimateTokens` | system/user/assistant/tool roles, tool_calls on assistant (single + multiple), reasoning_history (string/None/empty), messages missing role, empty list, full multi-turn integration |

## File layout

```
chatbot/
  helper.py                       # code under test
  tests/
    test_estimate_tokens.py       # 33 unit tests
  guidelines.md                   # this file
```

## Adding new tests

1. Open `tests/test_estimate_tokens.py`.
2. Add a method to the appropriate `TestCase` class.
3. Name it `test_<description>` so pytest discovers it.
4. Use `self.assertAlmostEqual` for float token values and `self.assertEqual` for integer results from `estimateTokens`.
5. Run the suite to confirm green before committing.
