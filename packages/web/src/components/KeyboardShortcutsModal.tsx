import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  key: string;
  description: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: 'j', description: 'Next case in list' },
  { key: 'k', description: 'Previous case in list' },
  { key: 'Enter', description: 'Open selected case' },
  { key: '/', description: 'Focus search' },
  { key: 'n', description: 'Add note (case detail)' },
  { key: 'Escape', description: 'Go back / close modal' },
];

/**
 * Modal displaying available keyboard shortcuts.
 * Triggered by the `?` key.
 */
export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[480px]" data-testid="shortcuts-modal">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <Table>
          <TableBody>
            {SHORTCUTS.map((s) => (
              <TableRow key={s.key}>
                <TableCell className="w-20 text-right">
                  <kbd className="inline-block rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs font-semibold shadow-sm">
                    {s.key}
                  </kbd>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
