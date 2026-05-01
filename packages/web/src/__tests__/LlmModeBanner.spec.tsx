import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LlmModeBanner } from '../components/LlmModeBanner';

// Mock the API client
vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from '../api/client';

describe('LlmModeBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when LLM mode is ON', async () => {
    (apiGet as any).mockResolvedValue({ llmMode: 'ON' });
    const { container } = render(<LlmModeBanner />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="llm-mode-banner"]')).toBeNull();
    });
  });

  it('should show yellow banner when DEGRADED', async () => {
    (apiGet as any).mockResolvedValue({ llmMode: 'DEGRADED' });
    render(<LlmModeBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('llm-mode-banner')).toBeTruthy();
      expect(screen.getByText(/DEGRADED/)).toBeTruthy();
    });
  });

  it('should show red banner when OFF', async () => {
    (apiGet as any).mockResolvedValue({ llmMode: 'OFF' });
    render(<LlmModeBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('llm-mode-banner')).toBeTruthy();
      expect(screen.getByText(/OFF/)).toBeTruthy();
    });
  });

  it('should be dismissible', async () => {
    (apiGet as any).mockResolvedValue({ llmMode: 'DEGRADED' });
    render(<LlmModeBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('llm-mode-banner')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('\u00d7'));
    expect(screen.queryByTestId('llm-mode-banner')).toBeNull();
  });
});
