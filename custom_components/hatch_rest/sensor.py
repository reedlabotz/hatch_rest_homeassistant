"""Hatch Rest sensors for timer and scheduled programs."""

import logging
from datetime import datetime, timedelta
from time import monotonic
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import PROGRAM_SLOTS
from .coordinator import (
    HatchBabyRestEntity,
    HatchBabyRestTimerEntity,
    HatchBabyRestUpdateCoordinator,
)

_LOGGER = logging.getLogger(__name__)

# How far a fresh read of the timer can move its end before the sensor shows
# the new one. Each connection reads it again, to the whole second, so the
# same timer would otherwise come back a second either way.
TIMER_END_TOLERANCE_SECONDS = 5


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the sleep timer and program sensors."""
    coordinator = config_entry.runtime_data
    entities: list[SensorEntity] = [
        HatchBabyRestTimerSensor(coordinator),
        HatchBabyRestProgramsOverviewSensor(coordinator),
    ]
    for slot in range(1, PROGRAM_SLOTS + 1):
        entities.append(HatchBabyRestProgramSensor(coordinator, slot))

    async_add_entities(entities, update_before_add=False)


class HatchBabyRestTimerSensor(HatchBabyRestTimerEntity, SensorEntity):  # pyright: ignore[reportIncompatibleVariableOverride]
    """When the device's sleep timer runs out, or unknown with none running.

    A timestamp rather than the time left, so it changes when a timer starts,
    stops or is changed, not once a second while it runs. Home Assistant shows
    it counting down ("in 5 hours") on its own.

    Still ticks, so that it clears the moment the timer runs out rather than
    at the next coordinator update; see HatchBabyRestTimerEntity.
    """

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, coordinator: HatchBabyRestUpdateCoordinator) -> None:
        """Initialize the timer sensor."""
        super().__init__(coordinator)
        # Kept from when it showed the time left, so the entity carries on.
        self._attr_unique_id = f"{coordinator.unique_id}_timer_remaining"
        # The end last shown, and the monotonic expiry it was worked out from.
        self._ends_at: datetime | None = None
        self._ends_from: float | None = None

    def _timer_value(self) -> datetime | None:
        """Return the end of the timer, as this sensor shows it."""
        return self.native_value

    @property
    def name(self) -> str | None:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return the name of the entity."""
        if self._hatch_rest_device.name:
            return f"{self._hatch_rest_device.name.title()} Timer Ends"
        return None

    @property
    def native_value(self) -> datetime | None:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return when the timer runs out, or None when none is running.

        Worked out once per read of the timer, not on every call: turning the
        monotonic expiry into wall-clock time anew each tick would wobble.
        """
        device = self._hatch_rest_device
        expires_at = device.timer_expires_at
        if device.timer_remaining is None or expires_at is None:
            self._ends_at = self._ends_from = None
            return None

        if (
            self._ends_from is None
            or abs(expires_at - self._ends_from) > TIMER_END_TOLERANCE_SECONDS
        ):
            self._ends_from = expires_at
            self._ends_at = (
                dt_util.utcnow() + timedelta(seconds=expires_at - monotonic())
            ).replace(microsecond=0)
        return self._ends_at


class HatchBabyRestProgramsOverviewSensor(HatchBabyRestEntity, SensorEntity):  # pyright: ignore[reportIncompatibleVariableOverride]
    """Overview sensor of all scheduled programs on the Hatch Rest."""

    _attr_icon = "mdi:calendar-clock"

    def __init__(self, coordinator: HatchBabyRestUpdateCoordinator) -> None:
        """Initialize the programs overview sensor."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.unique_id}_programs_overview"

    @property
    def name(self) -> str | None:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return the name of the entity."""
        if self._hatch_rest_device.name:
            return f"{self._hatch_rest_device.name.title()} Programs"
        return None

    @property
    def native_value(self) -> str:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return a count of configured programs."""
        programs = self._hatch_rest_device.programs
        populated = [
            p
            for p in programs.values()
            if not p.get("empty", False) and "time" in p
        ]
        if not populated:
            return "No Programs"
        enabled_count = sum(1 for p in populated if p.get("enabled", False))
        return f"{len(populated)} Configured ({enabled_count} Active)"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return detailed list and readable summary of all programs."""
        programs = self._hatch_rest_device.programs
        program_list = []
        summary_lines = []

        for slot in range(1, PROGRAM_SLOTS + 1):
            prog = programs.get(slot)
            if prog and not prog.get("empty", False) and "time" in prog:
                name = prog.get("name") or f"Program {slot}"
                sound_name = (
                    prog["sound"].name
                    if prog.get("sound") is not None
                    else (prog.get("sound_id") or "None")
                )
                duration_sec = prog.get("duration_seconds", 0)
                if duration_sec % 3600 == 0:
                    duration_str = f"{duration_sec // 3600}h"
                else:
                    duration_str = f"{duration_sec // 60}m"
                days_str = ", ".join(prog.get("days", []))
                enabled = prog.get("enabled", False)
                status_str = "Enabled" if enabled else "Disabled"

                program_list.append(
                    {
                        "slot": slot,
                        "name": name,
                        "time": prog.get("time"),
                        "days": prog.get("days", []),
                        "duration": duration_str,
                        "duration_seconds": duration_sec,
                        "sound": sound_name,
                        "volume": prog.get("volume"),
                        "color": prog.get("color"),
                        "brightness": prog.get("brightness"),
                        "toddler_lock": prog.get("toddler_lock"),
                        "enabled": enabled,
                    }
                )
                summary_lines.append(
                    f"Slot {slot} ({name}): {prog.get('time')} [{days_str}] ({duration_str}) "
                    f"- Sound: {sound_name} (Vol {prog.get('volume')}), "
                    f"Light: RGB{prog.get('color')} at {prog.get('brightness')} "
                    f"[{status_str}]"
                )

        return {
            "configured_count": len(program_list),
            "programs": program_list,
            "summary": (
                "\n".join(summary_lines)
                if summary_lines
                else "No configured programs"
            ),
        }


class HatchBabyRestProgramSensor(HatchBabyRestEntity, SensorEntity):  # pyright: ignore[reportIncompatibleVariableOverride]
    """Sensor for an individual Hatch Rest program slot."""

    def __init__(self, coordinator: HatchBabyRestUpdateCoordinator, slot: int) -> None:
        """Initialize the individual program sensor."""
        super().__init__(coordinator)
        self._slot = slot
        self._attr_unique_id = f"{coordinator.unique_id}_program_{slot}_sensor"

    @property
    def name(self) -> str | None:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return the name of the entity."""
        if not self._hatch_rest_device.name:
            return None
        name = f"{self._hatch_rest_device.name.title()} Program {self._slot}"
        prog = self._hatch_rest_device.programs.get(self._slot)
        if prog and prog.get("name"):
            name = f"{name} ({prog['name']})"
        return name

    @property
    def icon(self) -> str:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return an icon representing the program status."""
        prog = self._hatch_rest_device.programs.get(self._slot)
        if not prog or prog.get("empty", True):
            return "mdi:clock-remove-outline"
        if prog.get("enabled", False):
            return "mdi:clock-check-outline"
        return "mdi:clock-outline"

    @property
    def native_value(self) -> str:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return the program state / schedule summary."""
        prog = self._hatch_rest_device.programs.get(self._slot)
        if not prog or prog.get("empty", True) or "time" not in prog:
            return "Empty"

        time_str = prog.get("time", "--:--")
        days = prog.get("days", [])
        days_str = ", ".join(days) if days else "No days"
        status = "Active" if prog.get("enabled", False) else "Disabled"
        prog_name = prog.get("name")

        if prog_name:
            return f"{time_str} ({days_str}) - {prog_name} [{status}]"
        return f"{time_str} ({days_str}) [{status}]"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return all details of the program slot."""
        prog = self._hatch_rest_device.programs.get(self._slot)
        if not prog or prog.get("empty", True) or "time" not in prog:
            return {"slot": self._slot, "empty": True}

        sound_name = (
            prog["sound"].name
            if prog.get("sound") is not None
            else (prog.get("sound_id") or "None")
        )
        duration_sec = prog.get("duration_seconds", 0)
        duration_str = (
            f"{duration_sec // 3600}h"
            if duration_sec % 3600 == 0
            else f"{duration_sec // 60}m"
        )

        return {
            "slot": self._slot,
            "name": prog.get("name"),
            "empty": False,
            "enabled": prog.get("enabled", False),
            "time": prog.get("time"),
            "days": prog.get("days", []),
            "duration": duration_str,
            "duration_seconds": duration_sec,
            "sound": sound_name,
            "volume": prog.get("volume"),
            "color": prog.get("color"),
            "brightness": prog.get("brightness"),
            "toddler_lock": prog.get("toddler_lock"),
        }
