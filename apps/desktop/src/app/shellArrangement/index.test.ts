import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { shellArrangement } from './index';

const DESKTOP_SRC = join(__dirname, '..', '..');

const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') ? [full] : [];
  });

const shellMounts = (): ReadonlyArray<{ readonly path: string; readonly source: string }> =>
  sourceFiles(DESKTOP_SRC)
    .filter(
      (path) =>
        !path.includes('__tests__') && !path.endsWith('.test.tsx') && !path.endsWith('.test.ts'),
    )
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => source.includes('<AppShell'));

describe('shellArrangement', () => {
  it('hides the column on the board, where there is no sessions list to show', () => {
    expect(
      shellArrangement({ hasWorkspace: true, hasActiveSession: false, isSidebarCollapsed: false }),
    ).toEqual({
      hasFooter: true,
      leftHidden: true,
      leftSidebarCollapsed: false,
      leftSlot: 'none',
      leftOverlaySlot: 'none',
    });
  });

  it('ignores a stale collapse preference while no session is open', () => {
    expect(
      shellArrangement({ hasWorkspace: true, hasActiveSession: false, isSidebarCollapsed: true }),
    ).toEqual({
      hasFooter: true,
      leftHidden: true,
      leftSidebarCollapsed: false,
      leftSlot: 'none',
      leftOverlaySlot: 'none',
    });
  });

  it('lays out the sessions column inside a session', () => {
    expect(
      shellArrangement({ hasWorkspace: true, hasActiveSession: true, isSidebarCollapsed: false }),
    ).toEqual({
      hasFooter: true,
      leftHidden: false,
      leftSidebarCollapsed: false,
      leftSlot: 'sessions',
      leftOverlaySlot: 'none',
    });
  });

  it('swaps the column for the rail and arms peek once collapsed', () => {
    expect(
      shellArrangement({ hasWorkspace: true, hasActiveSession: true, isSidebarCollapsed: true }),
    ).toEqual({
      hasFooter: true,
      leftHidden: false,
      leftSidebarCollapsed: true,
      leftSlot: 'rail',
      leftOverlaySlot: 'peek',
    });
  });

  it('drops the footer with no workspace, which no session can outlive', () => {
    expect(
      shellArrangement({ hasWorkspace: false, hasActiveSession: true, isSidebarCollapsed: false }),
    ).toEqual({
      hasFooter: false,
      leftHidden: true,
      leftSidebarCollapsed: false,
      leftSlot: 'none',
      leftOverlaySlot: 'none',
    });
  });
});

describe('every shell mount, the app and the mock scenes alike', () => {
  it('finds the composition root and at least one scene to police', () => {
    const paths = shellMounts().map(({ path }) => path);
    expect(paths.some((path) => path.endsWith('App.tsx'))).toBe(true);
    expect(paths.some((path) => path.includes('MockScene'))).toBe(true);
  });

  it('derives its arrangement from the helper instead of hand picking one', () => {
    const handPicked = shellMounts()
      .filter(({ source }) => !/from '[^']*shellArrangement'/.test(source))
      .map(({ path }) => path);
    expect(handPicked).toEqual([]);
  });

  it('never writes a literal into the shell layout props', () => {
    const literals = shellMounts()
      .filter(({ source }) =>
        /left(Hidden|SidebarCollapsed)/.test(
          source.replace(/left(Hidden|SidebarCollapsed)=\{arrangement\.\w+\}/g, ''),
        ),
      )
      .map(({ path }) => path);
    expect(literals).toEqual([]);
  });
});
