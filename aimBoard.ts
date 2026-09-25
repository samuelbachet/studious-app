export const MAX_AIMS_PER_GROUP = 5;
export const DEFAULT_GROUP_TITLE = 'Morning session';

export type AimItem = {
  id: string;
  text: string;
  note: string;
  completed: boolean;
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
  restoredFromDateKey?: string;
  restoredFromGroupId?: string;
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

export function prioritizeOldGroups(groups: AimGroup[]): AimGroup[] {
  return [...groups].sort((a, b) => {
    const aIsOld = Boolean(a.restoredFromDateKey);
    const bIsOld = Boolean(b.restoredFromDateKey);
    if (aIsOld !== bIsOld) return aIsOld ? -1 : 1;
    if (aIsOld && bIsOld && a.restoredFromDateKey !== b.restoredFromDateKey) return (b.restoredFromDateKey ?? '').localeCompare(a.restoredFromDateKey ?? '');
    return a.order - b.order || a.id.localeCompare(b.id);
  });
}

export function emptyAimBoard(now = new Date()): AimBoardState {
  const dateKey = localDateKey(now);
  return { active: { dateKey, groups: [defaultGroup(dateKey)] }, archive: [] };
}

export function starterAimBoard(now = new Date()): AimBoardState {
  const board = emptyAimBoard(now);
  return addAim(board, 'Study', board.active.groups[0].id, now, 'Bio chap 4');
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
  return { id: item.id, text: item.text.trim(), note: item.note, completed: item.completed === true, createdAt: item.createdAt, order };
}

function readGroup(value: unknown, dateKey: string, fallbackOrder: number): AimGroup | null {
  const group = record(value);
  if (!group || typeof group.id !== 'string' || !group.id || typeof group.title !== 'string' || !group.title.trim() || group.title.trim().length > 40 || group.dateKey !== dateKey || !Array.isArray(group.aims)) return null;
  const aims = group.aims.map((value, index) => readAim(value, index)).filter((aim): aim is AimItem => aim !== null).slice(0, MAX_AIMS_PER_GROUP);
  const order = typeof group.order === 'number' && Number.isSafeInteger(group.order) && group.order >= 0 ? group.order : legacyGroupOrder(group.id, fallbackOrder);
  return { id: group.id, title: group.title.trim(), dateKey, isDefault: group.isDefault === true, order, originGroupId: typeof group.originGroupId === 'string' && group.originGroupId ? group.originGroupId : undefined, restoredFromDateKey: typeof group.restoredFromDateKey === 'string' && calendarDay(group.restoredFromDateKey) !== null ? group.restoredFromDateKey : undefined, restoredFromGroupId: typeof group.restoredFromGroupId === 'string' && group.restoredFromGroupId ? group.restoredFromGroupId : undefined, aims: sortAims(aims) };
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
  return { id: group.id, originalGroupId: group.originalGroupId, title: group.title.trim(), originalDateKey: group.originalDateKey, originalGroupOrder, archivedAt: group.archivedAt, aims: sortAims(aims) };
}

export function retainRecentArchive(archive: ArchivedGroup[], now = new Date()): ArchivedGroup[] {
  const today = calendarDay(localDateKey(now)) ?? 0;
  return archive.filter((group) => {
    const day = calendarDay(group.originalDateKey);
    return day !== null && today - day < 30;
  });
}

export function archiveSelected(state: AimBoardState, selectedIds: ReadonlySet<string>, now = new Date(), selectedEmptyGroupIds: ReadonlySet<string> = new Set()): AimBoardState {
  if (!selectedIds.size && !selectedEmptyGroupIds.size) return state;
  const archivedAt = now.toISOString();
  const archived: ArchivedGroup[] = [];
  const groups = state.active.groups.flatMap((group): AimGroup[] => {
    if (!group.aims.length && selectedEmptyGroupIds.has(group.id)) {
      archived.push({ id: makeAimId(), originalGroupId: group.restoredFromGroupId ?? group.originGroupId ?? group.id, title: group.title, originalDateKey: group.restoredFromDateKey ?? group.dateKey, originalGroupOrder: group.order, archivedAt, aims: [] });
      return [];
    }
    const chosen = group.aims.filter((aim) => selectedIds.has(aim.id));
    if (!chosen.length) return [group];
    archived.push({ id: makeAimId(), originalGroupId: group.restoredFromGroupId ?? group.originGroupId ?? group.id, title: group.title, originalDateKey: group.restoredFromDateKey ?? group.dateKey, originalGroupOrder: group.order, archivedAt, aims: chosen.map((aim) => ({ ...aim, archivedAt })) });
    const remaining = group.aims.filter((aim) => !selectedIds.has(aim.id));
    return remaining.length || group.isDefault ? [{ ...group, aims: remaining }] : [];
  });
  if (!archived.length) return state;
  const defaultGroupWasEmptied = state.active.groups.some((group) => group.isDefault && group.aims.length > 0 && group.aims.every((aim) => selectedIds.has(aim.id)));
  const survivingOtherGroups = groups.filter((group) => !group.isDefault);
  const activeGroups = defaultGroupWasEmptied && survivingOtherGroups.length ? survivingOtherGroups : groups;
  return { active: { ...state.active, groups: activeGroups.length ? ensureDefaultGroup(activeGroups, state.active.dateKey) : [] }, archive: retainRecentArchive([...archived, ...state.archive], now) };
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
  return { ...state, active: { ...state.active, groups: remaining.length ? ensureDefaultGroup(remaining, state.active.dateKey) : [] } };
}

export function deleteEmptyGroups(state: AimBoardState, groupIds: ReadonlySet<string>): AimBoardState {
  if (!groupIds.size) return state;
  const removableIds = new Set(state.active.groups.filter((group) => groupIds.has(group.id) && group.aims.length === 0).map((group) => group.id));
  if (!removableIds.size) return state;
  const remaining = state.active.groups.filter((group) => !removableIds.has(group.id));
  return { ...state, active: { ...state.active, groups: remaining.length ? ensureDefaultGroup(remaining, state.active.dateKey) : [] } };
}

export function unarchiveSelected(state: AimBoardState, selectedIds: ReadonlySet<string>, now = new Date(), selectedEmptyGroupIds: ReadonlySet<string> = new Set()): AimBoardState {
  if (!selectedIds.size && !selectedEmptyGroupIds.size) return state;
  const current = rollAimBoard(state, now);
  let groups = [...current.active.groups];
  const archive: ArchivedGroup[] = [];
  const batches = new Map<string, { originalId: string; originalDateKey: string; title: string; order: number; aims: AimItem[] }>();
  const emptyGroups: ArchivedGroup[] = [];

  for (const archivedGroup of current.archive) {
    if (!archivedGroup.aims.length) {
      if (selectedEmptyGroupIds.has(archivedGroup.id)) emptyGroups.push(archivedGroup);
      else archive.push(archivedGroup);
      continue;
    }
    const chosen = archivedGroup.aims.filter((aim) => selectedIds.has(aim.id));
    const remaining = archivedGroup.aims.filter((aim) => !selectedIds.has(aim.id));
    if (remaining.length) archive.push({ ...archivedGroup, aims: remaining });
    if (!chosen.length) continue;
    const key = `${archivedGroup.originalGroupId}\u0000${archivedGroup.originalDateKey}`;
    const batch = batches.get(key) ?? { originalId: archivedGroup.originalGroupId, originalDateKey: archivedGroup.originalDateKey, title: archivedGroup.title, order: archivedGroup.originalGroupOrder, aims: [] };
    batch.aims.push(...chosen.map((aim): AimItem => ({
      id: aim.id,
      text: aim.text,
      note: aim.note,
      completed: aim.completed,
      createdAt: aim.createdAt,
      order: aim.order,
    })));
    batches.set(key, batch);
  }

  if (!batches.size && !emptyGroups.length) return current;
  for (const batch of batches.values()) {
    const { originalId } = batch;
    const isOldGroup = batch.originalDateKey !== current.active.dateKey;
    const related = isOldGroup
      ? groups.filter((group) => group.restoredFromGroupId === originalId && group.restoredFromDateKey === batch.originalDateKey)
      : groups.filter((group) => group.id === originalId || group.originGroupId === originalId);
    const original = related.find((group) => group.id === originalId)
      ?? related[0]
      ?? { id: isOldGroup ? makeAimId() : originalId, title: batch.title, dateKey: current.active.dateKey, isDefault: false, order: batch.order, originGroupId: originalId, ...(isOldGroup ? { restoredFromGroupId: originalId, restoredFromDateKey: batch.originalDateKey } : {}), aims: [] };
    const overflow = related.filter((group) => group.id !== original.id);
    const orderedAims = sortAims([...related.flatMap((group) => group.aims), ...batch.aims]);
    const fragments: AimGroup[] = [];
    for (let offset = 0; offset < orderedAims.length; offset += MAX_AIMS_PER_GROUP) {
      const existing = fragments.length === 0 ? original : overflow[fragments.length - 1];
      fragments.push({ ...(existing ?? { id: makeAimId(), title: original.title, dateKey: current.active.dateKey, isDefault: false, order: original.order, originGroupId: originalId, ...(isOldGroup ? { restoredFromGroupId: originalId, restoredFromDateKey: batch.originalDateKey } : {}) }), aims: orderedAims.slice(offset, offset + MAX_AIMS_PER_GROUP) });
    }
    const relatedIds = new Set(related.map((group) => group.id));
    groups = [...groups.filter((group) => !relatedIds.has(group.id)), ...fragments];
  }
  for (const archivedGroup of emptyGroups) {
    const isOldGroup = archivedGroup.originalDateKey !== current.active.dateKey;
    const originalId = archivedGroup.originalGroupId;
    const id = isOldGroup || groups.some((group) => group.id === originalId) ? makeAimId() : originalId;
    groups.push({
      id,
      title: archivedGroup.title,
      dateKey: current.active.dateKey,
      isDefault: false,
      order: archivedGroup.originalGroupOrder,
      originGroupId: originalId,
      ...(isOldGroup ? { restoredFromGroupId: originalId, restoredFromDateKey: archivedGroup.originalDateKey } : {}),
      aims: [],
    });
  }
  return { active: { ...current.active, groups: ensureDefaultGroup(sortGroups(groups), current.active.dateKey) }, archive };
}

export function rollAimBoard(state: AimBoardState, now = new Date()): AimBoardState {
  const today = localDateKey(now);
  if (state.active.dateKey === today) {
    const archive = retainRecentArchive(state.archive, now);
    const groups = state.active.groups.length ? ensureDefaultGroup(state.active.groups, today) : state.active.groups;
    return archive.length === state.archive.length && groups === state.active.groups ? state : { active: { dateKey: today, groups }, archive };
  }
  const selectedIds = new Set(state.active.groups.flatMap((group) => group.aims.map((aim) => aim.id)));
  const archived = archiveSelected(state, selectedIds, now);
  return { active: { dateKey: today, groups: [defaultGroup(today, nextOrder(archived))] }, archive: retainRecentArchive(archived.archive, now) };
}

export function restoreAimBoard(raw: string | null, now = new Date()): AimBoardState {
  if (!raw) return starterAimBoard(now);
  try {
    const parsed = record(JSON.parse(raw));
    const active = record(parsed?.active);
    const dateKey = typeof active?.dateKey === 'string' && calendarDay(active.dateKey) !== null ? active.dateKey : localDateKey(now);
    const storedGroups = Array.isArray(active?.groups) ? active.groups : null;
    const hasStoredGroups = storedGroups !== null;
    const restoredGroups = storedGroups ? sortGroups(storedGroups.map((value, index) => readGroup(value, dateKey, index)).filter((value): value is AimGroup => value !== null)) : [];
    const groups = restoredGroups.length ? ensureDefaultGroup(restoredGroups, dateKey) : hasStoredGroups ? [] : ensureDefaultGroup([], dateKey);
    const rawArchive = Array.isArray(parsed?.archive) ? parsed.archive : [];
    const archive = rawArchive.map((value, index) => readArchivedGroup(value, rawArchive.length - index - 1)).filter((value): value is ArchivedGroup => value !== null);
    return rollAimBoard({ active: { dateKey, groups }, archive }, now);
  } catch {
    return starterAimBoard(now);
  }
}

export function addAim(state: AimBoardState, text: string, groupId: string, now = new Date(), note = ''): AimBoardState {
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > 100) return state;
  const current = rollAimBoard(state, now);
  const aim: AimItem = { id: makeAimId(), text: cleanText, note: note.trim().slice(0, 240), completed: false, createdAt: now.toISOString(), order: nextOrder(current) };
  const group = current.active.groups.find((item) => item.id === groupId);
  if (!group || group.aims.length >= MAX_AIMS_PER_GROUP) return current;
  return { ...current, active: { ...current.active, groups: current.active.groups.map((item) => item.id === group.id ? { ...item, aims: [...item.aims, aim] } : item) } };
}

