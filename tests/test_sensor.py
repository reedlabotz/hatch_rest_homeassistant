"""Tests for Hatch Rest sensors."""

import math
from datetime import timedelta
from time import monotonic
from unittest.mock import MagicMock, patch

import pytest
from homeassistant.components.sensor import SensorDeviceClass
from homeassistant.const import EntityCategory
from homeassistant.util import dt as dt_util

from custom_components.hatch_rest.const import PyHatchBabyRestSound
from custom_components.hatch_rest.coordinator import HatchBabyRestUpdateCoordinator
from custom_components.hatch_rest.sensor import (
    HatchBabyRestProgramSensor,
    HatchBabyRestProgramsOverviewSensor,
    HatchBabyRestTimerSensor,
    async_setup_entry,
)


class TestSensorSetup:
    """Tests for the sensor platform's setup."""

    @pytest.mark.asyncio
    async def test_setup_adds_timer_and_program_sensors(
        self, hass, mock_coordinator: HatchBabyRestUpdateCoordinator
    ):
        """Test setup adds the timer, overview, and 10 program sensors."""
        config_entry = MagicMock()
        config_entry.runtime_data = mock_coordinator
        added = []

        await async_setup_entry(
            hass, config_entry, lambda entities, **_: added.extend(entities)
        )

        assert len(added) == 12
        assert isinstance(added[0], HatchBabyRestTimerSensor)
        assert isinstance(added[1], HatchBabyRestProgramsOverviewSensor)
        assert all(isinstance(e, HatchBabyRestProgramSensor) for e in added[2:])


class TestHatchBabyRestTimerSensor:
    """Tests for HatchBabyRestTimerSensor."""

    @staticmethod
    def _run_timer(device, seconds: float | None) -> None:
        """Make the mocked device report a timer with this much left."""
        if seconds is None:
            device.timer_expires_at = None
            device.timer_remaining = None
        else:
            device.timer_expires_at = monotonic() + seconds
            device.timer_remaining = math.ceil(seconds)

    def test_is_a_timestamp(self, mock_coordinator: HatchBabyRestUpdateCoordinator):
        """Test Home Assistant is told to show it as a time."""
        sensor = HatchBabyRestTimerSensor(mock_coordinator)

        assert sensor.device_class is SensorDeviceClass.TIMESTAMP

    def test_shows_when_the_timer_runs_out(
        self, mock_coordinator: HatchBabyRestUpdateCoordinator
    ):
        """Test a running timer reads as its end, to the second."""
        self._run_timer(mock_coordinator.hatch_rest_device, 21076)
        before = dt_util.utcnow()

        ends = HatchBabyRestTimerSensor(mock_coordinator).native_value

        assert ends is not None
        assert ends.microsecond == 0
        assert abs((ends - before).total_seconds() - 21076) <= 1

    def test_shows_nothing_with_no_timer(
        self, mock_coordinator: HatchBabyRestUpdateCoordinator
    ):
        """Test no timer is no end time."""
        self._run_timer(mock_coordinator.hatch_rest_device, None)

        assert HatchBabyRestTimerSensor(mock_coordinator).native_value is None

    def test_a_reread_a_second_out_keeps_the_same_end(
        self, mock_coordinator: HatchBabyRestUpdateCoordinator
    ):
        """Test reading the same timer again on reconnect changes nothing.

        Each read is to the whole second, so the same timer comes back a
        second either way.
        """
        sensor = HatchBabyRestTimerSensor(mock_coordinator)
        device = mock_coordinator.hatch_rest_device
        self._run_timer(device, 3600)
        first = sensor.native_value

        device.timer_expires_at += 1

        assert sensor.native_value == first

    def test_a_changed_timer_moves_the_end(
        self, mock_coordinator: HatchBabyRestUpdateCoordinator
    ):
        """Test a timer set to something else shows its new end."""
        sensor = HatchBabyRestTimerSensor(mock_coordinator)
        device = mock_coordinator.hatch_rest_device
        self._run_timer(device, 3600)
        first = sensor.native_value

        self._run_timer(device, 900)

        assert first is not None
        assert sensor.native_value == first - timedelta(seconds=2700)

    def test_ticks_write_only_when_the_end_moves(
        self, hass, mock_coordinator: HatchBabyRestUpdateCoordinator
    ):
        """Test a running timer is not a state change every second.

        It used to show the time left, which changed on every tick.
        """
        sensor = HatchBabyRestTimerSensor(mock_coordinator)
        device = mock_coordinator.hatch_rest_device

        with patch(
            "homeassistant.helpers.entity.Entity.async_write_ha_state"
        ) as written:
            self._run_timer(device, 12)
            sensor._async_tick(None)
            device.timer_remaining = 11
            sensor._async_tick(None)
            sensor._async_tick(None)
            self._run_timer(device, None)
            sensor._async_tick(None)

        assert written.call_count == 2


class TestSensorEntityCategories:
    """Tests that the sensors declare a category Home Assistant will accept."""

    @pytest.mark.parametrize(
        "build",
        [
            HatchBabyRestTimerSensor,
            HatchBabyRestProgramsOverviewSensor,
            lambda c: HatchBabyRestProgramSensor(c, 1),
        ],
    )
    def test_no_sensor_claims_to_be_configuration(
        self, mock_coordinator: HatchBabyRestUpdateCoordinator, build
    ):
        """Test no sensor uses the config category.

        SensorEntity.async_internal_added_to_hass raises outright on one that
        does -- a sensor reports state and cannot configure anything. It fails
        at the point of being added, so constructing the entity in a test says
        nothing about it; this asserts the rule directly instead.
        """
        assert build(mock_coordinator).entity_category is not EntityCategory.CONFIG


