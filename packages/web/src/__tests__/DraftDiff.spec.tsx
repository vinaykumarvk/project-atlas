import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DraftDiff, computeWordDiff } from '../components/DraftDiff';

describe('DraftDiff (FR-053.A2)', () => {
  it('should render unchanged text without highlighting', () => {
    render(<DraftDiff original="Hello world" edited="Hello world" />);
    expect(screen.getByTestId('draft-diff')).toBeTruthy();
  });

  it('should detect added words', () => {
    const segments = computeWordDiff('Hello', 'Hello world');
    const added = segments.filter(s => s.type === 'added');
    expect(added.length).toBeGreaterThan(0);
  });

  it('should detect removed words', () => {
    const segments = computeWordDiff('Hello world', 'Hello');
    const removed = segments.filter(s => s.type === 'removed');
    expect(removed.length).toBeGreaterThan(0);
  });

  it('should handle empty strings', () => {
    const segments = computeWordDiff('', 'new text');
    expect(segments.length).toBeGreaterThan(0);
  });
});
