"""
Phase 3.2 Parameter Resolution Tests

Tests for:
- CLI param precedence over profile
- Profile expansion
- Model family override from profile
- Provenance tracking
"""

import pytest

from ml_runner.resolver import (
    resolve_config,
    ResolvedConfig,
    ParamSource,
    get_param_provenance,
)
from ml_runner.profiles import UnknownProfileError


class TestResolveConfigNoProfile:
    """Tests for resolve_config without a profile."""

    def test_resolve_empty_config(self):
        """Empty config uses model family only."""
        config = resolve_config(model_family="logistic_regression")

        assert config.model_family == "logistic_regression"
        assert config.hyperparameters == {}
        assert config.param_sources == {}
        assert not config.has_profile()

    def test_resolve_cli_params_only(self):
        """CLI params are included without profile."""
        config = resolve_config(
            model_family="logistic_regression",
            cli_params={"C": "1.0", "max_iter": "200"},
        )

        assert config.hyperparameters == {"C": "1.0", "max_iter": "200"}
        assert len(config.param_sources) == 2
        assert config.param_sources["C"].source == "cli"
        assert config.param_sources["max_iter"].source == "cli"

    def test_no_profile_fields_when_no_profile(self):
        """Profile fields are None when no profile used."""
        config = resolve_config(model_family="random_forest")

        assert config.profile_name is None
        assert config.profile_version is None
        assert config.expanded_parameters_hash is None
        assert not config.has_profile()


class TestResolveConfigWithProfile:
    """Tests for resolve_config with a profile."""

    def test_resolve_profile_expands_params(self):
        """Profile expands to its parameters."""
        config = resolve_config(
            model_family="logistic_regression",
            profile_name="fast",
        )

        assert config.hyperparameters == {"max_iter": 50}
        assert config.param_sources["max_iter"].source == "profile"

    def test_resolve_profile_overrides_model_family(self):
        """Profile can override model family."""
        config = resolve_config(
            model_family="logistic_regression",
            profile_name="thorough",
        )

        # thorough profile uses random_forest
        assert config.model_family == "random_forest"

    def test_resolve_profile_sets_profile_fields(self):
        """Profile sets profile_name, version, and hash."""
        config = resolve_config(
            model_family="logistic_regression",
            profile_name="fast",
        )

        assert config.profile_name == "fast"
        assert config.profile_version == "1.0"
        assert config.expanded_parameters_hash is not None
        assert len(config.expanded_parameters_hash) == 64  # SHA-256
        assert config.has_profile()

    def test_unknown_profile_raises(self):
        """Unknown profile raises error."""
        with pytest.raises(UnknownProfileError):
            resolve_config(
                model_family="logistic_regression",
                profile_name="nonexistent",
            )


class TestPrecedence:
    """Tests for CLI > profile precedence."""

    def test_cli_overrides_profile_param(self):
        """CLI param overrides same param from profile."""
        config = resolve_config(
            model_family="logistic_regression",
            cli_params={"max_iter": "100"},  # Override profile's 50
            profile_name="fast",
        )

        assert config.hyperparameters["max_iter"] == "100"
        assert config.param_sources["max_iter"].source == "cli"

    def test_cli_adds_to_profile_params(self):
        """CLI can add params not in profile."""
        config = resolve_config(
            model_family="logistic_regression",
            cli_params={"C": "2.0"},
            profile_name="fast",
        )

        # Profile's max_iter + CLI's C
        assert config.hyperparameters["max_iter"] == 50  # From profile
        assert config.hyperparameters["C"] == "2.0"  # From CLI
        assert config.param_sources["max_iter"].source == "profile"
        assert config.param_sources["C"].source == "cli"

    def test_cli_does_not_override_model_family_from_profile(self):
        """Model family from profile is used even with CLI params."""
        config = resolve_config(
            model_family="logistic_regression",  # Original
            cli_params={"n_estimators": "50"},
            profile_name="thorough",  # Uses random_forest
        )

        # Profile's model_family wins
        assert config.model_family == "random_forest"


class TestProvenance:
    """Tests for parameter provenance tracking."""

    def test_get_provenance_empty(self):
        """Empty config has empty provenance."""
        config = resolve_config(model_family="logistic_regression")
        provenance = get_param_provenance(config)
        assert provenance == []

    def test_get_provenance_cli_only(self):
        """CLI-only provenance is tracked."""
        config = resolve_config(
            model_family="logistic_regression",
            cli_params={"C": "1.0"},
        )
        provenance = get_param_provenance(config)

        assert len(provenance) == 1
        assert provenance[0]["name"] == "C"
        assert provenance[0]["value"] == "1.0"
        assert provenance[0]["source"] == "cli"

    def test_get_provenance_profile_only(self):
        """Profile-only provenance is tracked."""
        config = resolve_config(
            model_family="logistic_regression",
            profile_name="fast",
        )
        provenance = get_param_provenance(config)

        assert len(provenance) == 1
        assert provenance[0]["name"] == "max_iter"
        assert provenance[0]["value"] == 50
        assert provenance[0]["source"] == "profile"

    def test_get_provenance_mixed(self):
        """Mixed sources are tracked correctly."""
        config = resolve_config(
            model_family="logistic_regression",
            cli_params={"C": "2.0"},
            profile_name="fast",
        )
        provenance = get_param_provenance(config)

        # Sorted by name: C, max_iter
        assert len(provenance) == 2
        assert provenance[0]["name"] == "C"
        assert provenance[0]["source"] == "cli"
        assert provenance[1]["name"] == "max_iter"
        assert provenance[1]["source"] == "profile"

    def test_get_provenance_override_shows_cli(self):
        """Overridden param shows CLI as source."""
        config = resolve_config(
            model_family="logistic_regression",
            cli_params={"max_iter": "100"},
            profile_name="fast",
        )
        provenance = get_param_provenance(config)

        assert len(provenance) == 1
        assert provenance[0]["source"] == "cli"


class TestResolvedConfigMethods:
    """Tests for ResolvedConfig helper methods."""

    def test_has_profile_true(self):
        """has_profile returns True when profile used."""
        config = resolve_config(
            model_family="logistic_regression",
            profile_name="default",
        )
        assert config.has_profile() is True

    def test_has_profile_false(self):
        """has_profile returns False when no profile."""
        config = resolve_config(model_family="logistic_regression")
        assert config.has_profile() is False
