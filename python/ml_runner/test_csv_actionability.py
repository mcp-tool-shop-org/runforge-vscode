"""
F-PY-B003 (iter #5b) + FT-PY-008 (Phase 4 §3.3): CSV loader error
actionability tests.

Edge cases that used to surface as opaque failures:

F-PY-B003 (Stage C):
1. UTF-8-with-BOM CSV (Excel default on Windows) — `﻿` would land in
   `header[0]` and trigger "CSV must contain a 'label' column" even when
   the file clearly had one.
2. All-NaN label column — surfaced as a generic "no valid data rows after
   dropping missing values" error after the row-drop step ate the signal.
3. Single-column CSV (only `label`, no features) — silently produced
   num_features=0 which then triggered cryptic sklearn warnings downstream.

FT-PY-008 (Phase 4 §3.3, Wave 1 — conservative explicit-error path per
Q5; Phase 4 does NOT auto-detect delimiter or encoding):
4. Non-comma delimiter (semicolon, tab) — used to fail downstream with
   "Row N: expected M columns, got 1" or similar; now an explicit error
   tells the user how to convert the file.
5. Non-UTF-8 encoding (Latin-1, etc.) — used to bubble up a raw
   UnicodeDecodeError from `open()`; now wrapped with a clear instruction
   to re-save as UTF-8.
6. Non-numeric label column (categorical strings like "yes"/"no") — used
   to surface as a generic "Non-numeric value in column 'label'" message;
   now produces a label-specific message that names LabelEncoder as the
   conversion path.
7. Header-only CSV (no data rows, possibly with trailing blank lines) —
   now produces the spec'd "CSV has no data rows (only header)..."
   message uniformly.

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


class TestNonCommaDelimiter:
    """FT-PY-008 (Phase 4 §3.3): non-comma delimiters raise actionable errors.

    Phase 4 does NOT auto-detect delimiters (Q5 conservative path). The
    user is told the detected delimiter + the exact pandas one-liner that
    converts the file.
    """

    def test_semicolon_delimited_csv_raises_actionable_error(self, tmp_path: Path):
        path = tmp_path / "semi.csv"
        path.write_text(
            "feature1;feature2;label\n"
            "1.0;2.0;0\n"
            "3.0;4.0;1\n"
            "5.0;6.0;0\n"
        )

        with pytest.raises(ValueError) as excinfo:
            load_csv(path)

        msg = str(excinfo.value)
        assert "';' delimiter" in msg
        assert "only ',' is supported" in msg
        assert "pandas.read_csv" in msg
        assert "sep=';'" in msg

    def test_tab_delimited_csv_raises_actionable_error(self, tmp_path: Path):
        path = tmp_path / "tabs.csv"
        path.write_text(
            "feature1\tfeature2\tlabel\n"
            "1.0\t2.0\t0\n"
            "3.0\t4.0\t1\n"
            "5.0\t6.0\t0\n"
        )

        with pytest.raises(ValueError) as excinfo:
            load_csv(path)

        msg = str(excinfo.value)
        assert "'\\t' delimiter" in msg
        assert "only ',' is supported" in msg
        assert "pandas.read_csv" in msg
        assert "sep='\\t'" in msg


class TestNonUtf8Encoding:
    """FT-PY-008 (Phase 4 §3.3): non-UTF-8 encodings raise actionable errors.

    Phase 4 does NOT auto-detect encoding (Q5 conservative path). The
    raw UnicodeDecodeError from `open()` is wrapped with a clear
    re-save instruction.
    """

    def test_non_utf8_csv_raises_actionable_error(self, tmp_path: Path):
        path = tmp_path / "latin1.csv"
        # Latin-1 encoded byte sequence that is NOT valid UTF-8:
        # 0xE9 alone (Latin-1 'é') is an invalid UTF-8 start byte when
        # followed by ASCII.
        with open(path, "wb") as f:
            f.write(b"feature1,feature2,label\n")
            f.write(b"1.0,caf\xe9,0\n")
            f.write(b"3.0,bonjour,1\n")
            f.write(b"5.0,r\xe9sum\xe9,0\n")

        with pytest.raises(ValueError) as excinfo:
            load_csv(path)

        msg = str(excinfo.value)
        assert "not UTF-8" in msg
        assert "UTF-8 encoding" in msg
        # Original UnicodeDecodeError preserved via `raise ... from e`
        assert isinstance(excinfo.value.__cause__, UnicodeDecodeError)


class TestNonNumericLabel:
    """FT-PY-008 (Phase 4 §3.3): non-numeric label values raise a
    label-specific error that points at LabelEncoder.

    Without this, the loader's generic per-column non-numeric message
    fired and the user had no idea categorical labels needed encoding
    before sklearn could classify them.
    """

    def test_non_numeric_label_raises_actionable_error(self, tmp_path: Path):
        path = tmp_path / "categorical_label.csv"
        path.write_text(
            "feature1,feature2,label\n"
            "1.0,2.0,yes\n"
            "3.0,4.0,no\n"
            "5.0,6.0,yes\n"
            "7.0,8.0,no\n"
        )

        with pytest.raises(ValueError) as excinfo:
            load_csv(path)

        msg = str(excinfo.value)
        assert "Label column 'label'" in msg
        assert "non-numeric" in msg
        assert "LabelEncoder" in msg
        # Includes the offending row for debuggability
        assert "row 2" in msg

    def test_numeric_string_label_still_loads(self, tmp_path: Path):
        """Sanity check: '0'/'1' as string in CSV is fine because
        float('0') succeeds — only truly non-numeric labels (e.g. 'yes')
        trigger the new branch.
        """
        path = tmp_path / "numeric.csv"
        path.write_text(
            "feature1,feature2,label\n"
            "1.0,2.0,0\n"
            "3.0,4.0,1\n"
            "5.0,6.0,0\n"
        )

        result = load_csv(path)
        assert result.num_samples == 3
        assert result.num_features == 2


class TestHeaderOnlyCsv:
    """FT-PY-008 (Phase 4 §3.3): header-only CSVs raise the spec'd message
    uniformly — for both the literal one-line case AND the case where
    trailing blank lines follow the header.
    """

    def test_header_only_no_trailing_newline_raises(self, tmp_path: Path):
        path = tmp_path / "header_only.csv"
        path.write_text("feature1,feature2,label\n")

        with pytest.raises(
            ValueError,
            match="CSV has no data rows .only header",
        ):
            load_csv(path)

    def test_header_only_with_blank_lines_raises(self, tmp_path: Path):
        path = tmp_path / "header_with_blanks.csv"
        path.write_text(
            "feature1,feature2,label\n"
            "\n"
            "\n"
            "\n"
        )

        with pytest.raises(
            ValueError,
            match="CSV has no data rows .only header",
        ):
            load_csv(path)
