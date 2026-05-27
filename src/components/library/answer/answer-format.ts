/** Absolute + short relative label for answer updated timestamps. */
export function formatAnswerUpdated(iso: string | Date | null | undefined): {
  absolute: string;
  relative: string;
} {
  if (!iso) {
    return { absolute: "—", relative: "" };
  }
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) {
    return { absolute: "—", relative: "" };
  }
  const absolute = d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  let relative: string;
  if (sec < 60) relative = "just now";
  else if (min < 60) relative = `${min}m ago`;
  else if (hr < 24) relative = `${hr}h ago`;
  else if (day < 7) relative = `${day}d ago`;
  else relative = d.toLocaleDateString(undefined, { dateStyle: "medium" });
  return { absolute, relative };
}
