import { useState, useEffect } from 'react';
import { apiGet } from '../api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  return (
    <Alert
      data-testid="llm-mode-banner"
      className={cn(
        'mb-4 flex items-center justify-between',
        isDegraded
          ? 'border-amber-500 bg-amber-50 text-amber-800'
          : 'border-red-500 bg-red-50 text-red-800',
      )}
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <AlertDescription>
          {isDegraded
            ? 'LLM mode is DEGRADED — classification is running in ONNX-only mode. LLM augmentation is unavailable.'
            : 'LLM mode is OFF — all emails are routed to manual triage. Classification pipeline is disabled.'}
        </AlertDescription>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 shrink-0 text-current hover:opacity-70"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </Alert>
  );
}