export function addGroup(state: AimBoardState, title: string, now = new Date()): AimBoardState {
  const clean = title.trim();
  if (!clean || clean.length > 40) return state;
  const current = rollAimBoard(state, now);
  const group: AimGroup = { id: makeAimId(), title: clean, dateKey: current.active.dateKey, isDefault: current.active.groups.length === 0, order: nextOrder(current), aims: [] };
  return { ...current, active: { ...current.active, groups: [...current.active.groups, group] } };
}

export function deleteArchivedSelected(state: AimBoardState, selectedIds: ReadonlySet<string>, selectedEmptyGroupIds: ReadonlySet<string> = new Set()): AimBoardState {
  if (!selectedIds.size && !selectedEmptyGroupIds.size) return state;
  let deleted = false;
  const archive = state.archive.flatMap((group): ArchivedGroup[] => {
    if (!group.aims.length && selectedEmptyGroupIds.has(group.id)) {
      deleted = true;
      return [];
    }
    const aims = group.aims.filter((aim) => !selectedIds.has(aim.id));
    if (aims.length === group.aims.length) return [group];
    deleted = true;
    return aims.length ? [{ ...group, aims }] : [];
  });
  return deleted ? { ...state, archive } : state;
}

export function addSeptember23PreviewGroup(state: AimBoardState, now = new Date()): AimBoardState {
  const current = rollAimBoard(state, now);
  let previous = emptyAimBoard(new Date(2026, 8, 23, 12));
  const previousGroup = previous.active.groups[0];
  previous = renameGroup(previous, previousGroup.id, 'University');
  previous = addAim(previous, 'Read Chapter 4', previousGroup.id, new Date(2026, 8, 23, 12));
  const oldAimId = previous.active.groups[0].aims[0]?.id;
  if (!oldAimId) return current;

  const previousDay = rollAimBoard(previous, now);
  const base = current.active.groups.some((group) => group.title === 'University')
    ? current
    : addGroup(current, 'University', now);
  const withPreviewArchive = { ...base, archive: [...previousDay.archive, ...base.archive] };
  const restored = unarchiveSelected(withPreviewArchive, new Set([oldAimId]), now);
  const previewGroup = restored.active.groups.find((group) => group.restoredFromDateKey === '2026-09-23' && group.title === 'University');
  if (!previewGroup) return restored;

  const greatestOrder = base.active.groups.reduce((greatest, group) => Math.max(greatest, group.order), -1);
  return {
    ...restored,
    active: {
      ...restored.active,
      groups: [
        ...base.active.groups,
        { ...previewGroup, isDefault: false, order: greatestOrder + 1 },
      ],
    },
  };
}

