import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface ProposeChangeDrawerProps {
  open: boolean;
  masterKey: string;
  existingData: Record<string, unknown> | null;
  onClose: () => void;
  onSubmit: () => void;
}

export function ProposeChangeDrawer({ open, masterKey, existingData, onClose, onSubmit }: ProposeChangeDrawerProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [effectiveAt, setEffectiveAt] = useState('');

  useEffect(() => {
    if (open) {
      setFormData(
        existingData
          ? Object.fromEntries(Object.entries(existingData).map(([k, v]) => [k, String(v)]))
          : {},
      );
      setEffectiveAt('');
    }
  }, [open, existingData]);

  const isEdit = existingData !== null;
  const title = isEdit ? 'Propose Edit' : 'Propose New Record';

  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production: POST to /v1/masters/:masterName/changes
    onSubmit();
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            Master: {masterKey.replace(/_/g, ' ')}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 py-6">
          <div className="space-y-4">
            {Object.entries(formData)
              .filter(([key]) => key !== 'id')
              .map(([key, value]) => (
                <div className="space-y-2" key={key}>
                  <Label htmlFor={key} className="capitalize">
                    {key.replace(/_/g, ' ')}
                  </Label>
                  <Input
                    id={key}
                    type="text"
                    value={value}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                  />
                </div>
              ))}

            <div className="space-y-2">
              <Label htmlFor="effective_at">Effective From (optional)</Label>
              <Input
                id="effective_at"
                type="date"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
              />
            </div>
          </div>

          {isEdit && existingData && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Changes Preview</h4>
              <div className="space-y-2">
                {Object.entries(formData)
                  .filter(([key, val]) => key !== 'id' && String(existingData[key]) !== val)
                  .map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-muted-foreground">{key}:</span>
                      <span className="line-through text-destructive">{String(existingData[key])}</span>
                      <span className="text-muted-foreground">&rarr;</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{val}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <SheetFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Submit for Approval
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
