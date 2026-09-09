import { describe, expect, it } from 'vitest';
import { sessionCardShell } from './sessionCardShell';

describe('sessionCardShell', () => {
  it('tints the border by stage', () => {
    expect(sessionCardShell({ stage: 'running' })).toContain('border-info/50');
    expect(sessionCardShell({ stage: 'running' })).toContain('spin-border spin-border-info');
    expect(sessionCardShell({ stage: 'attention' })).toContain('border-warning/50');
    expect(sessionCardShell({ stage: 'attention' })).not.toContain('spin-border');
    expect(sessionCardShell({ stage: 'done' })).toContain('border-border-soft');
    expect(sessionCardShell({ stage: 'done' })).not.toContain('spin-border');
  });

  it('rests on the elevated surface without a shadow', () => {
    const classes = sessionCardShell({ stage: 'building' });
    expect(classes).toContain('bg-elevated');
    expect(classes).toContain('text-foreground');
    expect(classes).not.toContain('shadow-sm');
    expect(classes).not.toContain('bg-muted/40');
    expect(classes).not.toContain('text-foreground/70');
  });

  it('lets selection win over the stage tint', () => {
    const classes = sessionCardShell({ stage: 'running', selected: true });
    expect(classes).toContain('border-primary');
    expect(classes).not.toContain('border-info/50');
    expect(classes).not.toContain('spin-border');
  });

  it('lifts the active card and neutralises its border', () => {
    const classes = sessionCardShell({ stage: 'running', active: true });
    expect(classes).toContain('bg-elevated');
    expect(classes).toContain('shadow-sm');
    expect(classes).toContain('border-border');
    expect(classes).not.toContain('border-info/50');
  });

  it('dims on request', () => {
    expect(sessionCardShell({ stage: 'done', dimmed: true })).toContain('opacity-50');
    expect(sessionCardShell({ stage: 'done' })).not.toContain('opacity-50');
  });
});
