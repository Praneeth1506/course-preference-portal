export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function publicUrlForForm(form) {
  if (!form) return null;
  if (form.public_url) return form.public_url;
  if (form.public_token) {
    return `${window.location.origin}/forms/${form.public_token}`;
  }
  return null;
}

export function semesterLabel(semester) {
  return semester === null || semester === undefined
    ? "Semester not set"
    : `Semester ${semester}`;
}

// Matches the backend's download name, e.g. "Fall-2026-responses.xlsx".
export function responsesFileName(title) {
  const slug = (title || "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "form"}-responses.xlsx`;
}

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
