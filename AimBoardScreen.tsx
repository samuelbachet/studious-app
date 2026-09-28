import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, BackHandler, Easing, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { addAim, addGroup, ARCHIVE_TITLE_MAX_LENGTH, archiveSelected, completeArchivedSelected, completeSelected, completionDraftChanges, completionInDraft, deleteAim, deleteGroup, deleteOrganizedArchivedSelected, deleteOrganizedSelected, goalCompletionInDraft, makeAimId, MAX_AIMS_PER_GROUP, MAX_GROUPS, prioritizeOldGroups, renameAim, renameGroup, reorderAim, reorderGroup, setGoalCompletionDraft, unarchiveSelected, uncompleteArchivedSelected, uncompleteSelected, updateAimNote, updateArchivedNote } from './aimBoard';
import type { AimBoardState, AimGroup, ArchivedAimItem } from './aimBoard';
import { boundedAimOffset, orderedAimLayouts, previewAimTops, previewIndex, proposedAimIndex } from './aimDrag';
import type { AimDragLayout } from './aimDrag';
import type { EffectiveTheme, ThemeColors } from './theme';
import { fonts } from './typography';

type Editor = { kind: 'title' | 'aim'; id: string; isNew: boolean };
type NoteEdit = { id: string; archived: boolean; original: string; latest: string };
type InlineEdit = { kind: 'title' | 'aim'; id: string; value: string; isNew: boolean; groupId?: string; originalEmptyCompleted?: boolean };
type AimDrag = { groupId: string; aimId: string; startY: number; sourceY: number; layouts: AimDragLayout[]; listHeight: number; toIndex: number };
type GroupDrag = { groupId: string; startY: number; layouts: AimDragLayout[]; toIndex: number };
type AimDragPress = Pick<PressableProps, 'onLongPress' | 'onPressMove' | 'onPressOut'>;
type OrganizeAction = 'delete' | 'complete' | 'archive';
type ConfirmableOrganizeAction = Exclude<OrganizeAction, 'complete'>;
export type OrganizerLabelVisibility = Record<OrganizeAction, boolean>;
export type OrganizerProcessLabelVisibility = { cancel: boolean; save: boolean };
export type OrganizerIconEnlargement = Record<OrganizeAction | 'organize', boolean>;
const AIM_DRAG_RETENTION = { top: 1000, bottom: 1000, left: 80, right: 80 };
const ORGANIZER_MENU_HEIGHT = 74;
const ORGANIZER_TOGGLE_HEIGHT_WITH_LABEL = 56;
const ORGANIZER_TOGGLE_HEIGHT_WITHOUT_LABEL = 44;

function PressFeedback({ children, onPress, label, style, disabled = false, selected = false }: { children: ReactNode; onPress: () => void; label: string; style?: StyleProp<ViewStyle>; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}>{children}</Pressable>;
}