export function addSeptember23ArchivePreview(state: AimBoardState, now = new Date()): AimBoardState {
  const current = rollAimBoard(state, now);
  const archivedPreview = current.archive.some((group) => group.title === 'University' && group.aims.some((aim) => aim.text === 'Read Chapter 4'));
  if (archivedPreview) {
    let changed = false;
    const archive = current.archive.map((group) => {
      if (group.title !== 'University' || !group.aims.some((aim) => aim.text === 'Read Chapter 4') || group.originalDateKey === '2026-09-23') return group;
      changed = true;
      return { ...group, originalDateKey: '2026-09-23' };
    });
    return changed ? { ...current, archive } : current;
  }

  const activePreview = current.active.groups.find((group) => group.title === 'University' && group.restoredFromDateKey === '2026-09-23' && group.aims.some((aim) => aim.text === 'Read Chapter 4'))
    ? current
    : addSeptember23PreviewGroup(current, now);
  const previewAim = activePreview.active.groups.find((group) => group.title === 'University' && group.restoredFromDateKey === '2026-09-23')?.aims.find((aim) => aim.text === 'Read Chapter 4');
  return previewAim ? archiveSelected(activePreview, new Set([previewAim.id]), now) : activePreview;
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

export function completeSelected(state: AimBoardState, selectedIds: ReadonlySet<string>): AimBoardState {
  if (!selectedIds.size) return state;
  let changed = false;
  const groups = state.active.groups.map((group) => ({
    ...group,
    aims: group.aims.map((aim) => {
      if (!selectedIds.has(aim.id) || aim.completed) return aim;
      changed = true;
      return { ...aim, completed: true };
    }),
  }));
  return changed ? { ...state, active: { ...state.active, groups } } : state;
}

export function uncompleteSelected(state: AimBoardState, selectedIds: ReadonlySet<string>): AimBoardState {
  if (!selectedIds.size) return state;
  let changed = false;
  const groups = state.active.groups.map((group) => ({
    ...group,
    aims: group.aims.map((aim) => {
      if (!selectedIds.has(aim.id) || !aim.completed) return aim;
      changed = true;
      return { ...aim, completed: false };
    }),
  }));
  return changed ? { ...state, active: { ...state.active, groups } } : state;
}

export function completeArchivedSelected(state: AimBoardState, selectedIds: ReadonlySet<string>): AimBoardState {
  if (!selectedIds.size) return state;
  let changed = false;
  const archive = state.archive.map((group) => ({
    ...group,
    aims: group.aims.map((aim) => {
      if (!selectedIds.has(aim.id) || aim.completed) return aim;
      changed = true;
      return { ...aim, completed: true };
    }),
  }));
  return changed ? { ...state, archive } : state;
}

export function uncompleteArchivedSelected(state: AimBoardState, selectedIds: ReadonlySet<string>): AimBoardState {
  if (!selectedIds.size) return state;
  let changed = false;
  const archive = state.archive.map((group) => ({
    ...group,
    aims: group.aims.map((aim) => {
      if (!selectedIds.has(aim.id) || !aim.completed) return aim;
      changed = true;
      return { ...aim, completed: false };
    }),
  }));
  return changed ? { ...state, archive } : state;
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
