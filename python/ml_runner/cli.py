"""
CLI argument parsing for ml_runner

Phase 2.2.1 adds:
- inspect: Dataset inspection (pre-run validation)
- metadata: View run metadata
"""

import argparse
import sys
from typing import Optional
from .runner import run_training
from .inspect import run_inspect_command
from .metadata import run_metadata_command


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

    # inspect command (Phase 2.2.1)
    inspect_parser = subparsers.add_parser(
        "inspect",
        help="Inspect dataset without training"
    )
    inspect_parser.add_argument(
        "--dataset",
        required=True,
        help="Path to CSV dataset"
    )
    inspect_parser.add_argument(
        "--label",
        default="label",
        help="Expected label column name (default: label)"
    )

    # metadata command (Phase 2.2.1)
    metadata_parser = subparsers.add_parser(
        "metadata",
        help="View or export run metadata"
    )
    metadata_group = metadata_parser.add_mutually_exclusive_group(required=True)
    metadata_group.add_argument(
        "--latest",
        action="store_true",
        help="Show metadata for the latest run"
    )
    metadata_group.add_argument(
        "--run-id",
        help="Show metadata for a specific run ID"
    )
    metadata_parser.add_argument(
        "--runforge-dir",
        default=".runforge",
        help="Path to .runforge directory (default: .runforge)"
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

    elif args.command == "inspect":
        return run_inspect_command(["--dataset", args.dataset, "--label", args.label])

    elif args.command == "metadata":
        if args.latest:
            return run_metadata_command(["--latest", "--runforge-dir", args.runforge_dir])
        else:
            return run_metadata_command(["--run-id", args.run_id, "--runforge-dir", args.runforge_dir])

    return 0
