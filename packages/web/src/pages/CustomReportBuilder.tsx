import { useState, useCallback, type DragEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { BarChart3, Loader2, Save, Clock, X } from 'lucide-react';

interface ReportSchema {
  name: string;
  dimensions: string[];
  measures: string[];
  filters?: Record<string, string | string[]>;
  groupBy?: string[];
  orderBy?: string;
  limit?: number;
}

/** FR-113.A2: Saved report configuration persisted to localStorage. */
interface SavedReport {
  id: string;
  name: string;
  dimensions: string[];
  measures: string[];
  filters?: Record<string, string | string[]>;
  savedAt: string;
}

/** FR-113.A2: Schedule configuration for a saved report. */
interface ReportSchedule {
  reportId: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  scheduledAt: string;
}

const SAVED_REPORTS_KEY = 'atlas_saved_reports';
const REPORT_SCHEDULES_KEY = 'atlas_report_schedules';

function loadSavedReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(SAVED_REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedReports(reports: SavedReport[]): void {
  localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(reports));
}

function loadSchedules(): ReportSchedule[] {
  try {
    const raw = localStorage.getItem(REPORT_SCHEDULES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSchedules(schedules: ReportSchedule[]): void {
  localStorage.setItem(REPORT_SCHEDULES_KEY, JSON.stringify(schedules));
}

interface ReportResult {
  schema: ReportSchema;
  rows: Record<string, unknown>[];
  totalRows: number;
  generatedAt: string;
}

const CustomReportBuilder = () => {
  const [reportName, setReportName] = useState('');
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([]);
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // FR-113.A2: Saved reports & scheduling state
  const [savedReports, setSavedReports] = useState<SavedReport[]>(loadSavedReports);
  const [scheduleFrequency, setScheduleFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);

  // FR-113.A1: Drag-and-drop state
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [draggedType, setDraggedType] = useState<'dimension' | 'measure' | null>(null);
  const [dimDropHighlight, setDimDropHighlight] = useState(false);
  const [measureDropHighlight, setMeasureDropHighlight] = useState(false);

  // FR-113.A1: Drag handlers
  const handleDragStart = useCallback((item: string, type: 'dimension' | 'measure') => (e: DragEvent) => {
    setDraggedItem(item);
    setDraggedType(type);
    e.dataTransfer.setData('text/plain', item);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDropOnDimensions = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDimDropHighlight(false);
    const item = e.dataTransfer.getData('text/plain') || draggedItem;
    if (item && draggedType === 'dimension' && !selectedDimensions.includes(item)) {
      setSelectedDimensions((prev) => [...prev, item]);
    }
    setDraggedItem(null);
    setDraggedType(null);
  }, [draggedItem, draggedType, selectedDimensions]);

  const handleDropOnMeasures = useCallback((e: DragEvent) => {
    e.preventDefault();
    setMeasureDropHighlight(false);
    const item = e.dataTransfer.getData('text/plain') || draggedItem;
    if (item && draggedType === 'measure' && !selectedMeasures.includes(item)) {
      setSelectedMeasures((prev) => [...prev, item]);
    }
    setDraggedItem(null);
    setDraggedType(null);
  }, [draggedItem, draggedType, selectedMeasures]);

  const handleDimDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (draggedType === 'dimension') setDimDropHighlight(true);
  }, [draggedType]);

  const handleDimDragLeave = useCallback(() => {
    setDimDropHighlight(false);
  }, []);

  const handleMeasureDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (draggedType === 'measure') setMeasureDropHighlight(true);
  }, [draggedType]);

  const handleMeasureDragLeave = useCallback(() => {
    setMeasureDropHighlight(false);
  }, []);

  // Fetch available dimensions and measures
  const { data: dimensionsData } = useQuery({
    queryKey: ['reports', 'dimensions'],
    queryFn: () => apiGet<{ data: string[] }>('/sla/reports/dimensions'),
  });

  const { data: measuresData } = useQuery({
    queryKey: ['reports', 'measures'],
    queryFn: () => apiGet<{ data: string[] }>('/sla/reports/measures'),
  });

  const availableDimensions = dimensionsData?.data ?? [
    'case_type', 'priority', 'status', 'assigned_fpr_id',
    'assigned_vendor_id', 'property_city', 'confidence_band', 'region',
  ];

  const availableMeasures = measuresData?.data ?? [
    'count', 'avg_tat', 'breach_rate', 'total_breached',
    'total_resolved', 'min_tat', 'max_tat',
  ];

  // Generate report mutation
  const generateMutation = useMutation({
    mutationFn: (schema: ReportSchema) =>
      apiPost<{ data: ReportResult }>('/sla/reports/execute', schema),
    onSuccess: (response) => {
      setReportResult(response.data);
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
      setReportResult(null);
    },
  });

  const toggleDimension = (dim: string) => {
    setSelectedDimensions((prev) =>
      prev.includes(dim)
        ? prev.filter((d) => d !== dim)
        : [...prev, dim],
    );
  };

  const toggleMeasure = (measure: string) => {
    setSelectedMeasures((prev) =>
      prev.includes(measure)
        ? prev.filter((m) => m !== measure)
        : [...prev, measure],
    );
  };

  // FR-113.A2: Save current report config to localStorage
  const handleSaveReport = () => {
    if (!reportName.trim()) {
      setError('Report name is required to save');
      return;
    }
    const newReport: SavedReport = {
      id: `rpt-${Date.now()}`,
      name: reportName,
      dimensions: selectedDimensions,
      measures: selectedMeasures,
      savedAt: new Date().toISOString(),
    };
    const updated = [...savedReports, newReport];
    setSavedReports(updated);
    persistSavedReports(updated);
    setError(null);
  };

  // FR-113.A2: Load a previously saved report config
  const handleLoadSavedReport = (reportId: string) => {
    const report = savedReports.find((r) => r.id === reportId);
    if (report) {
      setReportName(report.name);
      setSelectedDimensions(report.dimensions);
      setSelectedMeasures(report.measures);
      setError(null);
    }
  };

  // FR-113.A2: Schedule a report with a cron-like frequency
  const handleScheduleReport = () => {
    if (!reportName.trim()) {
      setError('Report name is required to schedule');
      return;
    }
    const schedule: ReportSchedule = {
      reportId: `rpt-${Date.now()}`,
      frequency: scheduleFrequency,
      scheduledAt: new Date().toISOString(),
    };
    const existing = loadSchedules();
    const updated = [...existing, schedule];
    persistSchedules(updated);
    setScheduleMessage(`Report "${reportName}" scheduled ${scheduleFrequency}`);
    setError(null);
    setTimeout(() => setScheduleMessage(null), 3000);
  };

  const handleGenerate = () => {
    if (!reportName.trim()) {
      setError('Report name is required');
      return;
    }
    if (selectedDimensions.length === 0) {
      setError('At least one dimension is required');
      return;
    }
    if (selectedMeasures.length === 0) {
      setError('At least one measure is required');
      return;
    }

    setError(null);

    const schema: ReportSchema = {
      name: reportName,
      dimensions: selectedDimensions,
      measures: selectedMeasures,
      groupBy: selectedDimensions,
    };

    generateMutation.mutate(schema);
  };

  // Derive column headers from report result
  const columnHeaders = reportResult
    ? [...reportResult.schema.dimensions, ...reportResult.schema.measures]
    : [];

  return (
    <div data-testid="custom-report-builder">
      <h2 className="mb-6 text-2xl font-bold">Custom Report Builder</h2>

      {/* Report Configuration */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Report Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Report Name */}
          <div className="space-y-2">
            <Label htmlFor="report-name">Report Name</Label>
            <Input
              id="report-name"
              data-testid="report-name-input"
              type="text"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="Enter report name..."
            />
          </div>

          {/* Dimensions -- draggable source cards */}
          <div className="space-y-2">
            <Label>
              Dimensions{' '}
              <span className="font-normal text-xs text-muted-foreground">(click or drag)</span>
            </Label>
            <div className="flex flex-wrap gap-2" data-testid="dimension-selector">
              {availableDimensions.map((dim) => (
                <Badge
                  key={dim}
                  data-testid={`dim-${dim}`}
                  draggable
                  onDragStart={handleDragStart(dim, 'dimension')}
                  onClick={() => toggleDimension(dim)}
                  variant={selectedDimensions.includes(dim) ? 'default' : 'outline'}
                  className="cursor-grab select-none"
                >
                  {dim}
                </Badge>
              ))}
            </div>
          </div>

          {/* Dimensions drop zone */}
          <div
            data-testid="dimension-drop-zone"
            onDragOver={handleDragOver}
            onDrop={handleDropOnDimensions}
            onDragEnter={handleDimDragEnter}
            onDragLeave={handleDimDragLeave}
            className={cn(
              'min-h-12 rounded-lg border-2 border-dashed px-3 py-2 flex flex-wrap gap-1.5 items-center text-sm text-muted-foreground transition-colors',
              dimDropHighlight
                ? 'border-primary bg-primary/5'
                : 'border-border bg-muted/30',
            )}
          >
            {selectedDimensions.length === 0
              ? 'Drop dimensions here'
              : selectedDimensions.map((d) => (
                  <Badge
                    key={d}
                    variant="secondary"
                    className="inline-flex items-center gap-1 bg-blue-100 text-blue-700"
                  >
                    {d}
                    <button
                      aria-label={`Remove ${d}`}
                      onClick={() => toggleDimension(d)}
                      className="ml-0.5 hover:text-blue-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
          </div>

          {/* Measures -- draggable source cards */}
          <div className="space-y-2">
            <Label>
              Measures{' '}
              <span className="font-normal text-xs text-muted-foreground">(click or drag)</span>
            </Label>
            <div className="flex flex-wrap gap-2" data-testid="measure-selector">
              {availableMeasures.map((measure) => (
                <Badge
                  key={measure}
                  data-testid={`measure-${measure}`}
                  draggable
                  onDragStart={handleDragStart(measure, 'measure')}
                  onClick={() => toggleMeasure(measure)}
                  variant={selectedMeasures.includes(measure) ? 'default' : 'outline'}
                  className="cursor-grab select-none"
                >
                  {measure}
                </Badge>
              ))}
            </div>
          </div>

          {/* Measures drop zone */}
          <div
            data-testid="measure-drop-zone"
            onDragOver={handleDragOver}
            onDrop={handleDropOnMeasures}
            onDragEnter={handleMeasureDragEnter}
            onDragLeave={handleMeasureDragLeave}
            className={cn(
              'min-h-12 rounded-lg border-2 border-dashed px-3 py-2 flex flex-wrap gap-1.5 items-center text-sm text-muted-foreground transition-colors',
              measureDropHighlight
                ? 'border-primary bg-primary/5'
                : 'border-border bg-muted/30',
            )}
          >
            {selectedMeasures.length === 0
              ? 'Drop measures here'
              : selectedMeasures.map((m) => (
                  <Badge
                    key={m}
                    variant="secondary"
                    className="inline-flex items-center gap-1 bg-blue-100 text-blue-700"
                  >
                    {m}
                    <button
                      aria-label={`Remove ${m}`}
                      onClick={() => toggleMeasure(m)}
                      className="ml-0.5 hover:text-blue-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive" data-testid="report-error">{error}</p>
          )}

          {/* Generate Button */}
          <Button
            data-testid="generate-report-btn"
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <BarChart3 />
                Generate Report
              </>
            )}
          </Button>

          {/* FR-113.A2: Save, Load & Schedule controls */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              data-testid="save-report-btn"
              onClick={handleSaveReport}
              variant="default"
              className="bg-green-600 hover:bg-green-700"
            >
              <Save />
              Save Report
            </Button>

            {savedReports.length > 0 && (
              <Select
                onValueChange={(value) => handleLoadSavedReport(value)}
              >
                <SelectTrigger className="w-[200px]" data-testid="saved-reports-dropdown">
                  <SelectValue placeholder="Saved Reports..." />
                </SelectTrigger>
                <SelectContent>
                  {savedReports.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={scheduleFrequency}
              onValueChange={(value) => setScheduleFrequency(value as 'daily' | 'weekly' | 'monthly')}
            >
              <SelectTrigger className="w-[130px]" data-testid="schedule-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>

            <Button
              data-testid="schedule-report-btn"
              onClick={handleScheduleReport}
              variant="default"
              className="bg-indigo-500 hover:bg-indigo-600"
            >
              <Clock />
              Schedule Report
            </Button>
          </div>
          {scheduleMessage && (
            <p className="text-sm text-green-600" data-testid="schedule-confirmation">
              {scheduleMessage}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Report Results */}
      {reportResult && (
        <Card data-testid="report-results">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base">{reportResult.schema.name}</CardTitle>
            <span className="text-xs text-muted-foreground">
              {reportResult.totalRows} rows | Generated at{' '}
              {new Date(reportResult.generatedAt).toLocaleString()}
            </span>
          </CardHeader>
          <CardContent>
            {reportResult.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data found for this report configuration</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {columnHeaders.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportResult.rows.map((row, idx) => (
                    <TableRow key={idx}>
                      {columnHeaders.map((col) => (
                        <TableCell key={col}>
                          {row[col] !== undefined && row[col] !== null
                            ? String(row[col])
                            : '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CustomReportBuilder;
