import { useState, useEffect } from 'react';
import { apiGet } from '../api/client';

interface HealthStatus {
  llmMode?: string;
  [key: string]: unknown;
}

export function LlmModeBanner() {
  const [mode, setMode] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const fetchMode = async () => {
      try {
        const health = await apiGet<HealthStatus>('/health/detailed');
        setMode(health.llmMode || null);
      } catch {
        // Health endpoint may not be available in demo mode
      }
    };
    fetchMode();
    const interval = setInterval(fetchMode, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!mode || mode === 'ON' || dismissed) return null;

  const isDegraded = mode === 'DEGRADED';
  const bgColor = isDegraded ? '#fef3c7' : '#fee2e2';
  const textColor = isDegraded ? '#92400e' : '#991b1b';
  const borderColor = isDegraded ? '#f59e0b' : '#ef4444';

  return (
    <div
      data-testid="llm-mode-banner"
      style={{
        padding: '12px 16px',
        backgroundColor: bgColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        marginBottom: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span>
        {isDegraded
          ? 'LLM mode is DEGRADED — classification is running in ONNX-only mode. LLM augmentation is unavailable.'
          : 'LLM mode is OFF — all emails are routed to manual triage. Classification pipeline is disabled.'}
      </span>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 18,
          color: textColor,
        }}
      >
        ×
      </button>
    </div>
  );
}
