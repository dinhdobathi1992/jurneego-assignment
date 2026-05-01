/** Resolve a display name for a user, falling back through email → external_subject → 'Learner'. */
export function resolveName(
  display_name: string | null | undefined,
  external_subject: string | null | undefined,
  email: string | null | undefined
): string {
  const name = display_name?.trim();
  if (name) return name;

  if (email) return email.split('@')[0];

  const sub = String(external_subject ?? '');
  if (sub && !/^\d+$/.test(sub)) return sub.slice(0, 20);

  return 'Learner';
}