function SelectionCircle({ selected, partial = false, disabled = false, group = false, label, onPress, dragPress, colors, action }: { selected: boolean; partial?: boolean; disabled?: boolean; group?: boolean; label: string; onPress: () => void; dragPress?: AimDragPress; colors: ThemeColors; action: OrganizeAction }) {
  const selectionColor = action === 'delete' ? colors.danger : action === 'complete' ? colors.sage : colors.archiveAccent;
  const foreground = action === 'delete' ? colors.dangerForeground : action === 'complete' ? colors.sageForeground : colors.archiveAccentForeground;
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: partial ? 'mixed' : selected, disabled }} disabled={disabled} onPress={onPress} onLongPress={dragPress?.onLongPress} onPressMove={dragPress?.onPressMove} onPressOut={dragPress?.onPressOut} delayLongPress={450} pressRetentionOffset={dragPress ? AIM_DRAG_RETENTION : undefined} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : 1 }}>
    <View style={{ width: 22, height: 22, borderRadius: group ? 6 : 11, borderWidth: 1.5, borderColor: selected || partial ? selectionColor : colors.textMuted, backgroundColor: selected ? selectionColor : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {selected ? <Feather name="check" size={14} color={foreground} /> : partial ? <View style={{ width: 9, height: 2, borderRadius: 1, backgroundColor: selectionColor }} /> : null}
    </View>
  </Pressable>;
}

function goalIsCompleted(goal: { aims: readonly { completed: boolean }[]; emptyCompleted?: boolean }): boolean {
  return goal.aims.length === 0 ? goal.emptyCompleted === true : goal.aims.every((aim) => aim.completed);
}

function CompletedGoalIndicator({ title, colors, style }: { title: string; colors: ThemeColors; style: StyleProp<ViewStyle> }) {
  return <View accessible accessibilityRole="image" accessibilityLabel={`Completed goal: ${title}`} pointerEvents="none" style={style}>
    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.sage, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name="check" size={14} color={colors.sageForeground} accessible={false} />
    </View>
  </View>;
}

function RenameLabel({ accessibilityLabel, accessibilityHint, onPress, onPressIn, onLongPress, onPressMove, onPressOut, children, style, pressStyle, pressedStyle, disabled = false }: { accessibilityLabel: string; accessibilityHint?: string; onPress: () => void; onPressIn?: PressableProps['onPressIn']; onLongPress?: PressableProps['onLongPress']; onPressMove?: PressableProps['onPressMove']; onPressOut?: PressableProps['onPressOut']; children: ReactNode; style?: StyleProp<ViewStyle>; pressStyle: StyleProp<ViewStyle>; pressedStyle: StyleProp<ViewStyle>; disabled?: boolean }) {
  return <View style={style}>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onPressIn={onPressIn} onLongPress={onLongPress} onPressMove={onPressMove} onPressOut={onPressOut} delayLongPress={450} pressRetentionOffset={onLongPress ? AIM_DRAG_RETENTION : undefined} style={({ pressed }) => [pressStyle, pressed && pressedStyle]}>{children}</Pressable>
  </View>;
}

function AimBlock({ id, children, onLayout, registerSlot, dragPress, style, draggedStyle, draggedBorderStyle, dragging, previewActive, previewTop, dragTop }: { id: string; children: ReactNode; onLayout: (event: LayoutChangeEvent) => void; registerSlot: (id: string, slot: Animated.Value | null) => void; dragPress?: AimDragPress; style: StyleProp<ViewStyle>; draggedStyle: StyleProp<ViewStyle>; draggedBorderStyle: StyleProp<ViewStyle>; dragging: boolean; previewActive: boolean; previewTop: number; dragTop: Animated.Value }) {
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
  return <Animated.View onLayout={handleLayout} style={[style, dragging && draggedStyle, previewActive && { position: 'absolute', left: 0, right: 0, top: dragging ? dragTop : slotTop }]}>
    <Pressable accessible={false} onLongPress={dragPress?.onLongPress} onPressMove={dragPress?.onPressMove} onPressOut={dragPress?.onPressOut} delayLongPress={450} pressRetentionOffset={dragPress ? AIM_DRAG_RETENTION : undefined}>
      {children}
    </Pressable>
    {dragging && <View pointerEvents="none" style={draggedBorderStyle} />}
  </Animated.View>;
}

function formatArchiveDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function SelectableContent({ top, styles, children }: { top: ReactNode; styles: ReturnType<typeof createStyles>; children: ReactNode }) {
  return <View style={styles.organizeScreenContent}>
    {top}
    <View style={styles.organizeListTouchArea}>
      {children}
    </View>
  </View>;
}

function OrganizerActionIcon({ action, archived, showLabel, enlargeWhenUnlabeled, color }: { action: OrganizeAction; archived: boolean; showLabel: boolean; enlargeWhenUnlabeled: boolean; color: string }) {
  const size = !showLabel && enlargeWhenUnlabeled ? 30 : 24;
  return action === 'archive'
    ? <MaterialCommunityIcons name={archived ? 'folder-arrow-up-outline' : 'folder-arrow-down-outline'} size={size} color={color} accessible={false} />
    : <Feather name={action === 'delete' ? 'trash-2' : 'check'} size={size} color={color} accessible={false} />;
}

function OrganizeActions({ archived, onChoose, showLabels, enlargeWhenUnlabeled, disabled, colors, styles }: { archived: boolean; onChoose: (action: OrganizeAction) => void; showLabels: OrganizerLabelVisibility; enlargeWhenUnlabeled: OrganizerIconEnlargement; disabled: boolean; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.organizeActions}>
    {(['delete', 'complete', 'archive'] as const).map((option) => {
      const color = option === 'delete' ? colors.danger : option === 'complete' ? colors.sage : colors.archiveAccent;
      const title = option === 'delete' ? 'Delete' : option === 'complete' ? 'Complete' : archived ? 'Unarchive' : 'Put in Archive';
      const showLabel = showLabels[option];
      return <PressFeedback key={option} label={`Choose ${title.toLowerCase()} action`} onPress={() => onChoose(option)} disabled={disabled} style={[styles.organizeActionButton, !showLabel && styles.organizeActionButtonWithoutLabel]}>
        {showLabel && <Text style={styles.organizeActionHeading}>{title}</Text>}
        <View style={styles.organizeActionIcon}>
          <OrganizerActionIcon action={option} archived={archived} showLabel={showLabel} enlargeWhenUnlabeled={enlargeWhenUnlabeled[option]} color={color} />
        </View>
      </PressFeedback>;
    })}
  </View>;
}

function OrganizerDock({ open, canOpen, showLabel, enlargeWhenUnlabeled, onToggle, onClosed, colors, children, styles }: { open: boolean; canOpen: boolean; showLabel: boolean; enlargeWhenUnlabeled: boolean; onToggle: () => void; onClosed: () => void; colors: ThemeColors; children: ReactNode; styles: ReturnType<typeof createStyles> }) {
  const toggleHeight = showLabel ? ORGANIZER_TOGGLE_HEIGHT_WITH_LABEL : ORGANIZER_TOGGLE_HEIGHT_WITHOUT_LABEL;
  const [translateY] = useState(() => new Animated.Value(open ? 0 : ORGANIZER_MENU_HEIGHT));
  const hasOpened = useRef(open);
  useEffect(() => {
    if (!open && !hasOpened.current) return;
    if (open) hasOpened.current = true;
    const animation = Animated.timing(translateY, { toValue: open ? 0 : ORGANIZER_MENU_HEIGHT, duration: open ? 180 : 160, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => {
      if (finished && !open) onClosed();
    });
    return () => animation.stop();
  }, [open, onClosed, translateY]);
  return <View pointerEvents="box-none" style={[styles.organizerDock, { height: ORGANIZER_MENU_HEIGHT + toggleHeight }]}>
    <Animated.View pointerEvents="box-none" style={[styles.organizerDockMotion, { transform: [{ translateY }] }]}>
      <View style={[styles.organizerToggleFooter, { height: toggleHeight }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={canOpen ? open ? 'Hide Organize menu' : 'Show Organize menu' : 'No items to organize'} accessibilityState={{ expanded: open, disabled: !canOpen }} disabled={!canOpen} onPress={onToggle} style={({ pressed }) => [styles.organizerToggleButton, !canOpen && styles.organizerToggleDisabled, pressed && styles.organizerTogglePressed]}>
          {showLabel && <Text style={styles.organizerToggleLabel}>Organize</Text>}
          <View style={styles.organizerToggleIcon}>
            <Feather name={open ? 'chevron-down' : 'chevron-up'} size={!showLabel && enlargeWhenUnlabeled ? 30 : 23} color={open ? colors.accent : colors.textMuted} accessible={false} />
          </View>
        </Pressable>
      </View>
      <View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={styles.organizerDockPanel}>{children}</View>
    </Animated.View>
  </View>;
}

function ProcessActionButton({ action, archived, showActionLabel, showLabels, enlargeWhenUnlabeled, count, disabled, blocked = false, saveOnlyUncomplete = false, onPress, onSave, onCancel, colors, styles }: { action: OrganizeAction; archived: boolean; showActionLabel: boolean; showLabels: OrganizerProcessLabelVisibility; enlargeWhenUnlabeled: boolean; count: number; disabled: boolean; blocked?: boolean; saveOnlyUncomplete?: boolean; onPress: () => void; onSave: () => void; onCancel: () => void; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  const color = action === 'delete' ? colors.danger : action === 'complete' ? colors.sage : colors.archiveAccent;
  const title = action === 'delete' ? 'Delete' : action === 'complete' ? 'Mark complete' : archived ? 'Unarchive' : 'Put in Archive';
  const saveColor = disabled ? colors.textMuted : saveOnlyUncomplete ? colors.danger : color;
  const iconSize = enlargeWhenUnlabeled ? 30 : 24;
  const saveLabel = disabled
    ? 'Select a completion change before saving'
    : `Save ${count} completion change${count === 1 ? '' : 's'}`;
  const actionLabel = blocked
    ? `Cannot unarchive: maximum ${MAX_GROUPS} active goals`
    : disabled
      ? `Select items to ${title.toLowerCase()}`
      : `Review ${title.toLowerCase()} for ${count} selected item${count === 1 ? '' : 's'}`;
  return <View style={styles.processActionRow}>
    <PressFeedback label={`Cancel ${title.toLowerCase()} action`} onPress={onCancel} style={styles.cancelProcessButton}>
      {showLabels.cancel && <Text style={styles.processActionLabel}>Cancel</Text>}
      <Feather name="x" size={showLabels.cancel ? 24 : iconSize} color={colors.danger} accessible={false} />
    </PressFeedback>
    {action === 'complete'
      ? <Text style={[styles.processActionTitle, { color: disabled ? colors.textMuted : color }]}>{title}</Text>
      : <PressFeedback label={actionLabel} onPress={onPress} disabled={disabled} style={styles.processTarget}>
          <OrganizerActionIcon action={action} archived={archived} showLabel={showActionLabel} enlargeWhenUnlabeled={enlargeWhenUnlabeled} color={disabled ? colors.textMuted : color} />
        </PressFeedback>}
    {action === 'complete' && <PressFeedback label={saveLabel} onPress={onSave} disabled={disabled} style={styles.saveProcessButton}>
      {showLabels.save && <Text style={[styles.processActionLabel, { color: saveColor }]}>Save</Text>}
      <MaterialCommunityIcons name="content-save-outline" size={showLabels.save ? 24 : iconSize} color={saveColor} accessible={false} />
    </PressFeedback>}
  </View>;
}

function ConfirmOrganizerAction({ action, archived, onCancel, onConfirm, colors, styles }: { action: ConfirmableOrganizeAction | null; archived: boolean; onCancel: () => void; onConfirm: () => void; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  const title = action === 'delete' ? 'Delete selected items?' : archived ? 'Unarchive selected goals?' : 'Put selected goals in Archive?';
  const confirmLabel = action === 'delete' ? 'Delete' : archived ? 'Unarchive' : 'Put in Archive';
  return <Modal visible={action !== null} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.confirmOverlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss confirmation" onPress={onCancel} style={StyleSheet.absoluteFill} />
      <View style={styles.confirmCard}>
        <Text style={styles.confirmTitle}>{title}</Text>
        {action === 'delete' && <Text style={styles.confirmCopy}>This can&apos;t be undone.</Text>}
        <View style={styles.confirmActions}>
          <PressFeedback label="Cancel" onPress={onCancel} style={styles.confirmButton}><Text style={styles.confirmCancelText}>Cancel</Text></PressFeedback>
          <PressFeedback label={confirmLabel} onPress={onConfirm} style={styles.confirmButton}><Text style={[styles.confirmActionText, { color: action === 'delete' ? colors.danger : colors.archiveAccent }]}>{confirmLabel}</Text></PressFeedback>
        </View>
      </View>
    </View>
  </Modal>;
}

function formatOldAimDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type ArchivedGoalDisplay = { key: string; id: string; title: string; order: number; aims: ArchivedAimItem[]; archiveIds: string[]; emptyArchiveId?: string; emptyCompleted?: boolean };
type ArchivedHeadingDisplay = { key: string; title: string; latestArchivedAt: string; goals: ArchivedGoalDisplay[] };

function archiveSections(archive: AimBoardState['archive']): { dateKey: string; headings: ArchivedHeadingDisplay[] }[] {
  const dates = new Map<string, Map<string, { key: string; title: string; latestArchivedAt: string; goals: Map<string, ArchivedGoalDisplay> }>>();
  for (const group of archive) {
    const headings = dates.get(group.originalDateKey) ?? new Map();
    const headingKey = JSON.stringify([group.originalDateKey, group.archiveHeading]);
    const heading = headings.get(headingKey) ?? { key: headingKey, title: group.archiveHeading, latestArchivedAt: group.archivedAt, goals: new Map<string, ArchivedGoalDisplay>() };
    heading.goals.set(group.id, { key: JSON.stringify([headingKey, group.id]), id: group.id, title: group.title, order: group.originalGroupOrder, aims: group.aims, archiveIds: [group.id], emptyArchiveId: group.aims.length ? undefined : group.id, emptyCompleted: group.aims.length === 0 && group.emptyCompleted === true });
    if (group.archivedAt > heading.latestArchivedAt) heading.latestArchivedAt = group.archivedAt;
    headings.set(headingKey, heading);
    dates.set(group.originalDateKey, headings);
  }
  return [...dates.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([dateKey, headings]) => ({
    dateKey,
    headings: [...headings.values()].map((heading) => ({ key: heading.key, title: heading.title, latestArchivedAt: heading.latestArchivedAt, goals: [...heading.goals.values()].map((group) => ({ ...group, aims: group.aims.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)) })).sort((a, b) => a.order - b.order) })).sort((a, b) => b.latestArchivedAt.localeCompare(a.latestArchivedAt)),
  }));
}

export function AimBoardScreen({ header, archiveView = false, onCloseArchive, onSelectionModeChange, state, onChange, colors, effectiveTheme, scrollContentStyle, showArchiveDates, showRelatedTags, showOrganizeHeader, showSelectHeader, showOrganizerLabels, showOrganizerProcessLabels, largeUnlabeledOrganizerIcons, headingEditing = false }: { header?: ReactNode; archiveView?: boolean; onCloseArchive?: () => void; onSelectionModeChange?: (active: boolean) => void; state: AimBoardState; onChange: (update: (current: AimBoardState) => AimBoardState) => AimBoardState; colors: ThemeColors; effectiveTheme: EffectiveTheme; scrollContentStyle: StyleProp<ViewStyle>; showArchiveDates: boolean; showRelatedTags: boolean; showOrganizeHeader: boolean; showSelectHeader: boolean; showOrganizerLabels: OrganizerLabelVisibility; showOrganizerProcessLabels: OrganizerProcessLabelVisibility; largeUnlabeledOrganizerIcons: OrganizerIconEnlargement; headingEditing?: boolean }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set());
  const [selectedEmptyGroupIds, setSelectedEmptyGroupIds] = useState<Set<string>>(() => new Set());
  const [activeCompletionDraft, setActiveCompletionDraft] = useState<Set<string>>(() => new Set());
  const [selectedArchived, setSelectedArchived] = useState<Set<string>>(() => new Set());
  const [selectedArchivedGoalKeys, setSelectedArchivedGoalKeys] = useState<Set<string>>(() => new Set());
  const [selectedArchivedEmptyGroupIds, setSelectedArchivedEmptyGroupIds] = useState<Set<string>>(() => new Set());
  const [archiveCompletionDraft, setArchiveCompletionDraft] = useState<Set<string>>(() => new Set());
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<OrganizeAction | null>(null);
  const [archiveOrganizeOpen, setArchiveOrganizeOpen] = useState(false);
  const [archiveAction, setArchiveAction] = useState<OrganizeAction | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmableOrganizeAction | null>(null);
  const selectionMode = organizeOpen && activeAction !== null;
  const archiveSelectionMode = archiveOrganizeOpen && archiveAction !== null;
  const editingLocked = selectionMode || archiveSelectionMode;
  useEffect(() => { onSelectionModeChange?.(selectionMode); }, [onSelectionModeChange, selectionMode]);
  const finishActiveOrganizeClose = useCallback(() => setActiveAction(null), []);
  const finishArchiveOrganizeClose = useCallback(() => setArchiveAction(null), []);
  const [archiveTitleDraft, setArchiveTitleDraft] = useState<string | null>(null);
  const archiveTitleEditRef = useRef<string | null>(null);
  const [collapsedArchiveHeadings, setCollapsedArchiveHeadings] = useState<Set<string>>(() => new Set());
  const [collapsedArchivedGoals, setCollapsedArchivedGoals] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [value, setValue] = useState('');
  const [goalLimitError, setGoalLimitError] = useState(false);
  const [goalLimitShake] = useState(() => new Animated.Value(0));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [aimPressHeld, setAimPressHeld] = useState(false);
  const [dragging, setDragging] = useState<AimDrag | null>(null);
  const dragRef = useRef<AimDrag | null>(null);
  const [groupDragging, setGroupDragging] = useState<GroupDrag | null>(null);
  const groupDragRef = useRef<GroupDrag | null>(null);
  const groupLayouts = useRef(new Map<string, AimDragLayout>());
  const [groupDragOffset] = useState(() => new Animated.Value(0));
  const aimHeights = useRef(new Map<string, number>());
  const aimSlotValues = useRef(new Map<string, Animated.Value>());
  const settleAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [dragTop] = useState(() => new Animated.Value(0));
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const noteEditRef = useRef<NoteEdit | null>(null);
  const inlineEditRef = useRef<InlineEdit | null>(null);
  const textEditing = editor !== null || focusedNoteId !== null || headingEditing || archiveTitleDraft !== null;
  const groups = useMemo(() => prioritizeOldGroups(state.active.groups), [state.active.groups]);
  const hasCompletedActiveGoal = useMemo(() => groups.some(goalIsCompleted), [groups]);
  const organizerToggleHeight = showOrganizeHeader ? ORGANIZER_TOGGLE_HEIGHT_WITH_LABEL : ORGANIZER_TOGGLE_HEIGHT_WITHOUT_LABEL;
  const activeIds = useMemo(() => new Set(groups.flatMap((group) => group.aims.map((aim) => aim.id))), [groups]);
  const emptyGroupIds = useMemo(() => new Set(groups.filter((group) => group.aims.length === 0).map((group) => group.id)), [groups]);
  const sections = useMemo(() => archiveSections(state.archive), [state.archive]);
  const hasCompletedArchivedGoal = useMemo(() => sections.some((section) => section.headings.some((heading) => heading.goals.some(goalIsCompleted))), [sections]);
  const firstVisibleArchiveGoalKey = useMemo(() => {
    for (const section of sections) {
      for (const heading of section.headings) {
        if (!collapsedArchiveHeadings.has(heading.key) && heading.goals.length > 0) return heading.goals[0].key;
      }
    }
    return null;
  }, [sections, collapsedArchiveHeadings]);
  const selectedActive = useMemo(() => new Set([...selected].filter((id) => activeIds.has(id))), [selected, activeIds]);
  const selectedGoals = useMemo(() => new Set([...selectedGroupIds].filter((id) => groups.some((group) => group.id === id && group.aims.length > 0))), [selectedGroupIds, groups]);
  const selectedEmptyGroups = useMemo(() => new Set([...selectedEmptyGroupIds].filter((id) => emptyGroupIds.has(id))), [emptyGroupIds, selectedEmptyGroupIds]);
  const activeCompletionChanges = useMemo(() => completionDraftChanges(groups, activeCompletionDraft), [groups, activeCompletionDraft]);
  const activeNewCompletionCount = activeCompletionChanges.completeAimIds.size + activeCompletionChanges.completeEmptyGroupIds.size;
  const activeCompletionChangeCount = activeNewCompletionCount + activeCompletionChanges.uncompleteAimIds.size + activeCompletionChanges.uncompleteEmptyGroupIds.size;
  const canArchiveSelection = selectedGoals.size > 0 || selectedEmptyGroups.size > 0;
  const archivedIds = useMemo(() => new Set(state.archive.flatMap((group) => group.aims.map((aim) => aim.id))), [state.archive]);
  const archivedEmptyGroupIds = useMemo(() => new Set(state.archive.filter((group) => group.aims.length === 0).map((group) => group.id)), [state.archive]);
  const selectedArchiveActive = useMemo(() => new Set([...selectedArchived].filter((id) => archivedIds.has(id))), [selectedArchived, archivedIds]);
  const selectedArchiveEmptyGroups = useMemo(() => new Set([...selectedArchivedEmptyGroupIds].filter((id) => archivedEmptyGroupIds.has(id))), [selectedArchivedEmptyGroupIds, archivedEmptyGroupIds]);
  const archiveCompletionChanges = useMemo(() => completionDraftChanges(state.archive, archiveCompletionDraft), [state.archive, archiveCompletionDraft]);
  const archiveNewCompletionCount = archiveCompletionChanges.completeAimIds.size + archiveCompletionChanges.completeEmptyGroupIds.size;
  const archiveCompletionChangeCount = archiveNewCompletionCount + archiveCompletionChanges.uncompleteAimIds.size + archiveCompletionChanges.uncompleteEmptyGroupIds.size;
  const selectedArchivedGoals = useMemo(() => sections.flatMap((section) => section.headings.flatMap((heading) => heading.goals)).filter((goal) => selectedArchivedGoalKeys.has(goal.key)), [sections, selectedArchivedGoalKeys]);
  const hasUnarchiveSelection = selectedArchivedGoals.length > 0 || selectedArchiveEmptyGroups.size > 0;
  const unarchivePreview = useMemo(() => archiveAction === 'archive' && hasUnarchiveSelection ? unarchiveSelected(state,
    new Set(selectedArchivedGoals.flatMap((goal) => goal.aims.map((aim) => aim.id))),
    undefined,
    selectedArchiveEmptyGroups,
    new Set(selectedArchivedGoals.flatMap((goal) => goal.archiveIds))) : null, [archiveAction, hasUnarchiveSelection, selectedArchiveEmptyGroups, selectedArchivedGoals, state]);
  const canUnarchiveSelection = hasUnarchiveSelection && Boolean(unarchivePreview) && selectedArchivedGoals.every((goal) => goal.archiveIds.every((id) => !unarchivePreview!.archive.some((group) => group.id === id))) && [...selectedArchiveEmptyGroups].every((id) => !unarchivePreview!.archive.some((group) => group.id === id));
  const finishArchiveTitleEdit = useCallback(() => {
    const draft = archiveTitleEditRef.current;
    if (draft === null) return;
    archiveTitleEditRef.current = null;
    setArchiveTitleDraft(null);
    const clean = draft.trim();
    if (clean && clean !== state.archiveTitle) onChange((current) => ({ ...current, archiveTitle: clean }));
  }, [onChange, state.archiveTitle]);
  const closeArchive = useCallback(() => { finishArchiveTitleEdit(); Keyboard.dismiss(); onCloseArchive?.(); }, [finishArchiveTitleEdit, onCloseArchive]);
  useEffect(() => {
    if (!archiveView) return undefined;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { closeArchive(); return true; });
    return () => back.remove();
  }, [archiveView, closeArchive]);
  useEffect(() => () => { settleAnimationRef.current?.stop(); }, []);

  const cancelDrag = () => {
    const animation = settleAnimationRef.current;
    settleAnimationRef.current = null;
    animation?.stop();
    dragRef.current = null;
    groupDragRef.current = null;
    groupDragOffset.setValue(0);
    setAimPressHeld(false);
    setDragging(null);
    setGroupDragging(null);
  };

  const showValidationError = (offset: Animated.Value) => {
    offset.stopAnimation();
    offset.setValue(0);
    Animated.sequence([8, -8, 6, -6, 0].map((toValue) => Animated.timing(offset, { toValue, duration: 55, useNativeDriver: true }))).start();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const openAddAim = (group: AimGroup) => {
    if (editingLocked || textEditing || group.aims.length >= MAX_AIMS_PER_GROUP) return;
    cancelDrag();
    const id = makeAimId();
    const name = `Step ${group.aims.length + 1}`;
    inlineEditRef.current = { kind: 'aim', id, value: '', isNew: true, groupId: group.id, originalEmptyCompleted: group.emptyCompleted };
    setValue('');
    onChange((current) => addAim(current, name, group.id, undefined, '', id));
    setEditor({ kind: 'aim', id, isNew: true });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const openAddGroup = () => {
    if (editingLocked || textEditing) return;
    if (groups.length >= MAX_GROUPS) {
      setGoalLimitError(true);
      showValidationError(goalLimitShake);
      return;
    }
    setGoalLimitError(false);
    cancelDrag();
    if (groups.length === 0) { setActiveAction(null); setOrganizeOpen(false); }
    const id = makeAimId();
    const name = `Goal ${groups.length + 1}`;
    inlineEditRef.current = { kind: 'title', id, value: '', isNew: true };
    setValue('');
    onChange((current) => addGroup(current, name, undefined, id));
    setEditor({ kind: 'title', id, isNew: true });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const revertInlineCreation = (draft: InlineEdit) => {
    onChange((current) => {
      if (draft.kind === 'title') return deleteGroup(current, draft.id);
      const withoutDraft = deleteAim(current, draft.id);
      if (!draft.groupId) return withoutDraft;
      return {
        ...withoutDraft,
        active: {
          ...withoutDraft.active,
          groups: withoutDraft.active.groups.map((group) => group.id === draft.groupId ? { ...group, emptyCompleted: draft.originalEmptyCompleted } : group),
        },
      };
    });
  };
  const finishInlineEdit = (kind: InlineEdit['kind'], id: string) => {
    const draft = inlineEditRef.current;
    if (!draft || draft.kind !== kind || draft.id !== id) return;
    const clean = draft.value.trim();
    inlineEditRef.current = null;
    if (clean) {
      onChange((current) => draft.kind === 'title' ? renameGroup(current, draft.id, clean) : renameAim(current, draft.id, clean));
    } else if (draft.isNew) revertInlineCreation(draft);
    setEditor((current) => current?.kind === draft.kind && current.id === draft.id ? null : current);
  };
  const cancelInlineEdit = (kind: InlineEdit['kind'], id: string) => {
    const draft = inlineEditRef.current;
    if (!draft || draft.kind !== kind || draft.id !== id) return;
    inlineEditRef.current = null;
    setEditor((current) => current?.kind === kind && current.id === id ? null : current);
    Keyboard.dismiss();
    if (!draft.isNew) return;
    revertInlineCreation(draft);
  };
  const finishPreviousEdit = (nextId: string) => {
    const draft = inlineEditRef.current;
    if (draft && draft.id !== nextId) finishInlineEdit(draft.kind, draft.id);
    return inlineEditRef.current === null || inlineEditRef.current.id === nextId;
  };
  const openTitleEditor = (group: AimGroup) => {
    if (editingLocked) return;
    if (!finishPreviousEdit(group.id)) return;
    cancelDrag();
    inlineEditRef.current = { kind: 'title', id: group.id, value: group.title, isNew: false };
    setValue(group.title);
    setEditor({ kind: 'title', id: group.id, isNew: false });
  };
  const openAimEditor = (id: string, text: string) => {
    if (editingLocked) return;
    if (!finishPreviousEdit(id)) return;
    cancelDrag();
    inlineEditRef.current = { kind: 'aim', id, value: text, isNew: false };
    setValue(text);
    setEditor({ kind: 'aim', id, isNew: false });
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
    if (dragRef.current?.groupId === groupId || groupDragRef.current?.groupId === groupId) cancelDrag();
  };
  const canReorderGroup = (group: AimGroup) => groups.filter((item) => Boolean(item.restoredFromDateKey) === Boolean(group.restoredFromDateKey)).length > 1;
  const registerGroupLayout = (groupId: string, event: LayoutChangeEvent) => {
    groupLayouts.current.set(groupId, { id: groupId, y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height });
  };
  const beginGroupDrag = (group: AimGroup, event: GestureResponderEvent) => {
    if (!collapsedGroups.has(group.id) || !canReorderGroup(group) || dragRef.current || groupDragRef.current || settleAnimationRef.current || editor) return;
    const peers = groups.filter((item) => Boolean(item.restoredFromDateKey) === Boolean(group.restoredFromDateKey));
    const layouts = peers.map((item) => groupLayouts.current.get(item.id));
    if (layouts.some((layout) => !layout || layout.height <= 0)) return;
    const next: GroupDrag = { groupId: group.id, startY: event.nativeEvent.pageY, layouts: layouts as AimDragLayout[], toIndex: peers.findIndex((item) => item.id === group.id) };
    groupDragOffset.setValue(0);
    groupDragRef.current = next;
    setGroupDragging(next);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const moveGroupDrag = (groupId: string, event: GestureResponderEvent) => {
    const active = groupDragRef.current;
    if (!active || active.groupId !== groupId) return;
    const source = active.layouts.find((item) => item.id === groupId);
    if (!source) return;
    const offset = boundedAimOffset(active.layouts, groupId, event.nativeEvent.pageY - active.startY);
    groupDragOffset.setValue(offset);
    const toIndex = proposedAimIndex(active.layouts, groupId, active.toIndex, source.y + offset);
    if (toIndex !== active.toIndex) {
      const next = { ...active, toIndex };
      groupDragRef.current = next;
      setGroupDragging(next);
      void Haptics.selectionAsync();
    }
  };
  const finishGroupDrag = (groupId: string) => {
    const active = groupDragRef.current;
    if (!active || active.groupId !== groupId) return;
    groupDragRef.current = null;
    groupDragOffset.setValue(0);
    setGroupDragging(null);
    if (active.toIndex !== active.layouts.findIndex((item) => item.id === groupId)) {
      onChange((current) => reorderGroup(current, groupId, active.toIndex));
      void Haptics.selectionAsync();
    }
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
    setAimPressHeld(true);
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
    setAimPressHeld(false);
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
    if (activeAction === 'complete') {
      setActiveCompletionDraft((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
      return;
    }
    setSelected((current) => {
      const next = new Set([...current].filter((item) => activeIds.has(item)));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleGroup = (group: AimGroup) => {
    if (activeAction === 'complete') {
      setActiveCompletionDraft((current) => setGoalCompletionDraft(current, group, !goalCompletionInDraft(group, current)));
      return;
    }
    if (!group.aims.length) {
      setSelectedEmptyGroupIds((current) => {
        const next = new Set([...current].filter((id) => groups.some((item) => item.id === id && item.aims.length === 0)));
        if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
        return next;
      });
      return;
    }
    const wasSelected = selectedGroupIds.has(group.id);
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      if (wasSelected) next.delete(group.id); else next.add(group.id);
      return next;
    });
    if (activeAction === 'delete') {
      setSelected((current) => new Set([...current].filter((item) => !group.aims.some((aim) => aim.id === item))));
    }
  };
  const toggleArchivedAim = (id: string) => {
    if (archiveAction === 'complete') {
      setArchiveCompletionDraft((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
      return;
    }
    setSelectedArchived((current) => {
      const next = new Set([...current].filter((item) => archivedIds.has(item)));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleArchivedGroup = (goal: ArchivedGoalDisplay) => {
    if (archiveAction === 'complete') {
      setArchiveCompletionDraft((current) => setGoalCompletionDraft(current, goal, !goalCompletionInDraft(goal, current)));
      return;
    }
    const wasSelected = selectedArchivedGoalKeys.has(goal.key);
    setSelectedArchivedGoalKeys((current) => {
      const next = new Set(current);
      if (wasSelected) next.delete(goal.key); else next.add(goal.key);
      return next;
    });
    if (archiveAction === 'delete') {
      setSelectedArchived((current) => new Set([...current].filter((item) => !goal.aims.some((aim) => aim.id === item))));
    }
  };
  const toggleArchivedEmptyGroup = (id: string) => {
    if (archiveAction === 'complete') {
      setArchiveCompletionDraft((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
      return;
    }
    setSelectedArchivedEmptyGroupIds((current) => {
      const next = new Set([...current].filter((item) => archivedEmptyGroupIds.has(item)));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearActiveSelection = () => {
    setSelected(new Set());
    setSelectedGroupIds(new Set());
    setSelectedEmptyGroupIds(new Set());
    setActiveCompletionDraft(new Set());
  };
  const toggleOrganize = () => {
    setOrganizeOpen((current) => !current);
    if (!organizeOpen) setActiveAction(null);
    clearActiveSelection();
  };
  const clearArchivedSelection = () => {
    setSelectedArchived(new Set());
    setSelectedArchivedGoalKeys(new Set());
    setSelectedArchivedEmptyGroupIds(new Set());
    setArchiveCompletionDraft(new Set());
  };
  const toggleArchiveOrganize = () => {
    setArchiveOrganizeOpen((current) => !current);
    if (!archiveOrganizeOpen) setArchiveAction(null);
    clearArchivedSelection();
  };
  const toggleArchiveHeadingCollapsed = (headingKey: string) => {
    setCollapsedArchiveHeadings((current) => {
      const next = new Set(current);
      if (next.has(headingKey)) next.delete(headingKey); else next.add(headingKey);
      return next;
    });
  };
  const archivedGoalFullySelected = (goal: ArchivedGoalDisplay) => archiveAction === 'complete'
    ? goalCompletionInDraft(goal, archiveCompletionDraft)
    : goal.emptyArchiveId
    ? selectedArchiveEmptyGroups.has(goal.emptyArchiveId)
    : selectedArchivedGoalKeys.has(goal.key);
  const toggleArchivedHeading = (heading: ArchivedHeadingDisplay) => {
    if (archiveAction === 'complete') {
      setArchiveCompletionDraft((current) => {
        const shouldComplete = !heading.goals.every((goal) => goalCompletionInDraft(goal, current));
        return heading.goals.reduce((next, goal) => setGoalCompletionDraft(next, goal, shouldComplete), new Set(current));
      });
      return;
    }
    const wasSelected = heading.goals.every(archivedGoalFullySelected);
    const aimIds = heading.goals.flatMap((goal) => goal.aims.map((aim) => aim.id));
    const goalKeys = heading.goals.filter((goal) => goal.aims.length > 0).map((goal) => goal.key);
    const emptyIds = heading.goals.flatMap((goal) => goal.emptyArchiveId ? [goal.emptyArchiveId] : []);
    if (archiveAction === 'delete') setSelectedArchived((current) => new Set([...current].filter((id) => !aimIds.includes(id))));
    setSelectedArchivedGoalKeys((current) => {
      const next = new Set(current);
      for (const key of goalKeys) { if (wasSelected) next.delete(key); else next.add(key); }
      return next;
    });
    setSelectedArchivedEmptyGroupIds((current) => {
      const next = new Set([...current].filter((id) => archivedEmptyGroupIds.has(id)));
      for (const id of emptyIds) { if (wasSelected) next.delete(id); else next.add(id); }
      return next;
    });
  };
  const toggleArchivedGoalCollapsed = (goalKey: string) => {
    setCollapsedArchivedGoals((current) => {
      const next = new Set(current);
      if (next.has(goalKey)) next.delete(goalKey); else next.add(goalKey);
      return next;
    });
  };
  const closeActiveOrganizeIfEmpty = (next: AimBoardState) => {
    if (next.active.groups.length > 0) return;
    setOrganizeOpen(false);
  };
  const closeArchiveOrganizeIfEmpty = (next: AimBoardState) => {
    if (next.archive.length > 0) return;
    setArchiveOrganizeOpen(false);
  };
  const archiveCurrentSelection = () => {
    if (!canArchiveSelection) return;
    setGoalLimitError(false);
    const ids = new Set(groups.filter((group) => selectedGoals.has(group.id)).flatMap((group) => group.aims.map((aim) => aim.id)));
    const groupIds = new Set(selectedEmptyGroups);
    const goalIds = new Set(selectedGoals);
    Keyboard.dismiss();
    const next = onChange((current) => archiveSelected(current, ids, undefined, groupIds, goalIds));
    clearActiveSelection();
    closeActiveOrganizeIfEmpty(next);
    cancelDrag();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const saveActiveCompletionDraft = () => {
    if (!activeCompletionChangeCount) return;
    const { completeAimIds, completeEmptyGroupIds, uncompleteAimIds, uncompleteEmptyGroupIds } = activeCompletionChanges;
    Keyboard.dismiss();
    onChange((current) => uncompleteSelected(completeSelected(current, completeAimIds, completeEmptyGroupIds), uncompleteAimIds, uncompleteEmptyGroupIds));
    clearActiveSelection();
    cancelDrag();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const deleteCurrentSelection = () => {
    if (!selectedActive.size && !selectedEmptyGroups.size && !selectedGoals.size) return;
    setGoalLimitError(false);
    const ids = new Set(selectedActive);
    const groupIds = new Set(selectedEmptyGroups);
    const selectedGoalIds = new Set(selectedGoals);
    Keyboard.dismiss();
    const next = onChange((current) => deleteOrganizedSelected(current, ids, selectedGoalIds, groupIds));
    clearActiveSelection();
    closeActiveOrganizeIfEmpty(next);
    cancelDrag();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const unarchiveCurrentSelection = () => {
    if (!canUnarchiveSelection) return;
    const ids = new Set(selectedArchivedGoals.flatMap((goal) => goal.aims.map((aim) => aim.id)));
    const groupIds = new Set(selectedArchiveEmptyGroups);
    const goalArchiveIds = new Set(selectedArchivedGoals.flatMap((goal) => goal.archiveIds));
    Keyboard.dismiss();
    const next = onChange((current) => unarchiveSelected(current, ids, undefined, groupIds, goalArchiveIds));
    clearArchivedSelection();
    closeArchiveOrganizeIfEmpty(next);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const saveArchiveCompletionDraft = () => {
    if (!archiveCompletionChangeCount) return;
    const { completeAimIds, completeEmptyGroupIds, uncompleteAimIds, uncompleteEmptyGroupIds } = archiveCompletionChanges;
    Keyboard.dismiss();
    onChange((current) => uncompleteArchivedSelected(completeArchivedSelected(current, completeAimIds, completeEmptyGroupIds), uncompleteAimIds, uncompleteEmptyGroupIds));
    clearArchivedSelection();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const deleteArchivedSelection = () => {
    if (!selectedArchiveActive.size && !selectedArchiveEmptyGroups.size && !selectedArchivedGoals.length) return;
    const ids = new Set(selectedArchiveActive);
    const groupIds = new Set(selectedArchiveEmptyGroups);
    const selectedGoalIds = new Set(selectedArchivedGoals.flatMap((goal) => goal.archiveIds));
    Keyboard.dismiss();
    const next = onChange((current) => deleteOrganizedArchivedSelected(current, ids, selectedGoalIds, groupIds));
    clearArchivedSelection();
    closeArchiveOrganizeIfEmpty(next);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const chooseActiveAction = (action: OrganizeAction) => {
    if (textEditing) return;
    clearActiveSelection();
    setActiveAction(action);
  };
  const chooseArchiveAction = (action: OrganizeAction) => {
    if (textEditing) return;
    clearArchivedSelection();
    setArchiveAction(action);
  };
  const cancelActiveAction = () => { clearActiveSelection(); setActiveAction(null); };
  const cancelArchiveAction = () => { clearArchivedSelection(); setArchiveAction(null); };
  const processActiveAction = () => {
    if (activeAction === 'delete') deleteCurrentSelection();
    else if (activeAction === 'complete') saveActiveCompletionDraft();
    else if (activeAction === 'archive') archiveCurrentSelection();
  };
  const processArchiveAction = () => {
    if (archiveAction === 'delete') deleteArchivedSelection();
    else if (archiveAction === 'complete') saveArchiveCompletionDraft();
    else if (archiveAction === 'archive') unarchiveCurrentSelection();
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
  const cancelNoteEdit = (id: string) => {
    const edit = noteEditRef.current;
    if (!edit || edit.id !== id) return;
    noteEditRef.current = null;
    setFocusedNoteId(null);
    Keyboard.dismiss();
    if (edit.latest !== edit.original) updateNote(id, edit.archived, edit.original);
  };
  const noteInput = (id: string, text: string, note: string, archived: boolean, selecting: boolean) => {
    if (editingLocked) return note ? <View style={[selecting ? styles.noteWithSelection : styles.noteWithoutSelection, styles.noteReadOnly]}><Text numberOfLines={3} style={styles.notePreviewText}>{note}</Text></View> : null;
    if (!note && focusedNoteId !== id) return textEditing ? null : <Pressable accessibilityRole="button" accessibilityLabel={`Add note for ${text}`} onPress={() => setFocusedNoteId(id)} style={[styles.addNoteButton, selecting ? styles.noteWithSelection : styles.noteWithoutSelection]}>
      <Feather name="plus" size={13} color={colors.textMuted} accessible={false} />
      <Text style={styles.addNoteText}>Add note</Text>
    </Pressable>;
    return <View style={[selecting ? styles.noteWithSelection : styles.noteWithoutSelection, styles.noteEditWrap]}><TextInput
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
      {focusedNoteId === id && <Pressable accessibilityRole="button" accessibilityLabel={`Cancel note edit for ${text}`} onPressIn={() => cancelNoteEdit(id)} onPress={() => cancelNoteEdit(id)} hitSlop={4} style={({ pressed }) => [styles.noteCancelButton, pressed && styles.cancelEditButtonPressed]}>
        <Feather name="x" size={18} color={colors.textMuted} accessible={false} />
      </Pressable>}
      {focusedNoteId === id && <Text style={styles.characterFooter}>{note.length} / 240</Text>}
    </View>;
  };

  return <View style={styles.root}>
    {archiveView ? <>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.archiveContent, { paddingBottom: organizerToggleHeight + (archiveOrganizeOpen && state.archive.length > 0 ? ORGANIZER_MENU_HEIGHT + 20 : 24) }]} keyboardShouldPersistTaps={focusedNoteId ? 'never' : 'handled'} keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <SelectableContent top={<>
          <View style={styles.archiveTopRow}>
            <PressFeedback label="Back to Archive" onPress={closeArchive} style={styles.backButton}><Feather name="arrow-left" size={21} color={colors.text} /></PressFeedback>
            <View style={styles.archiveTitleSlot}>
              {archiveTitleDraft !== null
                ? <View style={styles.archiveTitleEditWrap}>
                  <TextInput value={archiveTitleDraft} onChangeText={(next) => { archiveTitleEditRef.current = next; setArchiveTitleDraft(next); }} onBlur={finishArchiveTitleEdit} onSubmitEditing={finishArchiveTitleEdit} autoFocus maxLength={ARCHIVE_TITLE_MAX_LENGTH} returnKeyType="done" enterKeyHint="done" submitBehavior="blurAndSubmit" keyboardAppearance={effectiveTheme} underlineColorAndroid="transparent" accessibilityLabel="Edit Plans title" style={styles.archiveTitleInput} />
                  <Text style={styles.archiveTitleCharacterFooter}>{archiveTitleDraft.length} / {ARCHIVE_TITLE_MAX_LENGTH}</Text>
                </View>
                : <Pressable accessibilityRole="button" accessibilityLabel={`Rename Plans title: ${state.archiveTitle}`} accessibilityState={{ disabled: archiveSelectionMode }} disabled={archiveSelectionMode} onPress={() => { if (archiveSelectionMode) return; archiveTitleEditRef.current = state.archiveTitle; setArchiveTitleDraft(state.archiveTitle); }} style={({ pressed }) => [styles.archiveTitleEditTarget, pressed && styles.renameTargetPressed]}><Text numberOfLines={1} style={styles.archiveTitle}>{state.archiveTitle}</Text></Pressable>}
            </View>
            <View style={styles.archiveTopSpacer} accessible={false} />
          </View>
        </>} styles={styles}>
        {sections.map((section) => <View key={section.dateKey} style={[styles.archiveDateBlock, !showArchiveDates && styles.archiveDateBlockWithoutHeading]}>
          {showArchiveDates && <Text style={styles.eyebrow}>{formatArchiveDate(section.dateKey).toUpperCase()}</Text>}
          {section.headings.map((heading) => {
            const collapsed = collapsedArchiveHeadings.has(heading.key);
            const headingSelected = heading.goals.every(archivedGoalFullySelected);
            const headingPartiallySelected = !headingSelected && heading.goals.some((goal) => archiveAction === 'complete'
              ? goal.aims.length === 0
                ? goalCompletionInDraft(goal, archiveCompletionDraft)
                : goal.aims.some((aim) => completionInDraft(aim.id, aim.completed, archiveCompletionDraft))
              : goal.emptyArchiveId
                ? selectedArchiveEmptyGroups.has(goal.emptyArchiveId)
                : selectedArchivedGoalKeys.has(goal.key) || goal.aims.some((aim) => selectedArchiveActive.has(aim.id)));
            return <View key={heading.key} style={styles.archiveHeadingSection}>
              <View style={styles.archiveHeadingRow}>
                {archiveSelectionMode && <SelectionCircle group selected={headingSelected} partial={headingPartiallySelected} label={`Select archived heading: ${heading.title}`} onPress={() => toggleArchivedHeading(heading)} colors={colors} action={archiveAction!} />}
                <Pressable accessibilityRole="button" accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} archived heading ${heading.title}`} accessibilityState={{ expanded: !collapsed }} onPress={() => toggleArchiveHeadingCollapsed(heading.key)} style={({ pressed }) => [styles.archiveHeadingTitleTarget, pressed && styles.collapseButtonPressed]}>
                  <Text style={styles.archiveHeadingTitle}>{heading.title}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} archived heading ${heading.title}`} accessibilityState={{ expanded: !collapsed }} onPress={() => toggleArchiveHeadingCollapsed(heading.key)} style={({ pressed }) => [styles.archiveHeadingCollapseButton, pressed && styles.collapseButtonPressed]}>
                  <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={19} color={colors.textMuted} accessible={false} />
                </Pressable>
              </View>
              {!collapsed && heading.goals.map((group, goalIndex) => {
                const count = group.aims.filter((aim) => selectedArchiveActive.has(aim.id)).length;
                const goalExplicitlySelected = selectedArchivedGoalKeys.has(group.key);
                const selectedGoal = archiveAction === 'complete' ? goalCompletionInDraft(group, archiveCompletionDraft) : group.emptyArchiveId ? selectedArchiveEmptyGroups.has(group.emptyArchiveId) : goalExplicitlySelected;
                const partiallySelectedGoal = !selectedGoal && (archiveAction === 'complete' ? group.aims.some((aim) => completionInDraft(aim.id, aim.completed, archiveCompletionDraft)) : goalExplicitlySelected || count > 0);
                const highlightGoalSteps = (archiveAction === 'archive' || archiveAction === 'delete') && selectedGoal;
                const groupCompleted = archiveAction === 'complete' ? goalCompletionInDraft(group, archiveCompletionDraft) : goalIsCompleted(group);
                const archiveStepSelectionVisible = archiveSelectionMode && archiveAction !== 'archive' && !(archiveAction === 'delete' && goalExplicitlySelected);
                const goalCollapsed = collapsedArchivedGoals.has(group.key);
                return <View key={group.key} style={[styles.archiveGroup, !archiveSelectionMode && hasCompletedArchivedGoal && styles.archiveGroupWithCompletionGutter]}>
                  {archiveSelectionMode && showSelectHeader && group.key === firstVisibleArchiveGoalKey && <View style={[styles.selectCue, styles.archiveSelectCue]}><Text style={styles.selectCueText}>Select</Text></View>}
                  <View style={styles.groupRow}>
                    {!archiveSelectionMode && groupCompleted && <CompletedGoalIndicator title={group.title} colors={colors} style={styles.completedGoalIndicator} />}
                    {archiveSelectionMode && <SelectionCircle group selected={selectedGoal} partial={partiallySelectedGoal} label={archiveAction === 'complete' ? `${selectedGoal ? 'Mark incomplete' : 'Mark complete'} archived goal: ${group.title}` : group.emptyArchiveId ? `Select empty archived goal: ${group.title}` : `Select archived goal: ${group.title}`} onPress={() => { if (group.emptyArchiveId) toggleArchivedEmptyGroup(group.emptyArchiveId); else toggleArchivedGroup(group); }} colors={colors} action={archiveAction!} />}
                    <View style={styles.goalNumberSlot} accessible={false}><Text style={styles.goalNumber}>{goalIndex + 1}.</Text></View>
                    {group.aims.length > 0
                      ? <Pressable accessibilityRole="button" accessibilityLabel={`${goalCollapsed ? 'Expand' : 'Collapse'} archived goal ${group.title}`} accessibilityState={{ expanded: !goalCollapsed }} onPress={() => toggleArchivedGoalCollapsed(group.key)} style={({ pressed }) => [styles.rowTextWrap, highlightGoalSteps && styles.selectedGroupTitle, pressed && styles.collapseButtonPressed]}><Text style={[styles.groupTitle, groupCompleted && styles.completedGroupTitle]}>{group.title}</Text></Pressable>
                      : <View style={[styles.rowTextWrap, highlightGoalSteps && styles.selectedGroupTitle]}><Text style={[styles.groupTitle, groupCompleted && styles.completedGroupTitle]}>{group.title}</Text></View>}
                    {group.aims.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`${goalCollapsed ? 'Expand' : 'Collapse'} archived goal ${group.title}`} accessibilityState={{ expanded: !goalCollapsed }} onPress={() => toggleArchivedGoalCollapsed(group.key)} style={({ pressed }) => [styles.collapseButton, pressed && styles.collapseButtonPressed]}><Feather name={goalCollapsed ? 'chevron-down' : 'chevron-up'} size={20} color={colors.textMuted} accessible={false} /></Pressable>}
                  </View>
                  {!goalCollapsed && <View>
                  {group.aims.map((aim, index) => <View key={aim.id} style={[styles.archiveAim, highlightGoalSteps && styles.selectedAimBlock]}>
                    <View style={[styles.aimRow, (archiveAction === 'complete' ? completionInDraft(aim.id, aim.completed, archiveCompletionDraft) : aim.completed) && styles.completedAimBlock, highlightGoalSteps && styles.selectedAimBlock, !archiveStepSelectionVisible && styles.rowWithoutSelection]}>
                      {archiveStepSelectionVisible && <SelectionCircle selected={archiveAction === 'complete' ? completionInDraft(aim.id, aim.completed, archiveCompletionDraft) : selectedArchiveActive.has(aim.id)} label={archiveAction === 'complete' ? `${completionInDraft(aim.id, aim.completed, archiveCompletionDraft) ? 'Mark incomplete' : 'Mark complete'} archived step: ${aim.text}` : `Select archived step: ${aim.text}`} onPress={() => toggleArchivedAim(aim.id)} colors={colors} action={archiveAction!} />}
                      <Text style={styles.aimNumber}>{goalIndex + 1}.{index + 1}</Text>
                      <View style={styles.rowTextWrap}><Text style={[styles.aimText, (archiveAction === 'complete' ? completionInDraft(aim.id, aim.completed, archiveCompletionDraft) : aim.completed) && styles.completedAimText]}>{aim.text}</Text></View>
                    </View>
                    {noteInput(aim.id, aim.text, aim.note, true, archiveStepSelectionVisible)}
                  </View>)}
                  </View>}
                </View>;
              })}
            </View>;
          })}
        </View>)}
        </SelectableContent>
      </ScrollView>
      <OrganizerDock open={archiveOrganizeOpen && state.archive.length > 0} canOpen={archivedIds.size + archivedEmptyGroupIds.size > 0} showLabel={showOrganizeHeader} enlargeWhenUnlabeled={largeUnlabeledOrganizerIcons.organize} onToggle={toggleArchiveOrganize} onClosed={finishArchiveOrganizeClose} colors={colors} styles={styles}>
        {archiveAction
          ? <ProcessActionButton action={archiveAction} archived showActionLabel={showOrganizerLabels[archiveAction]} showLabels={showOrganizerProcessLabels} enlargeWhenUnlabeled={largeUnlabeledOrganizerIcons[archiveAction]} count={archiveAction === 'complete' ? archiveCompletionChangeCount : archiveAction === 'archive' ? selectedArchivedGoals.length + selectedArchiveEmptyGroups.size : selectedArchiveActive.size + selectedArchiveEmptyGroups.size + selectedArchivedGoals.length} disabled={archiveAction === 'archive' ? !canUnarchiveSelection : archiveAction === 'complete' ? archiveCompletionChangeCount === 0 : selectedArchiveActive.size + selectedArchiveEmptyGroups.size + selectedArchivedGoals.length === 0} blocked={archiveAction === 'archive' && hasUnarchiveSelection && !canUnarchiveSelection} saveOnlyUncomplete={archiveAction === 'complete' && archiveNewCompletionCount === 0} onPress={() => { if (archiveAction !== 'complete') setPendingConfirmation(archiveAction); }} onSave={processArchiveAction} onCancel={cancelArchiveAction} colors={colors} styles={styles} />
          : <OrganizeActions archived onChoose={chooseArchiveAction} showLabels={showOrganizerLabels} enlargeWhenUnlabeled={largeUnlabeledOrganizerIcons} disabled={textEditing} colors={colors} styles={styles} />}
      </OrganizerDock>
    </> : <>
      <ScrollView style={styles.scroll} contentContainerStyle={[scrollContentStyle, styles.homeContent, { paddingBottom: organizerToggleHeight + (organizeOpen && groups.length > 0 ? ORGANIZER_MENU_HEIGHT + 20 : 24) }]} keyboardShouldPersistTaps={focusedNoteId ? 'never' : 'handled'} keyboardDismissMode="on-drag" scrollEnabled={!dragging && !aimPressHeld && !groupDragging} showsVerticalScrollIndicator={false}>
        <SelectableContent top={header} styles={styles}>
        <View style={styles.boardArea}>
          <View style={styles.listDivider} />
          {selectionMode && showSelectHeader && !textEditing && groups.length > 0 && <View style={[styles.selectCue, styles.activeSelectCue]}><Text style={styles.selectCueText}>Select</Text></View>}
          {groups.map((group, groupIndex) => {
            const count = group.aims.filter((aim) => selectedActive.has(aim.id)).length;
            const groupExplicitlySelected = selectedGroupIds.has(group.id);
            const groupSelected = activeAction === 'complete' ? goalCompletionInDraft(group, activeCompletionDraft) : group.aims.length === 0 ? selectedEmptyGroups.has(group.id) : groupExplicitlySelected;
            const groupPartiallySelected = group.aims.length > 0 && !groupSelected && (activeAction === 'complete' ? group.aims.some((aim) => completionInDraft(aim.id, aim.completed, activeCompletionDraft)) : groupExplicitlySelected || count > 0);
            const highlightGoalSteps = (activeAction === 'archive' || activeAction === 'delete') && groupSelected;
            const stepSelectionVisible = selectionMode && activeAction !== 'archive' && !(activeAction === 'delete' && groupExplicitlySelected);
            const groupCompleted = activeAction === 'complete' ? goalCompletionInDraft(group, activeCompletionDraft) : goalIsCompleted(group);
            const collapsed = collapsedGroups.has(group.id);
            const groupDrag = dragging?.groupId === group.id ? dragging : null;
            const sourceIndex = groupDrag ? group.aims.findIndex((aim) => aim.id === groupDrag.aimId) : -1;
            const previewTops = groupDrag ? previewAimTops(groupDrag.layouts, groupDrag.aimId, groupDrag.toIndex) : null;
            const isGroupDragging = groupDragging?.groupId === group.id;
            const isGroupDropTarget = groupDragging && !isGroupDragging && groupDragging.layouts[groupDragging.toIndex]?.id === group.id;
            const canDragGroup = collapsed && canReorderGroup(group);
            const newGoalEditing = editor?.kind === 'title' && editor.id === group.id && editor.isNew;
            const newStepEditing = editor?.kind === 'aim' && editor.isNew && group.aims.some((aim) => aim.id === editor.id);
            return <Animated.View key={group.id} collapsable={false} onLayout={(event) => registerGroupLayout(group.id, event)} style={[styles.group, !selectionMode && hasCompletedActiveGoal && styles.groupWithCompletionGutter, groupIndex === 0 && styles.firstGroup, isGroupDragging && styles.draggedGroup, isGroupDropTarget && styles.groupDropTarget, isGroupDragging && { transform: [{ translateY: groupDragOffset }] }]}>
              <Pressable accessible={false} onLongPress={canDragGroup ? (event) => beginGroupDrag(group, event) : undefined} onPressMove={(event) => moveGroupDrag(group.id, event)} onPressOut={() => finishGroupDrag(group.id)} delayLongPress={450} pressRetentionOffset={canDragGroup ? AIM_DRAG_RETENTION : undefined} style={styles.groupRow}>
                {!selectionMode && groupCompleted && !(editor?.kind === 'title' && editor.id === group.id) && <CompletedGoalIndicator title={group.title} colors={colors} style={styles.completedGoalIndicator} />}
                {editor?.kind === 'title' && editor.id === group.id
                  ? <Pressable accessibilityRole="button" accessibilityLabel={editor.isNew ? 'Cancel new goal' : `Cancel renaming ${group.title}`} onPressIn={() => cancelInlineEdit('title', group.id)} onPress={() => cancelInlineEdit('title', group.id)} style={({ pressed }) => [styles.groupCompletedButton, pressed && styles.cancelEditButtonPressed]}>
                    <Feather name="x" size={20} color={colors.textMuted} accessible={false} />
                  </Pressable>
                  : selectionMode
                  ? <SelectionCircle group selected={groupSelected} partial={groupPartiallySelected} label={activeAction === 'complete' ? `${groupSelected ? 'Mark incomplete' : 'Mark complete'} goal: ${group.title}` : group.aims.length === 0 ? `Select empty goal: ${group.title}` : `Select goal and its steps: ${group.title}`} onPress={() => toggleGroup(group)} colors={colors} action={activeAction!} />
                  : null}
                {!(editor?.kind === 'title' && editor.id === group.id) && <View style={styles.goalNumberSlot} accessible={false}><Text style={styles.goalNumber}>{groupIndex + 1}.</Text></View>}
                <View style={[styles.rowTextWrap, activeAction !== 'complete' && groupSelected && styles.selectedGroupTitle]}>
                  {editor?.kind === 'title' && editor.id === group.id
                    ? <View style={styles.inlineEditWrap}>
                      <TextInput key={`group-title-${group.id}`} value={value} onChangeText={(next) => { setValue(next); if (inlineEditRef.current?.kind === 'title' && inlineEditRef.current.id === group.id) inlineEditRef.current.value = next; }} onBlur={() => finishInlineEdit('title', group.id)} onSubmitEditing={() => finishInlineEdit('title', group.id)} placeholder="Name this goal..." placeholderTextColor={colors.textMuted} autoFocus maxLength={40} returnKeyType="done" enterKeyHint="done" submitBehavior="blurAndSubmit" underlineColorAndroid="transparent" style={[styles.groupTitle, groupCompleted && styles.completedGroupTitle, styles.groupTitleInput]} accessibilityLabel="Edit goal title" />
                      <Text style={styles.characterFooter}>{value.length} / 40</Text>
                    </View>
                    : <Pressable accessibilityRole="button" accessibilityLabel={`Rename goal: ${group.title}`} accessibilityHint={canDragGroup && !selectionMode ? 'Long press to reorder this collapsed goal' : undefined} accessibilityState={{ disabled: selectionMode }} disabled={selectionMode} onPress={() => openTitleEditor(group)} onLongPress={canDragGroup && !selectionMode ? (event) => beginGroupDrag(group, event) : undefined} onPressMove={(event) => moveGroupDrag(group.id, event)} onPressOut={() => finishGroupDrag(group.id)} delayLongPress={450} pressRetentionOffset={canDragGroup && !selectionMode ? AIM_DRAG_RETENTION : undefined} style={({ pressed }) => [styles.groupTitleEditTarget, pressed && styles.renameTargetPressed]}>
                      <Text selectable={false} style={[styles.groupTitle, groupCompleted && styles.completedGroupTitle]}>{group.title}</Text>
                    </Pressable>}
                  {showRelatedTags && group.restoredFromDateKey && <View style={styles.oldGroupMeta}>
                    <Text style={styles.oldGroupDate}>{formatOldAimDate(group.restoredFromDateKey)}</Text>
                    <View style={styles.oldGroupTag}><Text style={styles.oldGroupTagText}>Old</Text></View>
                  </View>}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${group.title}`} accessibilityState={{ expanded: !collapsed }} onPress={() => toggleGroupCollapsed(group.id)} style={({ pressed }) => [styles.collapseButton, pressed && styles.collapseButtonPressed]}>
                  <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={20} color={colors.textMuted} accessible={false} />
                </Pressable>
              </Pressable>
              {!collapsed && <View>
              <View collapsable={false} style={groupDrag && { height: groupDrag.listHeight }}>
              {group.aims.map((aim, index) => <AimBlock key={aim.id} id={aim.id} registerSlot={registerAimSlot} onLayout={({ nativeEvent }) => { aimHeights.current.set(aim.id, nativeEvent.layout.height); }} dragPress={group.aims.length > 1 ? { onLongPress: (event) => beginAimDrag(group, aim.id, event), onPressMove: (event) => moveAimDrag(group, aim.id, event), onPressOut: () => finishAimDrag(group, aim.id) } : undefined} style={[styles.aimBlock, selectedActive.has(aim.id) && !aim.completed && styles.selectedAimBlock, highlightGoalSteps && styles.selectedAimBlock]} draggedStyle={styles.draggedAim} draggedBorderStyle={styles.draggedAimBorder} dragging={groupDrag?.aimId === aim.id} previewActive={Boolean(groupDrag)} previewTop={previewTops?.get(aim.id) ?? 0} dragTop={dragTop}>
                <View style={[styles.aimRow, (activeAction === 'complete' ? completionInDraft(aim.id, aim.completed, activeCompletionDraft) : aim.completed) && styles.completedAimBlock, selectedActive.has(aim.id) && aim.completed && styles.selectedCompletedAimBlock, highlightGoalSteps && styles.selectedAimBlock, !stepSelectionVisible && styles.rowWithoutSelection]}>
                  {stepSelectionVisible && <SelectionCircle selected={activeAction === 'complete' ? completionInDraft(aim.id, aim.completed, activeCompletionDraft) : selectedActive.has(aim.id)} label={activeAction === 'complete' ? `${completionInDraft(aim.id, aim.completed, activeCompletionDraft) ? 'Mark incomplete' : 'Mark complete'} step: ${aim.text}` : `Select step: ${aim.text}`} onPress={() => toggleAim(aim.id)} dragPress={group.aims.length > 1 ? { onLongPress: (event) => beginAimDrag(group, aim.id, event), onPressMove: (event) => moveAimDrag(group, aim.id, event), onPressOut: () => finishAimDrag(group, aim.id) } : undefined} colors={colors} action={activeAction!} />}
                  {editor?.kind === 'aim' && editor.id === aim.id && editor.isNew
                    ? <Pressable accessibilityRole="button" accessibilityLabel="Cancel new step" onPressIn={() => cancelInlineEdit('aim', aim.id)} onPress={() => cancelInlineEdit('aim', aim.id)} hitSlop={10} style={({ pressed }) => [styles.aimNumberCancelButton, pressed && styles.cancelEditButtonPressed]}>
                      <Feather name="x" size={17} color={colors.textMuted} accessible={false} />
                    </Pressable>
                    : <Text style={styles.aimNumber}>{groupIndex + 1}.{(groupDrag ? previewIndex(index, sourceIndex, groupDrag.toIndex) : index) + 1}</Text>}
                  {editor?.kind === 'aim' && editor.id === aim.id
                    ? <View style={styles.inlineEditWrap}>
                      <TextInput key={`aim-text-${aim.id}`} value={value} onChangeText={(next) => { setValue(next); if (inlineEditRef.current?.kind === 'aim' && inlineEditRef.current.id === aim.id) inlineEditRef.current.value = next; }} onBlur={() => finishInlineEdit('aim', aim.id)} onSubmitEditing={() => finishInlineEdit('aim', aim.id)} placeholder="Write this step..." placeholderTextColor={colors.textMuted} autoFocus maxLength={100} returnKeyType="done" enterKeyHint="done" submitBehavior="blurAndSubmit" underlineColorAndroid="transparent" style={[styles.aimText, styles.inlineAimInput, aim.completed && styles.completedAimText]} accessibilityLabel="Edit step name" />
                      <Text style={styles.characterFooter}>{value.length} / 100</Text>
                    </View>
                    : <RenameLabel accessibilityLabel={`Rename step: ${aim.text}`} accessibilityHint={group.aims.length > 1 && !selectionMode ? 'Long press anywhere on this step to reorder' : undefined} disabled={selectionMode} onPress={() => openAimEditor(aim.id, aim.text)} onPressIn={group.aims.length > 1 && !selectionMode ? () => setAimPressHeld(true) : undefined} onLongPress={group.aims.length > 1 && !selectionMode ? (event) => beginAimDrag(group, aim.id, event) : undefined} onPressMove={(event) => moveAimDrag(group, aim.id, event)} onPressOut={() => finishAimDrag(group, aim.id)} style={styles.rowTextWrap} pressStyle={styles.aimRenameTarget} pressedStyle={styles.renameTargetPressed}><Text selectable={false} style={[styles.aimText, (activeAction === 'complete' ? completionInDraft(aim.id, aim.completed, activeCompletionDraft) : aim.completed) && styles.completedAimText]}>{aim.text}</Text></RenameLabel>}
                </View>
                {group.aims.length > 1 && focusedNoteId !== aim.id
                  ? aim.note
                    ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit note for ${aim.text}`} accessibilityState={{ disabled: selectionMode }} disabled={selectionMode} onPress={() => setFocusedNoteId(aim.id)} onLongPress={(event) => beginAimDrag(group, aim.id, event)} onPressMove={(event) => moveAimDrag(group, aim.id, event)} onPressOut={() => finishAimDrag(group, aim.id)} delayLongPress={450} pressRetentionOffset={AIM_DRAG_RETENTION} style={[stepSelectionVisible ? styles.noteWithSelection : styles.noteWithoutSelection, styles.noteInput]}><Text numberOfLines={3} style={styles.notePreviewText}>{aim.note}</Text></Pressable>
                    : textEditing || editingLocked ? null : <Pressable accessibilityRole="button" accessibilityLabel={`Add note for ${aim.text}`} onPress={() => setFocusedNoteId(aim.id)} onLongPress={(event) => beginAimDrag(group, aim.id, event)} onPressMove={(event) => moveAimDrag(group, aim.id, event)} onPressOut={() => finishAimDrag(group, aim.id)} delayLongPress={450} pressRetentionOffset={AIM_DRAG_RETENTION} style={[styles.addNoteButton, stepSelectionVisible ? styles.noteWithSelection : styles.noteWithoutSelection]}><Feather name="plus" size={13} color={colors.textMuted} accessible={false} /><Text style={styles.addNoteText}>Add note</Text></Pressable>
                  : noteInput(aim.id, aim.text, aim.note, false, stepSelectionVisible)}
              </AimBlock>)}
              </View>
              </View>}
              {!collapsed && !newGoalEditing && !newStepEditing && !textEditing && !editingLocked && group.aims.length < MAX_AIMS_PER_GROUP &&
                <PressFeedback label={`Add step to ${group.title}`} onPress={() => openAddAim(group)} style={[styles.boardButton, styles.addAimButton, group.aims.length > 0 && styles.compactAddAimButton, group.aims.length > 0 && stepSelectionVisible && styles.compactAddAimButtonWithSelection]}>
                  <Feather name="plus" size={group.aims.length > 0 ? 20 : 17} color={colors.accent} accessible={false} />
                  {group.aims.length === 0 && <Text style={styles.boardActionText}>Add step</Text>}
                </PressFeedback>}
            </Animated.View>;
          })}
          <Animated.View style={{ transform: [{ translateX: goalLimitShake }] }}>
            {!textEditing && !editingLocked && <PressFeedback label={groups.length >= MAX_GROUPS ? 'Goal list full; cannot add another goal' : 'Add goal'} onPress={openAddGroup} style={[styles.boardButton, styles.addGroupButton]}>
              <Feather name="plus" size={17} color={goalLimitError ? colors.danger : colors.accent} accessible={false} /><Text style={[styles.boardActionText, goalLimitError && styles.goalLimitErrorText]}>Add goal</Text>
            </PressFeedback>}
            {groups.length >= MAX_GROUPS && <Text accessibilityLiveRegion="polite" style={[styles.fullGoalMessage, goalLimitError && styles.goalLimitErrorText]}>Looks like you&apos;re over-encumbered.</Text>}
          </Animated.View>
        </View>
        </SelectableContent>
      </ScrollView>
      <OrganizerDock open={organizeOpen && groups.length > 0} canOpen={groups.length > 0} showLabel={showOrganizeHeader} enlargeWhenUnlabeled={largeUnlabeledOrganizerIcons.organize} onToggle={toggleOrganize} onClosed={finishActiveOrganizeClose} colors={colors} styles={styles}>
        {activeAction
          ? <ProcessActionButton action={activeAction} archived={false} showActionLabel={showOrganizerLabels[activeAction]} showLabels={showOrganizerProcessLabels} enlargeWhenUnlabeled={largeUnlabeledOrganizerIcons[activeAction]} count={activeAction === 'complete' ? activeCompletionChangeCount : activeAction === 'archive' ? selectedGoals.size + selectedEmptyGroups.size : selectedActive.size + selectedEmptyGroups.size + selectedGoals.size} disabled={activeAction === 'archive' ? !canArchiveSelection : activeAction === 'complete' ? activeCompletionChangeCount === 0 : selectedActive.size + selectedEmptyGroups.size + selectedGoals.size === 0} saveOnlyUncomplete={activeAction === 'complete' && activeNewCompletionCount === 0} onPress={() => { if (activeAction !== 'complete') setPendingConfirmation(activeAction); }} onSave={processActiveAction} onCancel={cancelActiveAction} colors={colors} styles={styles} />
          : <OrganizeActions archived={false} onChoose={chooseActiveAction} showLabels={showOrganizerLabels} enlargeWhenUnlabeled={largeUnlabeledOrganizerIcons} disabled={textEditing} colors={colors} styles={styles} />}
      </OrganizerDock>
    </>}
    <ConfirmOrganizerAction action={pendingConfirmation} archived={archiveView} onCancel={() => setPendingConfirmation(null)} onConfirm={() => { setPendingConfirmation(null); if (archiveView) processArchiveAction(); else processActiveAction(); }} colors={colors} styles={styles} />
  </View>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    homeContent: { flexGrow: 1 },
    boardArea: { flexGrow: 1, paddingTop: 10, paddingBottom: 30 },
    organizeScreenContent: { flexGrow: 1 },
    organizeListTouchArea: { flexGrow: 1 },
    listDivider: { borderBottomWidth: 1, borderBottomColor: colors.textMuted, opacity: 0.32, marginBottom: 10 },
    selectCue: { width: 44, alignItems: 'center' },
    activeSelectCue: { marginLeft: -2 },
    archiveSelectCue: { marginLeft: -8 },
    selectCueText: { fontFamily: fonts.sans.medium, fontSize: 10, lineHeight: 14, letterSpacing: 0.3, color: colors.accent },
    organizeActions: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    organizeActionButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 2 },
    organizeActionButtonWithoutLabel: { minHeight: 44 },
    organizeActionHeading: { fontFamily: fonts.sans.medium, fontSize: 11, lineHeight: 15, color: colors.text, textAlign: 'center' },
    organizeActionIcon: { width: 40, height: 34, alignItems: 'center', justifyContent: 'center' },
    group: { marginTop: 26, marginLeft: 0, paddingLeft: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
    groupWithCompletionGutter: { paddingLeft: 50 },
    firstGroup: { marginTop: 3 },
    groupRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -8 },
    completedGoalIndicator: { position: 'absolute', left: -44, top: '50%', marginTop: -22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    goalNumberSlot: { width: 28, height: 44, alignItems: 'center', justifyContent: 'center' },
    goalNumber: { fontFamily: fonts.sans.medium, fontSize: 14, color: colors.textMuted },
    draggedGroup: { zIndex: 10, elevation: 4, borderRadius: 12, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8 },
    groupDropTarget: { borderRadius: 12, backgroundColor: colors.surfaceMuted },
    rowWithoutSelection: { marginLeft: 0 },
    rowTextWrap: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    collapseButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    collapseButtonPressed: { backgroundColor: colors.surfaceMuted, opacity: 0.85 },
    groupCompletedButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    cancelEditButtonPressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
    renameTarget: { minHeight: 44, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 4 },
    aimRenameTarget: { minHeight: 44, maxWidth: '100%', alignSelf: 'flex-start', borderRadius: 12, justifyContent: 'center' },
    groupTitleEditTarget: { minHeight: 44, maxWidth: '100%', alignSelf: 'flex-start', borderRadius: 12, justifyContent: 'center' },
    groupTitleInput: { minHeight: 44, maxWidth: '100%', padding: 0, includeFontPadding: false },
    inlineEditWrap: { flex: 1 },
    characterFooter: { alignSelf: 'flex-end', marginTop: 3, marginRight: 4, fontFamily: fonts.sans.medium, fontSize: 10, color: colors.textMuted },
    renameTargetPressed: { backgroundColor: colors.surfaceMuted, opacity: 0.85 },
    groupTitle: { fontFamily: fonts.serif.regular, fontSize: 23, lineHeight: 31, color: colors.text },
    completedGroupTitle: { color: colors.sageText },
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
    aimNumber: { width: 36, fontFamily: fonts.sans.medium, fontSize: 13, lineHeight: 20, color: colors.textMuted },
    aimNumberCancelButton: { width: 36, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
    aimText: { fontFamily: fonts.sans.medium, fontSize: 15, lineHeight: 22, color: colors.text, flexShrink: 1 },
    inlineAimInput: { flex: 1, minHeight: 44, padding: 0, includeFontPadding: false },
    completedAimText: { color: colors.textMuted, textDecorationLine: 'line-through', textDecorationColor: colors.textMuted },
    noteEditWrap: { position: 'relative' },
    noteReadOnly: { minHeight: 35, maxHeight: 82, paddingTop: 3, paddingBottom: 8, paddingLeft: 3, marginRight: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
    noteInput: { fontFamily: fonts.sans.regular, fontSize: 13, lineHeight: 20, color: colors.textMuted, minHeight: 35, maxHeight: 82, paddingTop: 3, paddingBottom: 8, paddingLeft: 3, paddingRight: 38, marginRight: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
    noteCancelButton: { position: 'absolute', top: '50%', right: 0, width: 36, height: 44, marginTop: -22, alignItems: 'center', justifyContent: 'center' },
    notePreviewText: { fontFamily: fonts.sans.regular, fontSize: 13, lineHeight: 20, color: colors.textMuted },
    noteWithSelection: { marginLeft: 76 },
    noteWithoutSelection: { marginLeft: 28 },
    addNoteButton: { minHeight: 30, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, opacity: 0.78 },
    addNoteText: { fontFamily: fonts.sans.regular, fontSize: 12, color: colors.textMuted },
    boardButton: { minHeight: 44, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
    addAimButton: { marginLeft: 45, marginTop: 9, alignSelf: 'flex-start' },
    compactAddAimButton: { width: 44, marginLeft: 2, justifyContent: 'center', paddingHorizontal: 0 },
    compactAddAimButtonWithSelection: { marginLeft: 46 },
    addGroupButton: { marginTop: 20, alignSelf: 'flex-start' },
    boardActionText: { fontFamily: fonts.sans.medium, fontSize: 14, color: colors.accent },
    fullGoalMessage: { marginTop: 12, marginLeft: 4, fontFamily: fonts.sans.medium, fontSize: 12, lineHeight: 18, color: colors.textMuted },
    goalLimitErrorText: { color: colors.danger },
    organizerDock: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
    organizerDockMotion: { width: '100%' },
    organizerDockPanel: { height: ORGANIZER_MENU_HEIGHT, backgroundColor: colors.background, paddingHorizontal: 24, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
    organizerToggleFooter: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.line },
    organizerToggleButton: { minWidth: 72, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2 },
    organizerToggleLabel: { fontFamily: fonts.sans.medium, fontSize: 10, lineHeight: 14, color: colors.textMuted },
    organizerToggleIcon: { width: 44, height: 34, alignItems: 'center', justifyContent: 'center' },
    organizerToggleDisabled: { opacity: 0.4 },
    organizerTogglePressed: { opacity: 0.75, transform: [{ scale: 0.94 }] },
    processActionRow: { width: '100%', minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    cancelProcessButton: { position: 'absolute', left: 0, minWidth: 58, height: 58, alignItems: 'center', justifyContent: 'center', gap: 2 },
    processActionTitle: { flex: 1, fontFamily: fonts.sans.medium, fontSize: 14, textAlign: 'center', marginHorizontal: 64 },
    processTarget: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
    processActionLabel: { fontFamily: fonts.sans.medium, fontSize: 10, lineHeight: 14, color: colors.danger },
    saveProcessButton: { position: 'absolute', right: 0, minWidth: 58, height: 58, alignItems: 'center', justifyContent: 'center', gap: 2 },
    confirmOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: colors.backdrop },
    confirmCard: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
    confirmTitle: { fontFamily: fonts.serif.regular, fontSize: 22, lineHeight: 29, color: colors.text },
    confirmCopy: { marginTop: 6, fontFamily: fonts.sans.regular, fontSize: 13, color: colors.textMuted },
    confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 20 },
    confirmButton: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    confirmCancelText: { fontFamily: fonts.sans.medium, fontSize: 14, color: colors.textMuted },
    confirmActionText: { fontFamily: fonts.sans.semibold, fontSize: 14 },
    archiveContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 30, backgroundColor: colors.background },
    backButton: { width: 44, height: 44, justifyContent: 'center' },
    archiveTopRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center' },
    archiveTitleSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    archiveTopSpacer: { width: 44, height: 44 },
    archiveTitleEditTarget: { maxWidth: '100%', alignSelf: 'center', paddingHorizontal: 2, borderRadius: 10 },
    archiveTitle: { fontFamily: fonts.serif.regular, fontSize: 30, lineHeight: 40, color: colors.text, textAlign: 'center' },
    archiveTitleEditWrap: { width: '100%' },
    archiveTitleInput: { minHeight: 44, padding: 0, fontFamily: fonts.serif.regular, fontSize: 30, lineHeight: 40, color: colors.text, textAlign: 'center' },
    archiveTitleCharacterFooter: { alignSelf: 'flex-end', marginTop: 2, fontFamily: fonts.sans.medium, fontSize: 10, color: colors.textMuted },
    archiveDateBlock: { marginTop: 32 },
    archiveDateBlockWithoutHeading: { marginTop: 16 },
    eyebrow: { fontFamily: fonts.sans.medium, fontSize: 11, letterSpacing: 2, color: colors.accent },
    archiveHeadingSection: { marginTop: 14 },
    archiveHeadingRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.line, borderRadius: 10 },
    archiveHeadingTitleTarget: { flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: 10 },
    archiveHeadingTitle: { fontFamily: fonts.serif.regular, fontSize: 21, lineHeight: 29, color: colors.text },
    archiveHeadingCollapseButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    archiveGroup: { marginTop: 16, marginLeft: 0, paddingLeft: 16 },
    archiveGroupWithCompletionGutter: { paddingLeft: 60 },
    archiveAim: { marginTop: 10, paddingLeft: 14 },
  });
}
