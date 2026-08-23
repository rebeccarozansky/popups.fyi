#!/usr/bin/env python
"""Thin entry point so you can run `python scrape.py ...` from this folder.

See README.md for setup, and `python scrape.py --help` for options.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from popup_scraper.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
