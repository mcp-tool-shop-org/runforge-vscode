"""
CLI argument parsing for ml_runner
"""

import argparse
import sys
from typing import Optional
from .runner import run_training


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="ml_runner",
        description="RunForge Training Runner",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # train command
    train_parser = subparsers.add_parser("train", help="Run training")
    train_parser.add_argument(
        "--preset",
        required=True,
        choices=["std-train", "hq-train"],
        help="Training preset ID",
    )
    train_parser.add_argument(
        "--out",
        required=True,
        help="Output directory for run artifacts",
    )
    train_parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed (optional)",
    )
    train_parser.add_argument(
        "--device",
        required=True,
        choices=["cuda", "cpu"],
        help="Device to use for training (extension decides, runner must respect)",
    )

    args = parser.parse_args()

    if args.command == "train":
        try:
            run_training(
                preset_id=args.preset,
                out_dir=args.out,
                seed=args.seed,
                device=args.device,
            )
            return 0
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1

    return 0
