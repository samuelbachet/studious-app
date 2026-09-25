import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, BackHandler, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addAim, addGroup, archiveSelected, completeArchivedSelected, completeSelected, deleteArchivedSelected, deleteEmptyGroups, deleteSelected, MAX_AIMS_PER_GROUP, prioritizeOldGroups, renameAim, renameGroup, reorderAim, unarchiveSelected, uncompleteArchivedSelected, uncompleteSelected, updateAimNote, updateArchivedNote } from './aimBoard';
import type { AimBoardState, AimGroup, ArchivedAimItem } from './aimBoard';
import { boundedAimOffset, orderedAimLayouts, previewAimTops, previewIndex, proposedAimIndex } from './aimDrag';
import type { AimDragLayout } from './aimDrag';
import type { EffectiveTheme, ThemeColors } from './theme';
import { fonts } from './typography';

type Editor = { kind: 'addAim'; groupId: string } | { kind: 'addGroup' } | { kind: 'title'; id: string } | { kind: 'aim'; id: string };
type NoteEdit = { id: string; archived: boolean; original: string; latest: string };
type InlineEdit = { kind: 'title' | 'aim'; id: string; value: string };
type AimDrag = { groupId: string; aimId: string; startY: number; sourceY: number; layouts: AimDragLayout[]; listHeight: number; toIndex: number };
const ORGANIZE_ROW_HEIGHT = 60;
const ORGANIZE_SELECTION_HEIGHT = 92;
const ORGANIZE_DRAG_THRESHOLD = 34;

function PressFeedback({ children, onPress, label, style, disabled = false, selected = false }: { children: ReactNode; onPress: () => void; label: string; style?: StyleProp<ViewStyle>; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}>{children}</Pressable>;
}

function ToolbarCircleButton({ icon, label, onPress, color, foreground, disabled = false, selected = false, styles }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; color: string; foreground: string; disabled?: boolean; selected?: boolean; styles: ReturnType<typeof createStyles> }) {
  return <PressFeedback label={label} onPress={onPress} disabled={disabled} selected={selected} style={styles.toolbarIconButton}>
    <View style={[styles.toolbarIconCircle, { borderColor: color }, selected && { backgroundColor: color }]}>
      <Feather name={icon} size={18} color={selected ? foreground : color} accessible={false} />
    </View>
  </PressFeedback>;
}

function SelectionCircle({ selected, partial = false, disabled = false, label, onPress, colors }: { selected: boolean; partial?: boolean; disabled?: boolean; label: string; onPress: () => void; colors: ThemeColors }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: partial ? 'mixed' : selected, disabled }} disabled={disabled} onPress={onPress} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : 1 }}>
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: selected || partial ? colors.accent : colors.textMuted, backgroundColor: selected ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {selected ? <Feather name="check" size={14} color={colors.accentForeground} /> : partial ? <View style={{ width: 9, height: 2, borderRadius: 1, backgroundColor: colors.accent }} /> : null}
    </View>
  </Pressable>;
}

