export type BookingSlotsReadSource = "rubitime" | "canonical";

function unwrapSettingValue(valueJson: unknown): unknown {
  if (
    valueJson !== null &&
    typeof valueJson === "object" &&
    "value" in (valueJson as Record<string, unknown>)
  ) {
    return (valueJson as { value: unknown }).value;
  }
  return valueJson;
}

export function parseBookingSlotsReadSource(valueJson: unknown): BookingSlotsReadSource {
  const value = unwrapSettingValue(valueJson);
  if (value === "rubitime") return "rubitime";
  return "canonical";
}
