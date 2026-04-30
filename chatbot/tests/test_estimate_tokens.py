"""
Unit tests for helper.py token estimation functions.

Covers:
  - _estimate_text_tokens  (all branches)
  - _estimate_tool_call_tokens
  - estimateTokens          (the public API)
"""

import sys
import os
import unittest

# Ensure the parent directory is on the path so we can import helper
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from helper import (
    estimateTokens,
    _estimate_text_tokens,
    _estimate_tool_call_tokens,
)


# ---------------------------------------------------------------------------
# _estimate_text_tokens
# ---------------------------------------------------------------------------

class TestEstimateTextTokens(unittest.TestCase):
    """Exercise every branch inside _estimate_text_tokens."""

    MULTIPLIER = 1.6

    # --- None / empty ------------------------------------------------------

    def test_none_returns_zero(self):
        self.assertEqual(_estimate_text_tokens(None, self.MULTIPLIER), 0)

    def test_empty_string_returns_zero(self):
        self.assertEqual(_estimate_text_tokens("", self.MULTIPLIER), 0)

    def test_empty_list_returns_zero(self):
        self.assertEqual(_estimate_text_tokens([], self.MULTIPLIER), 0)

    # --- List (multimodal) -------------------------------------------------

    def test_list_flattens_and_uses_char_division(self):
        """List content ? flattened string ? len/4 * multiplier."""
        content = [{"type": "text", "text": "hello"}]
        flat = "".join(str(item) for item in content)
        expected = (len(flat) / 4) * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_text_tokens(content, self.MULTIPLIER), expected
        )

    def test_multimodal_list_with_multiple_blocks(self):
        content = [
            {"type": "text", "text": "Describe this image."},
            {"type": "image_url", "image_url": {"url": "https://example.com/img.png"}},
        ]
        flat = "".join(str(item) for item in content)
        expected = (len(flat) / 4) * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_text_tokens(content, self.MULTIPLIER), expected
        )

    # --- Short string (= 10 000 chars) ? word-based -----------------------

    def test_short_string_uses_word_count(self):
        content = "The quick brown fox jumps over the lazy dog"  # 9 words
        expected = 9 * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_text_tokens(content, self.MULTIPLIER), expected
        )

    def test_short_string_single_word(self):
        content = "Hello"
        expected = 1 * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_text_tokens(content, self.MULTIPLIER), expected
        )

    def test_short_string_with_punctuation(self):
        content = "Hello, world! How are you?"  # 5 words after split
        result = _estimate_text_tokens(content, self.MULTIPLIER)
        self.assertEqual(result, len(content.split()) * self.MULTIPLIER)

    # --- Long string (> 10 000 chars) ? character-based --------------------

    def test_long_string_uses_char_based(self):
        content = "x" * 15000  # 15 000 chars
        expected = (15000 / 4) * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_text_tokens(content, self.MULTIPLIER), expected
        )

    def test_exactly_10001_chars(self):
        content = "a" * 10001
        expected = (10001 / 4) * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_text_tokens(content, self.MULTIPLIER), expected
        )

    def test_exactly_10000_chars_still_word_based(self):
        """Boundary: 10 000 is NOT > 10000, so still word-based."""
        content = "word " * 2500  # 2500 words, 12500 chars? Let's be precise
        # Actually let's craft exactly 10000 chars
        content = "x" * 10000
        # This is a single "word" of 10000 chars, word-count = 1
        expected = 1 * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_text_tokens(content, self.MULTIPLIER), expected
        )

    # --- Fallback for unexpected types -------------------------------------

    def test_int_fallback(self):
        content = 42
        expected = (len(str(content)) / 4) * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_text_tokens(content, self.MULTIPLIER), expected
        )

    def test_float_fallback(self):
        content = 3.14159
        expected = (len(str(content)) / 4) * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_text_tokens(content, self.MULTIPLIER), expected
        )

    # --- Edge: multiplier variations ---------------------------------------

    def test_multiplier_of_one(self):
        content = "one two three"  # 3 words
        self.assertAlmostEqual(_estimate_text_tokens(content, 1.0), 3.0)

    def test_multiplier_of_two(self):
        content = "one two"  # 2 words
        self.assertAlmostEqual(_estimate_text_tokens(content, 2.0), 4.0)


# ---------------------------------------------------------------------------
# _estimate_tool_call_tokens
# ---------------------------------------------------------------------------

