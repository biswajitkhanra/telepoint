/** Tiny className combiner — join truthy values (shadcn-style `cn` without deps). */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
