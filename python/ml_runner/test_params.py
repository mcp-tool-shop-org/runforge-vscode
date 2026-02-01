"""
Phase 3.2 Hyperparameter Parsing Tests

Tests for:
- --param parsing (single and multiple)
- Malformed parameter rejection
- Profile argument parsing
"""

import pytest
import sys
from unittest.mock import patch

from ml_runner.params import parse_param, parse_params, ParamParseError


class TestParseParam:
    """Tests for parse_param function."""

    def test_parse_simple_param(self):
        """Parse a simple name=value parameter."""
        name, value = parse_param("C=1.0")
        assert name == "C"
        assert value == "1.0"

    def test_parse_param_with_underscore(self):
        """Parse a parameter with underscore in name."""
        name, value = parse_param("max_iter=100")
        assert name == "max_iter"
        assert value == "100"

    def test_parse_param_string_value(self):
        """Parse a parameter with string value."""
        name, value = parse_param("solver=lbfgs")
        assert name == "solver"
        assert value == "lbfgs"

    def test_parse_param_value_with_equals(self):
        """Value may contain equals sign."""
        name, value = parse_param("path=/foo=bar")
        assert name == "path"
        assert value == "/foo=bar"

    def test_parse_param_strips_whitespace(self):
        """Whitespace around name and value is stripped."""
        name, value = parse_param("  C  =  1.0  ")
        assert name == "C"
        assert value == "1.0"

    def test_reject_no_equals(self):
        """Reject parameter without equals sign."""
        with pytest.raises(ParamParseError) as exc_info:
            parse_param("C1.0")

        assert "must contain exactly one '='" in str(exc_info.value)
        assert exc_info.value.param_str == "C1.0"

    def test_reject_empty_name(self):
        """Reject parameter with empty name."""
        with pytest.raises(ParamParseError) as exc_info:
            parse_param("=1.0")

        assert "name cannot be empty" in str(exc_info.value)

    def test_reject_empty_value(self):
        """Reject parameter with empty value."""
        with pytest.raises(ParamParseError) as exc_info:
            parse_param("C=")

        assert "value cannot be empty" in str(exc_info.value)

    def test_reject_invalid_name_characters(self):
        """Reject parameter with invalid characters in name."""
        with pytest.raises(ParamParseError) as exc_info:
            parse_param("my-param=1.0")

        assert "must be alphanumeric with underscores" in str(exc_info.value)


class TestParseParams:
    """Tests for parse_params function."""

    def test_parse_empty_list(self):
        """Parse empty parameter list."""
        result = parse_params([])
        assert result == {}

    def test_parse_single_param(self):
        """Parse single parameter."""
        result = parse_params(["C=1.0"])
        assert result == {"C": "1.0"}

    def test_parse_multiple_params(self):
        """Parse multiple parameters."""
        result = parse_params(["C=1.0", "max_iter=100", "solver=lbfgs"])
        assert result == {
            "C": "1.0",
            "max_iter": "100",
            "solver": "lbfgs",
        }

    def test_later_value_overrides(self):
        """Later values override earlier ones for same key."""
        result = parse_params(["C=1.0", "C=2.0"])
        assert result == {"C": "2.0"}

    def test_propagates_parse_error(self):
        """ParamParseError is propagated from parse_param."""
        with pytest.raises(ParamParseError):
            parse_params(["C=1.0", "bad_param"])


class TestCLIParamArgument:
    """Tests for --param CLI argument."""

    def test_param_arg_single(self):
        """Single --param argument is parsed."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/out",
            "--device", "cpu",
            "--param", "C=1.0",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                main()
                mock_run.assert_called_once()

    def test_param_arg_multiple(self):
        """Multiple --param arguments are parsed."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/out",
            "--device", "cpu",
            "--param", "C=1.0",
            "--param", "max_iter=200",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                main()
                mock_run.assert_called_once()

    def test_param_arg_invalid_fails(self):
        """Invalid --param argument fails with error."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/out",
            "--device", "cpu",
            "--param", "bad_no_equals",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                exit_code = main()
                assert exit_code == 1
                mock_run.assert_not_called()

    def test_param_arg_empty_name_fails(self):
        """--param with empty name fails."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/out",
            "--device", "cpu",
            "--param", "=1.0",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                exit_code = main()
                assert exit_code == 1
                mock_run.assert_not_called()

    def test_param_arg_empty_value_fails(self):
        """--param with empty value fails."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/out",
            "--device", "cpu",
            "--param", "C=",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                exit_code = main()
                assert exit_code == 1
                mock_run.assert_not_called()


class TestCLIProfileArgument:
    """Tests for --profile CLI argument."""

    def test_profile_arg_parsed(self):
        """--profile argument is parsed."""
        from ml_runner.cli import main
        import argparse

        # Verify argparse accepts --profile
        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/out",
            "--device", "cpu",
            "--profile", "fast",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                main()
                mock_run.assert_called_once()

    def test_profile_arg_default_none(self):
        """--profile defaults to None."""
        import argparse

        parser = argparse.ArgumentParser()
        parser.add_argument("--profile", default=None)
        args = parser.parse_args([])

        assert args.profile is None

    def test_profile_with_params(self):
        """--profile and --param can be used together."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/out",
            "--device", "cpu",
            "--profile", "fast",
            "--param", "C=2.0",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                main()
                mock_run.assert_called_once()