function SelectionToolbar({ enabled, canSelect = true, selectedCount, totalCount, aimCount, onToggle, onSelectAll, onCompleteAll, canCompleteAll, onArchiveAll, canArchiveAll = false, onUndo, onRedo, canUndo, canRedo, showArchiveAction = true, colors, styles }: { enabled: boolean; canSelect?: boolean; selectedCount: number; totalCount: number; aimCount: number; onToggle: () => void; onSelectAll: () => void; onCompleteAll: () => void; canCompleteAll: boolean; onArchiveAll?: () => void; canArchiveAll?: boolean; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; showArchiveAction?: boolean; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const selectionEnabled = enabled && canSelect;
  return <View style={styles.selectionToolbarWrap}>
    <View style={styles.selectionToolbar}>
    <View style={styles.toolbarActionRow}>
      <View style={styles.organizeControl}>
        <Text numberOfLines={1} style={styles.organizeLabel}>Organize</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={canSelect ? selectionEnabled ? 'Finish selecting aims' : 'Start selecting aims' : 'No groups to select'} accessibilityState={{ selected: selectionEnabled, disabled: !canSelect }} disabled={!canSelect} onPress={onToggle} style={({ pressed }) => [styles.toolbarIconButton, !canSelect && styles.selectionToggleDisabled, pressed && styles.selectionTogglePressed]}>
          <View style={[styles.toolbarIconCircle, { borderColor: selectionEnabled ? colors.accent : colors.textMuted }]}>
            <MaterialCommunityIcons name="format-list-checks" size={20} color={selectionEnabled ? colors.accent : colors.textMuted} accessible={false} />
          </View>
        </Pressable>
      </View>
      <ToolbarCircleButton icon="check" label={canCompleteAll || aimCount === 0 ? 'Mark all aims complete' : 'Mark all aims incomplete'} onPress={onCompleteAll} disabled={selectionEnabled || aimCount === 0} selected={aimCount > 0 && !canCompleteAll} color={colors.sage} foreground={colors.sageForeground} styles={styles} />
      {showArchiveAction && <ToolbarCircleButton icon="archive" label="Archive all aims" onPress={onArchiveAll ?? (() => undefined)} disabled={selectionEnabled || !canArchiveAll} color={canArchiveAll ? colors.archiveAccent : colors.textMuted} foreground={colors.archiveAccentForeground} styles={styles} />}
      <ToolbarCircleButton icon="rotate-ccw" label="Undo" onPress={onUndo} disabled={selectionEnabled || !canUndo} color={canUndo ? colors.text : colors.textMuted} foreground={colors.background} styles={styles} />
      <ToolbarCircleButton icon="rotate-cw" label="Redo" onPress={onRedo} disabled={selectionEnabled || !canRedo} color={canRedo ? colors.text : colors.textMuted} foreground={colors.background} styles={styles} />
    </View>
    </View>
    {selectionEnabled && <PressFeedback label={allSelected ? 'Deselect all aims' : 'Select all aims'} onPress={onSelectAll} disabled={totalCount === 0} style={styles.selectAllButton}>
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

function RevealableToolbar({ top, toolbar, selecting, gestureEnabled, toggleTop = 0, colors, styles, children }: { top: ReactNode; toolbar: ReactNode; selecting: boolean; gestureEnabled: boolean; toggleTop?: number; colors: ThemeColors; styles: ReturnType<typeof createStyles>; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [revealHeight] = useState(() => new Animated.Value(0));
  const gestureStartHeight = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const eligibleAtStart = useRef(false);
  const targetHeight = selecting ? ORGANIZE_SELECTION_HEIGHT : ORGANIZE_ROW_HEIGHT;

  const snapTo = useCallback((next: boolean) => {
    setExpanded(next);
    Animated.timing(revealHeight, { toValue: next ? targetHeight : 0, duration: 160, useNativeDriver: false }).start();
  }, [revealHeight, targetHeight]);

  useEffect(() => {
    if (expanded) Animated.timing(revealHeight, { toValue: targetHeight, duration: 160, useNativeDriver: false }).start();
  }, [expanded, revealHeight, targetHeight]);
  useEffect(() => () => revealHeight.stopAnimation(), [revealHeight]);

  return <View>
    {top}
    <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse Organize actions' : 'Reveal Organize actions'} accessibilityState={{ expanded }} onPress={() => snapTo(!expanded)} style={[styles.organizeHeaderToggle, { top: toggleTop }]}>
      <View style={[styles.organizeHeaderToggleCircle, { borderColor: expanded ? colors.accent : colors.iconBorder }]}>
        <Feather name="sliders" size={15} color={expanded ? colors.accent : colors.textMuted} accessible={false} />
      </View>
    </Pressable>
    <Animated.View accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'} pointerEvents={expanded ? 'auto' : 'none'} style={[styles.organizeRevealContent, { height: revealHeight }]}>{toolbar}</Animated.View>
    <View
      onStartShouldSetResponderCapture={(event) => { touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; eligibleAtStart.current = gestureEnabled; return false; }}
      onMoveShouldSetResponderCapture={(event) => {
        const start = touchStart.current;
        if (!eligibleAtStart.current || !gestureEnabled || !start || event.nativeEvent.touches.length !== 1) return false;
        const dx = event.nativeEvent.pageX - start.x;
        const dy = event.nativeEvent.pageY - start.y;
        return Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.25 && (expanded ? dy < 0 : dy > 0);
      }}
      onResponderGrant={() => revealHeight.stopAnimation((height) => { gestureStartHeight.current = height; })}
      onResponderMove={(event) => {
        const dy = event.nativeEvent.pageY - (touchStart.current?.y ?? event.nativeEvent.pageY);
        revealHeight.setValue(Math.max(0, Math.min(targetHeight, gestureStartHeight.current + dy)));
      }}
      onResponderRelease={(event) => {
        const dy = event.nativeEvent.pageY - (touchStart.current?.y ?? event.nativeEvent.pageY);
        touchStart.current = null;
        eligibleAtStart.current = false;
        snapTo(expanded ? dy >= -ORGANIZE_DRAG_THRESHOLD : dy >= ORGANIZE_DRAG_THRESHOLD);
      }}
      onResponderTerminate={() => { touchStart.current = null; eligibleAtStart.current = false; snapTo(expanded); }}
      onResponderTerminationRequest={() => false}
    >
      {children}
    </View>
  </View>;
}

function GroupCompletedButton({ title, completed, onPress, colors, styles }: { title: string; completed: boolean; onPress: () => void; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${title} ${completed ? 'incomplete' : 'complete'}`} onPress={onPress} style={({ pressed }) => [styles.groupCompletedButton, pressed && styles.groupCompletedPressed]}>
    <View style={[styles.groupCompletedCircle, completed ? styles.groupCompletedCircleDone : styles.groupCompletedCirclePending]}><Feather name="check" size={14} color={completed ? colors.sageForeground : colors.text} accessible={false} /></View>
  </Pressable>;
}

function formatOldAimDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function archiveSections(archive: AimBoardState['archive']): { dateKey: string; titles: { id: string; title: string; order: number; aims: ArchivedAimItem[]; emptyArchiveId?: string }[] }[] {
  const dates = new Map<string, Map<string, { id: string; title: string; order: number; aims: ArchivedAimItem[]; emptyArchiveId?: string }>>();
  for (const group of archive) {
    const titles = dates.get(group.originalDateKey) ?? new Map<string, { id: string; title: string; order: number; aims: ArchivedAimItem[]; emptyArchiveId?: string }>();
    const key = group.aims.length ? `${group.originalGroupId}:${group.title}` : `empty:${group.id}`;
    const existing = titles.get(key);
    titles.set(key, { id: group.aims.length ? group.originalGroupId : group.id, title: group.title, order: group.originalGroupOrder, aims: [...(existing?.aims ?? []), ...group.aims], emptyArchiveId: group.aims.length ? undefined : group.id });
    dates.set(group.originalDateKey, titles);
  }
  return [...dates.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([dateKey, titles]) => ({
    dateKey,
    titles: [...titles.values()].map((group) => ({ ...group, aims: group.aims.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)) })).sort((a, b) => a.order - b.order),
  }));
}

export function AimBoardScreen({ header, state, onChange, onUndo, onRedo, canUndo, canRedo, colors, effectiveTheme, scrollContentStyle }: { header: ReactNode; state: AimBoardState; onChange: (update: (current: AimBoardState) => AimBoardState) => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; colors: ThemeColors; effectiveTheme: EffectiveTheme; scrollContentStyle: StyleProp<ViewStyle> }) {
  const styles = useMemo(() => createStyles(colors, effectiveTheme), [colors, effectiveTheme]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectedEmptyGroupIds, setSelectedEmptyGroupIds] = useState<Set<string>>(() => new Set());
  const [selectedArchived, setSelectedArchived] = useState<Set<string>>(() => new Set());
  const [selectedArchivedEmptyGroupIds, setSelectedArchivedEmptyGroupIds] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [archiveSelectionMode, setArchiveSelectionMode] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [homeAtTop, setHomeAtTop] = useState(true);
  const [archiveAtTop, setArchiveAtTop] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [value, setValue] = useState('');
  const [newAimNote, setNewAimNote] = useState('');
  const [error, setError] = useState('');
  const newAimNoteInput = useRef<TextInput>(null);
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
  const inlineEditRef = useRef<InlineEdit | null>(null);
  const groups = useMemo(() => prioritizeOldGroups(state.active.groups), [state.active.groups]);
  const hasArchivedItems = state.archive.length > 0;
  const activeIds = useMemo(() => new Set(groups.flatMap((group) => group.aims.map((aim) => aim.id))), [groups]);
  const emptyGroupIds = useMemo(() => new Set(groups.filter((group) => group.aims.length === 0).map((group) => group.id)), [groups]);
  const sections = useMemo(() => archiveSections(state.archive), [state.archive]);
  const selectedActive = useMemo(() => new Set([...selected].filter((id) => activeIds.has(id))), [selected, activeIds]);
  const selectedEmptyGroups = useMemo(() => new Set([...selectedEmptyGroupIds].filter((id) => emptyGroupIds.has(id))), [emptyGroupIds, selectedEmptyGroupIds]);
  const hasActiveSelection = selectedActive.size > 0 || selectedEmptyGroups.size > 0;
  const archivedIds = useMemo(() => new Set(state.archive.flatMap((group) => group.aims.map((aim) => aim.id))), [state.archive]);
  const archivedEmptyGroupIds = useMemo(() => new Set(state.archive.filter((group) => group.aims.length === 0).map((group) => group.id)), [state.archive]);
  const selectedArchiveActive = useMemo(() => new Set([...selectedArchived].filter((id) => archivedIds.has(id))), [selectedArchived, archivedIds]);
  const selectedArchiveEmptyGroups = useMemo(() => new Set([...selectedArchivedEmptyGroupIds].filter((id) => archivedEmptyGroupIds.has(id))), [selectedArchivedEmptyGroupIds, archivedEmptyGroupIds]);
  const hasArchiveSelection = selectedArchiveActive.size > 0 || selectedArchiveEmptyGroups.size > 0;
  const selectedActiveAllCompleted = selectedActive.size > 0 && groups.flatMap((group) => group.aims).filter((aim) => selectedActive.has(aim.id)).every((aim) => aim.completed);
  const selectedArchiveAllCompleted = selectedArchiveActive.size > 0 && state.archive.flatMap((group) => group.aims).filter((aim) => selectedArchiveActive.has(aim.id)).every((aim) => aim.completed);
  const activeAllCompleted = activeIds.size > 0 && groups.flatMap((group) => group.aims).every((aim) => aim.completed);
  const archivedAllCompleted = archivedIds.size > 0 && state.archive.flatMap((group) => group.aims).every((aim) => aim.completed);
  const closeArchive = useCallback(() => { Keyboard.dismiss(); setSelectedArchived(new Set()); setSelectedArchivedEmptyGroupIds(new Set()); setArchiveSelectionMode(false); setArchiveAtTop(true); setHomeAtTop(true); setArchiveOpen(false); }, []);
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
    setNewAimNote('');
    setError('');
    setEditor({ kind: 'addAim', groupId: group.id });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const openAddGroup = () => { Keyboard.dismiss(); cancelDrag(); setValue(''); setNewAimNote(''); setError(''); setEditor({ kind: 'addGroup' }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const openTitleEditor = (group: AimGroup) => { cancelDrag(); inlineEditRef.current = { kind: 'title', id: group.id, value: group.title }; setValue(group.title); setError(''); setEditor({ kind: 'title', id: group.id }); };
  const openAimEditor = (id: string, text: string) => { cancelDrag(); inlineEditRef.current = { kind: 'aim', id, value: text }; setValue(text); setError(''); setEditor({ kind: 'aim', id }); };
  const closeEditor = () => { Keyboard.dismiss(); setEditor(null); };
  const finishInlineEdit = (kind: InlineEdit['kind'], id: string) => {
    const draft = inlineEditRef.current;
    if (!draft || draft.kind !== kind || draft.id !== id) return;
    inlineEditRef.current = null;
    const clean = draft.value.trim();
    if (clean) onChange((current) => draft.kind === 'title' ? renameGroup(current, draft.id, clean) : renameAim(current, draft.id, clean));
    setEditor((current) => current?.kind === draft.kind && current.id === draft.id ? null : current);
    setError('');
  };
  const saveEditor = () => {
    if (!editor) return;
    const clean = value.trim();
    if (!clean) { setError(editor.kind === 'addAim' || editor.kind === 'aim' ? 'Write an aim to continue.' : 'Enter a title to continue.'); return; }
    if (editor.kind === 'addAim') {
      const group = groups.find((item) => item.id === editor.groupId);
      if (!group || group.aims.length >= MAX_AIMS_PER_GROUP) { setError('This set already has 5 aims.'); return; }
      onChange((current) => addAim(current, clean, editor.groupId, undefined, newAimNote));
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
    if (!group.aims.length) {
      setSelectedEmptyGroupIds((current) => {
        const next = new Set([...current].filter((id) => groups.some((item) => item.id === id && item.aims.length === 0)));
        if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
        return next;
      });
      return;
    }
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
  const toggleArchivedEmptyGroup = (id: string) => {
    setSelectedArchivedEmptyGroupIds((current) => {
      const next = new Set([...current].filter((item) => archivedEmptyGroupIds.has(item)));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelected(new Set());
    setSelectedEmptyGroupIds(new Set());
  };
  const selectAllAims = () => {
    const allSelected = selectedActive.size + selectedEmptyGroups.size === activeIds.size + emptyGroupIds.size;
    setSelected(allSelected ? new Set() : new Set(activeIds));
    setSelectedEmptyGroupIds(allSelected ? new Set() : new Set(emptyGroupIds));
  };
  const toggleArchiveSelectionMode = () => {
    setArchiveSelectionMode((current) => !current);
    setSelectedArchived(new Set());
    setSelectedArchivedEmptyGroupIds(new Set());
  };
  const selectAllArchivedAims = () => {
    const allSelected = selectedArchiveActive.size + selectedArchiveEmptyGroups.size === archivedIds.size + archivedEmptyGroupIds.size;
    setSelectedArchived(allSelected ? new Set() : new Set(archivedIds));
    setSelectedArchivedEmptyGroupIds(allSelected ? new Set() : new Set(archivedEmptyGroupIds));
  };
  const archiveCurrentSelection = () => {
    if (!hasActiveSelection) return;
    const ids = new Set(selectedActive);
    const groupIds = new Set(selectedEmptyGroups);
    Keyboard.dismiss();
    onChange((current) => archiveSelected(current, ids, undefined, groupIds));
    setSelected(new Set());
    setSelectedEmptyGroupIds(new Set());
    setSelectionMode(false);
    cancelDrag();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const completeCurrentSelection = () => {
    if (!selectedActive.size) return;
    const ids = new Set(selectedActive);
    Keyboard.dismiss();
    const allCompleted = groups.flatMap((group) => group.aims).filter((aim) => ids.has(aim.id)).every((aim) => aim.completed);
    onChange((current) => allCompleted ? uncompleteSelected(current, ids) : completeSelected(current, ids));
    setSelected(new Set());
    setSelectedEmptyGroupIds(new Set());
    setSelectionMode(false);
    cancelDrag();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const completeAllActive = () => {
    if (!activeIds.size) return;
    const ids = new Set(activeIds);
    onChange((current) => activeAllCompleted ? uncompleteSelected(current, ids) : completeSelected(current, ids));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const archiveAllActive = () => {
    if (!activeIds.size && !emptyGroupIds.size) return;
    const ids = new Set(activeIds);
    const groupIds = new Set(emptyGroupIds);
    Keyboard.dismiss();
    onChange((current) => archiveSelected(current, ids, undefined, groupIds));
    setSelected(new Set());
    setSelectedEmptyGroupIds(new Set());
    setSelectionMode(false);
    cancelDrag();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const deleteCurrentSelection = () => {
    if (!hasActiveSelection) return;
    const ids = new Set(selectedActive);
    const groupIds = new Set(selectedEmptyGroups);
    Keyboard.dismiss();
    onChange((current) => deleteEmptyGroups(deleteSelected(current, ids), groupIds));
    setSelected(new Set());
    setSelectedEmptyGroupIds(new Set());
    setSelectionMode(false);
    cancelDrag();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const unarchiveCurrentSelection = () => {
    if (!hasArchiveSelection) return;
    const ids = new Set(selectedArchiveActive);
    const groupIds = new Set(selectedArchiveEmptyGroups);
    Keyboard.dismiss();
    onChange((current) => unarchiveSelected(current, ids, undefined, groupIds));
    setSelectedArchived(new Set());
    setSelectedArchivedEmptyGroupIds(new Set());
    setArchiveSelectionMode(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const completeArchivedSelection = () => {
    if (!selectedArchiveActive.size) return;
    const ids = new Set(selectedArchiveActive);
    Keyboard.dismiss();
    const allCompleted = state.archive.flatMap((group) => group.aims).filter((aim) => ids.has(aim.id)).every((aim) => aim.completed);
    onChange((current) => allCompleted ? uncompleteArchivedSelected(current, ids) : completeArchivedSelected(current, ids));
    setSelectedArchived(new Set());
    setSelectedArchivedEmptyGroupIds(new Set());
    setArchiveSelectionMode(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const completeAllArchived = () => {
    if (!archivedIds.size) return;
    const ids = new Set(archivedIds);
    onChange((current) => archivedAllCompleted ? uncompleteArchivedSelected(current, ids) : completeArchivedSelected(current, ids));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const deleteArchivedSelection = () => {
    if (!hasArchiveSelection) return;
    const ids = new Set(selectedArchiveActive);
    const groupIds = new Set(selectedArchiveEmptyGroups);
    Keyboard.dismiss();
    onChange((current) => deleteArchivedSelected(current, ids, groupIds));
    setSelectedArchived(new Set());
    setSelectedArchivedEmptyGroupIds(new Set());
    setArchiveSelectionMode(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const updateNote = (id: string, archived: boolean, next: string) => {
    onChange((current) => archived ? updateArchivedNote(current, id, next) : updateAimNote(current, id, next));
  };
  const finishNoteEdit = (id: string) => {
    const edit = noteEditRef.current;
    if (!edit || edit.id !== id) return;
    noteEditRef.current = null;
    setFocusedNoteId(null);
    const finalNote = edit.latest.trim();
    if (finalNote !== edit.latest) updateNote(id, edit.archived, finalNote);
  };
  const noteInput = (id: string, text: string, note: string, archived: boolean) => {
    const selecting = archived ? archiveSelectionMode : selectionMode;
    if (!note && focusedNoteId !== id) return <Pressable accessibilityRole="button" accessibilityLabel={`Add note for ${text}`} onPress={() => setFocusedNoteId(id)} style={[styles.addNoteButton, selecting ? styles.noteWithSelection : styles.noteWithoutSelection]}>
      <Feather name="plus" size={13} color={colors.textMuted} accessible={false} />
      <Text style={styles.addNoteText}>Add note</Text>
    </Pressable>;
    return <View style={selecting ? styles.noteWithSelection : styles.noteWithoutSelection}><TextInput
      value={note}
      onFocus={() => { noteEditRef.current = { id, archived, original: note, latest: note }; setFocusedNoteId(id); }}
      onChangeText={(next) => {
        if (noteEditRef.current?.id === id) noteEditRef.current.latest = next;
        updateNote(id, archived, next);
      }}
      onBlur={() => finishNoteEdit(id)}
      placeholderTextColor={colors.textMuted}
      keyboardAppearance={effectiveTheme}
      autoFocus={focusedNoteId === id}
      returnKeyType="done"
      enterKeyHint={Platform.OS === 'android' ? 'done' : undefined}
      submitBehavior={Platform.OS === 'android' ? 'blurAndSubmit' : 'newline'}
      onSubmitEditing={Platform.OS === 'android' ? () => Keyboard.dismiss() : undefined}
      multiline
      maxLength={240}
      numberOfLines={3}
      textAlignVertical="top"
      accessibilityLabel={`Write note for ${text}`}
      style={styles.noteInput}
    />
      {focusedNoteId === id && <Text style={styles.characterFooter}>{note.length} / 240</Text>}
    </View>;
  };

  return <View style={styles.root}>
    {archiveOpen ? <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.archiveContent} keyboardShouldPersistTaps={focusedNoteId ? 'never' : 'handled'} keyboardDismissMode="on-drag" onScroll={(event) => { const atTop = event.nativeEvent.contentOffset.y <= 2; setArchiveAtTop((current) => current === atTop ? current : atTop); }} scrollEventThrottle={32} showsVerticalScrollIndicator={false}>
        <RevealableToolbar top={<>
          <PressFeedback label="Back to aims" onPress={closeArchive} style={styles.backButton}><Feather name="arrow-left" size={21} color={colors.text} /></PressFeedback>
          <Text style={styles.archiveTitle}>Archive</Text>
        </>} selecting={archiveSelectionMode} gestureEnabled={archiveAtTop && !focusedNoteId && !editor} colors={colors} styles={styles} toolbar={
          <SelectionToolbar enabled={archiveSelectionMode} canSelect={archivedIds.size + archivedEmptyGroupIds.size > 0} selectedCount={selectedArchiveActive.size + selectedArchiveEmptyGroups.size} totalCount={archivedIds.size + archivedEmptyGroupIds.size} aimCount={archivedIds.size} onToggle={toggleArchiveSelectionMode} onSelectAll={selectAllArchivedAims} onCompleteAll={completeAllArchived} canCompleteAll={archivedIds.size > 0 && !archivedAllCompleted} onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} showArchiveAction={false} colors={colors} styles={styles} />
        }>
        {sections.map((section) => <View key={section.dateKey} style={styles.archiveDateBlock}>
          <Text style={styles.eyebrow}>{formatArchiveDate(section.dateKey).toUpperCase()}</Text>
          {section.titles.map((group) => {
            const count = group.aims.filter((aim) => selectedArchiveActive.has(aim.id)).length;
            const all = group.emptyArchiveId ? selectedArchiveEmptyGroups.has(group.emptyArchiveId) : count === group.aims.length;
            const groupCompleted = group.aims.length > 0 && group.aims.every((aim) => aim.completed);
            return <View key={`${group.id}:${group.title}`} style={styles.archiveGroup}>
              <View style={[styles.groupRow, !archiveSelectionMode && styles.rowWithoutSelection]}>
                {archiveSelectionMode && <SelectionCircle selected={all} partial={count > 0 && !all} label={group.emptyArchiveId ? `Select empty archived group: ${group.title}` : `Select all archived aims in ${group.title}`} onPress={() => group.emptyArchiveId ? toggleArchivedEmptyGroup(group.emptyArchiveId) : toggleArchivedGroup(group.aims)} colors={colors} />}
                <View style={styles.rowTextWrap}><Text style={styles.groupTitle}>{group.title}</Text></View>
                {group.aims.length > 0 && <GroupCompletedButton title={group.title} completed={groupCompleted} onPress={() => onChange((current) => groupCompleted ? uncompleteArchivedSelected(current, new Set(group.aims.map((aim) => aim.id))) : completeArchivedSelected(current, new Set(group.aims.map((aim) => aim.id))))} colors={colors} styles={styles} />}
              </View>
              {group.aims.map((aim, index) => <View key={aim.id} style={styles.archiveAim}>
                <View style={[styles.aimRow, aim.completed && styles.completedAimBlock, !archiveSelectionMode && styles.rowWithoutSelection]}>
                  {archiveSelectionMode && <SelectionCircle selected={selectedArchiveActive.has(aim.id)} label={`Select archived aim: ${aim.text}`} onPress={() => toggleArchivedAim(aim.id)} colors={colors} />}
                  <Text style={styles.aimNumber}>{index + 1}.</Text>
                  <View style={styles.rowTextWrap}><Text style={[styles.aimText, aim.completed && styles.completedAimText]}>{aim.text}</Text></View>
                </View>
                {noteInput(aim.id, aim.text, aim.note, true)}
              </View>)}
            </View>;
          })}
        </View>)}
        </RevealableToolbar>
      </ScrollView>
      {archiveSelectionMode && state.archive.length > 0 && <View style={styles.archiveFooter}>
        <View style={[styles.footerActions, hasArchiveSelection && styles.footerActionsSelected]}>
          {hasArchiveSelection && <PressFeedback label={`Delete ${selectedArchiveActive.size + selectedArchiveEmptyGroups.size} selected archived items`} onPress={deleteArchivedSelection} style={styles.deleteSelectedButton}>
            <Feather name="trash-2" size={18} color={colors.dangerForeground} />
          </PressFeedback>}
          <PressFeedback label={hasArchiveSelection ? `Unarchive ${selectedArchiveActive.size + selectedArchiveEmptyGroups.size} selected items` : 'Select archived items to unarchive'} onPress={unarchiveCurrentSelection} disabled={!hasArchiveSelection} style={[styles.archiveTarget, hasArchiveSelection && styles.archiveTargetReady]}>
            <Feather name="corner-up-left" size={20} color={hasArchiveSelection ? colors.archiveAccentForeground : colors.textMuted} />
            <Text style={[styles.archiveTargetText, hasArchiveSelection && styles.archiveTargetTextReady]}>Unarchive{hasArchiveSelection ? `  ·  ${selectedArchiveActive.size + selectedArchiveEmptyGroups.size}` : ''}</Text>
          </PressFeedback>
          {selectedArchiveEmptyGroups.size > 0 && selectedArchiveActive.size === 0 && <View style={styles.completeActionPlaceholder} />}
          {selectedArchiveActive.size > 0 && <PressFeedback label={`Mark ${selectedArchiveActive.size} selected archived aims ${selectedArchiveAllCompleted ? 'incomplete' : 'complete'}`} onPress={completeArchivedSelection} style={styles.completeSelectedButton}>
            <Feather name="check" size={20} color={colors.sageForeground} />
          </PressFeedback>}
        </View>
      </View>}
    </> : <>
      <ScrollView style={styles.scroll} contentContainerStyle={[scrollContentStyle, styles.homeContent]} keyboardShouldPersistTaps={focusedNoteId ? 'never' : 'handled'} keyboardDismissMode="on-drag" scrollEnabled={!dragging && !aimPressHeld} onScroll={(event) => { const atTop = event.nativeEvent.contentOffset.y <= 2; setHomeAtTop((current) => current === atTop ? current : atTop); }} scrollEventThrottle={32} showsVerticalScrollIndicator={false}>
        <RevealableToolbar top={header} selecting={selectionMode} gestureEnabled={homeAtTop && !dragging && !focusedNoteId && !editor} toggleTop={46} colors={colors} styles={styles} toolbar={
          <SelectionToolbar enabled={selectionMode} canSelect={groups.length > 0} selectedCount={selectedActive.size + selectedEmptyGroups.size} totalCount={activeIds.size + emptyGroupIds.size} aimCount={activeIds.size} onToggle={toggleSelectionMode} onSelectAll={selectAllAims} onCompleteAll={completeAllActive} canCompleteAll={activeIds.size > 0 && !activeAllCompleted} onArchiveAll={archiveAllActive} canArchiveAll={activeIds.size + emptyGroupIds.size > 0} onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} colors={colors} styles={styles} />
        }>
        <View style={styles.boardArea}>
          <Text style={styles.listLabel}>List</Text>
          {groups.map((group, groupIndex) => {
            const count = group.aims.filter((aim) => selectedActive.has(aim.id)).length;
            const all = group.aims.length > 0 && count === group.aims.length;
            const groupSelected = group.aims.length === 0 ? selectedEmptyGroups.has(group.id) : all;
            const groupCompleted = group.aims.length > 0 && group.aims.every((aim) => aim.completed);
            const collapsed = collapsedGroups.has(group.id);
            const groupDrag = dragging?.groupId === group.id ? dragging : null;
            const sourceIndex = groupDrag ? group.aims.findIndex((aim) => aim.id === groupDrag.aimId) : -1;
            const previewTops = groupDrag ? previewAimTops(groupDrag.layouts, groupDrag.aimId, groupDrag.toIndex) : null;
            return <View key={group.id} collapsable={false} style={[styles.group, groupIndex === 0 && styles.firstGroup]}>
              <View style={[styles.groupRow, !selectionMode && styles.rowWithoutSelection]}>
                {selectionMode && <SelectionCircle selected={groupSelected} partial={count > 0 && !all} label={group.aims.length === 0 ? `Select empty group: ${group.title}` : `Select all aims in ${group.title}`} onPress={() => toggleGroup(group)} colors={colors} />}
                <View style={[styles.rowTextWrap, groupSelected && styles.selectedGroupTitle]}>
                  {editor?.kind === 'title' && editor.id === group.id
                    ? <View style={styles.inlineEditWrap}>
                      <TextInput key={`group-title-${group.id}`} value={value} onChangeText={(next) => { setValue(next); if (inlineEditRef.current?.kind === 'title' && inlineEditRef.current.id === group.id) inlineEditRef.current.value = next; }} onBlur={() => finishInlineEdit('title', group.id)} onSubmitEditing={() => finishInlineEdit('title', group.id)} autoFocus maxLength={40} returnKeyType="done" enterKeyHint="done" submitBehavior="blurAndSubmit" underlineColorAndroid="transparent" style={[styles.groupTitle, styles.groupTitleInput]} accessibilityLabel="Edit group title" />
                      <Text style={styles.characterFooter}>{value.length} / 40</Text>
                    </View>
                    : <Pressable accessibilityRole="button" accessibilityLabel={`Rename group: ${group.title}`} onPress={() => openTitleEditor(group)} style={({ pressed }) => [styles.groupTitleEditTarget, pressed && styles.renameTargetPressed]}>
                      <Text selectable={false} style={styles.groupTitle}>{group.title}</Text>
                    </Pressable>}
                  {group.restoredFromDateKey && <View style={styles.oldGroupMeta}>
                    <Text style={styles.oldGroupDate}>{formatOldAimDate(group.restoredFromDateKey)}</Text>
                    <View style={styles.oldGroupTag}><Text style={styles.oldGroupTagText}>Old</Text></View>
                  </View>}
                </View>
                {group.aims.length > 0 && <GroupCompletedButton title={group.title} completed={groupCompleted} onPress={() => onChange((current) => groupCompleted ? uncompleteSelected(current, new Set(group.aims.map((aim) => aim.id))) : completeSelected(current, new Set(group.aims.map((aim) => aim.id))))} colors={colors} styles={styles} />}
                <Pressable accessibilityRole="button" accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${group.title}`} accessibilityState={{ expanded: !collapsed }} onPress={() => toggleGroupCollapsed(group.id)} style={({ pressed }) => [styles.collapseButton, pressed && styles.collapseButtonPressed]}>
                  <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={20} color={colors.textMuted} accessible={false} />
                </Pressable>
              </View>
              {!collapsed && <View collapsable={false} style={groupDrag && { height: groupDrag.listHeight }}>
              {group.aims.map((aim, index) => <AimBlock key={aim.id} id={aim.id} registerSlot={registerAimSlot} onLayout={({ nativeEvent }) => { aimHeights.current.set(aim.id, nativeEvent.layout.height); }} style={[styles.aimBlock, selectedActive.has(aim.id) && !aim.completed && styles.selectedAimBlock]} draggedStyle={styles.draggedAim} draggedBorderStyle={styles.draggedAimBorder} dragging={groupDrag?.aimId === aim.id} previewActive={Boolean(groupDrag)} previewTop={previewTops?.get(aim.id) ?? 0} dragTop={dragTop}>
                <View style={[styles.aimRow, aim.completed && styles.completedAimBlock, selectedActive.has(aim.id) && aim.completed && styles.selectedCompletedAimBlock, !selectionMode && styles.rowWithoutSelection]}>
                  {selectionMode && <SelectionCircle selected={selectedActive.has(aim.id)} label={`Select aim: ${aim.text}`} onPress={() => toggleAim(aim.id)} colors={colors} />}
                  <Text style={styles.aimNumber}>{(groupDrag ? previewIndex(index, sourceIndex, groupDrag.toIndex) : index) + 1}.</Text>
                  {editor?.kind === 'aim' && editor.id === aim.id
                    ? <View style={styles.inlineEditWrap}>
                      <TextInput key={`aim-text-${aim.id}`} value={value} onChangeText={(next) => { setValue(next); if (inlineEditRef.current?.kind === 'aim' && inlineEditRef.current.id === aim.id) inlineEditRef.current.value = next; }} onBlur={() => finishInlineEdit('aim', aim.id)} onSubmitEditing={() => finishInlineEdit('aim', aim.id)} autoFocus maxLength={100} returnKeyType="done" enterKeyHint="done" submitBehavior="blurAndSubmit" underlineColorAndroid="transparent" style={[styles.aimText, styles.inlineAimInput, aim.completed && styles.completedAimText]} accessibilityLabel="Edit aim name" />
                      <Text style={styles.characterFooter}>{value.length} / 100</Text>
                    </View>
                    : <RenameLabel accessibilityLabel={`Rename aim: ${aim.text}`} accessibilityHint={group.aims.length > 1 ? 'Long press and drag vertically to reorder' : undefined} onPress={() => openAimEditor(aim.id, aim.text)} onPressIn={group.aims.length > 1 ? () => setAimPressHeld(true) : undefined} onLongPress={group.aims.length > 1 ? (event) => beginAimDrag(group, aim.id, event) : undefined} onPressMove={(event) => moveAimDrag(group, aim.id, event)} onPressOut={() => { setAimPressHeld(false); finishAimDrag(group, aim.id); }} style={styles.rowTextWrap} pressStyle={styles.aimRenameTarget} pressedStyle={styles.renameTargetPressed}><Text selectable={false} style={[styles.aimText, aim.completed && styles.completedAimText]}>{aim.text}</Text></RenameLabel>}
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
        </RevealableToolbar>
      </ScrollView>
      {(groups.length > 0 || state.archive.length > 0) && <View style={styles.archiveFooter}>
        <View style={[styles.footerActions, hasActiveSelection && styles.footerActionsSelected]}>
        {hasActiveSelection && <PressFeedback label={`Delete ${selectedActive.size + selectedEmptyGroups.size} selected items`} onPress={deleteCurrentSelection} style={styles.deleteSelectedButton}>
          <Feather name="trash-2" size={18} color={colors.dangerForeground} />
        </PressFeedback>}
        <PressFeedback label={hasActiveSelection ? `Archive ${selectedActive.size + selectedEmptyGroups.size} selected items` : 'Open Archive'} onPress={() => {
            Keyboard.dismiss();
            if (hasActiveSelection) archiveCurrentSelection();
            else { setSelected(new Set()); setSelectedEmptyGroupIds(new Set()); setSelectionMode(false); cancelDrag(); setArchiveAtTop(true); setArchiveOpen(true); }
          }} style={[styles.archiveTarget, (hasActiveSelection || hasArchivedItems) && styles.archiveTargetReady]}>
          <Feather name="folder" size={22} color={hasActiveSelection || hasArchivedItems ? colors.archiveAccentForeground : colors.textMuted} />
          <Text style={[styles.archiveTargetText, (hasActiveSelection || hasArchivedItems) && styles.archiveTargetTextReady]}>Archive{hasActiveSelection ? `  ·  ${selectedActive.size + selectedEmptyGroups.size}` : ''}</Text>
        </PressFeedback>
        {selectedEmptyGroups.size > 0 && selectedActive.size === 0 && <View style={styles.completeActionPlaceholder} />}
        {selectedActive.size > 0 && <PressFeedback label={`Mark ${selectedActive.size} selected aims ${selectedActiveAllCompleted ? 'incomplete' : 'complete'}`} onPress={completeCurrentSelection} style={styles.completeSelectedButton}>
          <Feather name="check" size={20} color={colors.sageForeground} />
        </PressFeedback>}
        </View>
      </View>}
    </>}
    <Modal visible={editor?.kind === 'addAim' || editor?.kind === 'addGroup'} transparent animationType="fade" onRequestClose={closeEditor}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.modalBackdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel editing" onPress={closeEditor} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.eyebrow}>{editor?.kind === 'addAim' ? 'ADD AIM' : editor?.kind === 'addGroup' ? 'NEW GROUP' : editor?.kind === 'title' ? 'TITLE' : 'EDIT AIM'}</Text>
            <Text style={styles.modalPrompt}>{editor?.kind === 'title' ? 'Rename this set' : editor?.kind === 'addGroup' ? 'Group name' : editor?.kind === 'addAim' ? 'Aim' : 'Rename this aim'}</Text>
            <TextInput value={value} onChangeText={(next) => { setValue(next); setError(''); }} placeholder={editor?.kind === 'addAim' ? 'Write your aim...' : editor?.kind === 'addGroup' ? 'Name this group...' : undefined} placeholderTextColor={colors.textMuted} keyboardAppearance={effectiveTheme} maxLength={editor?.kind === 'title' || editor?.kind === 'addGroup' ? 40 : 100} returnKeyType={editor?.kind === 'addAim' ? 'next' : 'done'} enterKeyHint={editor?.kind === 'addAim' ? 'next' : 'done'} submitBehavior="blurAndSubmit" onSubmitEditing={() => { if (editor?.kind === 'addAim') newAimNoteInput.current?.focus(); else saveEditor(); }} style={styles.modalInput} accessibilityLabel={editor?.kind === 'title' || editor?.kind === 'addGroup' ? 'Group name' : 'Aim'} />
            <Text style={styles.characterFooter}>{value.length} / {editor?.kind === 'title' || editor?.kind === 'addGroup' ? 40 : 100}</Text>
            {editor?.kind === 'addAim' && <>
              <Text style={styles.noteSectionLabel}>NOTE</Text>
              <TextInput ref={newAimNoteInput} value={newAimNote} onChangeText={setNewAimNote} placeholder="Write a note..." placeholderTextColor={colors.textMuted} keyboardAppearance={effectiveTheme} multiline returnKeyType="done" enterKeyHint={Platform.OS === 'android' ? 'done' : undefined} submitBehavior={Platform.OS === 'android' ? 'blurAndSubmit' : 'newline'} onSubmitEditing={Platform.OS === 'android' ? saveEditor : undefined} maxLength={240} numberOfLines={3} textAlignVertical="top" style={styles.modalNoteInput} accessibilityLabel="Note for new aim" />
              <Text style={styles.characterFooter}>{newAimNote.length} / 240</Text>
            </>}
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
    boardArea: { paddingTop: 10, paddingBottom: 30 },
    listLabel: { fontFamily: fonts.sans.medium, fontSize: 11, lineHeight: 16, letterSpacing: 1.3, color: colors.textMuted },
    organizeHeaderToggle: { position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    organizeHeaderToggleCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    organizeRevealContent: { overflow: 'hidden' },
    selectionToolbarWrap: { minHeight: 60 },
    selectionToolbar: { height: 60, paddingTop: 16, flexDirection: 'row', alignItems: 'center' },
    toolbarActionRow: { width: '100%', maxWidth: 320, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    organizeControl: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    organizeLabel: { position: 'absolute', top: -13, left: 4, width: 60, textAlign: 'left', fontFamily: fonts.sans.medium, fontSize: 10, lineHeight: 12, letterSpacing: 0.8, color: colors.textMuted },
    selectionTogglePressed: { opacity: 0.75, transform: [{ scale: 0.94 }] },
    selectionToggleDisabled: { opacity: 0.4 },
    toolbarIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    toolbarIconCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    selectAllButton: { minHeight: 32, paddingHorizontal: 8, justifyContent: 'center', alignSelf: 'flex-end' },
    selectAllText: { fontFamily: fonts.sans.medium, fontSize: 13, color: colors.accent },
    group: { marginTop: 26, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
    firstGroup: { marginTop: 14 },
    groupRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -8 },
    rowWithoutSelection: { marginLeft: 0 },
    rowTextWrap: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    collapseButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    collapseButtonPressed: { backgroundColor: colors.surfaceMuted, opacity: 0.85 },
    groupCompletedButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    groupCompletedPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
    groupCompletedCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    groupCompletedCirclePending: { borderWidth: 1.5, borderColor: colors.text, backgroundColor: 'transparent' },
    groupCompletedCircleDone: { borderWidth: 1.5, borderColor: colors.sage, backgroundColor: colors.sage },
    renameTarget: { minHeight: 44, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 4 },
    aimRenameTarget: { minHeight: 44, maxWidth: '100%', alignSelf: 'flex-start', borderRadius: 12, justifyContent: 'center' },
    groupTitleEditTarget: { minHeight: 44, maxWidth: '100%', alignSelf: 'flex-start', borderRadius: 12, justifyContent: 'center' },
    groupTitleInput: { minHeight: 44, maxWidth: '100%', padding: 0, includeFontPadding: false },
    inlineEditWrap: { flex: 1 },
    characterFooter: { alignSelf: 'flex-end', marginTop: 3, marginRight: 4, fontFamily: fonts.sans.medium, fontSize: 10, color: colors.textMuted },
    renameTargetPressed: { backgroundColor: colors.surfaceMuted, opacity: 0.85 },
    groupTitle: { fontFamily: fonts.serif.regular, fontSize: 23, lineHeight: 31, color: colors.text },
    selectedGroupTitle: { backgroundColor: colors.selectionSurface, borderRadius: 12 },
    aimBlock: { paddingTop: 10, paddingLeft: 14 },
    oldGroupMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -2, marginBottom: 4 },
    oldGroupDate: { fontFamily: fonts.sans.medium, fontSize: 10, letterSpacing: 0.5, color: colors.textMuted },
    oldGroupTag: { borderRadius: 7, backgroundColor: colors.surfaceMuted, paddingHorizontal: 6, paddingVertical: 2 },
    oldGroupTagText: { fontFamily: fonts.sans.semibold, fontSize: 9, letterSpacing: 0.5, color: colors.textMuted },
    selectedAimBlock: { backgroundColor: colors.selectionSurface, borderRadius: 14 },
    completedAimBlock: { backgroundColor: colors.completedSurface, borderRadius: 14 },
    selectedCompletedAimBlock: { backgroundColor: colors.completedSurface, borderRadius: 14, borderWidth: 1, borderColor: colors.accent },
    draggedAim: { zIndex: 10, elevation: 4, borderRadius: 14, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8 },
    draggedAimBorder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 14, borderWidth: 1, borderColor: colors.accent },
    aimRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -8 },
    aimNumber: { width: 24, fontFamily: fonts.sans.medium, fontSize: 13, lineHeight: 20, color: colors.textMuted },
    aimText: { fontFamily: fonts.sans.medium, fontSize: 15, lineHeight: 22, color: colors.text, flexShrink: 1 },
    inlineAimInput: { flex: 1, minHeight: 44, padding: 0, includeFontPadding: false },
    completedAimText: { color: colors.textMuted, textDecorationLine: 'line-through', textDecorationColor: colors.textMuted },
    noteInput: { fontFamily: fonts.sans.regular, fontSize: 13, lineHeight: 20, color: colors.textMuted, minHeight: 35, maxHeight: 82, paddingTop: 3, paddingBottom: 8, paddingHorizontal: 3, marginRight: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
    noteWithSelection: { marginLeft: 64 },
    noteWithoutSelection: { marginLeft: 28 },
    addNoteButton: { minHeight: 30, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, opacity: 0.78 },
    addNoteText: { fontFamily: fonts.sans.regular, fontSize: 12, color: colors.textMuted },
    boardButton: { minWidth: 160, minHeight: 54, borderWidth: 1, borderColor: effectiveTheme === 'light' ? colors.actionAccent : colors.accent, borderRadius: 16, backgroundColor: effectiveTheme === 'light' ? colors.actionAccent : colors.surface, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    addAimButton: { marginLeft: 45, marginTop: 9, alignSelf: 'flex-start' },
    compactAddAimButton: { minWidth: 54, width: 54, paddingHorizontal: 0 },
    addGroupButton: { marginTop: 20, alignSelf: 'flex-start' },
    boardActionText: { fontFamily: fonts.sans.medium, fontSize: 14, color: effectiveTheme === 'light' ? colors.actionOnAccent : colors.accent },
    archiveFooter: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 24, paddingVertical: 9, alignItems: 'center' },
    footerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
    footerActionsSelected: { width: '100%', justifyContent: 'space-between' },
    archiveTarget: { minWidth: 150, minHeight: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
    archiveTargetReady: { borderColor: colors.archiveAccent, backgroundColor: colors.archiveAccent },
    deleteSelectedButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.danger, opacity: 1, alignItems: 'center', justifyContent: 'center' },
    completeSelectedButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.sage, backgroundColor: colors.sage, opacity: 1, alignItems: 'center', justifyContent: 'center' },
    completeActionPlaceholder: { width: 48, height: 48 },
    archiveTargetText: { fontFamily: fonts.sans.medium, fontSize: 13, color: colors.textMuted },
    archiveTargetTextReady: { color: colors.archiveAccentForeground },
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
    noteSectionLabel: { fontFamily: fonts.sans.medium, fontSize: 11, letterSpacing: 2, color: colors.textMuted, marginTop: 18, marginBottom: 8 },
    modalNoteInput: { minHeight: 82, maxHeight: 110, borderRadius: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inputBackground, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, fontFamily: fonts.sans.regular, fontSize: 14, lineHeight: 20, color: colors.text },
    errorText: { fontFamily: fonts.sans.regular, fontSize: 12, color: colors.accent, marginTop: 9 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 23 },
    cancelButton: { flex: 1, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.control },
    cancelText: { fontFamily: fonts.sans.medium, fontSize: 14, color: colors.text },
    saveButton: { flex: 1, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
    saveText: { fontFamily: fonts.sans.semibold, fontSize: 14, color: colors.accentForeground },
  });
}
