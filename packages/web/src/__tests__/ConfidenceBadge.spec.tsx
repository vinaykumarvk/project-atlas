import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceBadge, type ConfidenceBand } from '../components/ConfidenceBadge';

describe('ConfidenceBadge', () => {
  const bands: ConfidenceBand[] = ['GREEN', 'AMBER', 'RED', 'RED_MANUAL'];

  it.each(bands)('renders %s band with correct aria-label', (band) => {
    render(<ConfidenceBadge band={band} />);

    const badge = screen.getByRole('status');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('aria-label')).toBe(`Confidence: ${band}`);
  });

  it.each(bands)('renders %s band with an icon alongside text', (band) => {
    render(<ConfidenceBadge band={band} />);

    const badge = screen.getByRole('status');
    const text = badge.textContent || '';

    // Badge text should contain the band label
    expect(text).toContain(band);

    // Badge should contain a Unicode icon character (not just the label)
    const iconChars = ['\u2714', '\u26A0', '\u26D4']; // check, warning, stop
    const hasIcon = iconChars.some((icon) => text.includes(icon));
    expect(hasIcon).toBe(true);
  });

  it('GREEN band shows checkmark icon', () => {
    render(<ConfidenceBadge band="GREEN" />);
    const badge = screen.getByRole('status');
    expect(badge.textContent).toContain('\u2714');
  });

  it('AMBER band shows warning icon', () => {
    render(<ConfidenceBadge band="AMBER" />);
    const badge = screen.getByRole('status');
    expect(badge.textContent).toContain('\u26A0');
  });

  it('RED band shows alert icon', () => {
    render(<ConfidenceBadge band="RED" />);
    const badge = screen.getByRole('status');
    expect(badge.textContent).toContain('\u26A0');
  });

  it('RED_MANUAL band shows stop icon', () => {
    render(<ConfidenceBadge band="RED_MANUAL" />);
    const badge = screen.getByRole('status');
    expect(badge.textContent).toContain('\u26D4');
  });

  it('all 4 bands render successfully without errors', () => {
    const { container } = render(
      <>
        <ConfidenceBadge band="GREEN" />
        <ConfidenceBadge band="AMBER" />
        <ConfidenceBadge band="RED" />
        <ConfidenceBadge band="RED_MANUAL" />
      </>,
    );

    const badges = container.querySelectorAll('[role="status"]');
    expect(badges.length).toBe(4);

    // Each badge has a unique aria-label
    const labels = Array.from(badges).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Confidence: GREEN',
      'Confidence: AMBER',
      'Confidence: RED',
      'Confidence: RED_MANUAL',
    ]);
  });
});
