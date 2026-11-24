/** Stable SSR/client presentation; stored instants and financial values are never changed. */
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
const instant = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
export function displayDate(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? date.format(parsed) : "—";
}
export function displayInstant(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? `${instant.format(parsed)} UTC` : "—";
}
export const displayNumber = (value: number) => value.toLocaleString("en-IN");
