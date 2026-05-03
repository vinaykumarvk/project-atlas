import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../api/client';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface HealthMetric {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  value: string;
  detail: string;
}

interface QueueMetric {
  name: string;
  pending: number;
  processing: number;
  failed: number;
}

interface ErrorEntry {
  time: string;
  source: string;
  message: string;
}

interface HealthDetailedResponse {
  metrics: HealthMetric[];
  queues: QueueMetric[];
  errors: ErrorEntry[];
  lastUpdated: string;
}

const FALLBACK_METRICS: HealthMetric[] = [
  { name: 'API Server', status: 'healthy', value: '99.9%', detail: 'Uptime last 24h' },
  { name: 'Database', status: 'healthy', value: '12ms', detail: 'Avg query latency' },
  { name: 'Redis/Queue', status: 'healthy', value: '3', detail: 'Jobs in queue' },
  { name: 'Email Polling', status: 'healthy', value: '2 min', detail: 'Last poll age' },
  { name: 'LLM Provider', status: 'degraded', value: '850ms', detail: 'Avg latency (elevated)' },
  { name: 'S3 Storage', status: 'healthy', value: '100%', detail: 'Available' },
];

const FALLBACK_QUEUES: QueueMetric[] = [
  { name: 'email-ingest', pending: 2, processing: 1, failed: 0 },
  { name: 'classification', pending: 5, processing: 2, failed: 1 },
  { name: 'notifications', pending: 12, processing: 3, failed: 0 },
  { name: 'sla-evaluation', pending: 0, processing: 0, failed: 0 },
];

const FALLBACK_ERRORS: ErrorEntry[] = [
  { time: '10:23:45', source: 'classification', message: 'LLM timeout after 30s — fell back to distilled classifier' },
  { time: '09:55:12', source: 'email-ingest', message: 'Graph API rate limit (429) — retrying in 60s' },
];

const statusDotClass: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
};

const statusBorderClass: Record<string, string> = {
  healthy: 'border-green-200',
  degraded: 'border-yellow-200',
  down: 'border-red-200',
};

export function HealthDashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['health-detailed'],
    queryFn: () => apiGet<HealthDetailedResponse>('/health/detailed'),
    refetchInterval: 30000, // refresh every 30s
  });

  const metrics: HealthMetric[] = data?.metrics ?? FALLBACK_METRICS;
  const queues: QueueMetric[] = data?.queues ?? FALLBACK_QUEUES;
  const errors: ErrorEntry[] = data?.errors ?? FALLBACK_ERRORS;
  const lastUpdated = data?.lastUpdated ?? 'just now';

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="health-loading">
        <div>
          <h3 className="text-lg font-semibold">System Health</h3>
        </div>
        <p className="text-muted-foreground">Loading health metrics...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4" data-testid="health-error">
        <div>
          <h3 className="text-lg font-semibold">System Health</h3>
        </div>
        <p className="text-destructive">
          Failed to load health data: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="health-dashboard">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">System Health</h3>
        <span className="text-sm text-muted-foreground">Last updated: {lastUpdated}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.name} className={cn('transition-colors', statusBorderClass[metric.status])}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('inline-block h-2.5 w-2.5 rounded-full', statusDotClass[metric.status])} />
                <span className="text-sm font-medium">{metric.name}</span>
              </div>
              <div className="text-2xl font-bold">{metric.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{metric.detail}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <h4 className="text-base font-semibold">Queue Status</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Queue</TableHead>
              <TableHead>Pending</TableHead>
              <TableHead>Processing</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queues.map((q) => (
              <TableRow key={q.name}>
                <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-sm">{q.name}</code></TableCell>
                <TableCell>{q.pending}</TableCell>
                <TableCell>{q.processing}</TableCell>
                <TableCell className={cn(q.failed > 0 && 'text-destructive font-medium')}>{q.failed}</TableCell>
                <TableCell>{q.pending + q.processing + q.failed}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <h4 className="text-base font-semibold">Recent Errors (last 1h)</h4>
        <div className="space-y-2">
          {errors.map((entry, idx) => (
            <div key={idx} className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <span className="font-mono text-muted-foreground shrink-0">{entry.time}</span>
              <span className="font-semibold text-destructive shrink-0">{entry.source}</span>
              <span className="text-foreground">{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
