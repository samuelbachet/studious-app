import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, BackHandler, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addAim, addGroup, archiveSelected, deleteSelected, MAX_AIMS_PER_GROUP, renameAim, renameGroup, reorderAim, unarchiveSelected, updateAimNote, updateArchivedNote } from './aimBoard';
import type { AimBoardState, AimGroup, ArchivedAimItem } from './aimBoard';
import { boundedAimOffset, orderedAimLayouts, previewAimTops, previewIndex, proposedAimIndex } from './aimDrag';
import type { AimDragLayout } from './aimDrag';
import type { EffectiveTheme, ThemeColors } from './theme';
import { fonts } from './typography';

type Editor = { kind: 'addAim'; groupId: string } | { kind: 'addGroup' } | { kind: 'title'; id: string } | { kind: 'aim'; id: string };
type NoteEdit = { id: string; archived: boolean; original: string; latest: string };
type AimDrag = { groupId: string; aimId: string; startY: number; sourceY: number; layouts: AimDragLayout[]; listHeight: number; toIndex: number };

function PressFeedback({ children, onPress, label, style, disabled = false, selected = false }: { children: ReactNode; onPress: () => void; label: string; style?: StyleProp<ViewStyle>; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}>{children}</Pressable>;
}

function SelectionCircle({ selected, partial = false, disabled = false, label, onPress, colors }: { selected: boolean; partial?: boolean; disabled?: boolean; label: string; onPress: () => void; colors: ThemeColors }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: partial ? 'mixed' : selected, disabled }} disabled={disabled} onPress={onPress} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : 1 }}>
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: selected || partial ? colors.accent : colors.textMuted, backgroundColor: selected ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {selected ? <Feather name="check" size={14} color={colors.accentForeground} /> : partial ? <View style={{ width: 9, height: 2, borderRadius: 1, backgroundColor: colors.accent }} /> : null}
    </View>
  </Pressable>;
}

function SelectionToolbar({ enabled, selectedCount, totalCount, onToggle, onSelectAll, colors, styles }: { enabled: boolean; selectedCount: number; totalCount: number; onToggle: () => void; onSelectAll: () => void; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  return <View style={styles.selectionToolbar}>
    <PressFeedback label={enabled ? 'Finish selecting' : 'Select aims'} selected={enabled} onPress={onToggle} style={[styles.selectionToggle, enabled && styles.selectionToggleActive]}>
      <Feather name={enabled ? 'check-square' : 'square'} size={17} color={enabled ? colors.accent : colors.textMuted} />
      <Text style={[styles.selectionText, enabled && styles.selectionTextActive]}>{enabled ? 'Done' : 'Select'}</Text>
    </PressFeedback>
    {enabled && <PressFeedback label={allSelected ? 'Deselect all aims' : 'Select all aims'} onPress={onSelectAll} disabled={totalCount === 0} style={styles.selectAllButton}>
      <Text style={styles.selectAllText}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
    </PressFeedback>}
  </View>;
}

function RenameLabel({ accessibilityLabel, accessibilityHint, onPress, onPressIn, onLongPress, onPressMove, onPressOut, children, style, pressStyle, pressedStyle }: { accessibilityLabel: string; accessibilityHint?: string; onPress: () => void; onPressIn?: PressableProps['onPressIn']; onLongPress?: PressableProps['onLongPress']; onPressMove?: PressableProps['onPressMove']; onPressOut?: PressableProps['onPressOut']; children: ReactNode; style?: StyleProp<ViewStyle>; pressStyle: StyleProp<ViewStyle>; pressedStyle: StyleProp<ViewStyle> }) {
  return <View style={style}>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} onPress={onPress} onPressIn={onPressIn} onLongPress={onLongPress} onPressMove={onPressMove} onPressOut={onPressOut} delayLongPress={450} pressRetentionOffset={onLongPress ? { top: 1000, bottom: 1000, left: 80, right: 80 } : undefined} style={({ pressed }) => [pressStyle, pressed && pressedStyle]}>{children}</Pressable>
  </View>;
}

