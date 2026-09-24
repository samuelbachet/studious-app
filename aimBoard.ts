export const MAX_AIMS_PER_GROUP = 5;
export const DEFAULT_GROUP_TITLE = 'Aims';

export type AimItem = {
  id: string;
  text: string;
  note: string;
  createdAt: string;
  order: number;
};

export type AimGroup = {
  id: string;
  title: string;
  dateKey: string;
  isDefault: boolean;
  order: number;
  originGroupId?: string;
  aims: AimItem[];
};

export type ArchivedAimItem = AimItem & { archivedAt: string };

export type ArchivedGroup = {
  id: string;
  originalGroupId: string;
  title: string;
  originalDateKey: string;
  originalGroupOrder: number;
  archivedAt: string;
  aims: ArchivedAimItem[];
};

export type AimBoardState = {
  active: { dateKey: string; groups: AimGroup[] };
  archive: ArchivedGroup[];
};

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calendarDay(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function makeAimId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultGroup(dateKey: string, order = 0): AimGroup {
  return { id: makeAimId(), title: DEFAULT_GROUP_TITLE, dateKey, isDefault: true, order, aims: [] };
}

function nextOrder(state: AimBoardState): number {
  let greatest = -1;
  for (const group of state.active.groups) {
    greatest = Math.max(greatest, group.order);
    for (const aim of group.aims) greatest = Math.max(greatest, aim.order);
  }
  for (const group of state.archive) {
    greatest = Math.max(greatest, group.originalGroupOrder);
    for (const aim of group.aims) greatest = Math.max(greatest, aim.order);
  }
  return greatest + 1;
}

function sortAims<T extends AimItem>(aims: T[]): T[] {
  return [...aims].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

function sortGroups(groups: AimGroup[]): AimGroup[] {
  return [...groups].sort((a, b) => a.order - b.order || (a.id === b.originGroupId ? -1 : b.id === a.originGroupId ? 1 : 0));
}

export function emptyAimBoard(now = new Date()): AimBoardState {
  const dateKey = localDateKey(now);
  return { active: { dateKey, groups: [defaultGroup(dateKey)] }, archive: [] };
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function legacyGroupOrder(id: string, fallback: number): number {
  const match = /^([0-9a-z]{8,})-[0-9a-z]+$/i.exec(id);
  if (!match) return fallback;
  const timestamp = Number.parseInt(match[1], 36);
  const order = timestamp * 100 + fallback;
  return Number.isSafeInteger(order) && timestamp > 100_000_000_000 ? order : fallback;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readAim(value: unknown, fallbackOrder: number): AimItem | null {
  const item = record(value);
  if (!item || typeof item.id !== 'string' || !item.id || typeof item.text !== 'string' || !item.text.trim() || item.text.trim().length > 100 || typeof item.note !== 'string' || item.note.length > 240 || !validTimestamp(item.createdAt)) return null;
  const inferred = Date.parse(item.createdAt) * 100 + fallbackOrder;
  const order = typeof item.order === 'number' && Number.isSafeInteger(item.order) && item.order >= 0 ? item.order : Number.isSafeInteger(inferred) ? inferred : fallbackOrder;
  return { id: item.id, text: item.text.trim(), note: item.note, createdAt: item.createdAt, order };
}

function readGroup(value: unknown, dateKey: string, fallbackOrder: number): AimGroup | null {
  const group = record(value);
  if (!group || typeof group.id !== 'string' || !group.id || typeof group.title !== 'string' || !group.title.trim() || group.title.trim().length > 40 || group.dateKey !== dateKey || !Array.isArray(group.aims)) return null;
  const aims = group.aims.map((value, index) => readAim(value, index)).filter((aim): aim is AimItem => aim !== null).slice(0, MAX_AIMS_PER_GROUP);
  const order = typeof group.order === 'number' && Number.isSafeInteger(group.order) && group.order >= 0 ? group.order : legacyGroupOrder(group.id, fallbackOrder);
  return { id: group.id, title: group.title.trim(), dateKey, isDefault: group.isDefault === true, order, originGroupId: typeof group.originGroupId === 'string' && group.originGroupId ? group.originGroupId : undefined, aims: sortAims(aims) };
}

function ensureDefaultGroup(groups: AimGroup[], dateKey: string): AimGroup[] {
  if (!groups.length) return [defaultGroup(dateKey)];
  // The first group is the root, even when a previously archived group returns ahead of it.
  if (groups.every((group, index) => group.isDefault === (index === 0))) return groups;
  return groups.map((group, index) => group.isDefault === (index === 0)
    ? group
    : { ...group, isDefault: index === 0 });
}

function readArchivedGroup(value: unknown, fallbackOrder: number): ArchivedGroup | null {
  const group = record(value);
  if (!group || typeof group.id !== 'string' || !group.id || typeof group.originalGroupId !== 'string' || !group.originalGroupId || typeof group.title !== 'string' || !group.title.trim() || group.title.trim().length > 40 || typeof group.originalDateKey !== 'string' || calendarDay(group.originalDateKey) === null || !validTimestamp(group.archivedAt) || !Array.isArray(group.aims)) return null;
  const aims = group.aims.flatMap((value, index): ArchivedAimItem[] => {
    const aim = readAim(value, index);
    const archivedAt = record(value)?.archivedAt;
    return aim && validTimestamp(archivedAt) ? [{ ...aim, archivedAt }] : [];
  });
  const originalGroupOrder = typeof group.originalGroupOrder === 'number' && Number.isSafeInteger(group.originalGroupOrder) && group.originalGroupOrder >= 0 ? group.originalGroupOrder : legacyGroupOrder(group.originalGroupId, fallbackOrder);
  return aims.length ? { id: group.id, originalGroupId: group.originalGroupId, title: group.title.trim(), originalDateKey: group.originalDateKey, originalGroupOrder, archivedAt: group.archivedAt, aims: sortAims(aims) } : null;
}

export function retainRecentArchive(archive: ArchivedGroup[], now = new Date()): ArchivedGroup[] {
  const today = calendarDay(localDateKey(now)) ?? 0;
  return archive.filter((group) => {
    const day = calendarDay(group.originalDateKey);
    return day !== null && today - day < 30;
  });
}

export function archiveSelected(state: AimBoardState, selectedIds: ReadonlySet<string>, now = new Date()): AimBoardState {
  if (!selectedIds.size) return state;
  const archivedAt = now.toISOString();
  const archived: ArchivedGroup[] = [];
  const groups = state.active.groups.flatMap((group): AimGroup[] => {
    const chosen = group.aims.filter((aim) => selectedIds.has(aim.id));
    if (!chosen.length) return [group];
    archived.push({ id: makeAimId(), originalGroupId: group.originGroupId ?? group.id, title: group.title, originalDateKey: group.dateKey, originalGroupOrder: group.order, archivedAt, aims: chosen.map((aim) => ({ ...aim, archivedAt })) });
    const remaining = group.aims.filter((aim) => !selectedIds.has(aim.id));
    return remaining.length || group.isDefault ? [{ ...group, aims: remaining }] : [];
  });
  if (!archived.length) return state;
  const defaultGroupWasEmptied = state.active.groups.some((group) => group.isDefault && group.aims.length > 0 && group.aims.every((aim) => selectedIds.has(aim.id)));
  const survivingOtherGroups = groups.filter((group) => !group.isDefault);
  const activeGroups = defaultGroupWasEmptied && survivingOtherGroups.length ? survivingOtherGroups : groups;
  return { active: { ...state.active, groups: ensureDefaultGroup(activeGroups, state.active.dateKey) }, archive: retainRecentArchive([...archived, ...state.archive], now) };
}

export function deleteAim(state: AimBoardState, aimId: string): AimBoardState {
  if (!state.active.groups.some((group) => group.aims.some((aim) => aim.id === aimId))) return state;
  return { ...state, active: { ...state.active, groups: state.active.groups.map((group) => ({ ...group, aims: group.aims.filter((aim) => aim.id !== aimId) })) } };
}

export function deleteSelected(state: AimBoardState, selectedIds: ReadonlySet<string>): AimBoardState {
  if (!selectedIds.size) return state;
  let deleted = false;
  const groups = state.active.groups.flatMap((group): AimGroup[] => {
    const remaining = group.aims.filter((aim) => !selectedIds.has(aim.id));
    if (remaining.length === group.aims.length) return [group];
    deleted = true;
    return remaining.length || group.isDefault ? [{ ...group, aims: remaining }] : [];
  });
  if (!deleted) return state;
  const defaultWasEmptied = state.active.groups.some((group) => group.isDefault && group.aims.length > 0 && group.aims.every((aim) => selectedIds.has(aim.id)));
  const survivingOtherGroups = groups.filter((group) => !group.isDefault);
  const activeGroups = defaultWasEmptied && survivingOtherGroups.length ? survivingOtherGroups : groups;
  return { ...state, active: { ...state.active, groups: ensureDefaultGroup(activeGroups, state.active.dateKey) } };
}

export function deleteGroup(state: AimBoardState, groupId: string): AimBoardState {
  if (!state.active.groups.some((group) => group.id === groupId)) return state;
  const remaining = state.active.groups.filter((group) => group.id !== groupId);
  return { ...state, active: { ...state.active, groups: ensureDefaultGroup(remaining, state.active.dateKey) } };
}

export function unarchiveSelected(state: AimBoardState, selectedIds: ReadonlySet<string>, now = new Date()): AimBoardState {
  if (!selectedIds.size) return state;
  const current = rollAimBoard(state, now);
  let groups = [...current.active.groups];
  const archive: ArchivedGroup[] = [];
  const batches = new Map<string, { title: string; order: number; aims: AimItem[] }>();

  for (const archivedGroup of current.archive) {
    const chosen = archivedGroup.aims.filter((aim) => selectedIds.has(aim.id));
    const remaining = archivedGroup.aims.filter((aim) => !selectedIds.has(aim.id));
    if (remaining.length) archive.push({ ...archivedGroup, aims: remaining });
    if (!chosen.length) continue;
    const batch = batches.get(archivedGroup.originalGroupId) ?? { title: archivedGroup.title, order: archivedGroup.originalGroupOrder, aims: [] };
    batch.aims.push(...chosen.map((aim): AimItem => ({ id: aim.id, text: aim.text, note: aim.note, createdAt: aim.createdAt, order: aim.order })));
    batches.set(archivedGroup.originalGroupId, batch);
  }

  if (!batches.size) return current;
  for (const [originalId, batch] of batches) {
    const related = groups.filter((group) => group.id === originalId || group.originGroupId === originalId);
    const original = related.find((group) => group.id === originalId)
      ?? { id: originalId, title: related[0]?.title ?? batch.title, dateKey: current.active.dateKey, isDefault: false, order: batch.order, aims: [] };
    const overflow = related.filter((group) => group.id !== originalId);
    const orderedAims = sortAims([...related.flatMap((group) => group.aims), ...batch.aims]);
    const fragments: AimGroup[] = [];
    for (let offset = 0; offset < orderedAims.length; offset += MAX_AIMS_PER_GROUP) {
      const existing = fragments.length === 0 ? original : overflow[fragments.length - 1];
      fragments.push({ ...(existing ?? { id: makeAimId(), title: original.title, dateKey: current.active.dateKey, isDefault: false, order: original.order, originGroupId: originalId }), aims: orderedAims.slice(offset, offset + MAX_AIMS_PER_GROUP) });
    }
    const relatedIds = new Set(related.map((group) => group.id));
    groups = [...groups.filter((group) => !relatedIds.has(group.id)), ...fragments];
  }
  return { active: { ...current.active, groups: ensureDefaultGroup(sortGroups(groups), current.active.dateKey) }, archive };
}

export function rollAimBoard(state: AimBoardState, now = new Date()): AimBoardState {
  const today = localDateKey(now);
  if (state.active.dateKey === today) {
    const archive = retainRecentArchive(state.archive, now);
    const groups = ensureDefaultGroup(state.active.groups, today);
    return archive.length === state.archive.length && groups === state.active.groups ? state : { active: { dateKey: today, groups }, archive };
  }
  const selectedIds = new Set(state.active.groups.flatMap((group) => group.aims.map((aim) => aim.id)));
  const archived = archiveSelected(state, selectedIds, now);
  return { active: { dateKey: today, groups: [defaultGroup(today, nextOrder(archived))] }, archive: retainRecentArchive(archived.archive, now) };
}

export function restoreAimBoard(raw: string | null, now = new Date()): AimBoardState {
  if (!raw) return emptyAimBoard(now);
  try {
    const parsed = record(JSON.parse(raw));
    const active = record(parsed?.active);
    const dateKey = typeof active?.dateKey === 'string' && calendarDay(active.dateKey) !== null ? active.dateKey : localDateKey(now);
    const groups = ensureDefaultGroup(Array.isArray(active?.groups) ? sortGroups(active.groups.map((value, index) => readGroup(value, dateKey, index)).filter((value): value is AimGroup => value !== null)) : [], dateKey);
    const rawArchive = Array.isArray(parsed?.archive) ? parsed.archive : [];
    const archive = rawArchive.map((value, index) => readArchivedGroup(value, rawArchive.length - index - 1)).filter((value): value is ArchivedGroup => value !== null);
    return rollAimBoard({ active: { dateKey, groups }, archive }, now);
  } catch {
    return emptyAimBoard(now);
  }
}

export function addAim(state: AimBoardState, text: string, groupId: string, now = new Date()): AimBoardState {
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > 100) return state;
  const current = rollAimBoard(state, now);
  const aim: AimItem = { id: makeAimId(), text: cleanText, note: '', createdAt: now.toISOString(), order: nextOrder(current) };
  const group = current.active.groups.find((item) => item.id === groupId);
  if (!group || group.aims.length >= MAX_AIMS_PER_GROUP) return current;
  return { ...current, active: { ...current.active, groups: current.active.groups.map((item) => item.id === group.id ? { ...item, aims: [...item.aims, aim] } : item) } };
}

export function addGroup(state: AimBoardState, title: string, now = new Date()): AimBoardState {
  const clean = title.trim();
  if (!clean || clean.length > 40) return state;
  const current = rollAimBoard(state, now);
  const group: AimGroup = { id: makeAimId(), title: clean, dateKey: current.active.dateKey, isDefault: false, order: nextOrder(current), aims: [] };
  return { ...current, active: { ...current.active, groups: [...current.active.groups, group] } };
}

export function renameGroup(state: AimBoardState, groupId: string, title: string): AimBoardState {
  const clean = title.trim();
  if (!clean || clean.length > 40) return state;
  return { ...state, active: { ...state.active, groups: state.active.groups.map((group) => group.id === groupId ? { ...group, title: clean } : group) } };
}

export function renameAim(state: AimBoardState, aimId: string, text: string): AimBoardState {
  const clean = text.trim();
  if (!clean || clean.length > 100) return state;
  return { ...state, active: { ...state.active, groups: state.active.groups.map((group) => ({ ...group, aims: group.aims.map((aim) => aim.id === aimId ? { ...aim, text: clean } : aim) })) } };
}

export function reorderAim(state: AimBoardState, groupId: string, aimId: string, toIndex: number): AimBoardState {
  const group = state.active.groups.find((item) => item.id === groupId);
  if (!group || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= group.aims.length) return state;
  const fromIndex = group.aims.findIndex((aim) => aim.id === aimId);
  if (fromIndex < 0 || fromIndex === toIndex) return state;

  const reordered = [...group.aims];
  const [moving] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moving);
  // Reuse this group's order slots so archived aims keep their place if restored.
  const orderSlots = group.aims.map((aim) => aim.order).sort((a, b) => a - b);
  const aims = reordered.map((aim, index) => ({ ...aim, order: orderSlots[index] }));
  return { ...state, active: { ...state.active, groups: state.active.groups.map((item) => item.id === groupId ? { ...item, aims } : item) } };
}

export function updateAimNote(state: AimBoardState, aimId: string, note: string): AimBoardState {
  return { ...state, active: { ...state.active, groups: state.active.groups.map((group) => ({ ...group, aims: group.aims.map((aim) => aim.id === aimId ? { ...aim, note: note.slice(0, 240) } : aim) })) } };
}

export function updateArchivedNote(state: AimBoardState, aimId: string, note: string): AimBoardState {
  return { ...state, archive: state.archive.map((group) => ({ ...group, aims: group.aims.map((aim) => aim.id === aimId ? { ...aim, note: note.slice(0, 240) } : aim) })) };
}
