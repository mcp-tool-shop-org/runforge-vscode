"""
ml_runner entry point

Usage: python -m ml_runner train --preset <id> --out <dir> --device <device> [--seed <n>]
"""

import sys
from .cli import main

if __name__ == "__main__":
    sys.exit(main())
