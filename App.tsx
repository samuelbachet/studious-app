import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch as NativeSwitch, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import appConfig from './app.json';
import { AimBoardScreen } from './AimBoardScreen';
import type { OrganizerIconEnlargement, OrganizerLabelVisibility, OrganizerProcessLabelVisibility } from './AimBoardScreen';
import { addSeptember23ArchivePreview, addSeptember24ArchivePreview, addSeptember24HeadingPreview, DEFAULT_HOME_HEADLINE, emptyAimBoard, HOME_HEADLINE_MAX_LENGTH, restoreAimBoard, rollAimBoard, starterAimBoard } from './aimBoard';
import type { AimBoardState } from './aimBoard';
import { emptyAboutTapSequence, recordAboutTap } from './developerGesture';
import { DEFAULT_DISPLAY_NAME, DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName, restoreDisplayName } from './displayName';
import { STORAGE, STUDIOUS_RESET_KEYS } from './storageKeys';
import { EffectiveTheme, familyFor, GlassStyle, nextThemeMode, paletteFor, parseGlassStyle, parseThemeMode, parseThemePalette, resolveEffectiveTheme, temperatureFor, ThemeColors, ThemeFamily, ThemeMode, ThemePalette, ThemeTemperature, themePalettes, usesNativeGlass } from './theme';
import { fonts } from './typography';

void SplashScreen.preventAutoHideAsync();
if (Constants.expoGoConfig === null) {
  SplashScreen.setOptions({ duration: 300, fade: true });
}

type PrimaryScreen = 'Home' | 'Plan' | 'Focus' | 'Archive' | 'Settings';
type Screen = PrimaryScreen | 'About' | 'ArchiveRelaxations' | 'ArchivePlans' | 'ArchiveFocuses';
type ArchiveSection = 'Relaxations' | 'Plans' | 'Focuses';
type SettingsWidgetLabelVisibility = { minimalism: boolean; theme: boolean };
type SessionStatus = 'active' | 'paused' | 'completed' | 'ended';
type StudySession = { id: string; title: string; durationMinutes: number; startedAt: string; remainingSeconds: number; status: SessionStatus; lastResumedAt?: number; finishedAt?: string };
type ThemeContextValue = { themeMode: ThemeMode; glassAvailable: boolean; effectiveTheme: EffectiveTheme; themePalette: ThemePalette; glassStyle: GlassStyle; theme: ThemeColors; styles: ReturnType<typeof createStyles>; setThemeMode: (mode: ThemeMode) => void; setGlassScheme: (mode: EffectiveTheme) => void; setThemePalette: (palette: ThemePalette) => void; setGlassStyle: (style: GlassStyle) => void; openAppearance: () => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
function useAppTheme() { const context = useContext(ThemeContext); if (!context) throw new Error('Theme context is unavailable'); return context; }
const NAV_BAR_HEIGHT = 76;
const GREETING_FONT_SIZE = 16;
const GREETING_LINE_HEIGHT = 22;
const PREVIEW_SEED_KEY = 'studious.september23PreviewSeeded';
const SEPTEMBER24_HEADING_PREVIEW_KEY = 'studious.september24HeadingPreviewSeeded';
const DEFAULT_RELAX_HEADLINE = 'Steady your mind.';
const DEFAULT_FOCUS_HEADLINE = "Let's get to work.";

function restoreHomeHeadline(value: string | null): string {
  const clean = value?.trim();
  return clean && clean !== 'Aims' ? clean.slice(0, HOME_HEADLINE_MAX_LENGTH) : DEFAULT_HOME_HEADLINE;
}

function restoreSectionHeadline(value: string | null, fallback: string): string {
  return value?.trim().slice(0, HOME_HEADLINE_MAX_LENGTH) || fallback;
}

function boardStructureSignature(board: AimBoardState): string {
  return JSON.stringify([
    board.active.dateKey,
    board.active.heading,
    board.archiveTitle,
    board.active.groups.map((group) => [group.id, group.title, group.isDefault, group.restoredFromDateKey, group.restoredFromGroupId, group.emptyCompleted, group.aims.map((aim) => [aim.id, aim.text, aim.completed])]),
    board.archive.map((group) => [group.id, group.title, group.originalDateKey, group.archiveHeading, group.emptyCompleted, group.aims.map((aim) => [aim.id, aim.text, aim.completed])]),
  ]);
}
function isStoredSession(value: unknown): value is StudySession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Partial<StudySession>;
  return typeof session.id === 'string' && session.id.length > 0
    && typeof session.title === 'string' && session.title.trim().length > 0
    && typeof session.durationMinutes === 'number' && Number.isInteger(session.durationMinutes) && session.durationMinutes >= 1 && session.durationMinutes <= 180
    && typeof session.startedAt === 'string' && Number.isFinite(Date.parse(session.startedAt))
    && typeof session.finishedAt === 'string' && Number.isFinite(Date.parse(session.finishedAt))
    && (session.status === 'completed' || session.status === 'ended')
    && typeof session.remainingSeconds === 'number' && Number.isFinite(session.remainingSeconds);
}

function PressableScale({ children, onPress, style, accessibilityLabel, accessibilityHint, accessibilityState, disabled = false, glassSurface = false }: { children: React.ReactNode; onPress?: () => void; style?: object; accessibilityLabel?: string; accessibilityHint?: string; accessibilityState?: { selected?: boolean; expanded?: boolean }; disabled?: boolean; glassSurface?: boolean }) {
  const { themeMode, glassAvailable, effectiveTheme, glassStyle, theme, styles } = useAppTheme();
  const nativeGlass = glassSurface && usesNativeGlass(themeMode, glassAvailable);
  const systemGlass = themeMode === 'system';
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} accessibilityState={{ ...accessibilityState, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, nativeGlass && { backgroundColor: 'transparent' }, pressed && styles.pressed, disabled && styles.disabled]}>
    {nativeGlass && <GlassView pointerEvents="none" glassEffectStyle={systemGlass ? undefined : glassStyle === 'clear' ? 'clear' : 'regular'} colorScheme={systemGlass ? 'auto' : effectiveTheme} tintColor={systemGlass || glassStyle === 'clear' ? undefined : `${theme.accent}30`} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />}
    {children}
  </Pressable>;
}
function SectionLabel({ children }: { children: string }) { const { styles } = useAppTheme(); return <Text style={styles.sectionLabel}>{children}</Text>; }

function Switch(props: React.ComponentProps<typeof NativeSwitch>) {
  return <View style={{ width: 54, minHeight: 50, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
    <NativeSwitch {...props} style={[props.style, { alignSelf: 'center', marginVertical: 0, transform: Platform.OS === 'ios' ? [{ translateY: 2 }] : undefined }]} />
  </View>;
}

function ModalBackdrop({ children, onPressOutside }: { children: React.ReactNode; onPressOutside?: () => void }) {
  const { styles } = useAppTheme();
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.modalBackdrop}>
    {onPressOutside && <Pressable accessibilityRole="button" accessibilityLabel="Close settings menu" onPress={onPressOutside} style={StyleSheet.absoluteFill} />}
    {children}
  </SafeAreaView>;
}

function AppToast({ message }: { message: string }) {
  const { styles } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  return <View pointerEvents="none" style={[styles.toast, { bottom: NAV_BAR_HEIGHT + 16 + bottom }]}><Text style={styles.toastText}>{message}</Text></View>;
}

function FocusCirclesIcon({ size = 24, color }: { size?: number; color: string }) {
  const gradientId = useId().replace(/:/g, '');
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Defs>
      <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor={color} stopOpacity={1} />
        <Stop offset="35%" stopColor={color} stopOpacity={0.55} />
        <Stop offset="70%" stopColor={color} stopOpacity={0.22} />
        <Stop offset="100%" stopColor={color} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Circle cx={12} cy={12} r={10.5} fill={`url(#${gradientId})`} />
    <Circle cx={12} cy={12} r={10} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.2} />
    <Circle cx={12} cy={12} r={6.5} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={1.2} />
    <Circle cx={12} cy={12} r={3} fill="none" stroke={color} strokeOpacity={0.8} strokeWidth={1.2} />
    <Circle cx={12} cy={12} r={1.7} fill={color} />
  </Svg>;
}

function MinimalismIcon({ color, size = 21 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray="0.1 3.4" />
  </Svg>;
}

function BottomNavigation({ screen, onChange, showNavigationLabels, enlargeIcons }: { screen: PrimaryScreen; onChange: (screen: PrimaryScreen) => void; showNavigationLabels: boolean; enlargeIcons: boolean }) {
  const { themeMode, glassAvailable, effectiveTheme, glassStyle, theme: colors, styles } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const iconFrame = [styles.navIconFrame, enlargeIcons && { width: 40, height: 40 }];
  const items: { screen: PrimaryScreen; label: string }[] = [{ screen: 'Plan', label: 'Relax' }, { screen: 'Home', label: 'Plan' }, { screen: 'Focus', label: 'Focus' }, { screen: 'Archive', label: 'Archive' }, { screen: 'Settings', label: 'Settings' }];
  const navigationItems = items.map((item) => {
    const active = item.screen === screen;
    const iconColor = active ? colors.accent : colors.inactive;
    return <PressableScale key={item.screen} onPress={() => onChange(item.screen)} accessibilityLabel={`Open ${item.label}`} accessibilityState={{ selected: active }} style={[styles.navItem, { minWidth: 0, minHeight: enlargeIcons ? 68 : 58 }, active && { backgroundColor: usesNativeGlass(themeMode, glassAvailable) ? 'transparent' : colors.navigationSelectedBackground, borderRadius: 18 }]}>
      {item.screen === 'Home' ? <View style={iconFrame}><MaterialCommunityIcons name="playlist-edit" size={enlargeIcons ? 35 : 26} color={iconColor} accessible={false} /></View> : item.screen === 'Plan' ? <View style={iconFrame}><MaterialCommunityIcons name="meditation" size={enlargeIcons ? 36 : 27} color={iconColor} accessible={false} /></View> : item.screen === 'Focus' ? <FocusCirclesIcon size={enlargeIcons ? 35 : 24} color={iconColor} /> : item.screen === 'Archive' ? <View style={iconFrame}><MaterialCommunityIcons name="folder" size={enlargeIcons ? 35 : 25} color={iconColor} accessible={false} /></View> : <View style={iconFrame}><Feather name="settings" size={enlargeIcons ? 33 : 22} color={iconColor} accessible={false} /></View>}
      {showNavigationLabels && <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>}
    </PressableScale>;
  });
  const barStyle = [styles.navBar, { height: NAV_BAR_HEIGHT + bottom, paddingBottom: bottom }];
  return usesNativeGlass(themeMode, glassAvailable)
    ? <View style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: Math.max(bottom, 8), backgroundColor: colors.background }}><GlassView glassEffectStyle={themeMode === 'system' ? undefined : glassStyle === 'clear' ? 'clear' : 'regular'} colorScheme={themeMode === 'system' ? 'auto' : effectiveTheme} tintColor={themeMode === 'system' || glassStyle === 'clear' ? undefined : `${colors.accent}30`} style={[styles.navBar, { height: 68, paddingBottom: 0, paddingHorizontal: 4, backgroundColor: 'transparent', borderTopWidth: 0, borderRadius: 24 }]}>{navigationItems}</GlassView></View>
    : <View style={barStyle}>{navigationItems}</View>;
}