class TestHatchBabyRestProgramsOverviewSensor:
    """Tests for HatchBabyRestProgramsOverviewSensor."""

    def test_empty_programs(self, mock_coordinator: HatchBabyRestUpdateCoordinator):
        """Test overview reports No Programs when none are configured."""
        mock_coordinator.hatch_rest_device.programs = {}
        sensor = HatchBabyRestProgramsOverviewSensor(mock_coordinator)

        assert sensor.name == "Hatch Rest Programs"
        assert sensor.native_value == "No Programs"
        assert sensor.extra_state_attributes == {
            "configured_count": 0,
            "programs": [],
            "summary": "No configured programs",
        }

    def test_active_and_disabled_programs(
        self, mock_coordinator: HatchBabyRestUpdateCoordinator
    ):
        """Test overview counts and summarizes configured programs."""
        mock_coordinator.hatch_rest_device.programs = {
            1: {
                "empty": False,
                "enabled": True,
                "time": "07:00",
                "days": ["Mon", "Tue"],
                "duration_seconds": 3600,
                "sound": PyHatchBabyRestSound.rain,
                "sound_id": 7,
                "volume": 50,
                "color": (255, 255, 255),
                "brightness": 100,
                "toddler_lock": False,
                "name": "Wake Up",
            },
            2: {
                "empty": False,
                "enabled": False,
                "time": "19:30",
                "days": [],
                "duration_seconds": 1800,
                "sound": None,
                "sound_id": 8,
                "volume": 30,
                "color": (0, 0, 0),
                "brightness": 0,
                "toddler_lock": True,
                "name": None,
            },
            3: {"empty": True},
        }
        sensor = HatchBabyRestProgramsOverviewSensor(mock_coordinator)

        assert sensor.native_value == "2 Configured (1 Active)"
        attrs = sensor.extra_state_attributes
        assert attrs["configured_count"] == 2
        assert len(attrs["programs"]) == 2
        assert attrs["programs"][0]["slot"] == 1
        assert attrs["programs"][0]["sound"] == "rain"
        assert attrs["programs"][1]["slot"] == 2
        assert attrs["programs"][1]["sound"] == 8
        assert "Slot 1 (Wake Up): 07:00 [Mon, Tue] (1h)" in attrs["summary"]
        assert "Slot 2 (Program 2): 19:30 [] (30m)" in attrs["summary"]


class TestHatchBabyRestProgramSensor:
    """Tests for HatchBabyRestProgramSensor."""

    def test_empty_slot(self, mock_coordinator: HatchBabyRestUpdateCoordinator):
        """Test an empty or unread slot reports Empty."""
        mock_coordinator.hatch_rest_device.programs = {}
        sensor = HatchBabyRestProgramSensor(mock_coordinator, 4)

        assert sensor.name == "Hatch Rest Program 4"
        assert sensor.icon == "mdi:clock-remove-outline"
        assert sensor.native_value == "Empty"
        assert sensor.extra_state_attributes == {"slot": 4, "empty": True}

    def test_active_program_slot(
        self, mock_coordinator: HatchBabyRestUpdateCoordinator
    ):
        """Test an active program slot exposes name, icon, summary, and attributes."""
        mock_coordinator.hatch_rest_device.programs = {
            1: {
                "empty": False,
                "enabled": True,
                "time": "07:30",
                "days": ["Mon", "Wed", "Fri"],
                "duration_seconds": 3600,
                "sound": PyHatchBabyRestSound.ocean,
                "sound_id": 5,
                "volume": 60,
                "color": (10, 20, 30),
                "brightness": 128,
                "toddler_lock": True,
                "name": "Morning",
            }
        }
        sensor = HatchBabyRestProgramSensor(mock_coordinator, 1)

        assert sensor.name == "Hatch Rest Program 1 (Morning)"
        assert sensor.icon == "mdi:clock-check-outline"
        assert sensor.native_value == "07:30 (Mon, Wed, Fri) - Morning [Active]"
        assert sensor.extra_state_attributes == {
            "slot": 1,
            "name": "Morning",
            "empty": False,
            "enabled": True,
            "time": "07:30",
            "days": ["Mon", "Wed", "Fri"],
            "duration": "1h",
            "duration_seconds": 3600,
            "sound": "ocean",
            "volume": 60,
            "color": (10, 20, 30),
            "brightness": 128,
            "toddler_lock": True,
        }

    def test_disabled_unnamed_program_slot(
        self, mock_coordinator: HatchBabyRestUpdateCoordinator
    ):
        """Test a disabled unnamed program slot."""
        mock_coordinator.hatch_rest_device.programs = {
            2: {
                "empty": False,
                "enabled": False,
                "time": "20:00",
                "days": [],
                "duration_seconds": 900,
                "sound": None,
                "sound_id": 8,
                "volume": 25,
                "color": (0, 0, 0),
                "brightness": 0,
                "toddler_lock": False,
                "name": None,
            }
        }
        sensor = HatchBabyRestProgramSensor(mock_coordinator, 2)

        assert sensor.name == "Hatch Rest Program 2"
        assert sensor.icon == "mdi:clock-outline"
        assert sensor.native_value == "20:00 (No days) [Disabled]"
        assert sensor.extra_state_attributes["duration"] == "15m"
        assert sensor.extra_state_attributes["sound"] == 8