function AimBlock({ id, children, onLayout, registerSlot, style, draggedStyle, draggedBorderStyle, dragging, previewActive, previewTop, dragTop }: { id: string; children: ReactNode; onLayout: (event: LayoutChangeEvent) => void; registerSlot: (id: string, slot: Animated.Value | null) => void; style: StyleProp<ViewStyle>; draggedStyle: StyleProp<ViewStyle>; draggedBorderStyle: StyleProp<ViewStyle>; dragging: boolean; previewActive: boolean; previewTop: number; dragTop: Animated.Value }) {
  const [slotTop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    registerSlot(id, slotTop);
    return () => registerSlot(id, null);
  }, [id, registerSlot, slotTop]);
  useEffect(() => {
    if (!previewActive || dragging) return undefined;
    const animation = Animated.timing(slotTop, { toValue: previewTop, duration: 150, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [dragging, previewActive, previewTop, slotTop]);
  const handleLayout = (event: LayoutChangeEvent) => {
    if (!previewActive) {
      slotTop.setValue(event.nativeEvent.layout.y);
      onLayout(event);
    }
  };
  return <Animated.View onLayout={handleLayout} style={[style, dragging && draggedStyle, previewActive && { position: 'absolute', left: 0, right: 0, top: dragging ? dragTop : slotTop }]}>{children}{dragging && <View pointerEvents="none" style={draggedBorderStyle} />}</Animated.View>;
}

function formatArchiveDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function archiveSections(archive: AimBoardState['archive']): { dateKey: string; titles: { id: string; title: string; order: number; aims: ArchivedAimItem[] }[] }[] {
  const dates = new Map<string, Map<string, { id: string; title: string; order: number; aims: ArchivedAimItem[] }>>();
  for (const group of archive) {
    const titles = dates.get(group.originalDateKey) ?? new Map<string, { id: string; title: string; order: number; aims: ArchivedAimItem[] }>();
    const key = `${group.originalGroupId}:${group.title}`;
    const existing = titles.get(key);
    titles.set(key, { id: group.originalGroupId, title: group.title, order: group.originalGroupOrder, aims: [...(existing?.aims ?? []), ...group.aims] });
    dates.set(group.originalDateKey, titles);
  }
  return [...dates.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([dateKey, titles]) => ({
    dateKey,
    titles: [...titles.values()].map((group) => ({ ...group, aims: group.aims.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)) })).sort((a, b) => a.order - b.order),
  }));
}