function ResetAppDataModal({ visible, busy, onCancel, onReset }: { visible: boolean; busy: boolean; onCancel: () => void; onReset: () => void }) {
  const { theme: colors, styles } = useAppTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <ModalBackdrop>
      <View style={styles.confirmCard}>
        <View style={styles.confirmIcon}><Feather name="trash-2" size={21} color={colors.accent} /></View>
        <Text style={styles.modalTitle}>Reset app data?</Text>
        <Text style={styles.modalCopy}>This will clear your goals and steps, study sessions, timer preferences, and local Studious data on this device.</Text>
        <View style={styles.modalActions}>
          <PressableScale onPress={onCancel} disabled={busy} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></PressableScale>
          <PressableScale onPress={onReset} disabled={busy} accessibilityLabel="Confirm reset app data" style={styles.resetConfirmButton}><Text style={styles.modalSaveText}>{busy ? 'Resetting...' : 'Reset'}</Text></PressableScale>
        </View>
      </View>
    </ModalBackdrop>
  </Modal>;
}

const appearanceChoices: { mode: ThemeMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { mode: 'system', label: 'System', icon: 'smartphone' },
  { mode: 'light', label: 'Light', icon: 'sun' },
  { mode: 'dark', label: 'Dark', icon: 'moon' },
  { mode: 'glass', label: 'Glass', icon: 'layers' },
];

function AppearanceOptions({ onSelected }: { onSelected?: () => void }) {
  const { themeMode, glassAvailable, effectiveTheme, setThemeMode, theme, styles } = useAppTheme();
  return <View>{appearanceChoices.filter((choice) => choice.mode !== 'glass' || glassAvailable).map((choice) => {
    const selected = themeMode === choice.mode;
    return <PressableScale key={choice.mode} onPress={() => { setThemeMode(choice.mode); onSelected?.(); }} accessibilityLabel={`${choice.label}${selected ? ', selected' : ''}`} style={[styles.appearanceOption, selected && styles.appearanceOptionSelected]}>
      <View style={styles.appearanceOptionLeading}>
        <Feather name={choice.icon} size={19} color={selected ? theme.accent : theme.textMuted} />
        <View style={{ flexShrink: 1 }}><Text style={styles.appearanceOptionText}>{choice.label}</Text>{choice.mode === 'glass' && <Text style={styles.appearanceHint}>Native iOS Glass with your chosen style</Text>}{selected && choice.mode === 'system' && <Text style={styles.appearanceHint}>{`Using ${effectiveTheme} appearance${glassAvailable ? '; iOS controls Glass style' : ''}`}</Text>}</View>
      </View>
      {selected && <Feather name="check" size={18} color={theme.accent} />}
    </PressableScale>;
  })}</View>;
}

const paletteChoices: { family: ThemeFamily; lightLabel: string; darkLabel: string; description: string }[] = [
  { family: 'classic', lightLabel: 'Classic Light', darkLabel: 'Classic Dark', description: 'Terracotta tones' },
  { family: 'sage', lightLabel: 'Sage Light', darkLabel: 'Sage Dark', description: 'Layered sage greens' },
  { family: 'ocean', lightLabel: 'Ocean Light', darkLabel: 'Ocean Dark', description: 'Ocean blues' },
  { family: 'plum', lightLabel: 'Plum Light', darkLabel: 'Plum Dark', description: 'Soft plum tones' },
  { family: 'equinox', lightLabel: 'Equinox Light', darkLabel: 'Equinox Dark', description: 'Teal canvas with amber tones' },
  { family: 'monochrome', lightLabel: 'Daylight', darkLabel: 'Midnight', description: 'Neutral monochrome' },
];

function ThemePaletteOptions({ mode }: { mode: EffectiveTheme }) {
  const { themeMode, effectiveTheme, themePalette, setThemeMode, setGlassScheme, setThemePalette, theme, styles } = useAppTheme();
  return <View style={{ paddingLeft: 8 }}>{paletteChoices.map((choice) => {
    const palette = paletteFor(choice.family, temperatureFor(themePalette));
    const preview = themePalettes[palette][mode];
    const selected = effectiveTheme === mode && familyFor(themePalette) === choice.family;
    const label = mode === 'light' ? choice.lightLabel : choice.darkLabel;
    return <PressableScale key={choice.family} onPress={() => { setThemePalette(palette); if (themeMode === 'glass') setGlassScheme(mode); else if (themeMode !== 'system' || effectiveTheme !== mode) setThemeMode(mode); }} accessibilityLabel={`${label} theme${selected ? ', selected' : ''}`} accessibilityState={{ selected }} style={[styles.appearanceOption, selected && styles.appearanceOptionSelected]}>
      <View style={styles.appearanceOptionLeading}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }} accessible={false}>
          <View style={{ width: 35, height: 27, borderRadius: 8, backgroundColor: preview.background, borderWidth: 1, borderColor: theme.line, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 23, height: 15, borderRadius: 4, backgroundColor: preview.surface, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: preview.accent }} />
            </View>
          </View>
        </View>
        <View style={{ flexShrink: 1 }}><Text style={styles.appearanceOptionText}>{label}</Text><Text style={styles.appearanceHint}>{choice.description}</Text></View>
      </View>
      {selected && <Feather name="check" size={18} color={theme.accent} accessible={false} />}
    </PressableScale>;
  })}</View>;
}