class TestEstimateToolCallTokens(unittest.TestCase):
    MULTIPLIER = 1.6

    def test_non_dict_fallback(self):
        """Non-dict input uses str() then char-based / 4."""
        content = ["not", "a", "dict"]
        flat_len = len(str(content))
        expected = (flat_len / 4) * self.MULTIPLIER
        self.assertAlmostEqual(
            _estimate_tool_call_tokens(content, self.MULTIPLIER), expected
        )

    def test_full_tool_call_dict(self):
        """Typical tool-call: id + function.name + function.arguments + 12."""
        tc = {
            "id": "call_abc123",
            "type": "function",
            "function": {
                "name": "execute_terminal_command",
                "arguments": '{"command": "dir"}',
            },
        }

        # Build expected manually
        id_tokens = _estimate_text_tokens("call_abc123", self.MULTIPLIER)
        name_tokens = _estimate_text_tokens("execute_terminal_command", self.MULTIPLIER)
        args_tokens = (len('{"command": "dir"}') / 4) * self.MULTIPLIER
        expected = id_tokens + name_tokens + args_tokens + 12

        self.assertAlmostEqual(
            _estimate_tool_call_tokens(tc, self.MULTIPLIER), expected
        )

    def test_tool_call_missing_id(self):
        tc = {
            "type": "function",
            "function": {"name": "foo", "arguments": "{}"},
        }
        # id missing ? empty string ? 0 tokens from id
        name_tokens = _estimate_text_tokens("foo", self.MULTIPLIER)
        args_tokens = (len("{}") / 4) * self.MULTIPLIER
        expected = 0 + name_tokens + args_tokens + 12
        self.assertAlmostEqual(
            _estimate_tool_call_tokens(tc, self.MULTIPLIER), expected
        )

    def test_tool_call_missing_function(self):
        tc = {"id": "call_xyz"}
        # No function dict ? no name/args tokens, just id + overhead
        id_tokens = _estimate_text_tokens("call_xyz", self.MULTIPLIER)
        expected = id_tokens + 12
        self.assertAlmostEqual(
            _estimate_tool_call_tokens(tc, self.MULTIPLIER), expected
        )

    def test_tool_call_empty_arguments(self):
        tc = {
            "id": "call_empty",
            "function": {"name": "noop", "arguments": ""},
        }
        id_tokens = _estimate_text_tokens("call_empty", self.MULTIPLIER)
        name_tokens = _estimate_text_tokens("noop", self.MULTIPLIER)
        # Empty arguments ? 0 tokens (if-check skips empty str)
        expected = id_tokens + name_tokens + 0 + 12
        self.assertAlmostEqual(
            _estimate_tool_call_tokens(tc, self.MULTIPLIER), expected
        )


# ---------------------------------------------------------------------------
# estimateTokens (public API)
# ---------------------------------------------------------------------------

