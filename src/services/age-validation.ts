const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) return null;
  return { year, month, day };
}

export function hasMinimumAge(
  birthDate: string | null | undefined,
  minimumAge = 16,
  today = new Date(),
): boolean {
  if (!birthDate) return false;
  const birth = parseDateOnly(birthDate);
  if (!birth) return false;

  let age = today.getFullYear() - birth.year;
  if (
    today.getMonth() + 1 < birth.month ||
    (today.getMonth() + 1 === birth.month && today.getDate() < birth.day)
  ) age--;
  return age >= minimumAge;
}

export function latestEligibleBirthDate(minimumAge = 16, today = new Date()): string {
  const year = today.getFullYear() - minimumAge;
  const month = today.getMonth();
  const day = Math.min(today.getDate(), new Date(year, month + 1, 0).getDate());
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
