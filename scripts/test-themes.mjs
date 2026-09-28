import assert from 'node:assert/strict';
import test from 'node:test';
import { familyFor, glassTheme, nextThemeMode, paletteFor, parseGlassStyle, parseThemeMode, parseThemePalette, resolveEffectiveTheme, temperatureFor, themePalettes, usesNativeGlass } from '../theme.ts';

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function rgbDistance(first, second) {
  const channels = (hex) => hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
  const a = channels(first);
  const b = channels(second);
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

function composite(foreground, background) {
  const alpha = foreground.length === 9 ? parseInt(foreground.slice(7), 16) / 255 : 1;
  const channels = [1, 3, 5].map((start) => Math.round(parseInt(foreground.slice(start, start + 2), 16) * alpha + parseInt(background.slice(start, start + 2), 16) * (1 - alpha)));
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

test('saved palette names restore safely', () => {
  assert.equal(parseThemePalette('sage'), 'sage');
  assert.equal(parseThemePalette('ocean'), 'ocean');
  assert.equal(parseThemePalette('plum'), 'plum');
  assert.equal(parseThemePalette('classicPlus'), 'classicPlus');
  assert.equal(parseThemePalette('sagePlus'), 'sagePlus');
  assert.equal(parseThemePalette('oceanPlus'), 'oceanPlus');
  assert.equal(parseThemePalette('plumPlus'), 'plumPlus');
  for (const palette of ['classicCool', 'sageCool', 'oceanCool', 'plumCool', 'equinox', 'equinoxPlus', 'equinoxCool', 'monochrome', 'monochromeWarm', 'monochromeCool']) {
    assert.equal(parseThemePalette(palette), palette);
  }
  assert.equal(parseThemePalette(null), 'classic');
  assert.equal(parseThemePalette('unknown'), 'classic');
});

test('each theme family offers three temperatures and restores legacy variants', () => {
  for (const family of ['classic', 'sage', 'ocean', 'plum', 'equinox', 'monochrome']) {
    const palettes = ['standard', 'warm', 'cool'].map((temperature) => paletteFor(family, temperature));
    assert.equal(new Set(palettes).size, 3);
    for (const [index, palette] of palettes.entries()) {
      assert.equal(familyFor(palette), family);
      assert.equal(temperatureFor(palette), ['standard', 'warm', 'cool'][index]);
      assert.equal(parseThemePalette(palette), palette);
    }
  }
  assert.equal(temperatureFor(parseThemePalette('plumPlus')), 'warm');
  assert.equal(temperatureFor(parseThemePalette('sageCool')), 'cool');
});

test('System uses native Glass only when iOS reports availability', () => {
  assert.equal(usesNativeGlass('system', true), true);
  assert.equal(usesNativeGlass('glass', true), true);
  assert.equal(usesNativeGlass('light', true), false);
  assert.equal(usesNativeGlass('system', false), false);
  assert.equal(parseGlassStyle(null), 'tint');
  assert.equal(parseGlassStyle('clear'), 'clear');
  assert.equal(parseGlassStyle('invalid'), 'tint');
});

test('first launch follows the device appearance in System mode', () => {
  assert.equal(parseThemeMode(null, false), 'system');
  assert.equal(resolveEffectiveTheme('system', 'light'), 'light');
  assert.equal(resolveEffectiveTheme('system', 'dark'), 'dark');
});

test('Mode widget offers Glass only with native availability', () => {
  assert.equal(nextThemeMode('system', true), 'light');
  assert.equal(nextThemeMode('light', true), 'dark');
  assert.equal(nextThemeMode('dark', true), 'glass');
  assert.equal(nextThemeMode('glass', true), 'system');
  assert.equal(nextThemeMode('dark', false), 'system');
  assert.equal(nextThemeMode('glass', false), 'system');
  assert.equal(parseThemeMode('glass', true), 'glass');
  assert.equal(parseThemeMode('glass', false), 'system');
  assert.equal(resolveEffectiveTheme('glass', 'light', 'dark'), 'dark');
  assert.equal(resolveEffectiveTheme('glass', 'dark'), 'dark');
});

test('Glass preserves the selected palette and makes surfaces translucent', () => {
  const original = themePalettes.equinox.dark;
  const glass = glassTheme(original);
  assert.equal(glass.background, original.background);
  assert.equal(glass.accent, original.accent);
  assert.equal(glass.surface.slice(0, 7), original.surface);
  assert.match(glass.surface, /^#[0-9A-F]{8}$/i);
});

for (const mode of ['light', 'dark']) {
  test(`sage ${mode} has a visibly distinct canvas from classic`, () => {
    const sage = themePalettes.sage[mode];
    const classic = themePalettes.classic[mode];
    assert.ok(rgbDistance(sage.background, classic.background) >= 18, 'screen backgrounds differ');
    assert.ok(rgbDistance(sage.navigationBackground, classic.navigationBackground) >= 18, 'navigation backgrounds differ');
    assert.notEqual(sage.surface, classic.surface, 'cards have their own tint');
    assert.ok(contrast(sage.inactive, sage.navigationBackground) >= 4.5, 'navigation labels remain readable');
    assert.ok(contrast(sage.sageText, sage.completedSurface) >= 4.5, 'completed items remain readable');
  });
}

for (const name of ['classic', 'sage', 'ocean', 'plum']) {
  for (const mode of ['light', 'dark']) {
    test(`${name} ${mode}+ uses warm neutrals without losing its palette`, () => {
      const original = themePalettes[name][mode];
      const plus = themePalettes[`${name}Plus`][mode];
      assert.ok(rgbDistance(original.background, plus.background) >= 18, 'the canvas is visibly different');
      assert.equal(plus.accent, original.accent, 'primary accent is preserved');
      assert.equal(plus.sage, original.sage, 'completion color is preserved');
      assert.equal(plus.completedSurface, original.completedSurface, 'completion highlighting is preserved');
      const [red, green, blue] = plus.background.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
      assert.ok(red >= green && green >= blue, 'canvas has a warm hue');
      assert.ok(mode === 'light' ? luminance(plus.background) > 0.9 : luminance(plus.background) < 0.02, 'canvas matches the selected mode');
    });
  }
}

for (const name of ['classic', 'sage', 'ocean', 'plum']) {
  for (const mode of ['light', 'dark']) {
    test(`${name} ${mode} cool uses non-warm neutrals without losing its accent`, () => {
      const original = themePalettes[name][mode];
      const cool = themePalettes[`${name}Cool`][mode];
      assert.equal(cool.accent, original.accent);
      assert.equal(cool.sage, original.sage);
      assert.ok(rgbDistance(cool.background, original.background) >= 18, 'cool canvas is visibly different');
      const [red, green, blue] = cool.background.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
      assert.ok(blue > green && green > red, 'canvas has a cool hue');
    });
  }
}

test('Equinox and monochrome have distinct light/dark and temperature pairs', () => {
  assert.notEqual(themePalettes.equinox.light.background, themePalettes.equinox.dark.background);
  assert.notEqual(themePalettes.equinox.light.background, themePalettes.equinoxPlus.light.background);
  assert.notEqual(themePalettes.equinox.dark.background, themePalettes.equinoxCool.dark.background);
  assert.notEqual(themePalettes.monochrome.light.background, themePalettes.monochromeWarm.light.background);
  assert.notEqual(themePalettes.monochrome.dark.background, themePalettes.monochromeWarm.dark.background);
  assert.notEqual(themePalettes.monochrome.light.background, themePalettes.monochromeCool.light.background);
  for (const mode of ['light', 'dark']) {
    const colors = themePalettes.monochrome[mode];
    for (const color of [colors.accent, colors.sage, colors.danger, colors.archiveAccent]) {
      const [red, green, blue] = color.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
      assert.ok(Math.max(red, green, blue) - Math.min(red, green, blue) <= 24, 'actions stay near monochrome');
    }
  }
});

for (const [name, modes] of Object.entries(themePalettes)) {
  for (const [mode, colors] of Object.entries(modes)) {
    test(`${name} ${mode} keeps essential text and action colors readable`, () => {
      assert.ok(contrast(colors.text, colors.surface) >= 4.5, 'primary text on surface');
      assert.ok(contrast(colors.text, colors.background) >= 4.5, 'primary text on background');
      assert.ok(contrast(colors.accent, colors.surface) >= 4.5, 'accent text and icons on surface');
      assert.ok(contrast(colors.accent, colors.accentForeground) >= 4.5, 'text on accent');
      assert.ok(contrast(colors.sage, colors.sageForeground) >= 4.5, 'text on completion action');
      assert.ok(contrast(colors.sageText, colors.completedSurface) >= 4.5, 'completed text remains readable');
      assert.ok(contrast(colors.danger, colors.surface) >= 4.5, 'delete action on surface');
      assert.ok(contrast(colors.danger, colors.dangerForeground) >= 4.5, 'text on delete action');
      assert.ok(contrast(colors.archiveAccent, colors.surface) >= 4.5, 'archive action on surface');
      assert.ok(contrast(colors.archiveAccent, colors.archiveAccentForeground) >= 4.5, 'text on archive action');
      if (mode === 'dark') {
        assert.ok(luminance(colors.navigationSelectedBackground) < luminance(colors.background), 'off switch track is darker than the background');
        assert.ok(contrast(colors.text, colors.navigationSelectedBackground) >= 4.5, 'off switch knob against track');
        assert.ok(contrast(colors.background, colors.accent) >= 4.5, 'on switch knob against track');
      } else {
        assert.ok(contrast(colors.surface, colors.textMuted) >= 4.5, 'off switch knob against track');
      }
    });
    test(`${name} ${mode} stays readable on translucent Glass surfaces`, () => {
      const glass = glassTheme(colors);
      const surface = composite(glass.surface, glass.background);
      assert.ok(contrast(glass.text, surface) >= 4.5, 'primary text on translucent surface');
      assert.ok(contrast(glass.accent, surface) >= 4.5, 'accent on translucent surface');
    });
  }
}