class TestEstimateTokens(unittest.TestCase):
    MULTIPLIER = 1.6

    # --- System message ----------------------------------------------------

    def test_system_message_input_only(self):
        messages = [{"role": "system", "content": "You are a helpful assistant."}]
        result = estimateTokens(messages, "", self.MULTIPLIER)

        expected_input = _estimate_text_tokens(messages[0]["content"], self.MULTIPLIER)
        self.assertEqual(result["input_tokens"], int(expected_input))
        self.assertEqual(result["output_tokens"], 0)
        self.assertEqual(result["total_tokens"], int(expected_input))

    # --- User message ------------------------------------------------------

    def test_user_message_input_only(self):
        messages = [{"role": "user", "content": "What is the weather?"}]
        result = estimateTokens(messages, "", self.MULTIPLIER)

        expected_input = _estimate_text_tokens(messages[0]["content"], self.MULTIPLIER)
        self.assertEqual(result["input_tokens"], int(expected_input))
        self.assertEqual(result["output_tokens"], 0)
        self.assertEqual(result["total_tokens"], int(expected_input))

    # --- Assistant message -------------------------------------------------

    def test_assistant_message_counts_both(self):
        """Assistant content contributes to both input and output."""
        messages = [{"role": "assistant", "content": "The weather is sunny."}]
        result = estimateTokens(messages, "", self.MULTIPLIER)

        content_tokens = _estimate_text_tokens(messages[0]["content"], self.MULTIPLIER)
        self.assertEqual(result["input_tokens"], int(content_tokens))
        self.assertEqual(result["output_tokens"], int(content_tokens))
        self.assertEqual(result["total_tokens"], int(content_tokens * 2))

    # --- Tool message ------------------------------------------------------

    def test_tool_message_with_metadata(self):
        messages = [
            {
                "role": "tool",
                "tool_call_id": "call_abc123",
                "name": "execute_terminal_command",
                "content": "file1.txt\nfile2.txt",
            }
        ]
        result = estimateTokens(messages, "", self.MULTIPLIER)

        content_tokens = _estimate_text_tokens(messages[0]["content"], self.MULTIPLIER)
        id_tokens = _estimate_text_tokens("call_abc123", self.MULTIPLIER)
        name_tokens = _estimate_text_tokens("execute_terminal_command", self.MULTIPLIER)
        expected_input = content_tokens + id_tokens + name_tokens

        self.assertEqual(result["input_tokens"], int(expected_input))
        self.assertEqual(result["output_tokens"], 0)
        self.assertEqual(result["total_tokens"], int(expected_input))

    def test_tool_message_missing_metadata(self):
        """Tool message without tool_call_id or name -- only content counts."""
        messages = [{"role": "tool", "content": "some result"}]
        result = estimateTokens(messages, "", self.MULTIPLIER)

        expected_input = _estimate_text_tokens("some result", self.MULTIPLIER)
        self.assertEqual(result["input_tokens"], int(expected_input))
        self.assertEqual(result["output_tokens"], 0)

    # --- Tool calls on assistant -------------------------------------------

    def test_assistant_with_tool_calls(self):
        messages = [
            {
                "role": "assistant",
                "content": "Let me check that for you.",
                "tool_calls": [
                    {
                        "id": "call_123",
                        "type": "function",
                        "function": {
                            "name": "execute_terminal_command",
                            "arguments": '{"command": "dir"}',
                        },
                    }
                ],
            }
        ]
        result = estimateTokens(messages, "", self.MULTIPLIER)

        content_tokens = _estimate_text_tokens(messages[0]["content"], self.MULTIPLIER)
        tc_tokens = _estimate_tool_call_tokens(messages[0]["tool_calls"][0], self.MULTIPLIER)
        expected_each = content_tokens + tc_tokens

        self.assertEqual(result["input_tokens"], int(expected_each))
        self.assertEqual(result["output_tokens"], int(expected_each))
        self.assertEqual(result["total_tokens"], int(expected_each * 2))

    def test_assistant_with_multiple_tool_calls(self):
        messages = [
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_a",
                        "type": "function",
                        "function": {"name": "func_a", "arguments": "{}"},
                    },
                    {
                        "id": "call_b",
                        "type": "function",
                        "function": {"name": "func_b", "arguments": '{"x":1}'},
                    },
                ],
            }
        ]
        result = estimateTokens(messages, "", self.MULTIPLIER)

        # content is None ? 0 tokens
        tc_a = _estimate_tool_call_tokens(messages[0]["tool_calls"][0], self.MULTIPLIER)
        tc_b = _estimate_tool_call_tokens(messages[0]["tool_calls"][1], self.MULTIPLIER)
        expected_each = tc_a + tc_b

        self.assertEqual(result["input_tokens"], int(expected_each))
        self.assertEqual(result["output_tokens"], int(expected_each))
        self.assertEqual(result["total_tokens"], int(expected_each * 2))

    # --- Reasoning history -------------------------------------------------

    def test_reasoning_history_adds_to_output(self):
        messages = [{"role": "user", "content": "Hello"}]
        reasoning = "The user is greeting me..."

        result = estimateTokens(messages, reasoning, self.MULTIPLIER)

        input_from_msg = _estimate_text_tokens("Hello", self.MULTIPLIER)
        output_from_reasoning = _estimate_text_tokens(reasoning, self.MULTIPLIER)

        self.assertEqual(result["input_tokens"], int(input_from_msg))
        self.assertEqual(result["output_tokens"], int(output_from_reasoning))
        self.assertEqual(result["total_tokens"], int(input_from_msg + output_from_reasoning))

    def test_reasoning_history_none_skipped(self):
        messages = [{"role": "user", "content": "Hi"}]
        result = estimateTokens(messages, None, self.MULTIPLIER)
        self.assertEqual(result["output_tokens"], 0)

    def test_reasoning_history_empty_string(self):
        messages = [{"role": "user", "content": "Hi"}]
        result = estimateTokens(messages, "", self.MULTIPLIER)
        # Empty string ? _estimate_text_tokens returns 0
        self.assertEqual(result["output_tokens"], 0)

    # --- Full conversation integration -------------------------------------

    def test_full_multi_turn_conversation(self):
        """Simulate a realistic multi-turn with tool calls."""
        messages = [
            {"role": "system", "content": "You are an assistant."},
            {"role": "user", "content": "List files."},
            {
                "role": "assistant",
                "content": "Sure, let me check.",
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {
                            "name": "execute_terminal_command",
                            "arguments": '{"command": "dir"}',
                        },
                    }
                ],
            },
            {
                "role": "tool",
                "tool_call_id": "call_1",
                "name": "execute_terminal_command",
                "content": "file1.txt\nfile2.txt",
            },
            {"role": "assistant", "content": "You have two files: file1.txt and file2.txt."},
        ]
        reasoning = "I should list files for the user."

        result = estimateTokens(messages, reasoning, self.MULTIPLIER)

        # Verify all tokens are non-negative integers
        self.assertIsInstance(result["input_tokens"], int)
        self.assertIsInstance(result["output_tokens"], int)
        self.assertIsInstance(result["total_tokens"], int)
        self.assertGreaterEqual(result["input_tokens"], 0)
        self.assertGreaterEqual(result["output_tokens"], 0)
        self.assertEqual(
            result["total_tokens"],
            result["input_tokens"] + result["output_tokens"],
        )

    def test_message_without_role(self):
        """Message dict missing 'role' key ? treated as other (input only)."""
        messages = [{"content": "no role here"}]
        result = estimateTokens(messages, "", self.MULTIPLIER)

        expected_input = _estimate_text_tokens("no role here", self.MULTIPLIER)
        self.assertEqual(result["input_tokens"], int(expected_input))
        self.assertEqual(result["output_tokens"], 0)

    def test_empty_messages_list(self):
        result = estimateTokens([], "", self.MULTIPLIER)
        self.assertEqual(result["input_tokens"], 0)
        self.assertEqual(result["output_tokens"], 0)
        self.assertEqual(result["total_tokens"], 0)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    unittest.main(verbosity=2)

