"""
Phase 3.2 Profile Registry Tests

Tests for:
- Profile registry contents
- Profile lookup
- Unknown profile handling
"""

import pytest

from ml_runner.profiles import (
    Profile,
    PROFILES,
    get_profile,
    list_profiles,
    get_profile_info,
    UnknownProfileError,
)


class TestProfileRegistry:
    """Tests for the profile registry."""

    def test_registry_has_default_profile(self):
        """Registry contains 'default' profile."""
        assert "default" in PROFILES

    def test_registry_has_fast_profile(self):
        """Registry contains 'fast' profile."""
        assert "fast" in PROFILES

    def test_registry_has_thorough_profile(self):
        """Registry contains 'thorough' profile."""
        assert "thorough" in PROFILES

    def test_registry_has_expected_profiles(self):
        """Registry contains exactly the expected profiles."""
        assert set(PROFILES.keys()) == {"default", "fast", "thorough"}

    def test_profiles_have_versions(self):
        """All profiles have a version field."""
        for name, profile in PROFILES.items():
            assert profile.version, f"Profile '{name}' missing version"
            assert isinstance(profile.version, str)

    def test_profiles_have_model_family(self):
        """All profiles have a model_family field."""
        for name, profile in PROFILES.items():
            assert profile.model_family, f"Profile '{name}' missing model_family"

    def test_profiles_have_params_dict(self):
        """All profiles have a params dict."""
        for name, profile in PROFILES.items():
            assert isinstance(profile.params, dict), f"Profile '{name}' params not dict"

    def test_profiles_are_frozen(self):
        """Profiles are immutable (frozen dataclass)."""
        profile = PROFILES["default"]
        with pytest.raises(Exception):  # FrozenInstanceError
            profile.name = "modified"


class TestGetProfile:
    """Tests for get_profile function."""

    def test_get_default_profile(self):
        """Get 'default' profile."""
        profile = get_profile("default")
        assert profile.name == "default"
        assert profile.model_family == "logistic_regression"

    def test_get_fast_profile(self):
        """Get 'fast' profile."""
        profile = get_profile("fast")
        assert profile.name == "fast"
        assert profile.params.get("max_iter") == 50

    def test_get_thorough_profile(self):
        """Get 'thorough' profile."""
        profile = get_profile("thorough")
        assert profile.name == "thorough"
        assert profile.model_family == "random_forest"
        assert profile.params.get("n_estimators") == 200

    def test_unknown_profile_raises(self):
        """Unknown profile raises UnknownProfileError."""
        with pytest.raises(UnknownProfileError) as exc_info:
            get_profile("nonexistent")

        assert "nonexistent" in str(exc_info.value)
        assert "default" in str(exc_info.value)
        assert exc_info.value.profile_name == "nonexistent"
        assert "default" in exc_info.value.available


class TestListProfiles:
    """Tests for list_profiles function."""

    def test_list_returns_all_profiles(self):
        """list_profiles returns all profile names."""
        profiles = list_profiles()
        assert set(profiles) == {"default", "fast", "thorough"}

    def test_list_is_sorted(self):
        """list_profiles returns sorted list."""
        profiles = list_profiles()
        assert profiles == sorted(profiles)


class TestGetProfileInfo:
    """Tests for get_profile_info function."""

    def test_info_has_required_fields(self):
        """Profile info has all required fields."""
        info = get_profile_info("default")

        assert "name" in info
        assert "version" in info
        assert "model_family" in info
        assert "params" in info
        assert "description" in info

    def test_info_params_is_copy(self):
        """Profile info params is a copy (not reference)."""
        info = get_profile_info("fast")
        original_max_iter = info["params"].get("max_iter")

        # Modify the returned dict
        info["params"]["max_iter"] = 999

        # Original profile should be unchanged
        profile = get_profile("fast")
        assert profile.params.get("max_iter") == original_max_iter

    def test_info_unknown_profile_raises(self):
        """get_profile_info raises for unknown profile."""
        with pytest.raises(UnknownProfileError):
            get_profile_info("nonexistent")


class TestProfileVersioning:
    """Tests for profile versioning."""

    def test_default_profile_version(self):
        """Default profile has version 1.0."""
        profile = get_profile("default")
        assert profile.version == "1.0"

    def test_fast_profile_version(self):
        """Fast profile has version 1.0."""
        profile = get_profile("fast")
        assert profile.version == "1.0"

    def test_thorough_profile_version(self):
        """Thorough profile has version 1.0."""
        profile = get_profile("thorough")
        assert profile.version == "1.0"

    def test_version_format(self):
        """Version follows major.minor format."""
        import re
        version_pattern = re.compile(r"^\d+\.\d+$")

        for name, profile in PROFILES.items():
            assert version_pattern.match(profile.version), (
                f"Profile '{name}' version '{profile.version}' "
                "doesn't match major.minor format"
            )