export function AimBoardScreen({ header, state, onChange, colors, effectiveTheme, scrollContentStyle }: { header: ReactNode; state: AimBoardState; onChange: (update: (current: AimBoardState) => AimBoardState) => void; colors: ThemeColors; effectiveTheme: EffectiveTheme; scrollContentStyle: StyleProp<ViewStyle> }) {
  const styles = useMemo(() => createStyles(colors, effectiveTheme), [colors, effectiveTheme]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectedArchived, setSelectedArchived] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [aimPressHeld, setAimPressHeld] = useState(false);
  const [dragging, setDragging] = useState<AimDrag | null>(null);
  const dragRef = useRef<AimDrag | null>(null);
  const aimHeights = useRef(new Map<string, number>());
  const aimSlotValues = useRef(new Map<string, Animated.Value>());
  const settleAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [dragTop] = useState(() => new Animated.Value(0));
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const noteEditRef = useRef<NoteEdit | null>(null);
  const groups = state.active.groups;
  const hasArchivedAims = state.archive.some((group) => group.aims.length > 0);
  const activeIds = useMemo(() => new Set(groups.flatMap((group) => group.aims.map((aim) => aim.id))), [groups]);
  const sections = useMemo(() => archiveSections(state.archive), [state.archive]);
  const selectedActive = useMemo(() => new Set([...selected].filter((id) => activeIds.has(id))), [selected, activeIds]);
  const archivedIds = useMemo(() => new Set(state.archive.flatMap((group) => group.aims.map((aim) => aim.id))), [state.archive]);
  const selectedArchiveActive = useMemo(() => new Set([...selectedArchived].filter((id) => archivedIds.has(id))), [selectedArchived, archivedIds]);
  const closeArchive = useCallback(() => { Keyboard.dismiss(); setSelectedArchived(new Set()); setArchiveSelectionMode(false); setArchiveOpen(false); }, []);
  useEffect(() => {
    if (!archiveOpen) return undefined;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { closeArchive(); return true; });
    return () => back.remove();
  }, [archiveOpen, closeArchive]);
  useEffect(() => () => { settleAnimationRef.current?.stop(); }, []);

  const cancelDrag = () => {
    const animation = settleAnimationRef.current;
    settleAnimationRef.current = null;
    animation?.stop();
    dragRef.current = null;
    setAimPressHeld(false);
    setDragging(null);
  };

  const openAddAim = (group: AimGroup) => {
    if (group.aims.length >= MAX_AIMS_PER_GROUP) return;
    Keyboard.dismiss();
    cancelDrag();
    setValue('');
    setError('');
    setEditor({ kind: 'addAim', groupId: group.id });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const openAddGroup = () => { Keyboard.dismiss(); cancelDrag(); setValue(''); setError(''); setEditor({ kind: 'addGroup' }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const openTitleEditor = (group: AimGroup) => { cancelDrag(); setValue(group.title); setError(''); setEditor({ kind: 'title', id: group.id }); };
  const openAimEditor = (id: string, text: string) => { cancelDrag(); setValue(text); setError(''); setEditor({ kind: 'aim', id }); };
  const closeEditor = () => { Keyboard.dismiss(); setEditor(null); };
  const saveEditor = () => {
    if (!editor) return;
    const clean = value.trim();
    if (!clean) { setError(editor.kind === 'addAim' || editor.kind === 'aim' ? 'Write an aim to continue.' : 'Enter a title to continue.'); return; }
    if (editor.kind === 'addAim') {
      const group = groups.find((item) => item.id === editor.groupId);
      if (!group || group.aims.length >= MAX_AIMS_PER_GROUP) { setError('This set already has 5 aims.'); return; }
      onChange((current) => addAim(current, clean, editor.groupId));
    } else if (editor.kind === 'addGroup') {
      onChange((current) => addGroup(current, clean));
    } else if (editor.kind === 'title') {
      onChange((current) => renameGroup(current, editor.id, clean));
    } else {
      onChange((current) => renameAim(current, editor.id, clean));
    }
    void Haptics.selectionAsync();
    closeEditor();
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
    if (dragRef.current?.groupId === groupId) cancelDrag();
  };
  const registerAimSlot = useCallback((id: string, slot: Animated.Value | null) => {
    if (slot) aimSlotValues.current.set(id, slot);
    else aimSlotValues.current.delete(id);
  }, []);
  const measuredLayouts = (group: AimGroup): AimDragLayout[] | null =>
    orderedAimLayouts(group.aims.map((aim) => aim.id), aimHeights.current);
  const beginAimDrag = (group: AimGroup, aimId: string, event: GestureResponderEvent) => {
    if (group.aims.length < 2 || settleAnimationRef.current) return;
    const layouts = measuredLayouts(group);
    if (!layouts) return;
    const source = layouts.find((item) => item.id === aimId);
    if (!source) return;
    const pageY = event.nativeEvent.pageY;
    // Reset every row's animated slot to its *current* canonical position.
    // A previous drop may not have emitted a new onLayout for every Aim.
    for (const layout of layouts) {
      aimSlotValues.current.get(layout.id)?.stopAnimation();
      aimSlotValues.current.get(layout.id)?.setValue(layout.y);
    }
    dragTop.setValue(source.y);
    const next = { groupId: group.id, aimId, startY: pageY, sourceY: source.y, layouts, listHeight: Math.max(...layouts.map((item) => item.y + item.height)), toIndex: group.aims.findIndex((aim) => aim.id === aimId) };
    dragRef.current = next;
    setDragging(next);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const moveAimDrag = (group: AimGroup, aimId: string, event: GestureResponderEvent) => {
    const active = dragRef.current;
    if (!active || active.aimId !== aimId) return;
    const pageY = event.nativeEvent.pageY;
    const offset = boundedAimOffset(active.layouts, aimId, pageY - active.startY);
    dragTop.setValue(active.sourceY + offset);
    const draggedTopY = active.sourceY + offset;
    const toIndex = proposedAimIndex(active.layouts, aimId, active.toIndex, draggedTopY);
    if (toIndex !== active.toIndex) {
      const next = { ...active, toIndex };
      dragRef.current = next;
      setDragging(next);
      void Haptics.selectionAsync();
    }
  };
  const finishAimDrag = (group: AimGroup, aimId: string) => {
    const active = dragRef.current;
    if (!active || active.aimId !== aimId) return;
    dragRef.current = null;
    const sourceIndex = group.aims.findIndex((aim) => aim.id === aimId);
    const shouldCommit = active.toIndex !== sourceIndex;
    if (!shouldCommit) setDragging({ ...active, toIndex: sourceIndex });
    const finalTops = previewAimTops(active.layouts, aimId, shouldCommit ? active.toIndex : sourceIndex);
    const targetTop = finalTops.get(aimId) ?? active.sourceY;
    const animation = Animated.timing(dragTop, { toValue: targetTop, duration: 180, useNativeDriver: false });
    settleAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (!finished || settleAnimationRef.current !== animation) return;
      settleAnimationRef.current = null;
      for (const [id, top] of finalTops) {
        const slot = aimSlotValues.current.get(id);
        slot?.stopAnimation();
        slot?.setValue(top);
      }
      // Promote the fully settled preview and clear drag state in one React update.
      if (shouldCommit) onChange((current) => reorderAim(current, group.id, aimId, active.toIndex));
      setDragging(null);
    });
    if (shouldCommit) void Haptics.selectionAsync();
  };

  const toggleAim = (id: string) => {
    setSelected((current) => {
      const next = new Set([...current].filter((item) => activeIds.has(item)));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleGroup = (group: AimGroup) => {
    if (!group.aims.length) return;
    setSelected((current) => {
      const next = new Set([...current].filter((item) => activeIds.has(item)));
      const all = group.aims.every((aim) => next.has(aim.id));
      for (const aim of group.aims) { if (all) next.delete(aim.id); else next.add(aim.id); }
      return next;
    });
  };
  const toggleArchivedAim = (id: string) => {
    setSelectedArchived((current) => {
      const next = new Set([...current].filter((item) => archivedIds.has(item)));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleArchivedGroup = (aims: ArchivedAimItem[]) => {
    setSelectedArchived((current) => {
      const next = new Set([...current].filter((item) => archivedIds.has(item)));
      const all = aims.every((aim) => next.has(aim.id));
      for (const aim of aims) { if (all) next.delete(aim.id); else next.add(aim.id); }
      return next;
    });
  };
  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelected(new Set());
  };
  const selectAllAims = () => {
    setSelected(selectedActive.size === activeIds.size ? new Set() : new Set(activeIds));
  };
  const toggleArchiveSelectionMode = () => {
    setArchiveSelectionMode((current) => !current);
    setSelectedArchived(new Set());
  };
  const selectAllArchivedAims = () => {
    setSelectedArchived(selectedArchiveActive.size === archivedIds.size ? new Set() : new Set(archivedIds));
  };
  const archiveCurrentSelection = () => {
    if (!selectedActive.size) return;
    const ids = new Set(selectedActive);
    Keyboard.dismiss();
    onChange((current) => archiveSelected(current, ids));
    setSelected(new Set());
    setSelectionMode(false);
    cancelDrag();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const deleteCurrentSelection = () => {
    if (!selectedActive.size) return;
    const ids = new Set(selectedActive);
    Keyboard.dismiss();
    onChange((current) => deleteSelected(current, ids));
    setSelected(new Set());
    setSelectionMode(false);
    cancelDrag();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const unarchiveCurrentSelection = () => {
    if (!selectedArchiveActive.size) return;
    const ids = new Set(selectedArchiveActive);
    Keyboard.dismiss();
    onChange((current) => unarchiveSelected(current, ids));
    setSelectedArchived(new Set());
    setArchiveSelectionMode(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const updateNote = (id: string, archived: boolean, next: string) => {
    onChange((current) => archived ? updateArchivedNote(current, id, next) : updateAimNote(current, id, next));
  };
  const finishNoteEdit = (id: string) => {
    const edit = noteEditRef.current;
    if (!edit || edit.id !== id) return;
    noteEditRef.current = null;
    setFocusedNoteId(null);
    const trimmed = edit.latest.trim();
    const finalNote = trimmed ? trimmed : edit.original;
    if (finalNote !== edit.latest) updateNote(id, edit.archived, finalNote);
  };
  const noteInput = (id: string, text: string, note: string, archived: boolean) => <TextInput
    value={note}
    onFocus={() => { noteEditRef.current = { id, archived, original: note, latest: note }; setFocusedNoteId(id); }}
    onChangeText={(next) => {
      if (noteEditRef.current?.id === id) noteEditRef.current.latest = next;
      updateNote(id, archived, next);
    }}
    onBlur={() => finishNoteEdit(id)}
    placeholder="Write note..."
    placeholderTextColor={colors.textMuted}
    keyboardAppearance={effectiveTheme}
    multiline
    maxLength={240}
    numberOfLines={3}
    textAlignVertical="top"
    accessibilityLabel={`Write note for ${text}`}
    style={[styles.noteInput, (archived ? archiveSelectionMode : selectionMode) ? styles.noteWithSelection : styles.noteWithoutSelection]}
  />;

  return <View style={styles.root}>
    {archiveOpen ? <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.archiveContent} keyboardShouldPersistTaps={focusedNoteId ? 'never' : 'handled'} keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <PressFeedback label="Back to aims" onPress={closeArchive} style={styles.backButton}><Feather name="arrow-left" size={21} color={colors.text} /></PressFeedback>
        <Text style={styles.archiveTitle}>Archive</Text>
        <SelectionToolbar enabled={archiveSelectionMode} selectedCount={selectedArchiveActive.size} totalCount={archivedIds.size} onToggle={toggleArchiveSelectionMode} onSelectAll={selectAllArchivedAims} colors={colors} styles={styles} />
        {sections.map((section) => <View key={section.dateKey} style={styles.archiveDateBlock}>
          <Text style={styles.eyebrow}>{formatArchiveDate(section.dateKey).toUpperCase()}</Text>
          {section.titles.map((group) => {
            const count = group.aims.filter((aim) => selectedArchiveActive.has(aim.id)).length;
            const all = count === group.aims.length;
            return <View key={`${group.id}:${group.title}`} style={styles.archiveGroup}>
              <View style={[styles.groupRow, !archiveSelectionMode && styles.rowWithoutSelection]}>
                {archiveSelectionMode && <SelectionCircle selected={all} partial={count > 0 && !all} label={`Select all archived aims in ${group.title}`} onPress={() => toggleArchivedGroup(group.aims)} colors={colors} />}
                <View style={styles.rowTextWrap}><Text style={styles.groupTitle}>{group.title}</Text></View>
              </View>
              {group.aims.map((aim, index) => <View key={aim.id} style={styles.archiveAim}>
                <View style={[styles.aimRow, !archiveSelectionMode && styles.rowWithoutSelection]}>
                  {archiveSelectionMode && <SelectionCircle selected={selectedArchiveActive.has(aim.id)} label={`Select archived aim: ${aim.text}`} onPress={() => toggleArchivedAim(aim.id)} colors={colors} />}
                  <Text style={styles.aimNumber}>{index + 1}.</Text>
                  <View style={styles.rowTextWrap}><Text style={styles.aimText}>{aim.text}</Text></View>
                </View>
                {noteInput(aim.id, aim.text, aim.note, true)}
              </View>)}
            </View>;
          })}
        </View>)}
      </ScrollView>
      {archiveSelectionMode && state.archive.length > 0 && <View style={styles.archiveFooter}>
        <PressFeedback label={selectedArchiveActive.size ? `Unarchive ${selectedArchiveActive.size} selected aims` : 'Select archived aims to unarchive'} onPress={unarchiveCurrentSelection} disabled={!selectedArchiveActive.size} style={[styles.archiveTarget, selectedArchiveActive.size > 0 && styles.archiveTargetReady]}>
          <Feather name="corner-up-left" size={20} color={selectedArchiveActive.size ? colors.accent : colors.textMuted} />
          <Text style={[styles.archiveTargetText, selectedArchiveActive.size > 0 && styles.archiveTargetTextReady]}>Unarchive{selectedArchiveActive.size ? `  ·  ${selectedArchiveActive.size}` : ''}</Text>
        </PressFeedback>
      </View>}
    </> : <>
      <ScrollView style={styles.scroll} contentContainerStyle={[scrollContentStyle, styles.homeContent]} keyboardShouldPersistTaps={focusedNoteId ? 'never' : 'handled'} keyboardDismissMode="on-drag" scrollEnabled={!dragging && !aimPressHeld} showsVerticalScrollIndicator={false}>
        {header}
        <View style={styles.boardArea}>
          <SelectionToolbar enabled={selectionMode} selectedCount={selectedActive.size} totalCount={activeIds.size} onToggle={toggleSelectionMode} onSelectAll={selectAllAims} colors={colors} styles={styles} />
          {groups.map((group) => {
            const count = group.aims.filter((aim) => selectedActive.has(aim.id)).length;
            const all = group.aims.length > 0 && count === group.aims.length;
            const collapsed = collapsedGroups.has(group.id);
            const groupDrag = dragging?.groupId === group.id ? dragging : null;
            const sourceIndex = groupDrag ? group.aims.findIndex((aim) => aim.id === groupDrag.aimId) : -1;
            const previewTops = groupDrag ? previewAimTops(groupDrag.layouts, groupDrag.aimId, groupDrag.toIndex) : null;
            return <View key={group.id} collapsable={false} style={styles.group}>
              <View style={[styles.groupRow, !selectionMode && styles.rowWithoutSelection]}>
                {selectionMode && <SelectionCircle selected={all} partial={count > 0 && !all} disabled={group.aims.length === 0} label={`Select all aims in ${group.title}`} onPress={() => toggleGroup(group)} colors={colors} />}
                <RenameLabel accessibilityLabel={`Rename group: ${group.title}`} onPress={() => openTitleEditor(group)} style={styles.rowTextWrap} pressStyle={styles.renameTarget} pressedStyle={styles.renameTargetPressed}><Text selectable={false} style={styles.groupTitle}>{group.title}</Text></RenameLabel>
                <Pressable accessibilityRole="button" accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${group.title}`} accessibilityState={{ expanded: !collapsed }} onPress={() => toggleGroupCollapsed(group.id)} style={({ pressed }) => [styles.collapseButton, pressed && styles.collapseButtonPressed]}>
                  <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={20} color={colors.textMuted} accessible={false} />
                </Pressable>
              </View>
              {!collapsed && <View collapsable={false} style={groupDrag && { height: groupDrag.listHeight }}>
              {group.aims.map((aim, index) => <AimBlock key={aim.id} id={aim.id} registerSlot={registerAimSlot} onLayout={({ nativeEvent }) => { aimHeights.current.set(aim.id, nativeEvent.layout.height); }} style={styles.aimBlock} draggedStyle={styles.draggedAim} draggedBorderStyle={styles.draggedAimBorder} dragging={groupDrag?.aimId === aim.id} previewActive={Boolean(groupDrag)} previewTop={previewTops?.get(aim.id) ?? 0} dragTop={dragTop}>
                <View style={[styles.aimRow, !selectionMode && styles.rowWithoutSelection]}>
                  {selectionMode && <SelectionCircle selected={selectedActive.has(aim.id)} label={`Select aim: ${aim.text}`} onPress={() => toggleAim(aim.id)} colors={colors} />}
                  <Text style={styles.aimNumber}>{(groupDrag ? previewIndex(index, sourceIndex, groupDrag.toIndex) : index) + 1}.</Text>
                  <RenameLabel accessibilityLabel={`Rename aim: ${aim.text}`} accessibilityHint={group.aims.length > 1 ? 'Long press and drag vertically to reorder' : undefined} onPress={() => openAimEditor(aim.id, aim.text)} onPressIn={group.aims.length > 1 ? () => setAimPressHeld(true) : undefined} onLongPress={group.aims.length > 1 ? (event) => beginAimDrag(group, aim.id, event) : undefined} onPressMove={(event) => moveAimDrag(group, aim.id, event)} onPressOut={() => { setAimPressHeld(false); finishAimDrag(group, aim.id); }} style={styles.rowTextWrap} pressStyle={styles.renameTarget} pressedStyle={styles.renameTargetPressed}><Text selectable={false} style={styles.aimText}>{aim.text}</Text></RenameLabel>
                </View>
                {noteInput(aim.id, aim.text, aim.note, false)}
              </AimBlock>)}
              </View>}
              {!collapsed && <PressFeedback label={`Add aim to ${group.title}`} onPress={() => openAddAim(group)} disabled={group.aims.length >= MAX_AIMS_PER_GROUP} style={[styles.boardButton, styles.addAimButton, group.aims.length > 0 && styles.compactAddAimButton]}>
                <Feather name="plus" size={group.aims.length > 0 ? 20 : 17} color={effectiveTheme === 'light' ? colors.actionOnAccent : colors.accent} accessible={false} />
                {group.aims.length === 0 && <Text style={styles.boardActionText}>Add aim</Text>}
              </PressFeedback>}
            </View>;
          })}
          <PressFeedback label="Add group" onPress={openAddGroup} style={[styles.boardButton, styles.addGroupButton]}>
            <Feather name="plus" size={17} color={effectiveTheme === 'light' ? colors.actionOnAccent : colors.accent} accessible={false} /><Text style={styles.boardActionText}>Add group</Text>
          </PressFeedback>
        </View>
      </ScrollView>
      {(groups.length > 0 || state.archive.length > 0) && <View style={styles.archiveFooter}>
        <View style={styles.footerActions}>
        <PressFeedback label={selectedActive.size ? `Archive ${selectedActive.size} selected aims` : 'Open Archive'} onPress={() => {
            Keyboard.dismiss();
            if (selectedActive.size) archiveCurrentSelection();
            else { setSelected(new Set()); setSelectionMode(false); cancelDrag(); setArchiveOpen(true); }
          }} style={[styles.archiveTarget, (selectedActive.size > 0 || hasArchivedAims) && styles.archiveTargetReady]}>
          <Feather name="folder" size={22} color={selectedActive.size > 0 || hasArchivedAims ? colors.actionOnAccent : colors.textMuted} />
          <Text style={[styles.archiveTargetText, (selectedActive.size > 0 || hasArchivedAims) && styles.archiveTargetTextReady]}>Archive{selectedActive.size ? `  ·  ${selectedActive.size}` : ''}</Text>
        </PressFeedback>
        {selectedActive.size > 0 && <PressFeedback label={`Delete ${selectedActive.size} selected aims`} onPress={deleteCurrentSelection} style={styles.deleteSelectedButton}>
          <Feather name="trash-2" size={18} color={colors.actionOnAccent} />
        </PressFeedback>}
        </View>
      </View>}
    </>}
    <Modal visible={editor !== null} transparent animationType="fade" onRequestClose={closeEditor}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.modalBackdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel editing" onPress={closeEditor} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.eyebrow}>{editor?.kind === 'addAim' ? 'ADD AIM' : editor?.kind === 'addGroup' ? 'NEW GROUP' : editor?.kind === 'title' ? 'TITLE' : 'EDIT AIM'}</Text>
            <Text style={styles.modalPrompt}>{editor?.kind === 'title' ? 'Rename this set' : editor?.kind === 'addGroup' ? 'Group name' : editor?.kind === 'addAim' ? 'Aim' : 'Rename this aim'}</Text>
            <TextInput value={value} onChangeText={(next) => { setValue(next); setError(''); }} placeholder={editor?.kind === 'addAim' ? 'Write your aim...' : editor?.kind === 'addGroup' ? 'Name this group...' : undefined} placeholderTextColor={colors.textMuted} keyboardAppearance={effectiveTheme} maxLength={editor?.kind === 'title' || editor?.kind === 'addGroup' ? 40 : 100} returnKeyType="done" onSubmitEditing={saveEditor} style={styles.modalInput} accessibilityLabel={editor?.kind === 'title' || editor?.kind === 'addGroup' ? 'Group name' : 'Aim'} />
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.modalActions}>
              <PressFeedback label="Cancel" onPress={closeEditor} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></PressFeedback>
              <PressFeedback label="Save" onPress={saveEditor} style={styles.saveButton}><Text style={styles.saveText}>Save</Text></PressFeedback>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </View>;
}

function createStyles(colors: ThemeColors, effectiveTheme: EffectiveTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    homeContent: { flexGrow: 1 },
    boardArea: { paddingTop: 8, paddingBottom: 30 },
    selectionToolbar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectionToggle: { minHeight: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
    selectionToggleActive: { borderColor: colors.accent, backgroundColor: colors.surfaceMuted },
    selectionText: { fontFamily: fonts.sans.medium, fontSize: 13, color: colors.textMuted },
    selectionTextActive: { color: colors.accent },
    selectAllButton: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
    selectAllText: { fontFamily: fonts.sans.medium, fontSize: 13, color: colors.accent },
    group: { marginTop: 26, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
    groupRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -8 },
    rowWithoutSelection: { marginLeft: 0 },
    rowTextWrap: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    collapseButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    collapseButtonPressed: { backgroundColor: colors.surfaceMuted, opacity: 0.85 },
    renameTarget: { minHeight: 44, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 4 },
    renameTargetPressed: { backgroundColor: colors.surfaceMuted, opacity: 0.85 },
    groupTitle: { fontFamily: fonts.serif.regular, fontSize: 23, lineHeight: 31, color: colors.text },
    aimBlock: { paddingTop: 10, paddingLeft: 14 },
    draggedAim: { zIndex: 10, elevation: 4, borderRadius: 14, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8 },
    draggedAimBorder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 14, borderWidth: 1, borderColor: colors.accent },
    aimRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -8 },
    aimNumber: { width: 24, fontFamily: fonts.sans.medium, fontSize: 13, lineHeight: 20, color: colors.textMuted },
    aimText: { fontFamily: fonts.sans.medium, fontSize: 15, lineHeight: 22, color: colors.text, flexShrink: 1 },
    noteInput: { fontFamily: fonts.sans.regular, fontSize: 13, lineHeight: 20, color: colors.textMuted, minHeight: 35, maxHeight: 82, paddingTop: 3, paddingBottom: 8, paddingHorizontal: 3, marginRight: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
    noteWithSelection: { marginLeft: 64 },
    noteWithoutSelection: { marginLeft: 28 },
    boardButton: { minWidth: 160, minHeight: 54, borderWidth: 1, borderColor: effectiveTheme === 'light' ? colors.actionAccent : colors.accent, borderRadius: 16, backgroundColor: effectiveTheme === 'light' ? colors.actionAccent : colors.surface, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    addAimButton: { marginLeft: 45, marginTop: 9, alignSelf: 'flex-start' },
    compactAddAimButton: { minWidth: 54, width: 54, paddingHorizontal: 0 },
    addGroupButton: { marginTop: 20, alignSelf: 'flex-start' },
    boardActionText: { fontFamily: fonts.sans.medium, fontSize: 14, color: effectiveTheme === 'light' ? colors.actionOnAccent : colors.accent },
    archiveFooter: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 24, paddingVertical: 9, alignItems: 'center' },
    footerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    archiveTarget: { minWidth: 150, minHeight: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
    archiveTargetReady: { borderColor: colors.accent, backgroundColor: colors.accent },
    deleteSelectedButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    archiveTargetText: { fontFamily: fonts.sans.medium, fontSize: 13, color: colors.textMuted },
    archiveTargetTextReady: { color: colors.actionOnAccent },
    archiveContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 30, backgroundColor: colors.background },
    backButton: { width: 44, height: 44, justifyContent: 'center' },
    archiveTitle: { fontFamily: fonts.serif.regular, fontSize: 38, lineHeight: 47, color: colors.text, marginTop: 14 },
    archiveDateBlock: { marginTop: 32 },
    eyebrow: { fontFamily: fonts.sans.medium, fontSize: 11, letterSpacing: 2, color: colors.accent },
    archiveGroup: { marginTop: 20 },
    archiveAim: { marginTop: 10, paddingLeft: 14 },
    modalBackdrop: { flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: colors.backdrop },
    modalCard: { borderRadius: 29, padding: 24, paddingTop: 14, backgroundColor: colors.surface },
    modalHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.line, marginBottom: 22 },
    modalPrompt: { fontFamily: fonts.serif.regular, fontSize: 26, lineHeight: 34, color: colors.text, marginTop: 8 },
    modalInput: { minHeight: 54, marginTop: 17, borderRadius: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inputBackground, paddingHorizontal: 16, fontFamily: fonts.sans.medium, fontSize: 15, color: colors.text },
    errorText: { fontFamily: fonts.sans.regular, fontSize: 12, color: colors.accent, marginTop: 9 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 23 },
    cancelButton: { flex: 1, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.control },
    cancelText: { fontFamily: fonts.sans.medium, fontSize: 14, color: colors.text },
    saveButton: { flex: 1, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
    saveText: { fontFamily: fonts.sans.semibold, fontSize: 14, color: colors.accentForeground },
  });
}
