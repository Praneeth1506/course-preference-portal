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
