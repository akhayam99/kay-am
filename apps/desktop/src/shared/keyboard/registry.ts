import { currentPlatform } from '../platform';

export type ShortcutPlane = 'app' | 'session' | 'lens';

export type ShortcutEntry = {
  readonly combo: string;
  readonly label: string;
  readonly plane: ShortcutPlane;
};

export const SHORTCUTS = {
  'palette.open': { combo: 'cmd+KeyK', label: 'Command palette', plane: 'app' },
  'settings.open': { combo: 'cmd+Comma', label: 'Settings', plane: 'app' },
  'settings.shortcuts': { combo: 'cmd+Slash', label: 'Keyboard shortcuts', plane: 'app' },
  'session.new': { combo: 'cmd+KeyN', label: 'New session', plane: 'app' },
  'workspace.switcher': { combo: 'cmd+KeyO', label: 'Switch workspace', plane: 'app' },
  'workspace.1': { combo: 'cmd+Digit1', label: 'Workspace 1', plane: 'app' },
  'workspace.2': { combo: 'cmd+Digit2', label: 'Workspace 2', plane: 'app' },
  'workspace.3': { combo: 'cmd+Digit3', label: 'Workspace 3', plane: 'app' },
  'workspace.4': { combo: 'cmd+Digit4', label: 'Workspace 4', plane: 'app' },
  'workspace.5': { combo: 'cmd+Digit5', label: 'Workspace 5', plane: 'app' },
  'workspace.6': { combo: 'cmd+Digit6', label: 'Workspace 6', plane: 'app' },
  'workspace.7': { combo: 'cmd+Digit7', label: 'Workspace 7', plane: 'app' },
  'workspace.8': { combo: 'cmd+Digit8', label: 'Workspace 8', plane: 'app' },
  'workspace.9': { combo: 'cmd+Digit9', label: 'Workspace 9', plane: 'app' },
  'column.toggle': { combo: 'cmd+KeyB', label: 'Show or hide the session sidebar', plane: 'app' },
  'lens.back': { combo: 'cmd+BracketLeft', label: 'Back', plane: 'app' },
  'lens.forward': { combo: 'cmd+BracketRight', label: 'Forward', plane: 'app' },
  'zoom.in': { combo: 'cmd+Equal', label: 'Zoom in', plane: 'app' },
  'zoom.out': { combo: 'cmd+Minus', label: 'Zoom out', plane: 'app' },
  'zoom.reset': { combo: 'cmd+Digit0', label: 'Reset zoom', plane: 'app' },
  'app.reload': { combo: 'cmd+KeyR', label: 'Reload', plane: 'app' },

  'session.prev': { combo: 'cmd+shift+BracketLeft', label: 'Previous session', plane: 'session' },
  'session.next': { combo: 'cmd+shift+BracketRight', label: 'Next session', plane: 'session' },
  'session.archive': { combo: 'cmd+shift+KeyA', label: 'Archive session', plane: 'session' },
  'session.delete': { combo: 'cmd+shift+Backspace', label: 'Delete session', plane: 'session' },
  'session.model': { combo: 'cmd+shift+KeyM', label: 'Model picker', plane: 'session' },
  'session.permissions': {
    combo: 'cmd+shift+KeyP',
    label: 'Permission picker',
    plane: 'session',
  },
  'session.board': { combo: 'cmd+shift+KeyH', label: 'Back to board', plane: 'session' },

  'lens.overview': { combo: 'cmd+alt+KeyO', label: 'Overview', plane: 'lens' },
  'lens.context': { combo: 'cmd+alt+KeyC', label: 'Context', plane: 'lens' },
  'lens.goal': { combo: 'cmd+alt+KeyG', label: 'Context: Goal', plane: 'lens' },
  'lens.decisions': { combo: 'cmd+alt+KeyE', label: 'Context: Decisions', plane: 'lens' },
  'lens.summary': { combo: 'cmd+alt+KeyU', label: 'Context: Session summary', plane: 'lens' },
  'lens.workflows': { combo: 'cmd+alt+KeyW', label: 'Workflows', plane: 'lens' },
  'lens.agents': { combo: 'cmd+alt+KeyA', label: 'Agents', plane: 'lens' },
  'lens.review': { combo: 'cmd+alt+KeyR', label: 'Review', plane: 'lens' },
  'lens.questions': { combo: 'cmd+alt+KeyQ', label: 'Questions', plane: 'lens' },
  'lens.files': { combo: 'cmd+alt+KeyF', label: 'Diff', plane: 'lens' },
  'lens.explore': { combo: 'cmd+alt+KeyX', label: 'Explore', plane: 'lens' },
  'lens.plans': { combo: 'cmd+alt+KeyP', label: 'Plans', plane: 'lens' },
  'lens.scripts': { combo: 'cmd+alt+KeyS', label: 'Scripts', plane: 'lens' },
  'lens.terminal': { combo: 'cmd+alt+KeyT', label: 'Terminal', plane: 'lens' },
  'lens.pr': { combo: 'cmd+alt+Digit1', label: 'Code host', plane: 'lens' },
  'lens.linear': { combo: 'cmd+alt+Digit2', label: 'Linear', plane: 'lens' },
  'lens.gitlab_issues': { combo: 'cmd+alt+Digit4', label: 'GitLab issues', plane: 'lens' },
  'lens.jira_issues': { combo: 'cmd+alt+Digit5', label: 'Jira issues', plane: 'lens' },
  'lens.slack_threads': { combo: 'cmd+alt+Digit6', label: 'Slack threads', plane: 'lens' },
} as const satisfies Record<string, ShortcutEntry>;

