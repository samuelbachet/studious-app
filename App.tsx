import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, AppStateStatus, BackHandler, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import appConfig from './app.json';
import { getDailyHeadline } from './dailyHeadline';
import { emptyAboutTapSequence, recordAboutTap } from './developerGesture';
import { DEFAULT_DISPLAY_NAME, DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName, restoreDisplayName } from './displayName';
import { STORAGE, STUDIOUS_RESET_KEYS } from './storageKeys';
import { EffectiveTheme, parseThemeMode, resolveEffectiveTheme, ThemeColors, ThemeMode, themes } from './theme';
import { fonts } from './typography';

void SplashScreen.preventAutoHideAsync();
if (Constants.expoGoConfig === null) {
  SplashScreen.setOptions({ duration: 300, fade: true });
}

const LEGACY_SEEDED_AIM = 'Finish Biology Chapter 4';
type PrimaryScreen = 'Home' | 'Plan' | 'Focus' | 'Settings';
type Screen = PrimaryScreen | 'About';
type TimerSelection = 10 | 30 | 60 | 'custom';
type SessionStatus = 'active' | 'paused' | 'completed' | 'ended';
type StudySession = { id: string; title: string; durationMinutes: number; startedAt: string; remainingSeconds: number; status: SessionStatus; lastResumedAt?: number; finishedAt?: string };
type ThemeContextValue = { themeMode: ThemeMode; effectiveTheme: EffectiveTheme; theme: ThemeColors; styles: ReturnType<typeof createStyles>; setThemeMode: (mode: ThemeMode) => void; openAppearance: () => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
function useAppTheme() { const context = useContext(ThemeContext); if (!context) throw new Error('Theme context is unavailable'); return context; }
const NAV_BAR_HEIGHT = 76;
const GREETING_FONT_SIZE = 16;
const GREETING_LINE_HEIGHT = 22;
const timerOptions: { label: string; value: TimerSelection; icon?: keyof typeof Feather.glyphMap }[] = [{ label: '10 min', value: 10 }, { label: '30 min', value: 30 }, { label: '60 min', value: 60 }, { label: '', value: 'custom', icon: 'clock' }];

function getGreeting(date = new Date()) { const hour = date.getHours(); if (hour >= 5 && hour < 12) return 'GOOD MORNING'; if (hour >= 12 && hour < 17) return 'GOOD AFTERNOON'; return 'GOOD EVENING'; }
function formatDuration(minutes: number) { return `${minutes} min`; }
function formatClock(seconds: number) { const safe = Math.max(0, seconds); return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${Math.floor(safe % 60).toString().padStart(2, '0')}`; }
function formatSessionTime(iso?: string) { if (!iso) return 'Recently'; const date = new Date(iso); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1); const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); if (date.toDateString() === today.toDateString()) return `Today, ${time}`; if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`; return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`; }
function parseCustomDuration(value: string): number | null { if (!/^\d{1,3}$/.test(value)) return null; const minutes = Number(value); return Number.isInteger(minutes) && minutes >= 1 && minutes <= 180 ? minutes : null; }
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

function PressableScale({ children, onPress, style, accessibilityLabel, accessibilityHint, accessibilityState, disabled = false }: { children: React.ReactNode; onPress?: () => void; style?: object; accessibilityLabel?: string; accessibilityHint?: string; accessibilityState?: { selected?: boolean }; disabled?: boolean }) {
  const { styles } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} accessibilityState={{ ...accessibilityState, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, pressed && styles.pressed, disabled && styles.disabled]}>{children}</Pressable>;
}
function SectionLabel({ children }: { children: string }) { const { styles } = useAppTheme(); return <Text style={styles.sectionLabel}>{children}</Text>; }

function ModalBackdrop({ children }: { children: React.ReactNode }) {
  const { styles } = useAppTheme();
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.modalBackdrop}>{children}</SafeAreaView>;
}

function AppToast({ message }: { message: string }) {
  const { styles } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  return <View pointerEvents="none" style={[styles.toast, { bottom: NAV_BAR_HEIGHT + 16 + bottom }]}><Text style={styles.toastText}>{message}</Text></View>;
}

function EditPencilIcon({ color }: { color: string }) {
  return <Feather name="edit-3" size={17} color={color} accessible={false} />;
}

function FocusIcon({ size = 24, color }: { size?: number; color: string }) {
  const petal = { width: size * 0.27, height: size * 0.58, borderRadius: size * 0.2, borderWidth: Math.max(1.3, size * 0.07), borderColor: color, position: 'absolute' as const };
  return <View accessible accessibilityLabel="Focus" style={{ width: size, height: size * 0.82, alignItems: 'center', justifyContent: 'flex-end' }}><View style={[petal, { bottom: size * 0.17, transform: [{ scaleY: 0.92 }] }]} /><View style={[petal, { bottom: size * 0.16, left: size * 0.29, transform: [{ rotate: '-27deg' }, { scaleY: 0.82 }] }]} /><View style={[petal, { bottom: size * 0.16, right: size * 0.29, transform: [{ rotate: '27deg' }, { scaleY: 0.82 }] }]} /><View style={[petal, { bottom: size * 0.1, left: size * 0.08, transform: [{ rotate: '-57deg' }, { scaleY: 0.68 }] }]} /><View style={[petal, { bottom: size * 0.1, right: size * 0.08, transform: [{ rotate: '57deg' }, { scaleY: 0.68 }] }]} /><View style={{ width: size * 0.7, height: size * 0.12, borderTopWidth: Math.max(1.3, size * 0.07), borderColor: color, borderRadius: size * 0.3, marginBottom: size * 0.05 }} /></View>;
}

function BottomNavigation({ screen, onChange }: { screen: PrimaryScreen; onChange: (screen: PrimaryScreen) => void }) {
  const { theme: colors, styles } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const items: { label: PrimaryScreen; icon?: keyof typeof Feather.glyphMap }[] = [{ label: 'Home', icon: 'home' }, { label: 'Plan', icon: 'clipboard' }, { label: 'Focus' }, { label: 'Settings', icon: 'settings' }];
  return <View style={[styles.navBar, { height: NAV_BAR_HEIGHT + bottom, paddingBottom: bottom }]}>{items.map((item) => { const active = item.label === screen; const iconColor = active ? colors.accent : colors.inactive; return <PressableScale key={item.label} onPress={() => onChange(item.label)} accessibilityLabel={`Open ${item.label}`} style={styles.navItem}>{item.label === 'Focus' ? <FocusIcon size={24} color={iconColor} /> : <Feather name={item.icon!} size={21} color={iconColor} />}<Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text></PressableScale>; })}</View>;
}

function CustomTimerModal({ visible, initialValue, onClose, onSave }: { visible: boolean; initialValue: number; onClose: () => void; onSave: (value: number) => void }) {
  const { theme: colors, styles, effectiveTheme } = useAppTheme();
  const [value, setValue] = useState(String(initialValue));
  const [inputError, setInputError] = useState(false);
  const parsed = parseCustomDuration(value);
  const changeValue = (next: string) => { setValue(next); setInputError(false); };
  const save = () => {
    if (parsed === null) { setInputError(true); return; }
    Keyboard.dismiss();
    void Haptics.selectionAsync();
    onSave(parsed);
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <ModalBackdrop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalEyebrow}>CUSTOM TIMER</Text>
          <Text style={styles.modalTitle}>Custom Timer</Text>
          <Text style={styles.modalCopy}>Choose how long you&apos;d like to focus.</Text>
          <View style={styles.durationPicker}>
            <PressableScale onPress={() => changeValue(String(Math.max(1, (parsed ?? 1) - 1)))} accessibilityLabel="Decrease duration" style={styles.stepperButton}><Feather name="minus" size={20} color={colors.text} /></PressableScale>
            <View style={styles.durationValueWrap}>
              <TextInput value={value} onChangeText={(text) => changeValue(text.replace(/[^0-9]/g, '').slice(0, 3))} placeholder="Enter minutes..." placeholderTextColor={colors.textMuted} keyboardType="number-pad" keyboardAppearance={effectiveTheme} style={[styles.durationInput, !value && styles.durationInputEmpty]} selectTextOnFocus accessibilityLabel="Custom duration in minutes" maxLength={3} />
              {!!value && <Text style={styles.durationUnit}>minutes</Text>}
            </View>
            <PressableScale onPress={() => changeValue(String(Math.min(180, (parsed ?? 0) + 1)))} accessibilityLabel="Increase duration" style={styles.stepperButton}><Feather name="plus" size={20} color={colors.text} /></PressableScale>
          </View>
          {inputError && <Text style={styles.modalError}>Choose a time between 1 and 180 minutes.</Text>}
          <View style={styles.modalActions}>
            <PressableScale onPress={() => { Keyboard.dismiss(); onClose(); }} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></PressableScale>
            <PressableScale onPress={save} style={styles.modalSaveButton}><Text style={styles.modalSaveText}>Set Timer</Text></PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ModalBackdrop>
  </Modal>;
}
function EndSessionModal({ visible, onCancel, onEnd }: { visible: boolean; onCancel: () => void; onEnd: () => void }) {
  const { theme: colors, styles } = useAppTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><ModalBackdrop><View style={styles.confirmCard}><View style={styles.confirmIcon}><Feather name="pause-circle" size={22} color={colors.accent} /></View><Text style={styles.modalTitle}>End this session?</Text><Text style={styles.modalCopy}>Your progress will be saved to Recent Session.</Text><View style={styles.modalActions}><PressableScale onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></PressableScale><PressableScale onPress={onEnd} style={styles.modalSaveButton}><Text style={styles.modalSaveText}>End Session</Text></PressableScale></View></View></ModalBackdrop></Modal>;
}

function ResetAppDataModal({ visible, busy, onCancel, onReset }: { visible: boolean; busy: boolean; onCancel: () => void; onReset: () => void }) {
  const { theme: colors, styles } = useAppTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <ModalBackdrop>
      <View style={styles.confirmCard}>
        <View style={styles.confirmIcon}><Feather name="trash-2" size={21} color={colors.accent} /></View>
        <Text style={styles.modalTitle}>Reset app data?</Text>
        <Text style={styles.modalCopy}>This will clear your aims, study sessions, timer preferences, and local Studious data on this device.</Text>
        <View style={styles.modalActions}>
          <PressableScale onPress={onCancel} disabled={busy} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></PressableScale>
          <PressableScale onPress={onReset} disabled={busy} accessibilityLabel="Confirm reset app data" style={styles.resetConfirmButton}><Text style={styles.modalSaveText}>{busy ? 'Resetting...' : 'Reset'}</Text></PressableScale>
        </View>
      </View>
    </ModalBackdrop>
  </Modal>;
}

function SessionHistoryModal({ visible, sessions, onClose }: { visible: boolean; sessions: StudySession[]; onClose: () => void }) {
  const { theme: colors, styles } = useAppTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <ModalBackdrop>
      <View style={styles.modalCard}>
        <View style={styles.modalHandle} />
        <View style={styles.appearanceModalHeader}>
          <Text style={styles.modalTitle}>Study Sessions</Text>
          <PressableScale onPress={onClose} accessibilityLabel="Close study sessions" style={styles.appearanceClose}><Feather name="x" size={20} color={colors.textMuted} /></PressableScale>
        </View>
        <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
          {sessions.map((session) => <View key={session.id} style={styles.historyItem}>
            <View style={styles.recentIcon}><Feather name="book-open" size={18} color={colors.sageForeground} /></View>
            <View style={styles.recentText}><Text style={styles.recentTitle} numberOfLines={1}>{session.title}</Text><Text style={styles.recentMeta}>{formatDuration(session.durationMinutes)}  ·  {formatSessionTime(session.finishedAt)}</Text></View>
          </View>)}
        </ScrollView>
      </View>
    </ModalBackdrop>
  </Modal>;
}

const appearanceChoices: { mode: ThemeMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { mode: 'system', label: 'System', icon: 'smartphone' },
  { mode: 'light', label: 'Light', icon: 'sun' },
  { mode: 'dark', label: 'Dark', icon: 'moon' },
];

function AppearanceOptions({ onSelected }: { onSelected?: () => void }) {
  const { themeMode, setThemeMode, theme, styles } = useAppTheme();
  return <View>{appearanceChoices.map((choice) => {
    const selected = themeMode === choice.mode;
    return <PressableScale key={choice.mode} onPress={() => { setThemeMode(choice.mode); onSelected?.(); }} accessibilityLabel={`${choice.label}${selected ? ', selected' : ''}`} style={[styles.appearanceOption, selected && styles.appearanceOptionSelected]}>
      <View style={styles.appearanceOptionLeading}>
        <Feather name={choice.icon} size={19} color={selected ? theme.accent : theme.textMuted} />
        <View><Text style={styles.appearanceOptionText}>{choice.label}</Text>{selected && choice.mode === 'system' && <Text style={styles.appearanceHint}>Match your device appearance</Text>}</View>
      </View>
      {selected && <Feather name="check" size={18} color={theme.accent} />}
    </PressableScale>;
  })}</View>;
}

function AppearanceModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme, styles } = useAppTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <ModalBackdrop>
      <View style={styles.appearanceModalCard}>
        <View style={styles.modalHandle} />
        <View style={styles.appearanceModalHeader}>
          <Text style={styles.modalTitle}>Appearance</Text>
          <PressableScale onPress={onClose} accessibilityLabel="Close appearance settings" style={styles.appearanceClose}><Feather name="x" size={20} color={theme.textMuted} /></PressableScale>
        </View>
        <Text style={styles.modalCopy}>Choose how Studious looks while you study.</Text>
        <AppearanceOptions onSelected={onClose} />
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
          <TextInput value={value} onChangeText={(text) => { setValue(text); if (text.trim()) setInputError(false); }} placeholder="Enter your nickname..." placeholderTextColor={colors.textMuted} maxLength={DISPLAY_NAME_MAX_LENGTH} returnKeyType="done" onSubmitEditing={save} keyboardAppearance={effectiveTheme} style={[styles.nameInput, inputError && styles.inputShellError]} accessibilityLabel="Nickname" autoCapitalize="words" selectTextOnFocus />
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

function HomeScreen({ aim, setAim, displayName, onEditName, timer, customDuration, onTimerChange, onStart, onSeeAll, recentSession, inputError, hasActiveSession }: { aim: string; setAim: (value: string) => void; displayName: string; onEditName: () => void; timer: TimerSelection; customDuration: number; onTimerChange: (timer: TimerSelection) => void; onStart: () => void; onSeeAll: () => void; recentSession?: StudySession; inputError: boolean; hasActiveSession: boolean }) {
  const { theme: colors, styles, themeMode, effectiveTheme, openAppearance } = useAppTheme();
  const { width } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [shake] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!inputError) return;
    inputRef.current?.focus();
    Animated.sequence([
      Animated.timing(shake, { toValue: 5, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -5, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [inputError, shake]);

  return <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}>
    <View style={styles.headerRow}>
      <View style={styles.greetingRow}>
        <Text style={[styles.homeGreetingText, styles.homeGreeting]} allowFontScaling>{getGreeting()},</Text>
        <PressableScale onPress={onEditName} accessibilityLabel="Edit nickname" style={styles.nameEditTarget}>
          <Text style={[styles.homeGreetingText, styles.displayName]} allowFontScaling>{displayName}</Text>
          <View style={styles.namePencil}><EditPencilIcon color={colors.textMuted} /></View>
        </PressableScale>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Appearance settings" onPress={() => { Keyboard.dismiss(); openAppearance(); }} style={({ pressed }) => [styles.profileCircle, pressed && styles.themeTogglePressed]}>
        <Feather name={themeMode === 'system' ? 'smartphone' : themeMode === 'light' ? 'sun' : 'moon'} size={21} color={colors.textMuted} />
      </Pressable>
    </View>
    <Pressable onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.headlineRow}><Text style={[styles.headline, width < 380 && styles.headlineCompact, width < 340 && styles.headlineSmall]}>{getDailyHeadline()}</Text></View>
    </Pressable>
    <View style={styles.setupCard}>
      <SectionLabel>AIM</SectionLabel>
      <Animated.View style={[styles.inputShell, { transform: [{ translateX: shake }] }, inputError && styles.inputShellError]}>
        <TextInput ref={inputRef} value={aim} onChangeText={setAim} placeholder="Write your aim here..." placeholderTextColor={colors.textMuted} style={styles.aimInput} returnKeyType="done" maxLength={120} keyboardAppearance={effectiveTheme} onSubmitEditing={Keyboard.dismiss} accessibilityLabel="Study aim" />
        <PressableScale onPress={() => inputRef.current?.focus()} accessibilityLabel="Edit study aim" style={styles.editButton}><EditPencilIcon color={colors.textMuted} /></PressableScale>
      </Animated.View>
      {inputError && <Text style={styles.errorText}>Add an aim for this session.</Text>}
      <SectionLabel>TIMER</SectionLabel>
      <View style={styles.timerRow}>{timerOptions.map((option) => {
        const selected = timer === option.value;
        const label = option.value === 'custom' ? 'Set custom study timer' : `${option.value} minute study timer`;
        return <PressableScale key={String(option.value)} onPress={() => onTimerChange(option.value)} accessibilityLabel={label} accessibilityState={{ selected }} style={[styles.timerPill, selected && styles.timerPillSelected]}>
          {option.icon ? <Feather name={option.icon} size={19} color={selected ? colors.accentForeground : colors.text} /> : <Text style={[styles.timerText, selected && styles.timerTextSelected]}>{option.label}</Text>}
        </PressableScale>;
      })}</View>
      {timer === 'custom' && <Text style={styles.customHint}>{customDuration} minutes selected</Text>}
      <PressableScale onPress={onStart} accessibilityLabel={hasActiveSession ? 'Return to Focus' : 'Start studying'} style={styles.startButton}>
        <Feather name={hasActiveSession ? 'arrow-right' : 'play'} size={17} color={colors.accentForeground} />
        <Text style={styles.startButtonText}>{hasActiveSession ? 'Return to Focus' : 'Start Studying'}</Text>
      </PressableScale>
    </View>
    <View style={styles.recentHeading}>
      <SectionLabel>RECENT SESSION</SectionLabel>
      <PressableScale onPress={onSeeAll} disabled={!recentSession} accessibilityLabel="See all study sessions" style={styles.seeAll}><Text style={[styles.seeAllText, !recentSession && styles.seeAllDisabled]}>See All</Text><Feather name="arrow-up-right" size={14} color={recentSession ? colors.accent : colors.textMuted} /></PressableScale>
    </View>
    {recentSession ? <PressableScale onPress={onSeeAll} accessibilityLabel={`View recent session: ${recentSession.title}`} style={styles.recentCard}>
      <View style={styles.recentIcon}><Feather name="book-open" size={18} color={colors.sageForeground} /></View>
      <View style={styles.recentText}><Text style={styles.recentTitle} numberOfLines={1}>{recentSession.title}</Text><Text style={styles.recentMeta}>{formatDuration(recentSession.durationMinutes)}  ·  {formatSessionTime(recentSession.finishedAt)}</Text></View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </PressableScale> : <View style={styles.emptyRecentWrap}><Text style={styles.emptyRecent}>No sessions yet.</Text><Text style={styles.emptyRecentHint}>Your completed study sessions will appear here.</Text></View>}
  </ScrollView>;
}

function PlaceholderScreen({ screen, title, copy, icon }: { screen: 'Plan'; title: string; copy: string; icon: keyof typeof Feather.glyphMap }) {
  const { theme: colors, styles } = useAppTheme();
return (
    <ScrollView contentContainerStyle={styles.placeholderContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.greeting}>{screen.toUpperCase()}</Text>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <View style={styles.placeholderCard}>
        <View style={styles.placeholderIcon}><Feather name={icon} size={23} color={colors.sage} /></View>
        <Text style={styles.placeholderCardTitle}>{copy}</Text>
        <Text style={styles.placeholderCardCopy}>A calm, thoughtful space for the next part of your study rhythm.</Text>
      </View>
    </ScrollView>
  );
}

function SettingsScreen({ developerMode, onOpenAbout, onResetPress }: { developerMode: boolean; onOpenAbout: () => void; onResetPress: () => void }) {
  const { theme: colors, styles } = useAppTheme();
  return <View style={styles.settingsScreen}>
    <Text style={styles.greeting}>SETTINGS</Text>
    <PressableScale onPress={onOpenAbout} accessibilityLabel="About" accessibilityHint="View information about Studious" style={styles.settingsRow}>
      <View style={styles.settingsRowLeading}><View style={styles.settingsIcon}><Feather name="info" size={20} color={colors.sage} /></View><Text style={styles.settingsRowText}>About</Text></View>
      <Feather name="chevron-right" size={19} color={colors.textMuted} />
    </PressableScale>
    {__DEV__ && developerMode && <View style={styles.developerSection}>
      <SectionLabel>DEVELOPER</SectionLabel>
      <PressableScale onPress={onResetPress} accessibilityLabel="Reset app data" style={styles.settingsRow}>
        <View style={styles.settingsRowLeading}><View style={styles.settingsIcon}><Feather name="trash-2" size={19} color={colors.accent} /></View><Text style={styles.resetRowText}>Reset app data</Text></View>
        <Feather name="chevron-right" size={19} color={colors.textMuted} />
      </PressableScale>
    </View>}
  </View>;
}

function AboutScreen({ onBack, onTitlePress }: { onBack: () => void; onTitlePress: () => void }) {
  const { theme: colors, styles } = useAppTheme();
  return <SafeAreaView edges={['bottom']} style={styles.aboutScreen}>
    <PressableScale onPress={onBack} accessibilityLabel="Back to Settings" style={styles.aboutBack}><Feather name="arrow-left" size={21} color={colors.text} /></PressableScale>
    <View style={styles.aboutHeading}><Text style={styles.greeting}>ABOUT</Text></View>
    <View style={styles.aboutIdentity}>
      <Pressable accessible={false} hitSlop={8} onPress={__DEV__ ? onTitlePress : undefined}><Text style={styles.aboutName}>Studious</Text></Pressable>
      <Text style={styles.aboutDescription}>The app for getting things done.</Text>
      <Text style={styles.aboutCreator}>Mana Labs</Text>
      <Text style={styles.aboutVersion}>Version {appConfig.expo.version}</Text>
    </View>
    <Text style={styles.aboutFooter}>Aim, plan, focus. In that order.</Text>
  </SafeAreaView>;
}
function FocusScreen({ session, onPause, onResume, onEnd, onReturn }: { session?: StudySession; onPause: () => void; onResume: () => void; onEnd: () => void; onReturn: () => void }) {
  const { theme: colors, styles } = useAppTheme();
  if (!session) return <View style={styles.focusEmpty}><View style={styles.focusEmptyIcon}><Feather name="wind" size={28} color={colors.sage} /></View><Text style={styles.focusEmptyTitle}>No active focus session.</Text><Text style={styles.focusEmptyCopy}>Set a simple aim and give it your full attention.</Text><PressableScale onPress={onReturn} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Set an Aim</Text></PressableScale></View>;
  if (session.status === 'completed') return <View style={styles.focusEmpty}><View style={styles.focusEmptyIcon}><Feather name="check" size={28} color={colors.sage} /></View><Text style={styles.focusEmptyTitle}>Session complete.</Text><Text style={styles.focusEmptyCopy}>You made space for something that matters.</Text><PressableScale onPress={onReturn} style={styles.startButton}><Text style={styles.startButtonText}>Return to Aim</Text></PressableScale></View>;
const paused = session.status === 'paused'; return <View style={styles.focusScreen}><Text style={styles.greeting}>FOCUS</Text><Text style={styles.focusTitle}>{session.title}</Text><Text style={styles.focusTimer}>{formatClock(session.remainingSeconds)}</Text><Text style={styles.focusStatus}>{paused ? 'PAUSED' : 'IN SESSION'}</Text><PressableScale onPress={paused ? onResume : onPause} accessibilityLabel={paused ? 'Resume session' : 'Pause session'} style={styles.focusControl}><Feather name={paused ? 'play' : 'pause'} size={20} color={colors.accentForeground} fill={colors.accentForeground} /><Text style={styles.focusControlText}>{paused ? 'Resume' : 'Pause'}</Text></PressableScale><PressableScale onPress={onEnd} accessibilityLabel="End session" style={styles.endButton}><Text style={styles.endButtonText}>End Session</Text></PressableScale></View>;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.serif.regular]: require('./assets/fonts/DMSerifDisplay-Regular.ttf'),
    [fonts.sans.regular]: require('./assets/fonts/Inter-Regular.ttf'),
    [fonts.sans.medium]: require('./assets/fonts/Inter-Medium.ttf'),
    [fonts.sans.semibold]: require('./assets/fonts/Inter-SemiBold.ttf'),
  });
  const deviceScheme = useColorScheme();
  const [screen, setScreen] = useState<Screen>('Home');
  const [aim, setAimState] = useState('');
  const [displayName, setDisplayName] = useState(DEFAULT_DISPLAY_NAME);
  const [timer, setTimer] = useState<TimerSelection>(30);
  const [customDuration, setCustomDuration] = useState(30);
  const [history, setHistory] = useState<StudySession[]>([]);
  const [activeSession, setActiveSession] = useState<StudySession>();
  const [customModal, setCustomModal] = useState(false);
  const [endModal, setEndModal] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [developerMode, setDeveloperMode] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetEpoch, setResetEpoch] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [inputError, setInputError] = useState(false);
  const [ready, setReady] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  // Refreshes Home's local-time greeting and date-derived headline while the app stays open.
  const [, setMinute] = useState(0);
  const startLockRef = useRef(false);
  const completedNotifiedRef = useRef<string | null>(null);
  const aboutTapRef = useRef(emptyAboutTapSequence);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resettingRef = useRef(false);
  const pendingWritesRef = useRef<Set<Promise<unknown>>>(new Set());

  const effectiveTheme = resolveEffectiveTheme(themeMode, deviceScheme);
  const theme = themes[effectiveTheme];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const setThemeMode = useCallback((mode: ThemeMode) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setThemeModeState(mode);
  }, []);
  const openAppearance = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAppearanceOpen(true);
  }, []);
  const themeValue = useMemo(() => ({ themeMode, effectiveTheme, theme, styles, setThemeMode, openAppearance }), [themeMode, effectiveTheme, theme, styles, setThemeMode, openAppearance]);

  const trackWrite = useCallback((write: Promise<unknown>) => {
    pendingWritesRef.current.add(write);
    void write.then(() => pendingWritesRef.current.delete(write), () => pendingWritesRef.current.delete(write));
  }, []);
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
    if (!__DEV__ || developerMode) return;
    const result = recordAboutTap(aboutTapRef.current, Date.now());
    aboutTapRef.current = result.sequence;
    if (result.unlocked) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDeveloperMode(true);
      showToast('Developer mode enabled');
    }
  }, [developerMode, showToast]);
  useEffect(() => {
    if (screen !== 'About') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { goBackFromAbout(); return true; });
    return () => subscription.remove();
  }, [goBackFromAbout, screen]);
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE.aim),
      AsyncStorage.getItem(STORAGE.displayName),
      AsyncStorage.getItem(STORAGE.timer),
      AsyncStorage.getItem(STORAGE.custom),
      AsyncStorage.getItem(STORAGE.history),
      AsyncStorage.getItem(STORAGE.theme),
      AsyncStorage.getItem(STORAGE.legacyTheme),
      __DEV__ ? AsyncStorage.getItem(STORAGE.developer) : Promise.resolve(null),
    ]).then(async ([storedAim, storedDisplayName, storedTimer, storedCustom, storedHistory, storedTheme, legacyTheme, storedDeveloperMode]) => {
      setDisplayName(restoreDisplayName(storedDisplayName));
      if (__DEV__ && storedDeveloperMode === 'true') setDeveloperMode(true);
      if (storedTimer === '10' || storedTimer === '30' || storedTimer === '60' || storedTimer === 'custom') {
        setTimer(storedTimer === 'custom' ? 'custom' : Number(storedTimer) as TimerSelection);
      }
      const restoredCustomDuration = storedCustom === null ? null : parseCustomDuration(storedCustom);
      if (restoredCustomDuration !== null) setCustomDuration(restoredCustomDuration);
      let restoredHistory: StudySession[] = [];
      if (storedHistory) {
        try {
          const parsed: unknown = JSON.parse(storedHistory);
          if (Array.isArray(parsed)) restoredHistory = parsed.filter(isStoredSession).slice(0, 20);
        } catch { /* ignore malformed local data */ }
      }
      setHistory(restoredHistory);
      // Earlier builds persisted this exact seeded value on launch. Keep it only if a real session used it.
      if (storedAim !== null && (storedAim !== LEGACY_SEEDED_AIM || restoredHistory.some((session) => session.title === storedAim))) setAimState(storedAim);
      const hasValidCurrentMode = storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark';
      const restoredMode = parseThemeMode(hasValidCurrentMode ? storedTheme : legacyTheme);
      setThemeModeState(restoredMode);
      if (legacyTheme !== null) {
        if (!hasValidCurrentMode) await AsyncStorage.setItem(STORAGE.theme, restoredMode);
        await AsyncStorage.removeItem(STORAGE.legacyTheme);
      }
    }).catch((error: unknown) => {
      if (__DEV__) console.warn('Could not restore local preferences:', error);
    }).finally(() => setReady(true));
  }, []);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(aim.trim() ? AsyncStorage.setItem(STORAGE.aim, aim) : AsyncStorage.removeItem(STORAGE.aim)); }, [aim, ready, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(displayName === DEFAULT_DISPLAY_NAME ? AsyncStorage.removeItem(STORAGE.displayName) : AsyncStorage.setItem(STORAGE.displayName, displayName)); }, [displayName, ready, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.timer, String(timer))); }, [timer, ready, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.custom, String(customDuration))); }, [customDuration, ready, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.history, JSON.stringify(history.slice(0, 20)))); }, [history, ready, trackWrite]);
  useEffect(() => { if (ready && !resettingRef.current) trackWrite(AsyncStorage.setItem(STORAGE.theme, themeMode)); }, [ready, themeMode, trackWrite]);
  useEffect(() => { if (__DEV__ && ready && !resettingRef.current) trackWrite(developerMode ? AsyncStorage.setItem(STORAGE.developer, 'true') : AsyncStorage.removeItem(STORAGE.developer)); }, [developerMode, ready, trackWrite]);
  useEffect(() => { if (resetEpoch > 0) resettingRef.current = false; }, [resetEpoch]);
  const tick = useCallback(() => { setActiveSession((current) => { if (!current || current.status !== 'active' || !current.lastResumedAt) return current; const now = Date.now(); const elapsed = Math.floor((now - current.lastResumedAt) / 1000); if (elapsed < 1) return current; const remaining = Math.max(0, current.remainingSeconds - elapsed); return remaining === 0 ? { ...current, remainingSeconds: 0, status: 'completed', finishedAt: new Date(now).toISOString(), lastResumedAt: undefined } : { ...current, remainingSeconds: remaining, lastResumedAt: current.lastResumedAt + elapsed * 1000 }; }); }, []);
  useEffect(() => {
    if (activeSession?.status !== 'completed' || completedNotifiedRef.current === activeSession.id) return;
    completedNotifiedRef.current = activeSession.id;
    setHistory((items) => items.some((item) => item.id === activeSession.id) ? items : [activeSession, ...items].slice(0, 20));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [activeSession]);
  useEffect(() => { if (!activeSession || activeSession.status === 'completed') startLockRef.current = false; }, [activeSession]);
useEffect(() => { if (activeSession?.status !== 'active') return undefined; const interval = setInterval(tick, 1000); return () => clearInterval(interval); }, [activeSession?.status, tick]); useEffect(() => { const onAppStateChange = (nextState: AppStateStatus) => { if (nextState === 'active') { setMinute((value) => value + 1); tick(); } }; const subscription = AppState.addEventListener('change', onAppStateChange); const interval = setInterval(() => setMinute((value) => value + 1), 60000); return () => { subscription.remove(); clearInterval(interval); }; }, [tick]); useEffect(() => { if (__DEV__ && fontError) console.warn('Local fonts failed to load:', fontError); if ((fontsLoaded || fontError) && ready) void SplashScreen.hideAsync(); }, [fontError, fontsLoaded, ready]);
  const duration = timer === 'custom' ? customDuration : timer;
  const recentSession = history[0];
  const hasActiveSession = activeSession?.status === 'active' || activeSession?.status === 'paused';
  const setAim = (value: string) => { setAimState(value); if (value.trim()) setInputError(false); };
  const startSession = () => {
    Keyboard.dismiss();
    if (hasActiveSession) { setScreen('Focus'); return; }
    if (startLockRef.current) return;
    const title = aim.trim();
    if (!title) { setInputError(true); return; }
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) return;
    startLockRef.current = true;
    const now = Date.now();
    setAimState(title);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSession({ id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`, title, durationMinutes: duration, startedAt: new Date(now).toISOString(), remainingSeconds: duration * 60, status: 'active', lastResumedAt: now });
    setScreen('Focus');
  };
  const pauseSession = () => setActiveSession((current) => current?.status === 'active' && current.lastResumedAt ? { ...current, remainingSeconds: Math.max(0, current.remainingSeconds - Math.floor((Date.now() - current.lastResumedAt) / 1000)), status: 'paused', lastResumedAt: undefined } : current);
  const resumeSession = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveSession((current) => current?.status === 'paused' ? { ...current, status: 'active', lastResumedAt: Date.now() } : current); };
  const endSession = () => { if (!activeSession) return; const ended = { ...activeSession, status: 'ended' as const, finishedAt: new Date().toISOString() }; setHistory((items) => [ended, ...items.filter((item) => item.id !== ended.id)].slice(0, 20)); setActiveSession(undefined); setEndModal(false); setScreen('Home'); };
  const chooseTimer = (value: TimerSelection) => { Keyboard.dismiss(); if (value === 'custom') setCustomModal(true); else { void Haptics.selectionAsync(); setTimer(value); } };
  const resetAppData = async () => {
    if (!__DEV__ || !developerMode || resettingRef.current) return;
    resettingRef.current = true;
    setResetBusy(true);
    try {
      await Promise.allSettled([...pendingWritesRef.current]);
      await AsyncStorage.multiRemove(STUDIOUS_RESET_KEYS);
      aboutTapRef.current = emptyAboutTapSequence;
      startLockRef.current = false;
      completedNotifiedRef.current = null;
      setAimState('');
      setDisplayName(DEFAULT_DISPLAY_NAME);
      setTimer(30);
      setCustomDuration(30);
      setHistory([]);
      setActiveSession(undefined);
      setInputError(false);
      setThemeModeState('system');
      setDeveloperMode(false);
      setCustomModal(false);
      setEndModal(false);
      setHistoryOpen(false);
      setAppearanceOpen(false);
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
          {screen === 'Home' && <HomeScreen aim={aim} setAim={setAim} displayName={displayName} onEditName={() => { Keyboard.dismiss(); setNameModalOpen(true); }} timer={timer} customDuration={customDuration} onTimerChange={chooseTimer} onStart={startSession} onSeeAll={() => { Keyboard.dismiss(); setHistoryOpen(true); }} recentSession={recentSession} inputError={inputError} hasActiveSession={hasActiveSession} />}
          {screen === 'Plan' && <PlaceholderScreen screen="Plan" title="Plan your study time." copy="Planning tools are coming next." icon="calendar" />}
          {screen === 'Settings' && <SettingsScreen developerMode={developerMode} onOpenAbout={openAbout} onResetPress={() => setResetModal(true)} />}
          {screen === 'About' && <AboutScreen onBack={goBackFromAbout} onTitlePress={onAboutTitlePress} />}
          {screen === 'Focus' && <FocusScreen session={activeSession} onPause={pauseSession} onResume={resumeSession} onEnd={() => setEndModal(true)} onReturn={() => setScreen('Home')} />}
        </View>
      </KeyboardAvoidingView>
      {screen !== 'About' && <BottomNavigation screen={screen} onChange={(next) => { Keyboard.dismiss(); setScreen(next); }} />}
      <CustomTimerModal key={`${customDuration}-${customModal}`} visible={customModal} initialValue={customDuration} onClose={() => setCustomModal(false)} onSave={(value) => { setCustomDuration(value); setTimer('custom'); setCustomModal(false); }} />
      <EndSessionModal visible={endModal} onCancel={() => setEndModal(false)} onEnd={endSession} />
      <SessionHistoryModal visible={historyOpen} sessions={history} onClose={() => setHistoryOpen(false)} />
      <AppearanceModal visible={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
      <DisplayNameModal key={`${displayName}-${nameModalOpen}`} visible={nameModalOpen} currentName={displayName} onClose={() => setNameModalOpen(false)} onSave={(name) => { setDisplayName(name); setNameModalOpen(false); }} />
      {__DEV__ && <ResetAppDataModal visible={resetModal && developerMode} busy={resetBusy} onCancel={() => { if (!resetBusy) setResetModal(false); }} onReset={() => { void resetAppData(); }} />}
      {toast && <AppToast message={toast} />}
    </SafeAreaView>
    </ThemeContext.Provider>
  </SafeAreaProvider>;
}

function createStyles(colors: ThemeColors) {
return StyleSheet.create({ app: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1, backgroundColor: colors.background }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, scrollContent: { backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 17, paddingBottom: 24 }, headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }, greetingRow: { flex: 1, minHeight: 50, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginRight: 10 }, greeting: { fontFamily: fonts.sans.medium, color: colors.accent, fontSize: 12, letterSpacing: 2.1 }, homeGreetingText: { fontSize: GREETING_FONT_SIZE, lineHeight: GREETING_LINE_HEIGHT, includeFontPadding: false }, homeGreeting: { fontFamily: fonts.sans.medium, color: colors.accent, letterSpacing: 2.1, marginRight: 5 }, nameEditTarget: { minWidth: 44, minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center' }, displayName: { fontFamily: fonts.sans.semibold, color: colors.text, flexShrink: 1 }, namePencil: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' }, profileCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.iconBorder }, themeTogglePressed: { opacity: 0.8, transform: [{ scale: 0.96 }] }, headlineRow: { flexDirection: 'row', marginTop: 12 }, headline: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 39, lineHeight: 49, letterSpacing: -0.7, flexShrink: 1 }, headlineCompact: { fontSize: 33, lineHeight: 42 }, headlineSmall: { fontSize: 30, lineHeight: 39 }, setupCard: { backgroundColor: colors.surface, borderRadius: 30, padding: 21, marginTop: 28, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 }, sectionLabel: { fontFamily: fonts.sans.medium, color: colors.muted, fontSize: 11, letterSpacing: 2.1, marginBottom: 10 }, inputShell: { minHeight: 54, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBackground, borderRadius: 17, paddingLeft: 16, paddingRight: 5, borderWidth: 1, borderColor: 'transparent' }, inputShellError: { borderColor: colors.accent }, aimInput: { fontFamily: fonts.serif.regular, flex: 1, color: colors.text, fontSize: 16, paddingVertical: 13 }, nameInput: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 16, minHeight: 54, backgroundColor: colors.inputBackground, borderRadius: 17, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, marginTop: 20 }, editButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, errorText: { fontFamily: fonts.sans.regular, color: colors.accent, fontSize: 12, marginTop: 7, marginBottom: -2 }, timerRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' }, timerPill: { flex: 1, height: 46, borderRadius: 15, backgroundColor: colors.control, alignItems: 'center', justifyContent: 'center' }, timerPillSelected: { backgroundColor: colors.accent }, timerText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 13 }, timerTextSelected: { color: colors.accentForeground }, customHint: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 12, marginTop: 8, textAlign: 'right' }, startButton: { height: 54, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 21 }, startButtonText: { fontFamily: fonts.sans.semibold, color: colors.accentForeground, fontSize: 15, letterSpacing: 0.1 }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] }, disabled: { opacity: 0.5 }, recentHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 29 }, seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }, seeAllText: { fontFamily: fonts.sans.medium, color: colors.accent, fontSize: 13 }, seeAllDisabled: { color: colors.textMuted }, recentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 15, borderRadius: 21, marginTop: 1 }, recentIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' }, recentText: { flex: 1, marginLeft: 12 }, recentTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 15 }, recentMeta: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 12, marginTop: 4 }, emptyRecentWrap: { paddingVertical: 17 }, emptyRecent: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 14 }, emptyRecentHint: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 12, marginTop: 5 }, navBar: { height: NAV_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.navigationBackground, paddingHorizontal: 8 }, navItem: { minWidth: 64, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 5 }, navLabel: { fontFamily: fonts.sans.medium, color: colors.inactive, fontSize: 11 }, navLabelActive: { fontFamily: fonts.sans.semibold, color: colors.accent }, modalBackdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end', padding: 16 }, modalCard: { backgroundColor: colors.surface, borderRadius: 29, padding: 24, paddingTop: 14 }, modalHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 23 }, modalEyebrow: { fontFamily: fonts.sans.medium, color: colors.accent, fontSize: 11, letterSpacing: 2 }, modalTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 28, marginTop: 8 }, modalCopy: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 }, modalError: { fontFamily: fonts.sans.regular, color: colors.accent, fontSize: 12, marginTop: 10 }, durationPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.control, borderRadius: 20, padding: 7, marginTop: 23 }, stepperButton: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, durationValueWrap: { alignItems: 'center', flexDirection: 'row' }, durationInput: { fontFamily: fonts.sans.semibold, color: colors.text, fontSize: 30, minWidth: 52, textAlign: 'right', padding: 0 }, durationInputEmpty: { fontFamily: fonts.sans.regular, fontSize: 12, minWidth: 110, textAlign: 'left' }, durationUnit: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 13, marginLeft: 7, marginRight: 8 }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 23 }, cancelButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.control }, cancelText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 14 }, modalSaveButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, modalSaveText: { fontFamily: fonts.sans.semibold, color: colors.accentForeground, fontSize: 14 }, historyList: { maxHeight: 400, marginTop: 12 }, historyItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }, confirmCard: { backgroundColor: colors.surface, borderRadius: 27, padding: 24, marginBottom: 22 }, confirmIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.control, alignItems: 'center', justifyContent: 'center' }, placeholderContent: { backgroundColor: colors.background, padding: 24, paddingTop: 28, flexGrow: 1 }, placeholderTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 38, lineHeight: 44, marginTop: 25, maxWidth: 330 }, placeholderCard: { backgroundColor: colors.surface, borderRadius: 28, padding: 24, marginTop: 34 }, placeholderIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center' }, placeholderCardTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 24, marginTop: 22 }, placeholderCardCopy: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 }, focusScreen: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 30 }, focusTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 32, textAlign: 'center', marginTop: 24 }, focusTimer: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 72, letterSpacing: 3, marginTop: 54 }, focusStatus: { fontFamily: fonts.sans.medium, color: colors.accent, fontSize: 11, letterSpacing: 2, marginTop: 8 }, focusControl: { backgroundColor: colors.accent, height: 56, paddingHorizontal: 28, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: 55 }, focusControlText: { fontFamily: fonts.sans.semibold, color: colors.accentForeground, fontSize: 15 }, endButton: { minHeight: 44, justifyContent: 'center', marginTop: 13, paddingHorizontal: 20 }, endButtonText: { fontFamily: fonts.sans.medium, color: colors.muted, fontSize: 13 }, focusEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }, focusEmptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center' }, focusEmptyTitle: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 28, textAlign: 'center', marginTop: 22 }, focusEmptyCopy: { fontFamily: fonts.sans.regular, color: colors.muted, fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: 8, maxWidth: 270 }, secondaryButton: { minHeight: 52, paddingHorizontal: 28, borderRadius: 17, backgroundColor: colors.control, alignItems: 'center', justifyContent: 'center', marginTop: 25 }, secondaryButtonText: { fontFamily: fonts.sans.semibold, color: colors.text, fontSize: 15 }, appearanceOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.control, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 }, appearanceOptionSelected: { borderColor: colors.accent, backgroundColor: colors.inputBackground }, appearanceOptionLeading: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }, appearanceOptionText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 14 }, appearanceHint: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 12, marginTop: 3 }, appearanceModalCard: { backgroundColor: colors.surface, borderRadius: 28, padding: 24, paddingTop: 14 }, appearanceModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, appearanceClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, settingsScreen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 28 }, settingsRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, marginTop: 20 }, settingsRowLeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, settingsIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface }, settingsRowText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 15 }, developerSection: { marginTop: 34 }, resetRowText: { fontFamily: fonts.sans.medium, color: colors.accent, fontSize: 15 }, resetConfirmButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, aboutScreen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 24 }, aboutBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, aboutHeading: { minHeight: 70, justifyContent: 'center' }, aboutIdentity: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 30 }, aboutName: { fontFamily: fonts.serif.regular, color: colors.text, fontSize: 48 }, aboutDescription: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: 14 }, aboutCreator: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 14, marginTop: 48 }, aboutVersion: { fontFamily: fonts.sans.regular, color: colors.textMuted, fontSize: 13, marginTop: 8 }, aboutFooter: { fontFamily: fonts.serif.regular, color: colors.textMuted, fontSize: 17, textAlign: 'center', paddingBottom: 28 }, toast: { position: 'absolute', alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, maxWidth: '85%' }, toastText: { fontFamily: fonts.sans.medium, color: colors.text, fontSize: 13, textAlign: 'center' } });
}
