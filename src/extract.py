# -----------------------------------------------------------------------------
# Portions of this code are adapted from `extract.py` by virgiliojr94
#
# MIT License
# Copyright (c) 2025 virgiliojr94
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:

# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
# -----------------------------------------------------------------------------

#!/usr/bin/env python3
"""
Extract text from a document file for book-to-skill processing.
Backward-compatible entrypoint wrapper.
"""

import os
import sys

# Force UTF-8 stdout/stderr so extracted text, the attribution line's separators
# and the dependency-check glyphs (✓ / ✗) don't raise UnicodeEncodeError on Windows
# consoles that default to a legacy code page (e.g. GBK / cp936).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

# Ensure the project root directory (where the 'book_to_skill' package lives) is in sys.path
# so the modular package can be imported reliably regardless of the working directory.
sys.path.insert(0, str(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from book_to_skill.cli import main

if __name__ == "__main__":
    main()
