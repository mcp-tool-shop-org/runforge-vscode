"""
F-PY-B003 (iter #5b): CSV loader error actionability tests.

Three edge cases used to surface as opaque failures:
1. UTF-8-with-BOM CSV (Excel default on Windows) — `﻿` would land in
   `header[0]` and trigger "CSV must contain a 'label' column" even when
   the file clearly had one.
2. All-NaN label column — surfaced as a generic "no valid data rows after
   dropping missing values" error after the row-drop step ate the signal.
3. Single-column CSV (only `label`, no features) — silently produced
   num_features=0 which then triggered cryptic sklearn warnings downstream.

Each is now a specific, actionable message at load_csv time.
"""

from pathlib import Path

import pytest

from ml_runner.runner import load_csv


class TestBomHandling:
    """UTF-8-BOM CSVs load successfully; the BOM is stripped from the header."""

    def test_bom_prefixed_csv_loads_successfully(self, tmp_path: Path):
        # Write a CSV with a UTF-8 BOM (b'\xef\xbb\xbf') at the start.
        path = tmp_path / "bom.csv"
        with open(path, "wb") as f:
            f.write(b"\xef\xbb\xbf")
            f.write(b"feature1,feature2,label\n")
            f.write(b"1.0,2.0,0\n")
            f.write(b"3.0,4.0,1\n")
            f.write(b"5.0,6.0,0\n")
            f.write(b"7.0,8.0,1\n")
            f.write(b"9.0,10.0,0\n")

        result = load_csv(path)

        assert result.num_samples == 5
        assert result.num_features == 2

    def test_bom_does_not_pollute_header(self, tmp_path: Path):
        """After stripping, no header column contains the BOM character."""
        path = tmp_path / "bom.csv"
        with open(path, "wb") as f:
            f.write(b"\xef\xbb\xbf")
            f.write(b"feature1,label\n")
            f.write(b"1.0,0\n")
            f.write(b"2.0,1\n")
            f.write(b"3.0,0\n")

        # Should NOT raise "CSV must contain a 'label' column"
        result = load_csv(path)
        assert result.num_features == 1


class TestAllNanLabel:
    """A label column with no values raises a specific message."""

    def test_all_empty_label_raises_specific_message(self, tmp_path: Path):
        path = tmp_path / "no_label.csv"
        path.write_text(
            "feature1,feature2,label\n"
            "1.0,2.0,\n"
            "3.0,4.0,\n"
            "5.0,6.0,\n"
        )

        with pytest.raises(ValueError, match="Label column 'label' is empty or all NaN"):
            load_csv(path)


class TestSingleColumnCsv:
    """A CSV with only `label` and no feature columns raises a specific message."""

    def test_label_only_csv_raises(self, tmp_path: Path):
        path = tmp_path / "label_only.csv"
        path.write_text(
            "label\n"
            "0\n"
            "1\n"
            "0\n"
            "1\n"
        )

        with pytest.raises(
            ValueError,
            match="CSV must have at least one feature column in addition to 'label'",
        ):
            load_csv(path)