export type ShortcutId = keyof typeof SHORTCUTS;

export const RESERVED_COMBOS: ReadonlyArray<string> = [
  'cmd+KeyQ',
  'cmd+KeyW',
  'cmd+KeyM',
  'cmd+KeyH',
  'cmd+alt+KeyH',
  'cmd+alt+KeyD',
  'cmd+shift+KeyQ',
  'cmd+alt+shift+KeyQ',
  'cmd+shift+Slash',
  'cmd+shift+Digit3',
  'cmd+shift+Digit4',
  'cmd+shift+Digit5',
  'cmd+Space',
  'cmd+Tab',
  'cmd+shift+Tab',
  'cmd+Backquote',
  'cmd+KeyA',
  'cmd+KeyC',
  'cmd+KeyV',
  'cmd+KeyX',
  'cmd+KeyZ',
  'cmd+shift+KeyZ',
  'cmd+Backspace',
  'cmd+ArrowLeft',
  'cmd+ArrowRight',
  'cmd+ArrowUp',
  'cmd+ArrowDown',
];

const MAC_GLYPH: Record<string, string> = {
  cmd: '⌘',
  shift: '⇧',
  alt: '⌥',
  ctrl: '⌃',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backspace: '⌫',
  Escape: '⎋',
  Enter: '↵',
  Space: '␣',
  Backquote: '`',
};

const KEY_LABEL: Record<string, string> = {
  cmd: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  ctrl: 'Ctrl',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backspace: 'Backspace',
  Escape: 'Esc',
  Enter: 'Enter',
  Space: 'Space',
  Backquote: '`',
};

const codeGlyph = ({ code, glyphs }: { code: string; glyphs: Record<string, string> }): string => {
  if (glyphs[code] != null) {
    return glyphs[code];
  }
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  return code;
};

export const formatCombo = (combo: string): string => {
  const onMac = currentPlatform() === 'darwin';
  const glyphs = onMac ? MAC_GLYPH : KEY_LABEL;
  return combo
    .split('+')
    .map((part, index, parts) =>
      index === parts.length - 1 ? codeGlyph({ code: part, glyphs }) : (glyphs[part] ?? part),
    )
    .join(onMac ? '' : '+');
};

export const shortcutGlyphs = (id: ShortcutId): string => formatCombo(SHORTCUTS[id].combo);
