import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface BulkImportWizardProps {
  open: boolean;
  masterKey: string;
  onClose: () => void;
}

type WizardStep = 'upload' | 'validate' | 'review' | 'submit';

const STEPS: WizardStep[] = ['upload', 'validate', 'review', 'submit'];

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export function BulkImportWizard({ open, masterKey, onClose }: BulkImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
  };

  const handleValidate = () => {
    // Simulate validation
    setErrors([
      { row: 3, field: 'pin_prefix', message: 'Must be exactly 3 digits' },
      { row: 7, field: 'canonical_form', message: 'Required field is empty' },
    ]);
    setValidCount(8);
    setStep('review');
  };

  const handleSubmit = () => {
    setSubmitted(true);
    setStep('submit');
  };

  const currentStepIndex = STEPS.indexOf(step);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Bulk Import: {masterKey.replace(/_/g, ' ')}</SheetTitle>
          <SheetDescription>
            Import records from a CSV or Excel file
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Step indicators */}
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                      step === s
                        ? 'border-primary bg-primary text-primary-foreground'
                        : currentStepIndex > i
                          ? 'border-primary bg-primary/20 text-primary'
                          : 'border-muted-foreground/30 text-muted-foreground',
                    )}
                  >
                    {currentStepIndex > i ? (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs capitalize',
                      step === s ? 'font-semibold text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {s}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'mx-2 h-0.5 w-12 sm:w-16',
                      currentStepIndex > i ? 'bg-primary' : 'bg-muted-foreground/30',
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a CSV or Excel file with master data records.
              </p>
              <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8">
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="max-w-xs"
                />
                {file && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
              <Button
                disabled={!file}
                onClick={() => { setStep('validate'); handleValidate(); }}
              >
                Upload &amp; Validate
              </Button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="flex flex-col items-center justify-center p-6">
                    <span className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {validCount}
                    </span>
                    <span className="text-sm text-muted-foreground">Valid rows</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex flex-col items-center justify-center p-6">
                    <span className="text-3xl font-bold text-destructive">
                      {errors.length}
                    </span>
                    <span className="text-sm text-muted-foreground">Errors</span>
                  </CardContent>
                </Card>
              </div>

              {errors.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Validation Errors</h4>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Field</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errors.map((err, i) => (
                          <TableRow key={i}>
                            <TableCell>{err.row}</TableCell>
                            <TableCell>{err.field}</TableCell>
                            <TableCell>{err.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button variant="ghost" size="sm">
                    Download Errors CSV
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setStep('upload')}>
                  Re-upload
                </Button>
                <Button onClick={handleSubmit} disabled={validCount === 0}>
                  Submit {validCount} rows for Approval
                </Button>
              </div>
            </div>
          )}

          {step === 'submit' && submitted && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <svg
                  className="h-6 w-6 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h4 className="text-lg font-semibold">Batch Submitted Successfully</h4>
              <p className="text-sm text-muted-foreground">
                {validCount} records have been submitted for maker-checker approval.
              </p>
              <p className="text-sm text-muted-foreground">
                They will appear in the Approver Inbox for review.
              </p>
              <Button onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