function AppearanceModal({ visible, onClose, minimalism, showPlanDate, onShowPlanDateChange, showNavigationLabels, onShowNavigationLabelsChange, showSettingsWidgetLabels, onShowSettingsWidgetLabelChange, largeUnlabeledIcons, onLargeUnlabeledIconsChange, showOrganizeHeader, onShowOrganizeHeaderChange, showSelectHeader, onShowSelectHeaderChange, showOrganizerLabels, onShowOrganizerLabelChange, showOrganizerProcessLabels, onShowOrganizerProcessLabelChange, showArchiveDates, onShowArchiveDatesChange, showRelatedTags, onShowRelatedTagsChange }: {
  visible: boolean;
  onClose: () => void;
  minimalism: boolean;
  showPlanDate: boolean;
  onShowPlanDateChange: (value: boolean) => void;
  showNavigationLabels: boolean;
  onShowNavigationLabelsChange: (value: boolean) => void;
  showSettingsWidgetLabels: SettingsWidgetLabelVisibility;
  onShowSettingsWidgetLabelChange: (key: keyof SettingsWidgetLabelVisibility, value: boolean) => void;
  largeUnlabeledIcons: boolean;
  onLargeUnlabeledIconsChange: (value: boolean) => void;
  showOrganizeHeader: boolean;
  onShowOrganizeHeaderChange: (value: boolean) => void;
  showSelectHeader: boolean;
  onShowSelectHeaderChange: (value: boolean) => void;
  showOrganizerLabels: OrganizerLabelVisibility;
  onShowOrganizerLabelChange: (key: keyof OrganizerLabelVisibility, value: boolean) => void;
  showOrganizerProcessLabels: OrganizerProcessLabelVisibility;
  onShowOrganizerProcessLabelChange: (key: keyof OrganizerProcessLabelVisibility, value: boolean) => void;
  showArchiveDates: boolean;
  onShowArchiveDatesChange: (value: boolean) => void;
  showRelatedTags: boolean;
  onShowRelatedTagsChange: (value: boolean) => void;
}) {
  const { themeMode, glassAvailable, glassStyle, setGlassStyle, themePalette, setThemePalette, effectiveTheme, theme, styles } = useAppTheme();
  const [expandedDisplay, setExpandedDisplay] = useState<'plan' | 'archive' | null>(null);
  const [expandedThemeGroup, setExpandedThemeGroup] = useState<EffectiveTheme | null>(null);
  const [glassStyleOpen, setGlassStyleOpen] = useState(false);
  const toggleDisplay = (section: 'plan' | 'archive') => {
    void Haptics.selectionAsync();
    setExpandedDisplay((current) => current === section ? null : section);
  };
  const toggleThemeGroup = (mode: EffectiveTheme) => {
    void Haptics.selectionAsync();
    setExpandedThemeGroup((current) => current === mode ? null : mode);
  };
  const appearanceStyles = useMemo(() => StyleSheet.create({
    card: { maxHeight: '88%' },
    scroll: { flexShrink: 1 },
    scrollContent: { paddingBottom: 4 },
    category: { fontFamily: fonts.sans.medium, color: theme.textMuted, fontSize: 11, letterSpacing: 1.2, marginTop: 20, marginBottom: 4 },
    subcategory: { fontFamily: fonts.sans.medium, color: theme.textMuted, fontSize: 12, marginTop: 16, marginBottom: 2 },
    detail: { fontFamily: fonts.sans.medium, color: theme.textMuted, fontSize: 11, marginTop: 12, marginBottom: 2, marginLeft: 8 },
    row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.control, borderRadius: 18, paddingLeft: 16, paddingRight: 8, marginTop: 8 },
    rowDisabled: { backgroundColor: theme.selectionSurface },
    label: { flex: 1, paddingRight: 12, fontFamily: fonts.sans.medium, color: theme.text, fontSize: 14 },
    labelDisabled: { color: theme.textMuted },
    minimalismNotice: { fontFamily: fonts.sans.semibold, color: theme.accent, fontSize: 11, letterSpacing: 0.9, marginTop: 20, marginBottom: 2 },
    displayOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.control, borderRadius: 18, paddingHorizontal: 16, marginTop: 16 },
    displayOptionText: { fontFamily: fonts.sans.semibold, color: theme.text, fontSize: 15 },
    displayContent: { paddingLeft: 8 },
    title: { flexShrink: 1, fontSize: 24, lineHeight: 31 },
    help: { fontFamily: fonts.sans.regular, color: theme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 5 },
    choiceRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    choice: { flex: 1, minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.control, alignItems: 'center', justifyContent: 'center' },
    choiceSelected: { borderColor: theme.accent, backgroundColor: theme.inputBackground },
    choiceText: { fontFamily: fonts.sans.medium, color: theme.text, fontSize: 13 },
    glassStyleContent: { paddingLeft: 8 },
  }), [theme]);
  const switchOffTrackColor = effectiveTheme === 'dark' ? theme.navigationSelectedBackground : theme.textMuted;
  const switchTrackColor = { false: switchOffTrackColor, true: theme.accent };
  const labelSwitchTrackColor = minimalism ? { false: effectiveTheme === 'dark' ? theme.navigationSelectedBackground : theme.line, true: theme.line } : switchTrackColor;
  const switchThumbColor = (value: boolean) => effectiveTheme === 'dark' ? (value ? theme.background : theme.text) : theme.surface;
  const labelSwitchThumbColor = (value: boolean) => minimalism ? theme.inactive : switchThumbColor(value);
  const labelSwitchBackgroundColor = minimalism ? labelSwitchTrackColor.false : switchOffTrackColor;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <ModalBackdrop onPressOutside={onClose}>
      <View style={[styles.appearanceModalCard, appearanceStyles.card]}>
        <View style={styles.modalHandle} />
        <View style={styles.appearanceModalHeader}>
          <Text style={[styles.modalTitle, appearanceStyles.title]}>Appearance Settings</Text>
          <PressableScale onPress={onClose} accessibilityLabel="Close appearance settings" style={styles.appearanceClose}><Feather name="x" size={20} color={theme.textMuted} /></PressableScale>
        </View>
        <ScrollView style={appearanceStyles.scroll} contentContainerStyle={appearanceStyles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.modalCopy}>Choose your colors and the amount of detail shown throughout Studious.</Text>
          <Text style={appearanceStyles.category}>MODE</Text>
          <Text style={appearanceStyles.help}>System follows your device. On supported iPhones, it also uses native Glass.</Text>
          <AppearanceOptions />
          {themeMode === 'system' && <Text style={appearanceStyles.help}>{`Applied now: ${effectiveTheme} · ${paletteChoices.find((choice) => choice.family === familyFor(themePalette))?.[effectiveTheme === 'light' ? 'lightLabel' : 'darkLabel'] ?? 'Classic'} · ${temperatureFor(themePalette)}${glassAvailable ? ' · native Glass (iOS-controlled)' : ''}`}</Text>}
          {themeMode === 'glass' && glassAvailable && <View>
            <PressableScale onPress={() => setGlassStyleOpen((current) => !current)} accessibilityLabel="Glass style" accessibilityHint="Choose clear or tinted native Glass" accessibilityState={{ expanded: glassStyleOpen }} style={appearanceStyles.displayOption}>
              <View><Text style={appearanceStyles.displayOptionText}>Glass style</Text><Text style={styles.appearanceHint}>{glassStyle === 'clear' ? 'Clear' : 'Tint'}</Text></View>
              <Feather name={glassStyleOpen ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textMuted} accessible={false} />
            </PressableScale>
            {glassStyleOpen && <View style={appearanceStyles.glassStyleContent}>
              {(['clear', 'tint'] as const).map((style) => <PressableScale key={style} onPress={() => setGlassStyle(style)} accessibilityLabel={`${style === 'clear' ? 'Clear' : 'Tint'} Glass style`} accessibilityState={{ selected: glassStyle === style }} style={[styles.appearanceOption, glassStyle === style && styles.appearanceOptionSelected]}>
                <View style={{ flexShrink: 1 }}><Text style={styles.appearanceOptionText}>{style === 'clear' ? 'Clear' : 'Tint'}</Text><Text style={styles.appearanceHint}>{style === 'clear' ? 'More transparent; best over varied content' : 'A gentle tint from your selected theme'}</Text></View>
                {glassStyle === style && <Feather name="check" size={18} color={theme.accent} accessible={false} />}
              </PressableScale>)}
            </View>}
          </View>}
          <Text style={appearanceStyles.category}>TEMPERATURE</Text>
          <Text style={appearanceStyles.help}>Adjust the canvas warmth without changing your theme.</Text>
          <View style={appearanceStyles.choiceRow}>{(['standard', 'warm', 'cool'] as ThemeTemperature[]).map((temperature) => <PressableScale key={temperature} onPress={() => setThemePalette(paletteFor(familyFor(themePalette), temperature))} accessibilityLabel={`${temperature} temperature`} accessibilityState={{ selected: temperatureFor(themePalette) === temperature }} style={[appearanceStyles.choice, temperatureFor(themePalette) === temperature && appearanceStyles.choiceSelected]}><Text style={appearanceStyles.choiceText}>{temperature[0].toUpperCase() + temperature.slice(1)}</Text></PressableScale>)}</View>
          <Text style={appearanceStyles.category}>THEMES</Text>
          <Text style={appearanceStyles.help}>Pick a color family. Temperature applies to every theme, including Glass.</Text>
          {(['light', 'dark'] as const).map((mode) => <View key={mode}>
            <PressableScale onPress={() => toggleThemeGroup(mode)} accessibilityLabel={`${mode === 'light' ? 'Light' : 'Dark'} themes`} accessibilityHint="Show or hide color palettes" accessibilityState={{ expanded: expandedThemeGroup === mode }} style={appearanceStyles.displayOption}>
              <Text style={appearanceStyles.displayOptionText}>{mode === 'light' ? 'Light themes' : 'Dark themes'}</Text>
              <Feather name={expandedThemeGroup === mode ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textMuted} accessible={false} />
            </PressableScale>
            {expandedThemeGroup === mode && <ThemePaletteOptions mode={mode} />}
          </View>)}
          <Text style={appearanceStyles.category}>DISPLAY</Text>
          <Text style={appearanceStyles.help}>Hide only the details you do not need. Minimalism temporarily hides all of them.</Text>
          {minimalism && <Text style={appearanceStyles.minimalismNotice}>Minimalism is on · individual choices are paused</Text>}
          <Text style={appearanceStyles.subcategory}>Bottom navigation</Text>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide button labels</Text>
            <Switch accessibilityLabel="Hide bottom navigation button labels" disabled={minimalism} value={minimalism || !showNavigationLabels} onValueChange={(hide) => onShowNavigationLabelsChange(!hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showNavigationLabels)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <Text style={appearanceStyles.subcategory}>Settings header</Text>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide Minimalism label</Text>
            <Switch accessibilityLabel="Hide Minimalism widget label in Settings" disabled={minimalism} value={minimalism || !showSettingsWidgetLabels.minimalism} onValueChange={(hide) => onShowSettingsWidgetLabelChange('minimalism', !hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showSettingsWidgetLabels.minimalism)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide Mode label</Text>
            <Switch accessibilityLabel="Hide Mode widget label in Settings" disabled={minimalism} value={minimalism || !showSettingsWidgetLabels.theme} onValueChange={(hide) => onShowSettingsWidgetLabelChange('theme', !hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showSettingsWidgetLabels.theme)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <Text style={appearanceStyles.subcategory}>Plan and Archive</Text>
          <PressableScale onPress={() => toggleDisplay('plan')} accessibilityLabel="Plan Display settings" accessibilityHint="Show or hide Plan Display settings" accessibilityState={{ expanded: expandedDisplay === 'plan' }} style={appearanceStyles.displayOption}>
            <Text style={appearanceStyles.displayOptionText}>Plan Display</Text>
            <Feather name={expandedDisplay === 'plan' ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textMuted} accessible={false} />
          </PressableScale>
          {expandedDisplay === 'plan' && <View style={appearanceStyles.displayContent}>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide current date above heading</Text>
            <Switch accessibilityLabel="Hide current date above Plan heading" disabled={minimalism} value={minimalism || !showPlanDate} onValueChange={(hide) => onShowPlanDateChange(!hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showPlanDate)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <Text style={appearanceStyles.subcategory}>Organizer</Text>
          <Text style={appearanceStyles.detail}>Menu</Text>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide Organize label</Text>
            <Switch accessibilityLabel="Hide bottom Organize button label" disabled={minimalism} value={minimalism || !showOrganizeHeader} onValueChange={(hide) => onShowOrganizeHeaderChange(!hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showOrganizeHeader)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <Text style={appearanceStyles.detail}>Actions</Text>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide Select header above goals</Text>
            <Switch accessibilityLabel="Hide Select header above the first selectable goal" disabled={minimalism} value={minimalism || !showSelectHeader} onValueChange={(hide) => onShowSelectHeaderChange(!hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showSelectHeader)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide Delete label</Text>
            <Switch accessibilityLabel="Hide Delete organizer label" disabled={minimalism} value={minimalism || !showOrganizerLabels.delete} onValueChange={(hide) => onShowOrganizerLabelChange('delete', !hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showOrganizerLabels.delete)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide Complete label</Text>
            <Switch accessibilityLabel="Hide Complete organizer label" disabled={minimalism} value={minimalism || !showOrganizerLabels.complete} onValueChange={(hide) => onShowOrganizerLabelChange('complete', !hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showOrganizerLabels.complete)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide Archive / Unarchive label</Text>
            <Switch accessibilityLabel="Hide Archive and Unarchive organizer label" disabled={minimalism} value={minimalism || !showOrganizerLabels.archive} onValueChange={(hide) => onShowOrganizerLabelChange('archive', !hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showOrganizerLabels.archive)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide Cancel label</Text>
            <Switch accessibilityLabel="Hide Cancel label above organizer cancel button" disabled={minimalism} value={minimalism || !showOrganizerProcessLabels.cancel} onValueChange={(hide) => onShowOrganizerProcessLabelChange('cancel', !hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showOrganizerProcessLabels.cancel)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide completion Save label</Text>
            <Switch accessibilityLabel="Hide Save label above completion save button" disabled={minimalism} value={minimalism || !showOrganizerProcessLabels.save} onValueChange={(hide) => onShowOrganizerProcessLabelChange('save', !hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showOrganizerProcessLabels.save)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          </View>}
          <PressableScale onPress={() => toggleDisplay('archive')} accessibilityLabel="Archive Display settings" accessibilityHint="Show or hide Archive Display settings" accessibilityState={{ expanded: expandedDisplay === 'archive' }} style={appearanceStyles.displayOption}>
            <Text style={appearanceStyles.displayOptionText}>Archive Display</Text>
            <Feather name={expandedDisplay === 'archive' ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textMuted} accessible={false} />
          </PressableScale>
          {expandedDisplay === 'archive' && <View style={appearanceStyles.displayContent}>
          <Text style={appearanceStyles.subcategory}>Plans</Text>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide archive dates</Text>
            <Switch accessibilityLabel="Hide date headings in Archive" disabled={minimalism} value={minimalism || !showArchiveDates} onValueChange={(hide) => onShowArchiveDatesChange(!hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showArchiveDates)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          <View style={[appearanceStyles.row, minimalism && appearanceStyles.rowDisabled]}>
            <Text style={[appearanceStyles.label, minimalism && appearanceStyles.labelDisabled]}>Hide related tags on active goals</Text>
            <Switch accessibilityLabel="Hide related Old tags on active goals" disabled={minimalism} value={minimalism || !showRelatedTags} onValueChange={(hide) => onShowRelatedTagsChange(!hide)} trackColor={labelSwitchTrackColor} thumbColor={labelSwitchThumbColor(!showRelatedTags)} ios_backgroundColor={labelSwitchBackgroundColor} />
          </View>
          </View>}
          <Text style={appearanceStyles.category}>ICONS</Text>
          <Text style={appearanceStyles.help}>Larger icons apply only where a label is hidden, including when Minimalism is on.</Text>
          <View style={appearanceStyles.row}>
            <Text style={appearanceStyles.label}>Larger icons without labels</Text>
            <Switch accessibilityLabel="Use larger icons wherever labels are hidden" value={largeUnlabeledIcons} onValueChange={onLargeUnlabeledIconsChange} trackColor={switchTrackColor} thumbColor={switchThumbColor(largeUnlabeledIcons)} ios_backgroundColor={switchOffTrackColor} />
          </View>
        </ScrollView>
      </View>
    </ModalBackdrop>
  </Modal>;
}

function DisplayNameModal({ visible, currentName, onClose, onSave }: { visible: boolean; currentName: string; onClose: () => void; onSave: (name: string) => void }) {
  const { theme: colors, styles, effectiveTheme } = useAppTheme();
  const [value, setValue] = useState(currentName);
  const [inputError, setInputError] = useState(false);
  const save = () => {
    const name = normalizeDisplayName(value);
    if (!name) { setInputError(true); return; }
    Keyboard.dismiss();
    void Haptics.selectionAsync();
    onSave(name);
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <ModalBackdrop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalEyebrow}>NICKNAME</Text>
          <Text style={styles.modalCopy}>What&apos;s your nickname?</Text>
          <TextInput value={value} onChangeText={(text) => { setValue(text); if (text.trim()) setInputError(false); }} placeholder="Enter your nickname..." placeholderTextColor={colors.textMuted} maxLength={DISPLAY_NAME_MAX_LENGTH} returnKeyType="done" enterKeyHint="done" submitBehavior="blurAndSubmit" onSubmitEditing={save} keyboardAppearance={effectiveTheme} style={[styles.nameInput, inputError && styles.inputShellError]} accessibilityLabel="Nickname" autoCapitalize="words" selectTextOnFocus />
          <Text style={{ alignSelf: 'flex-end', marginTop: 4, fontFamily: fonts.sans.medium, fontSize: 10, color: colors.textMuted }}>{value.length} / {DISPLAY_NAME_MAX_LENGTH}</Text>
          {inputError && <Text style={styles.modalError}>Enter a nickname to continue.</Text>}
          <View style={styles.modalActions}>
            <PressableScale onPress={() => { Keyboard.dismiss(); onClose(); }} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></PressableScale>
            <PressableScale onPress={save} style={styles.modalSaveButton}><Text style={styles.modalSaveText}>Save</Text></PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ModalBackdrop>
  </Modal>;
}

const primaryHeadingMetrics = { fontSize: 38, lineHeight: 48, letterSpacing: 0 } as const;

function HomeScreen({ headline, onHeadlineChange, board, onBoardChange, showPlanDate, showArchiveDates, showRelatedTags, showOrganizeHeader, showSelectHeader, showOrganizerLabels, showOrganizerProcessLabels, largeUnlabeledOrganizerIcons }: { headline: string; onHeadlineChange: (value: string) => void; board: AimBoardState; onBoardChange: (update: (current: AimBoardState) => AimBoardState) => AimBoardState; showPlanDate: boolean; showArchiveDates: boolean; showRelatedTags: boolean; showOrganizeHeader: boolean; showSelectHeader: boolean; showOrganizerLabels: OrganizerLabelVisibility; showOrganizerProcessLabels: OrganizerProcessLabelVisibility; largeUnlabeledOrganizerIcons: OrganizerIconEnlargement }) {
  const { theme: colors, styles, effectiveTheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const [headlineDraft, setHeadlineDraft] = useState<string | null>(null);
  const [selectionActive, setSelectionActive] = useState(false);
  const [headlineTapSize, setHeadlineTapSize] = useState<{ key: string; width: number } | null>(null);
  const headlineMeasureKey = `${headline}:${width}`;
  const [year, month, day] = board.active.dateKey.split('-').map(Number);
  const planDate = showPlanDate ? new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : null;
  const headlineEditRef = useRef<string | null>(null);
  const finishHeadlineEdit = () => {
    const draft = headlineEditRef.current;
    if (draft === null) return;
    headlineEditRef.current = null;
    setHeadlineDraft(null);
    const clean = draft.trim();
    if (clean && clean !== headline) onHeadlineChange(clean);
  };
  const cancelHeadlineEdit = () => {
    if (headlineEditRef.current === null) return;
    headlineEditRef.current = null;
    setHeadlineDraft(null);
    Keyboard.dismiss();
  };
  return <AimBoardScreen state={board} onChange={onBoardChange} colors={colors} effectiveTheme={effectiveTheme} scrollContentStyle={[styles.scrollContent, { paddingTop: 28 }]} showArchiveDates={showArchiveDates} showRelatedTags={showRelatedTags} showOrganizeHeader={showOrganizeHeader} showSelectHeader={showSelectHeader} showOrganizerLabels={showOrganizerLabels} showOrganizerProcessLabels={showOrganizerProcessLabels} largeUnlabeledOrganizerIcons={largeUnlabeledOrganizerIcons} headingEditing={headlineDraft !== null} onSelectionModeChange={setSelectionActive} header={<View style={{ width: '100%', position: 'relative' }}>
    {planDate && <Text style={{ position: 'absolute', top: -20, left: 0, right: 0, fontFamily: fonts.sans.semibold, color: colors.accent, fontSize: 12, lineHeight: 18, letterSpacing: 0.8, textAlign: 'center' }}>{planDate}</Text>}
    <View style={{ width: '100%', alignItems: 'center' }}>
      <View style={{ width: '100%', alignItems: 'center' }}>
        {headlineDraft !== null
          ? <>
            <View style={{ position: 'relative', width: '100%' }}>
              <TextInput value={headlineDraft} onChangeText={(next) => { headlineEditRef.current = next; setHeadlineDraft(next); }} onBlur={finishHeadlineEdit} onSubmitEditing={finishHeadlineEdit} autoFocus multiline returnKeyType="done" enterKeyHint="done" submitBehavior="blurAndSubmit" maxLength={HOME_HEADLINE_MAX_LENGTH} keyboardAppearance={effectiveTheme} underlineColorAndroid="transparent" accessibilityLabel="Edit home heading" style={[styles.headline, primaryHeadingMetrics, { width: '100%', paddingHorizontal: 44, paddingVertical: 0, textAlign: 'center', textAlignVertical: 'top' }]} />
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel heading edit" onPressIn={cancelHeadlineEdit} onPress={cancelHeadlineEdit} hitSlop={4} style={({ pressed }) => [{ position: 'absolute', top: '50%', left: 0, width: 44, height: 44, marginTop: -22, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6, transform: [{ scale: 0.92 }] }]}>
                <Feather name="x" size={20} color={colors.textMuted} accessible={false} />
              </Pressable>
            </View>
            <Text style={{ alignSelf: 'flex-end', marginTop: 3, fontFamily: fonts.sans.medium, fontSize: 10, color: colors.textMuted }}>{headlineDraft.length} / {HOME_HEADLINE_MAX_LENGTH}</Text>
          </>
          : <Pressable accessibilityRole="button" accessibilityLabel={`Edit heading: ${headline}`} accessibilityState={{ disabled: selectionActive }} disabled={selectionActive} onPress={() => { if (selectionActive) return; headlineEditRef.current = headline; setHeadlineDraft(headline); }} style={({ pressed }) => [{ alignSelf: 'center', maxWidth: '100%', width: headlineTapSize?.key === headlineMeasureKey ? headlineTapSize.width : undefined, borderRadius: 12 }, pressed && { backgroundColor: colors.surfaceMuted, opacity: 0.85 }]}>
            <Text onTextLayout={({ nativeEvent }) => { if (!nativeEvent.lines.length) return; const measuredWidth = Math.ceil(Math.max(...nativeEvent.lines.map((line) => line.width))) + 2; setHeadlineTapSize((current) => current?.key === headlineMeasureKey ? current : { key: headlineMeasureKey, width: measuredWidth }); }} style={[styles.headline, primaryHeadingMetrics, { textAlign: 'center' }]}>{headline}</Text>
          </Pressable>}
      </View>
    </View>
  </View>} />;
}

function EmptySettingsModal({ visible, onClose, section }: { visible: boolean; onClose: () => void; section: 'Planning' | 'Archive' }) {
  const { theme: colors, styles } = useAppTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <ModalBackdrop onPressOutside={onClose}>
      <View style={styles.appearanceModalCard}>
        <View style={styles.modalHandle} />
        <View style={styles.appearanceModalHeader}>
          <Text style={[styles.modalTitle, { flexShrink: 1, fontSize: 24, lineHeight: 31 }]}>{section} Settings</Text>
          <PressableScale onPress={onClose} accessibilityLabel={`Close ${section.toLowerCase()} settings`} style={styles.appearanceClose}><Feather name="x" size={20} color={colors.textMuted} /></PressableScale>
        </View>
        <Text style={[styles.modalCopy, { marginTop: 18 }]}>No additional settings yet.</Text>
      </View>
    </ModalBackdrop>
  </Modal>;
}

function ComingSoonScreen({ section, headline, onHeadlineChange, copy }: { section: 'Relax' | 'Focus'; headline: string; onHeadlineChange: (value: string) => void; copy: string }) {
  const { theme: colors, styles, effectiveTheme } = useAppTheme();
  const screenStyles = useMemo(() => StyleSheet.create({
    content: { flexGrow: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, alignItems: 'center' },
    headingRow: { width: '100%', alignItems: 'center' },
    headingEdit: { position: 'relative', width: '100%' },
    headingInput: { width: '100%', paddingHorizontal: 44, paddingVertical: 0, textAlign: 'center', textAlignVertical: 'top' },
    headingCancel: { position: 'absolute', top: '50%', left: 0, width: 44, height: 44, marginTop: -22, alignItems: 'center', justifyContent: 'center' },
    characterFooter: { alignSelf: 'flex-end', marginTop: 3, fontFamily: fonts.sans.medium, fontSize: 10, color: colors.textMuted },
    headingTarget: { alignSelf: 'center', maxWidth: '100%', borderRadius: 12 },
    headingText: { textAlign: 'center' },
    message: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', paddingBottom: 50 },
    body: { maxWidth: 330, fontFamily: fonts.serif.regular, fontSize: 24, lineHeight: 33, textAlign: 'center', color: colors.text },
    footer: { marginTop: 20, fontFamily: fonts.sans.medium, fontSize: 11, letterSpacing: 1.5, color: colors.textMuted },
  }), [colors]);
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const finishEdit = () => {
    const latest = draftRef.current;
    if (latest === null) return;
    draftRef.current = null;
    setDraft(null);
    const clean = latest.trim();
    if (clean && clean !== headline) onHeadlineChange(clean);
    Keyboard.dismiss();
  };
  const cancelEdit = () => {
    if (draftRef.current === null) return;
    draftRef.current = null;
    setDraft(null);
    Keyboard.dismiss();
  };
  return <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
    {draft !== null && <Pressable accessibilityRole="button" accessibilityLabel="Save heading edit" onPress={finishEdit} style={StyleSheet.absoluteFill} />}
    <View pointerEvents="box-none" style={screenStyles.headingRow}>
      {draft !== null
        ? <>
            <View style={screenStyles.headingEdit}>
              <TextInput value={draft} onChangeText={(next) => { draftRef.current = next; setDraft(next); }} onBlur={finishEdit} onSubmitEditing={finishEdit} autoFocus multiline returnKeyType="done" enterKeyHint="done" submitBehavior="blurAndSubmit" maxLength={HOME_HEADLINE_MAX_LENGTH} keyboardAppearance={effectiveTheme} underlineColorAndroid="transparent" accessibilityLabel={`Edit ${section} heading`} style={[styles.headline, primaryHeadingMetrics, screenStyles.headingInput]} />
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel heading edit" onPressIn={cancelEdit} onPress={cancelEdit} hitSlop={4} style={({ pressed }) => [screenStyles.headingCancel, pressed && styles.pressed]}><Feather name="x" size={20} color={colors.textMuted} accessible={false} /></Pressable>
            </View>
            <Text style={screenStyles.characterFooter}>{draft.length} / {HOME_HEADLINE_MAX_LENGTH}</Text>
          </>
        : <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${section} heading: ${headline}`} onPress={() => { draftRef.current = headline; setDraft(headline); }} style={({ pressed }) => [screenStyles.headingTarget, pressed && { backgroundColor: colors.surfaceMuted, opacity: 0.85 }]}><Text style={[styles.headline, primaryHeadingMetrics, screenStyles.headingText]}>{headline}</Text></Pressable>}
    </View>
    <View pointerEvents="none" style={screenStyles.message}>
      <Text style={screenStyles.body}>{copy}</Text>
      <Text style={screenStyles.footer}>Coming Soon</Text>
    </View>
  </ScrollView>;
}

function SettingsScreen({ developerMode, minimalism, showWidgetLabels, enlargeUnlabeledIcons, onToggleMinimalism, themeMode, effectiveTheme, onToggleTheme, onOpenAbout, onOpenPlanning, onOpenArchiveSettings, onResetPress }: { developerMode: boolean; minimalism: boolean; showWidgetLabels: SettingsWidgetLabelVisibility; enlargeUnlabeledIcons: boolean; onToggleMinimalism: () => void; themeMode: ThemeMode; effectiveTheme: EffectiveTheme; onToggleTheme: () => void; onOpenAbout: () => void; onOpenPlanning: () => void; onOpenArchiveSettings: () => void; onResetPress: () => void }) {
  const { glassAvailable, theme: colors, styles, openAppearance } = useAppTheme();
  const settingsStyles = useMemo(() => StyleSheet.create({
    content: { flexGrow: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
    header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerWidgets: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerWidget: { width: 44, minHeight: 44, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 3 },
    headerWidgetLabeled: { width: 70, minHeight: 62 },
    headerWidgetLabel: { fontFamily: fonts.sans.medium, fontSize: 10, lineHeight: 13, color: colors.textMuted },
    intro: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 14 },
    category: { marginTop: 22, marginBottom: 0 },
    rowCopy: { flexShrink: 1 },
    rowDetail: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  }), [colors]);
  return <ScrollView contentContainerStyle={settingsStyles.content} showsVerticalScrollIndicator={false}>
    <View style={settingsStyles.header}>
      <Text style={styles.greeting}>SETTINGS</Text>
      <View style={settingsStyles.headerWidgets}>
        <PressableScale onPress={onToggleMinimalism} accessibilityLabel={minimalism ? 'Turn Minimalism off' : 'Turn Minimalism on'} accessibilityHint="Globally hides labels, dates, and tags; individual hide choices return when turned off" accessibilityState={{ selected: minimalism }} style={[settingsStyles.headerWidget, showWidgetLabels.minimalism && settingsStyles.headerWidgetLabeled]}>
          {showWidgetLabels.minimalism && <Text style={settingsStyles.headerWidgetLabel}>Minimalism</Text>}
          <MinimalismIcon size={!showWidgetLabels.minimalism && enlargeUnlabeledIcons ? 27 : 21} color={minimalism ? colors.accent : colors.textMuted} />
        </PressableScale>
        <PressableScale onPress={onToggleTheme} accessibilityLabel={`Current mode: ${themeMode}. Switch to ${nextThemeMode(themeMode, glassAvailable)} mode`} accessibilityHint={glassAvailable ? 'Cycles through System, Light, Dark, and Glass modes' : 'Cycles through System, Light, and Dark modes'} style={[settingsStyles.headerWidget, showWidgetLabels.theme && settingsStyles.headerWidgetLabeled]}>
          {showWidgetLabels.theme && <Text style={settingsStyles.headerWidgetLabel}>Mode</Text>}
          <Feather name={themeMode === 'glass' ? 'layers' : themeMode === 'system' ? 'smartphone' : effectiveTheme === 'dark' ? 'moon' : 'sun'} size={!showWidgetLabels.theme && enlargeUnlabeledIcons ? 27 : 21} color={colors.accent} accessible={false} />
        </PressableScale>
      </View>
    </View>
    <Text style={settingsStyles.intro}>Make the app feel right for you. Appearance and display choices stay on this device.</Text>
    <View style={settingsStyles.category}><SectionLabel>LOOK & FEEL</SectionLabel></View>
    <PressableScale glassSurface onPress={openAppearance} accessibilityLabel="Appearance settings" style={styles.settingsRow}>
      <View style={styles.settingsRowLeading}><View style={styles.settingsIcon}><Feather name="sun" size={20} color={colors.sage} /></View><View style={settingsStyles.rowCopy}><Text style={styles.settingsRowText}>Appearance</Text><Text style={settingsStyles.rowDetail}>{themeMode === 'system' ? `System · ${effectiveTheme}${glassAvailable ? ' · iOS Glass' : ''}` : `${themeMode[0].toUpperCase() + themeMode.slice(1)} mode`} · colors and display</Text></View></View>
      <Feather name="chevron-right" size={19} color={colors.textMuted} />
    </PressableScale>
    <View style={settingsStyles.category}><SectionLabel>SECTIONS</SectionLabel></View>
    <PressableScale glassSurface onPress={onOpenPlanning} accessibilityLabel="Planning settings" style={styles.settingsRow}>
      <View style={styles.settingsRowLeading}><View style={styles.settingsIcon}><Feather name="calendar" size={20} color={colors.sage} /></View><View style={settingsStyles.rowCopy}><Text style={styles.settingsRowText}>Planning</Text><Text style={settingsStyles.rowDetail}>Plan-specific settings</Text></View></View>
      <Feather name="chevron-right" size={19} color={colors.textMuted} />
    </PressableScale>
    <PressableScale glassSurface onPress={onOpenArchiveSettings} accessibilityLabel="Archive settings" style={styles.settingsRow}>
      <View style={styles.settingsRowLeading}><View style={styles.settingsIcon}><Feather name="archive" size={20} color={colors.sage} /></View><View style={settingsStyles.rowCopy}><Text style={styles.settingsRowText}>Archive</Text><Text style={settingsStyles.rowDetail}>Archive-specific settings</Text></View></View>
      <Feather name="chevron-right" size={19} color={colors.textMuted} />
    </PressableScale>
    <View style={settingsStyles.category}><SectionLabel>APP</SectionLabel></View>
    <PressableScale glassSurface onPress={onOpenAbout} accessibilityLabel="About" accessibilityHint="View information about Studious" style={styles.settingsRow}>
      <View style={styles.settingsRowLeading}><View style={styles.settingsIcon}><Feather name="info" size={20} color={colors.sage} /></View><View style={settingsStyles.rowCopy}><Text style={styles.settingsRowText}>About</Text><Text style={settingsStyles.rowDetail}>Studious and its version</Text></View></View>
      <Feather name="chevron-right" size={19} color={colors.textMuted} />
    </PressableScale>
    {__DEV__ && developerMode && <View style={styles.developerSection}>
      <SectionLabel>DEVELOPER</SectionLabel>
      <PressableScale onPress={onResetPress} accessibilityLabel="Reset app data" style={styles.settingsRow}>
        <View style={styles.settingsRowLeading}><View style={styles.settingsIcon}><Feather name="trash-2" size={19} color={colors.accent} /></View><Text style={styles.resetRowText}>Reset app data</Text></View>
        <Feather name="chevron-right" size={19} color={colors.textMuted} />
      </PressableScale>
    </View>}
  </ScrollView>;
}

function ArchiveHubScreen({ onOpen }: { onOpen: (section: ArchiveSection) => void }) {
  const { theme: colors } = useAppTheme();
  const styles = useMemo(() => createArchiveStyles(colors), [colors]);
  const sections: { title: ArchiveSection; icon: keyof typeof Feather.glyphMap }[] = [
    { title: 'Relaxations', icon: 'sun' },
    { title: 'Plans', icon: 'list' },
    { title: 'Focuses', icon: 'target' },
  ];
  return <ScrollView contentContainerStyle={styles.archiveHubContent} showsVerticalScrollIndicator={false}>
    <Text accessibilityRole="header" style={styles.archiveHubTitle}>Archive</Text>
    <Text style={styles.archiveHubSubtitle}>Stuff saved for later.</Text>
    {sections.map(({ title, icon }) => <PressableScale key={title} glassSurface onPress={() => onOpen(title)} accessibilityLabel={`Open archived ${title}`} style={styles.archiveSectionRow}>
      <View style={styles.archiveSectionLeading}>
        <View style={styles.archiveSectionIcon}><Feather name={icon} size={21} color={colors.sage} accessible={false} /></View>
        <Text style={styles.archiveSectionText}>{title}</Text>
      </View>
      <Feather name="chevron-right" size={19} color={colors.textMuted} accessible={false} />
    </PressableScale>)}
  </ScrollView>;
}

function ArchiveEmptyScreen({ title, onBack }: { title: 'Relaxations' | 'Focuses'; onBack: () => void }) {
  const { theme: colors } = useAppTheme();
  const styles = useMemo(() => createArchiveStyles(colors), [colors]);
  return <View style={styles.archiveEmptyScreen}>
    <View style={styles.archiveEmptyHeader}>
      <PressableScale onPress={onBack} accessibilityLabel="Back to Archive" style={styles.archiveEmptyBack}><Feather name="arrow-left" size={21} color={colors.text} accessible={false} /></PressableScale>
      <Text accessibilityRole="header" style={styles.archiveEmptyTitle}>{title}</Text>
      <View style={styles.archiveEmptyBack} accessible={false} />
    </View>
  </View>;
}

function createArchiveStyles(colors: ThemeColors) {
  return StyleSheet.create({
    archiveHubContent: { flexGrow: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
    archiveHubTitle: { fontFamily: fonts.serif.regular, color: colors.text, ...primaryHeadingMetrics, textAlign: 'center', marginBottom: 4 },
    archiveHubSubtitle: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 16 },
    archiveSectionRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, marginTop: 12 },
    archiveSectionLeading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    archiveSectionIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface },
    archiveSectionText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 16 },
    archiveEmptyScreen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 28 },
    archiveEmptyHeader: { flexDirection: 'row', alignItems: 'center' },
    archiveEmptyBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    archiveEmptyTitle: { flex: 1, fontFamily: fonts.serif.regular, color: colors.text, fontSize: 31, lineHeight: 40, textAlign: 'center' },
  });
}

function AboutScreen({ onBack, onTitlePress }: { onBack: () => void; onTitlePress: () => void }) {
  const { theme: colors, styles } = useAppTheme();
  return <SafeAreaView edges={['bottom']} style={styles.aboutScreen}>
    <PressableScale onPress={onBack} accessibilityLabel="Back to Settings" style={styles.aboutBack}><Feather name="arrow-left" size={21} color={colors.text} /></PressableScale>
    <View style={styles.aboutIdentity}>
      <Pressable accessible={false} hitSlop={8} onPress={__DEV__ ? onTitlePress : undefined}><Text style={styles.aboutName}>Studious</Text></Pressable>
      <Text style={styles.aboutDescription}>The app for getting things done.</Text>
      <Text style={styles.aboutCreator}>Mana Labs</Text>
      <Text style={styles.aboutVersion}>Version {appConfig.expo.version}</Text>
    </View>
  </SafeAreaView>;
}
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.serif.regular]: require('./assets/fonts/SourceSerif4-Variable.ttf'),
    [fonts.sans.regular]: require('./assets/fonts/Inter-Regular.ttf'),
    [fonts.sans.medium]: require('./assets/fonts/Inter-Medium.ttf'),
    [fonts.sans.semibold]: require('./assets/fonts/Inter-SemiBold.ttf'),
  });
  const deviceScheme = useColorScheme();
  const glassAvailable = useMemo(() => Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable(), []);
  const [screen, setScreen] = useState<Screen>('Home');
  const [relaxHeadline, setRelaxHeadline] = useState(DEFAULT_RELAX_HEADLINE);
  const [focusHeadline, setFocusHeadline] = useState(DEFAULT_FOCUS_HEADLINE);
  const [displayName, setDisplayName] = useState(DEFAULT_DISPLAY_NAME);
  const [history, setHistory] = useState<StudySession[]>([]);
  const [boardState, setBoardState] = useState<AimBoardState>(() => emptyAimBoard());
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [archiveSettingsOpen, setArchiveSettingsOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [developerMode, setDeveloperMode] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetEpoch, setResetEpoch] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Native launch art follows the device scheme; this handoff follows the restored app palette.
  const [showStartupSplash, setShowStartupSplash] = useState(true);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [glassScheme, setGlassSchemeState] = useState<EffectiveTheme | null>(null);
  const [glassStyle, setGlassStyleState] = useState<GlassStyle>('tint');
  const [themePalette, setThemePaletteState] = useState<ThemePalette>('classic');
  const [minimalism, setMinimalism] = useState(false);
  const [showPlanDate, setShowPlanDate] = useState(true);
  const [showNavigationLabels, setShowNavigationLabels] = useState(true);
  const [showSettingsWidgetLabels, setShowSettingsWidgetLabels] = useState<SettingsWidgetLabelVisibility>({ minimalism: true, theme: true });
  const [largeUnlabeledNavigationIcons, setLargeUnlabeledNavigationIcons] = useState(true);
  const [showArchiveDates, setShowArchiveDates] = useState(true);
  const [showRelatedTags, setShowRelatedTags] = useState(true);
  const [showOrganizeHeader, setShowOrganizeHeader] = useState(true);
  const [showSelectHeader, setShowSelectHeader] = useState(true);
  const [showOrganizerLabels, setShowOrganizerLabels] = useState<OrganizerLabelVisibility>({ delete: true, complete: true, archive: true });
  const [showOrganizerProcessLabels, setShowOrganizerProcessLabels] = useState<OrganizerProcessLabelVisibility>({ cancel: true, save: true });
  const [largeUnlabeledOrganizerIcons, setLargeUnlabeledOrganizerIcons] = useState<OrganizerIconEnlargement>({ organize: true, delete: true, complete: true, archive: true });
  const aboutTapRef = useRef(emptyAboutTapSequence);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resettingRef = useRef(false);
  const pendingWritesRef = useRef<Set<Promise<unknown>>>(new Set());
  const boardStateRef = useRef(boardState);
  const boardWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const boardStructureRef = useRef<string | null>(null);
  const startupSplashHideStartedRef = useRef(false);
  const startupSplashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupSplashMountedRef = useRef(true);
  useEffect(() => { boardStateRef.current = boardState; }, [boardState]);

  const updateBoard = useCallback((update: (current: AimBoardState) => AimBoardState) => {
    const current = boardStateRef.current;
    const next = update(current);
    if (next === current) return current;
    boardStateRef.current = next;
    setBoardState(next);
    return next;
  }, []);

  const effectiveTheme = resolveEffectiveTheme(themeMode, deviceScheme, glassScheme ?? undefined);
  const theme = useMemo(() => themePalettes[themePalette][effectiveTheme], [themePalette, effectiveTheme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const visiblePlanDate = !minimalism && showPlanDate;
  const visibleNavigationLabels = !minimalism && showNavigationLabels;
  const visibleSettingsWidgetLabels = useMemo<SettingsWidgetLabelVisibility>(() => minimalism ? { minimalism: false, theme: false } : showSettingsWidgetLabels, [minimalism, showSettingsWidgetLabels]);
  const visibleArchiveDates = !minimalism && showArchiveDates;
  const visibleRelatedTags = !minimalism && showRelatedTags;
  const visibleOrganizeHeader = !minimalism && showOrganizeHeader;
  const visibleSelectHeader = !minimalism && showSelectHeader;
  const visibleOrganizerLabels = useMemo<OrganizerLabelVisibility>(() => minimalism ? { delete: false, complete: false, archive: false } : showOrganizerLabels, [minimalism, showOrganizerLabels]);
  const visibleOrganizerProcessLabels = useMemo<OrganizerProcessLabelVisibility>(() => minimalism ? { cancel: false, save: false } : showOrganizerProcessLabels, [minimalism, showOrganizerProcessLabels]);
  const largeUnlabeledIcons = largeUnlabeledNavigationIcons && Object.values(largeUnlabeledOrganizerIcons).every(Boolean);
  const effectiveOrganizerIconSizes = useMemo<OrganizerIconEnlargement>(() => ({ organize: largeUnlabeledIcons, delete: largeUnlabeledIcons, complete: largeUnlabeledIcons, archive: largeUnlabeledIcons }), [largeUnlabeledIcons]);
  const setAllLargeUnlabeledIcons = (value: boolean) => {
    const organizer: OrganizerIconEnlargement = { organize: value, delete: value, complete: value, archive: value };
    setLargeUnlabeledNavigationIcons(value);
    setLargeUnlabeledOrganizerIcons(organizer);
  };
  const setThemeMode = useCallback((mode: ThemeMode) => {
    if (mode === 'glass' && !glassAvailable) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mode === 'glass') setGlassSchemeState(effectiveTheme);
    setThemeModeState(mode);
  }, [effectiveTheme, glassAvailable]);
  const openAppearance = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAppearanceOpen(true);
  }, []);
  const openPlanning = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlanningOpen(true);
  }, []);
  const openArchiveSettings = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setArchiveSettingsOpen(true);
  }, []);
  const themeValue = useMemo(() => ({ themeMode, glassAvailable, effectiveTheme, themePalette, glassStyle, theme, styles, setThemeMode, setGlassScheme: setGlassSchemeState, setThemePalette: setThemePaletteState, setGlassStyle: setGlassStyleState, openAppearance }), [themeMode, glassAvailable, effectiveTheme, themePalette, glassStyle, theme, styles, setThemeMode, openAppearance]);

  const trackWrite = useCallback((write: Promise<unknown>) => {
    pendingWritesRef.current.add(write);
    void write.then(() => pendingWritesRef.current.delete(write), () => pendingWritesRef.current.delete(write));
  }, []);
  const persistBoard = useCallback((value: AimBoardState) => {
    const write = boardWriteQueueRef.current.then(() => AsyncStorage.setItem(STORAGE.aimBoard, JSON.stringify(value)));
    boardWriteQueueRef.current = write.catch(() => undefined);
    trackWrite(write);
  }, [trackWrite]);
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => { setToast(null); toastTimerRef.current = null; }, 2200);
  }, []);
  const goBackFromAbout = useCallback(() => {
    aboutTapRef.current = emptyAboutTapSequence;
    setScreen('Settings');
  }, []);
  const openAbout = useCallback(() => {
    aboutTapRef.current = emptyAboutTapSequence;
    setScreen('About');
  }, []);
  const onAboutTitlePress = useCallback(() => {
    if (!__DEV__) return;
    const result = recordAboutTap(aboutTapRef.current, Date.now());
    aboutTapRef.current = result.sequence;
    if (result.unlocked) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDeveloperMode(!developerMode);
      showToast(developerMode ? 'Developer mode disabled' : 'Developer mode enabled');
    }
  }, [developerMode, showToast]);
  useEffect(() => {
    if (screen !== 'About') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { goBackFromAbout(); return true; });
    return () => subscription.remove();
  }, [goBackFromAbout, screen]);
  useEffect(() => {
    if (screen !== 'ArchiveRelaxations' && screen !== 'ArchiveFocuses') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setScreen('Archive'); return true; });
    return () => subscription.remove();
  }, [screen]);
  useEffect(() => {
    startupSplashMountedRef.current = true;
    return () => {
      startupSplashMountedRef.current = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (startupSplashTimerRef.current) clearTimeout(startupSplashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE.displayName),
      AsyncStorage.getItem(STORAGE.homeHeadline),
      AsyncStorage.getItem(STORAGE.relaxHeadline),
      AsyncStorage.getItem(STORAGE.focusHeadline),
      AsyncStorage.getItem(STORAGE.history),
      AsyncStorage.getItem(STORAGE.aimBoard),
      __DEV__ ? AsyncStorage.getItem(PREVIEW_SEED_KEY) : Promise.resolve(null),
      __DEV__ ? AsyncStorage.getItem(SEPTEMBER24_HEADING_PREVIEW_KEY) : Promise.resolve(null),
      AsyncStorage.getItem(STORAGE.theme),
      AsyncStorage.getItem(STORAGE.glassScheme),
      AsyncStorage.getItem(STORAGE.glassStyle),
      AsyncStorage.getItem(STORAGE.themePalette),
      AsyncStorage.getItem(STORAGE.legacyTheme),
      __DEV__ ? AsyncStorage.getItem(STORAGE.developer) : Promise.resolve(null),
      AsyncStorage.getItem(STORAGE.minimalism),
      AsyncStorage.getItem(STORAGE.planDate),
      AsyncStorage.getItem(STORAGE.archiveDates),
      AsyncStorage.getItem(STORAGE.relatedTags),
      AsyncStorage.getItem(STORAGE.organizeHeader),
      AsyncStorage.getItem(STORAGE.selectHeader),
      AsyncStorage.getItem(STORAGE.organizerDeleteLabel),
      AsyncStorage.getItem(STORAGE.organizerCompleteLabel),
      AsyncStorage.getItem(STORAGE.organizerArchiveLabel),
      AsyncStorage.getItem(STORAGE.organizerCancelLabel),
      AsyncStorage.getItem(STORAGE.organizerSaveLabel),
      AsyncStorage.getItem(STORAGE.navigationLabels),
      AsyncStorage.getItem(STORAGE.settingsMinimalismLabel),
      AsyncStorage.getItem(STORAGE.settingsThemeLabel),
      AsyncStorage.getItem(STORAGE.navigationIconSize),
      AsyncStorage.getItem(STORAGE.organizeIconSize),
      AsyncStorage.getItem(STORAGE.organizerDeleteIconSize),
      AsyncStorage.getItem(STORAGE.organizerCompleteIconSize),
      AsyncStorage.getItem(STORAGE.organizerArchiveIconSize),
    ]).then(async ([storedDisplayName, storedHomeHeadline, storedRelaxHeadline, storedFocusHeadline, storedHistory, storedBoard, previewSeeded, headingPreviewSeeded, storedTheme, storedGlassScheme, storedGlassStyle, storedThemePalette, legacyTheme, storedDeveloperMode, storedMinimalism, storedPlanDate, storedArchiveDates, storedRelatedTags, storedOrganizeHeader, storedSelectHeader, storedOrganizerDeleteLabel, storedOrganizerCompleteLabel, storedOrganizerArchiveLabel, storedOrganizerCancelLabel, storedOrganizerSaveLabel, storedNavigationLabels, storedSettingsMinimalismLabel, storedSettingsThemeLabel, storedNavigationIconSize, storedOrganizeIconSize, storedOrganizerDeleteIconSize, storedOrganizerCompleteIconSize, storedOrganizerArchiveIconSize]) => {
      let restoredBoard = restoreAimBoard(storedBoard, new Date(), restoreHomeHeadline(storedHomeHeadline));
      if (__DEV__ && previewSeeded !== 'reset' && previewSeeded !== 'archive-v3') {
        if (previewSeeded !== 'archive-v2') restoredBoard = addSeptember23ArchivePreview(restoredBoard);
        restoredBoard = addSeptember24ArchivePreview(restoredBoard);
        await AsyncStorage.setItem(STORAGE.aimBoard, JSON.stringify(restoredBoard));
        await AsyncStorage.setItem(PREVIEW_SEED_KEY, 'archive-v3');
      }
      if (__DEV__ && headingPreviewSeeded === null) {
        restoredBoard = addSeptember24HeadingPreview(restoredBoard);
        await AsyncStorage.setItem(STORAGE.aimBoard, JSON.stringify(restoredBoard));
        await AsyncStorage.setItem(SEPTEMBER24_HEADING_PREVIEW_KEY, 'seeded');
      }
      boardStateRef.current = restoredBoard;
      setBoardState(restoredBoard);
      setDisplayName(restoreDisplayName(storedDisplayName));
      setRelaxHeadline(restoreSectionHeadline(storedRelaxHeadline, DEFAULT_RELAX_HEADLINE));
      setFocusHeadline(restoreSectionHeadline(storedFocusHeadline, DEFAULT_FOCUS_HEADLINE));
      setMinimalism(storedMinimalism === 'true');
      setShowPlanDate(storedPlanDate !== 'false');
      setShowArchiveDates(storedArchiveDates !== 'false');
      setShowRelatedTags(storedRelatedTags !== 'false');
      setShowOrganizeHeader(storedOrganizeHeader !== 'false');
      setShowSelectHeader(storedSelectHeader !== 'false');
      setShowOrganizerLabels({ delete: storedOrganizerDeleteLabel !== 'false', complete: storedOrganizerCompleteLabel !== 'false', archive: storedOrganizerArchiveLabel !== 'false' });
      setShowOrganizerProcessLabels({ cancel: storedOrganizerCancelLabel !== 'false', save: storedOrganizerSaveLabel !== 'false' });
      setShowNavigationLabels(storedNavigationLabels !== 'false');
      setShowSettingsWidgetLabels({ minimalism: storedSettingsMinimalismLabel !== 'false', theme: storedSettingsThemeLabel !== 'false' });
      setLargeUnlabeledNavigationIcons(storedNavigationIconSize !== 'false');
      setLargeUnlabeledOrganizerIcons({ organize: storedOrganizeIconSize !== 'false', delete: storedOrganizerDeleteIconSize !== 'false', complete: storedOrganizerCompleteIconSize !== 'false', archive: storedOrganizerArchiveIconSize !== 'false' });
      if (__DEV__ && storedDeveloperMode === 'true') setDeveloperMode(true);
      let restoredHistory: StudySession[] = [];
      if (storedHistory) {
        try {
          const parsed: unknown = JSON.parse(storedHistory);
          if (Array.isArray(parsed)) restoredHistory = parsed.filter(isStoredSession).slice(0, 20);
        } catch { /* ignore malformed local data */ }
      }
      setHistory(restoredHistory);
      const hasValidCurrentMode = storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'glass';
      const restoredMode = parseThemeMode(hasValidCurrentMode ? storedTheme : legacyTheme, glassAvailable);
      setThemeModeState(restoredMode);
      setGlassSchemeState(storedGlassScheme === 'light' || storedGlassScheme === 'dark' ? storedGlassScheme : null);
      setGlassStyleState(parseGlassStyle(storedGlassStyle));
      setThemePaletteState(parseThemePalette(storedThemePalette));
      if (legacyTheme !== null) {
        if (!hasValidCurrentMode) await AsyncStorage.setItem(STORAGE.theme, restoredMode);
        await AsyncStorage.removeItem(STORAGE.legacyTheme);
      }
    }).catch((error: unknown) => {
      if (__DEV__) console.warn('Could not restore local preferences:', error);
    }).finally(() => setReady(true));
  }, [glassAvailable]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(displayName === DEFAULT_DISPLAY_NAME ? AsyncStorage.removeItem(STORAGE.displayName) : AsyncStorage.setItem(STORAGE.displayName, displayName)); }, [displayName, ready, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.relaxHeadline, relaxHeadline)); }, [ready, relaxHeadline, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.focusHeadline, focusHeadline)); }, [ready, focusHeadline, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.history, JSON.stringify(history.slice(0, 20)))); }, [history, ready, trackWrite]);
  useEffect(() => {
    if (!ready || resettingRef.current) return undefined;
    const structure = boardStructureSignature(boardState);
    if (structure !== boardStructureRef.current) {
      boardStructureRef.current = structure;
      persistBoard(boardStateRef.current);
      return undefined;
    }
    const timer = setTimeout(() => { boardWriteTimerRef.current = null; persistBoard(boardStateRef.current); }, 350);
    boardWriteTimerRef.current = timer;
    return () => { clearTimeout(timer); if (boardWriteTimerRef.current === timer) boardWriteTimerRef.current = null; };
  }, [boardState, ready, persistBoard]);
  useEffect(() => {
    if (!ready) return undefined;
    const checkDay = () => {
      const current = boardStateRef.current;
      const next = rollAimBoard(current);
      if (next === current) return;
      boardStateRef.current = next;
      setBoardState(next);
    };
    const interval = setInterval(checkDay, 60_000);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') checkDay();
      else if (!resettingRef.current) {
        if (boardWriteTimerRef.current) clearTimeout(boardWriteTimerRef.current);
        boardWriteTimerRef.current = null;
        persistBoard(boardStateRef.current);
      }
    });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [ready, persistBoard]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.theme, themeMode)); }, [ready, themeMode, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current && glassScheme) trackWrite(AsyncStorage.setItem(STORAGE.glassScheme, glassScheme)); }, [ready, glassScheme, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.glassStyle, glassStyle)); }, [ready, glassStyle, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.themePalette, themePalette)); }, [ready, themePalette, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.minimalism, String(minimalism))); }, [ready, minimalism, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.planDate, String(showPlanDate))); }, [ready, showPlanDate, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.navigationLabels, String(showNavigationLabels))); }, [ready, showNavigationLabels, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.settingsMinimalismLabel, String(showSettingsWidgetLabels.minimalism))); }, [ready, showSettingsWidgetLabels.minimalism, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.settingsThemeLabel, String(showSettingsWidgetLabels.theme))); }, [ready, showSettingsWidgetLabels.theme, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.navigationIconSize, String(largeUnlabeledNavigationIcons))); }, [ready, largeUnlabeledNavigationIcons, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.archiveDates, String(showArchiveDates))); }, [ready, showArchiveDates, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.relatedTags, String(showRelatedTags))); }, [ready, showRelatedTags, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizeHeader, String(showOrganizeHeader))); }, [ready, showOrganizeHeader, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.selectHeader, String(showSelectHeader))); }, [ready, showSelectHeader, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizerDeleteLabel, String(showOrganizerLabels.delete))); }, [ready, showOrganizerLabels.delete, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizerCompleteLabel, String(showOrganizerLabels.complete))); }, [ready, showOrganizerLabels.complete, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizerArchiveLabel, String(showOrganizerLabels.archive))); }, [ready, showOrganizerLabels.archive, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizerCancelLabel, String(showOrganizerProcessLabels.cancel))); }, [ready, showOrganizerProcessLabels.cancel, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizerSaveLabel, String(showOrganizerProcessLabels.save))); }, [ready, showOrganizerProcessLabels.save, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizeIconSize, String(largeUnlabeledOrganizerIcons.organize))); }, [ready, largeUnlabeledOrganizerIcons.organize, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizerDeleteIconSize, String(largeUnlabeledOrganizerIcons.delete))); }, [ready, largeUnlabeledOrganizerIcons.delete, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizerCompleteIconSize, String(largeUnlabeledOrganizerIcons.complete))); }, [ready, largeUnlabeledOrganizerIcons.complete, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.organizerArchiveIconSize, String(largeUnlabeledOrganizerIcons.archive))); }, [ready, largeUnlabeledOrganizerIcons.archive, trackWrite]);
  useEffect(() => { if (__DEV__ && ready && !resettingRef.current) trackWrite(developerMode ? AsyncStorage.setItem(STORAGE.developer, 'true') : AsyncStorage.removeItem(STORAGE.developer)); }, [developerMode, ready, trackWrite]);
  useEffect(() => { if (resetEpoch > 0) resettingRef.current = false; }, [resetEpoch]);
  useEffect(() => { if (__DEV__ && fontError) console.warn('Local fonts failed to load:', fontError); }, [fontError]);
  const onStartupSplashLayout = useCallback(() => {
    if (startupSplashHideStartedRef.current) return;
    startupSplashHideStartedRef.current = true;
    void SplashScreen.hideAsync().catch((error: unknown) => {
      if (__DEV__) console.warn('Could not hide native splash:', error);
    }).finally(() => {
      if (!startupSplashMountedRef.current) return;
      startupSplashTimerRef.current = setTimeout(() => {
        setShowStartupSplash(false);
        startupSplashTimerRef.current = null;
      }, fontError ? 0 : 350);
    });
  }, [fontError]);
  const resetAppData = async () => {
    if (!__DEV__ || !developerMode || resettingRef.current) return;
    resettingRef.current = true;
    if (boardWriteTimerRef.current) clearTimeout(boardWriteTimerRef.current);
    boardWriteTimerRef.current = null;
    setResetBusy(true);
    try {
      await Promise.allSettled([...pendingWritesRef.current]);
      await AsyncStorage.multiRemove(STUDIOUS_RESET_KEYS);
      await AsyncStorage.setItem(PREVIEW_SEED_KEY, 'reset');
      await AsyncStorage.setItem(SEPTEMBER24_HEADING_PREVIEW_KEY, 'reset');
      const emptyBoard = starterAimBoard();
      boardStructureRef.current = null;
      boardStateRef.current = emptyBoard;
      setBoardState(emptyBoard);
      aboutTapRef.current = emptyAboutTapSequence;
      setDisplayName(DEFAULT_DISPLAY_NAME);
      setRelaxHeadline(DEFAULT_RELAX_HEADLINE);
      setFocusHeadline(DEFAULT_FOCUS_HEADLINE);
      setHistory([]);
      setThemeModeState('system');
      setGlassSchemeState(null);
      setGlassStyleState('tint');
      setThemePaletteState('classic');
      setMinimalism(false);
      setShowPlanDate(true);
      setShowNavigationLabels(true);
      setShowSettingsWidgetLabels({ minimalism: true, theme: true });
      setLargeUnlabeledNavigationIcons(true);
      setShowArchiveDates(true);
      setShowRelatedTags(true);
      setShowOrganizeHeader(true);
      setShowSelectHeader(true);
      setShowOrganizerLabels({ delete: true, complete: true, archive: true });
      setShowOrganizerProcessLabels({ cancel: true, save: true });
      setLargeUnlabeledOrganizerIcons({ organize: true, delete: true, complete: true, archive: true });
      setDeveloperMode(false);
      setAppearanceOpen(false);
      setPlanningOpen(false);
      setArchiveSettingsOpen(false);
      setNameModalOpen(false);
      setResetModal(false);
      setScreen('Home');
      setResetEpoch((value) => value + 1);
      showToast('App data reset');
    } catch (error: unknown) {
      if (__DEV__) console.warn('Could not reset Studious data:', error);
      resettingRef.current = false;
      showToast('Could not reset app data');
    } finally {
      setResetBusy(false);
    }
  };
  if ((!fontsLoaded && !fontError) || !ready) return <View style={styles.loading}><ActivityIndicator color={theme.accent} /></View>;
  return <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.app}>
    <ThemeContext.Provider value={themeValue}>
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.app}>
      <StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'} animated />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.flex}>
          {screen === 'Home' && <HomeScreen key={resetEpoch} board={boardState} onBoardChange={updateBoard} headline={boardState.active.heading} onHeadlineChange={(heading) => updateBoard((current) => ({ ...current, active: { ...current.active, heading } }))} showPlanDate={visiblePlanDate} showArchiveDates={visibleArchiveDates} showRelatedTags={visibleRelatedTags} showOrganizeHeader={visibleOrganizeHeader} showSelectHeader={visibleSelectHeader} showOrganizerLabels={visibleOrganizerLabels} showOrganizerProcessLabels={visibleOrganizerProcessLabels} largeUnlabeledOrganizerIcons={effectiveOrganizerIconSizes} />}
          {screen === 'Plan' && <ComingSoonScreen key={`relax-${resetEpoch}`} section="Relax" headline={relaxHeadline} onHeadlineChange={setRelaxHeadline} copy="Breathing exercises and personal rituals." />}
          {screen === 'Archive' && <ArchiveHubScreen onOpen={(section) => setScreen(section === 'Plans' ? 'ArchivePlans' : section === 'Relaxations' ? 'ArchiveRelaxations' : 'ArchiveFocuses')} />}
          {screen === 'ArchivePlans' && <AimBoardScreen key={`archive-${resetEpoch}`} archiveView onCloseArchive={() => setScreen('Archive')} state={boardState} onChange={updateBoard} colors={theme} effectiveTheme={effectiveTheme} scrollContentStyle={styles.scrollContent} showArchiveDates={visibleArchiveDates} showRelatedTags={visibleRelatedTags} showOrganizeHeader={visibleOrganizeHeader} showSelectHeader={visibleSelectHeader} showOrganizerLabels={visibleOrganizerLabels} showOrganizerProcessLabels={visibleOrganizerProcessLabels} largeUnlabeledOrganizerIcons={effectiveOrganizerIconSizes} />}
          {screen === 'ArchiveRelaxations' && <ArchiveEmptyScreen title="Relaxations" onBack={() => setScreen('Archive')} />}
          {screen === 'ArchiveFocuses' && <ArchiveEmptyScreen title="Focuses" onBack={() => setScreen('Archive')} />}
          {screen === 'Settings' && <SettingsScreen developerMode={developerMode} minimalism={minimalism} showWidgetLabels={visibleSettingsWidgetLabels} enlargeUnlabeledIcons={largeUnlabeledIcons} onToggleMinimalism={() => { void Haptics.selectionAsync(); setMinimalism((current) => !current); }} themeMode={themeMode} effectiveTheme={effectiveTheme} onToggleTheme={() => setThemeMode(nextThemeMode(themeMode, glassAvailable))} onOpenAbout={openAbout} onOpenPlanning={openPlanning} onOpenArchiveSettings={openArchiveSettings} onResetPress={() => setResetModal(true)} />}
          {screen === 'About' && <AboutScreen onBack={goBackFromAbout} onTitlePress={onAboutTitlePress} />}
          {screen === 'Focus' && <ComingSoonScreen key={`focus-${resetEpoch}`} section="Focus" headline={focusHeadline} onHeadlineChange={setFocusHeadline} copy="Time your work and be as productive as you can." />}
        </View>
      </KeyboardAvoidingView>
      {screen !== 'About' && <BottomNavigation screen={screen === 'ArchivePlans' || screen === 'ArchiveRelaxations' || screen === 'ArchiveFocuses' ? 'Archive' : screen} onChange={(next) => { Keyboard.dismiss(); setScreen(next); }} showNavigationLabels={visibleNavigationLabels} enlargeIcons={!visibleNavigationLabels && largeUnlabeledIcons} />}
      <AppearanceModal visible={appearanceOpen} onClose={() => setAppearanceOpen(false)} minimalism={minimalism} showPlanDate={showPlanDate} onShowPlanDateChange={setShowPlanDate} showNavigationLabels={showNavigationLabels} onShowNavigationLabelsChange={setShowNavigationLabels} showSettingsWidgetLabels={showSettingsWidgetLabels} onShowSettingsWidgetLabelChange={(key, value) => setShowSettingsWidgetLabels((current) => ({ ...current, [key]: value }))} largeUnlabeledIcons={largeUnlabeledIcons} onLargeUnlabeledIconsChange={setAllLargeUnlabeledIcons} showOrganizeHeader={showOrganizeHeader} onShowOrganizeHeaderChange={setShowOrganizeHeader} showSelectHeader={showSelectHeader} onShowSelectHeaderChange={setShowSelectHeader} showOrganizerLabels={showOrganizerLabels} onShowOrganizerLabelChange={(key, value) => setShowOrganizerLabels((current) => ({ ...current, [key]: value }))} showOrganizerProcessLabels={showOrganizerProcessLabels} onShowOrganizerProcessLabelChange={(key, value) => setShowOrganizerProcessLabels((current) => ({ ...current, [key]: value }))} showArchiveDates={showArchiveDates} onShowArchiveDatesChange={setShowArchiveDates} showRelatedTags={showRelatedTags} onShowRelatedTagsChange={setShowRelatedTags} />
      <EmptySettingsModal visible={planningOpen} onClose={() => setPlanningOpen(false)} section="Planning" />
      <EmptySettingsModal visible={archiveSettingsOpen} onClose={() => setArchiveSettingsOpen(false)} section="Archive" />
      <DisplayNameModal key={`${displayName}-${nameModalOpen}`} visible={nameModalOpen} currentName={displayName} onClose={() => setNameModalOpen(false)} onSave={(name) => { setDisplayName(name); setNameModalOpen(false); }} />
      {__DEV__ && <ResetAppDataModal visible={resetModal && developerMode} busy={resetBusy} onCancel={() => { if (!resetBusy) setResetModal(false); }} onReset={() => { void resetAppData(); }} />}
      {toast && <AppToast message={toast} />}
    </SafeAreaView>
    {showStartupSplash && <View onLayout={onStartupSplashLayout} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
      <Text style={{ fontFamily: fonts.serif.regular, color: theme.text, fontSize: 39, lineHeight: 52, includeFontPadding: false }}>Studious</Text>
    </View>}
    </ThemeContext.Provider>
  </SafeAreaProvider>;
}

function createStyles(colors: ThemeColors) {
return StyleSheet.create({ app: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1, backgroundColor: colors.background }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, scrollContent: { backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 17, paddingBottom: 24 }, headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }, greetingRow: { flex: 1, minHeight: 50, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginRight: 10 }, greeting: { fontFamily: fonts.sans.medium, color: colors.accent, fontSize: 12, letterSpacing: 2.1 }, homeGreetingText: { fontSize: GREETING_FONT_SIZE, lineHeight: GREETING_LINE_HEIGHT, includeFontPadding: false }, homeGreeting: { fontFamily: fonts.sans.medium, color: colors.accent, letterSpacing: 2.1, marginRight: 5 }, nameEditTarget: { minWidth: 44, minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center' }, displayName: { fontFamily: fonts.sans.semibold, color: colors.text, flexShrink: 1 }, namePencil: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' }, profileCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.iconBorder }, themeTogglePressed: { opacity: 0.8, transform: [{ scale: 0.96 }] }, headlineRow: { flexDirection: 'row', marginTop: 12 }, headline: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 39, lineHeight: 49, letterSpacing: -0.7, flexShrink: 1 }, headlineCompact: { fontSize: 33, lineHeight: 42 }, headlineSmall: { fontSize: 30, lineHeight: 39 }, sectionLabel: { fontFamily: fonts.sans.medium, color: colors.muted, fontSize: 11, letterSpacing: 2.1, marginBottom: 10 }, inputShellError: { borderColor: colors.accent }, nameInput: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 16, minHeight: 54, backgroundColor: colors.inputBackground, borderRadius: 17, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, marginTop: 20 }, startButton: { height: 54, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 21 }, startButtonText: { fontFamily: fonts.sans.semibold, color: colors.accentForeground, fontSize: 15, letterSpacing: 0.1 }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] }, disabled: { opacity: 0.5 }, navBar: { height: NAV_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.navigationBackground, paddingHorizontal: 8 }, navItem: { flex: 1, minWidth: 64, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 5 }, navIconFrame: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }, navLabel: { fontFamily: fonts.sans.medium, color: colors.inactive, fontSize: 11, lineHeight: 14 }, navLabelActive: { fontFamily: fonts.sans.semibold, color: colors.accent }, modalBackdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end', padding: 16 }, modalCard: { backgroundColor: colors.surface, borderRadius: 29, padding: 24, paddingTop: 14 }, modalHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 23 }, modalEyebrow: { fontFamily: fonts.sans.medium, color: colors.accent, fontSize: 11, letterSpacing: 2 }, modalTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 28, marginTop: 8 }, modalCopy: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 }, modalError: { fontFamily: fonts.sans.regular, color: colors.accent, fontSize: 12, marginTop: 10 }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 23 }, cancelButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.control }, cancelText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 14 }, modalSaveButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, modalSaveText: { fontFamily: fonts.sans.semibold, color: colors.accentForeground, fontSize: 14 }, confirmCard: { backgroundColor: colors.surface, borderRadius: 27, padding: 24, marginBottom: 22 }, confirmIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.control, alignItems: 'center', justifyContent: 'center' }, placeholderContent: { backgroundColor: colors.background, padding: 24, paddingTop: 28, flexGrow: 1 }, placeholderTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 38, lineHeight: 44, marginTop: 25, maxWidth: 330 }, placeholderCard: { backgroundColor: colors.surface, borderRadius: 28, padding: 24, marginTop: 34 }, placeholderIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center' }, placeholderCardTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 24, marginTop: 22 }, placeholderCardCopy: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 }, focusScreen: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 30 }, focusTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 32, textAlign: 'center', marginTop: 24 }, focusTimer: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 72, letterSpacing: 3, marginTop: 54 }, focusStatus: { fontFamily: fonts.sans.medium, color: colors.accent, fontSize: 11, letterSpacing: 2, marginTop: 8 }, focusControl: { backgroundColor: colors.accent, height: 56, paddingHorizontal: 28, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: 55 }, focusControlText: { fontFamily: fonts.sans.semibold, color: colors.accentForeground, fontSize: 15 }, endButton: { minHeight: 44, justifyContent: 'center', marginTop: 13, paddingHorizontal: 20 }, endButtonText: { fontFamily: fonts.sans.medium, color: colors.muted, fontSize: 13 }, focusEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }, focusEmptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center' }, focusEmptyTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 28, textAlign: 'center', marginTop: 22 }, focusEmptyCopy: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: 8, maxWidth: 270 }, secondaryButton: { minHeight: 52, paddingHorizontal: 28, borderRadius: 17, backgroundColor: colors.control, alignItems: 'center', justifyContent: 'center', marginTop: 25 }, secondaryButtonText: { fontFamily: fonts.sans.semibold, color: colors.text, fontSize: 15 }, appearanceOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.control, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 }, appearanceOptionSelected: { borderColor: colors.accent, backgroundColor: colors.inputBackground }, appearanceOptionLeading: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }, appearanceOptionText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 14 }, appearanceHint: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 12, marginTop: 3 }, appearanceModalCard: { backgroundColor: colors.surface, borderRadius: 28, padding: 24, paddingTop: 14 }, appearanceModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, appearanceClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, settingsScreen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 28 }, settingsRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, marginTop: 20 }, settingsRowLeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, settingsIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface }, settingsRowText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 15 }, developerSection: { marginTop: 34 }, resetRowText: { fontFamily: fonts.sans.medium, color: colors.accent, fontSize: 15 }, resetConfirmButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, aboutScreen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 24 }, aboutBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, aboutHeading: { minHeight: 70, justifyContent: 'center' }, aboutIdentity: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 30 }, aboutName: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 48 }, aboutDescription: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: 14 }, aboutCreator: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 14, marginTop: 48 }, aboutVersion: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 13, marginTop: 8 }, aboutFooter: { fontFamily: fonts.serif.regular, color: colors.textMuted, fontSize: 17, textAlign: 'center', paddingBottom: 28 }, toast: { position: 'absolute', alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, maxWidth: '85%' }, toastText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 13, textAlign: 'center' } });
}
