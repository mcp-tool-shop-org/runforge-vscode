"""
Dataset inspection for RunForge Phase 2.2.1

Provides read-only, non-mutating dataset inspection:
- Lists columns
- Computes row count and feature count
- Validates label column exists
- Computes deterministic dataset fingerprint

Does NOT:
- Modify data
- Drop rows
- Guess or infer labels
- Execute training
"""

import hashlib
import json
import sys
from pathlib import Path
from typing import List, Tuple


def compute_dataset_fingerprint(path: Path) -> str:
    """
    Compute SHA-256 fingerprint of dataset file bytes.

    This is Option A from the implementation plan: hash raw bytes.
    Deterministic and simple. Byte changes (including line endings)
    will change the hash, which is correct behavior.
    """
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        # Read in chunks for memory efficiency
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def parse_csv_header(path: Path) -> Tuple[List[str], int]:
    """
    Parse CSV to extract header and row count.

    Returns:
        columns: List of column names
        num_rows: Total data rows (excluding header)
    """
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    if len(lines) < 1:
        raise ValueError("CSV file is empty")

    # Parse header
    header = [h.strip() for h in lines[0].strip().split(",")]

    # Count data rows (non-empty lines after header)
    num_rows = 0
    for line in lines[1:]:
        if line.strip():
            num_rows += 1

    return header, num_rows


def inspect_dataset(
    dataset_path: str,
    label_column: str = "label",
) -> dict:
    """
    Inspect a dataset without training.

    Args:
        dataset_path: Path to CSV file
        label_column: Expected label column name (default: "label")

    Returns:
        Inspection result as dict matching inspect.schema.v0.2.2.1

    Raises:
        FileNotFoundError: If dataset doesn't exist
        ValueError: If CSV is malformed
    """
    path = Path(dataset_path)

    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    # Compute fingerprint
    fingerprint = compute_dataset_fingerprint(path)

    # Parse CSV
    columns, num_rows = parse_csv_header(path)

    # Check label presence
    label_present = label_column in columns

    # Feature count excludes label
    num_features = len(columns) - 1 if label_present else len(columns)

    return {
        "dataset_path": str(path.resolve()),
        "fingerprint_sha256": fingerprint,
        "columns": columns,
        "num_rows": num_rows,
        "label_column": label_column,
        "num_features_excluding_label": num_features,
        "label_present": label_present,
    }


def inspect_dataset_json(
    dataset_path: str,
    label_column: str = "label",
) -> str:
    """
    Inspect dataset and return canonical JSON string.

    Uses sorted keys and compact separators for determinism.
    """
    result = inspect_dataset(dataset_path, label_column)
    return json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"


def run_inspect_command(args: List[str]) -> int:
    """
    CLI entrypoint for inspect subcommand.

    Usage: python -m ml_runner inspect --dataset <path> [--label <column>]

    Returns:
        Exit code (0 = success, 1 = error)
    """
    import argparse

    parser = argparse.ArgumentParser(
        prog="ml_runner inspect",
        description="Inspect dataset without training"
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Path to CSV dataset"
    )
    parser.add_argument(
        "--label",
        default="label",
        help="Expected label column name (default: label)"
    )

    parsed = parser.parse_args(args)

    try:
        result = inspect_dataset(parsed.dataset, parsed.label)

        # Output canonical JSON
        output = json.dumps(result, sort_keys=True, indent=2, ensure_ascii=False)
        print(output)

        # Exit with error if label is missing
        if not result["label_present"]:
            print(f"\nError: Label column '{parsed.label}' not found.", file=sys.stderr)
            print(f"Available columns: {result['columns']}", file=sys.stderr)
            return 1

        return 0

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
