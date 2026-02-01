"""
Structured Diagnostics for RunForge Phase 2.2.2

Diagnostic codes for explaining why a run behaved the way it did.
All diagnostics are:
- Structured JSON records
- Deterministic
- Machine-readable (no log parsing needed)

Diagnostic Categories:
- Missing Data: MISSING_VALUES_DROPPED
- Label Validation: LABEL_NOT_FOUND, LABEL_TYPE_INVALID
- Dataset Shape: ZERO_ROWS, ZERO_FEATURES, LABEL_ONLY_DATASET
"""

from dataclasses import dataclass, asdict
from enum import Enum
from typing import List, Dict, Any, Optional


class DiagnosticCode(str, Enum):
    """Diagnostic code constants for RunForge 2.2.2."""

    # Missing Data (Phase 2.2.1 - must remain stable)
    MISSING_VALUES_DROPPED = "MISSING_VALUES_DROPPED"

    # Label Validation (Phase 2.2.2)
    LABEL_NOT_FOUND = "LABEL_NOT_FOUND"
    LABEL_TYPE_INVALID = "LABEL_TYPE_INVALID"

    # Dataset Shape (Phase 2.2.2)
    ZERO_ROWS = "ZERO_ROWS"
    ZERO_FEATURES = "ZERO_FEATURES"
    LABEL_ONLY_DATASET = "LABEL_ONLY_DATASET"


class DiagnosticSeverity(str, Enum):
    """Severity levels for diagnostics."""

    INFO = "info"        # Informational (e.g., rows dropped)
    WARNING = "warning"  # Potential issue, run may continue
    ERROR = "error"      # Run cannot proceed


@dataclass
class Diagnostic:
    """
    Structured diagnostic record.

    Immutable data class for machine-readable diagnostics.
    """

    code: str
    severity: str
    message: str
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
        }
        if self.details:
            result["details"] = self.details
        return result


class DiagnosticsCollector:
    """
    Collector for diagnostics during a run.

    Thread-safe and deterministic ordering (by insertion order).
    """

    def __init__(self):
        self._diagnostics: List[Diagnostic] = []

    def add(self, diagnostic: Diagnostic) -> None:
        """Add a diagnostic to the collection."""
        self._diagnostics.append(diagnostic)

    def add_missing_values_dropped(self, rows_dropped: int) -> None:
        """Record dropped rows due to missing values (Phase 2.2.1 stable)."""
        if rows_dropped > 0:
            self.add(Diagnostic(
                code=DiagnosticCode.MISSING_VALUES_DROPPED.value,
                severity=DiagnosticSeverity.INFO.value,
                message=f"Dropped {rows_dropped} rows with missing values",
                details={"rows_dropped": rows_dropped},
            ))

    def add_label_not_found(
        self,
        expected_label: str,
        available_columns: List[str]
    ) -> None:
        """Record label column not found error."""
        self.add(Diagnostic(
            code=DiagnosticCode.LABEL_NOT_FOUND.value,
            severity=DiagnosticSeverity.ERROR.value,
            message=f"Label column '{expected_label}' not found in dataset",
            details={
                "expected_label": expected_label,
                "available_columns": available_columns,
            },
        ))

    def add_label_type_invalid(
        self,
        label_column: str,
        found_type: str,
        expected_types: List[str]
    ) -> None:
        """Record invalid label type error."""
        self.add(Diagnostic(
            code=DiagnosticCode.LABEL_TYPE_INVALID.value,
            severity=DiagnosticSeverity.ERROR.value,
            message=f"Label column '{label_column}' has invalid type: {found_type}",
            details={
                "label_column": label_column,
                "found_type": found_type,
                "expected_types": expected_types,
            },
        ))

    def add_zero_rows(self) -> None:
        """Record zero rows after processing error."""
        self.add(Diagnostic(
            code=DiagnosticCode.ZERO_ROWS.value,
            severity=DiagnosticSeverity.ERROR.value,
            message="Dataset has zero rows after processing",
            details=None,
        ))

    def add_zero_features(self) -> None:
        """Record zero features error."""
        self.add(Diagnostic(
            code=DiagnosticCode.ZERO_FEATURES.value,
            severity=DiagnosticSeverity.ERROR.value,
            message="Dataset has zero features (only label column present)",
            details=None,
        ))

    def add_label_only_dataset(self, label_column: str) -> None:
        """Record dataset with only label column error."""
        self.add(Diagnostic(
            code=DiagnosticCode.LABEL_ONLY_DATASET.value,
            severity=DiagnosticSeverity.ERROR.value,
            message="Dataset contains only the label column with no features",
            details={"label_column": label_column},
        ))

    def has_errors(self) -> bool:
        """Check if any error-level diagnostics were recorded."""
        return any(
            d.severity == DiagnosticSeverity.ERROR.value
            for d in self._diagnostics
        )

    def get_all(self) -> List[Diagnostic]:
        """Get all diagnostics in insertion order."""
        return list(self._diagnostics)

    def to_list(self) -> List[Dict[str, Any]]:
        """Convert all diagnostics to list of dicts for JSON."""
        return [d.to_dict() for d in self._diagnostics]

    def clear(self) -> None:
        """Clear all diagnostics."""
        self._diagnostics = []
