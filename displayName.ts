export const DEFAULT_DISPLAY_NAME = 'Scholar';
export const DISPLAY_NAME_MAX_LENGTH = 18;

export function normalizeDisplayName(value: string): string | null {
  const name = value.trim();
  return name.length > 0 && name.length <= DISPLAY_NAME_MAX_LENGTH ? name : null;
}

export function restoreDisplayName(value: string | null): string {
  return value === null ? DEFAULT_DISPLAY_NAME : normalizeDisplayName(value) ?? DEFAULT_DISPLAY_NAME;
}
