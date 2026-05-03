import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface RoutingRationaleProps {
  rationale: string;
  tier?: string;
  fprName?: string;
  workloadRatio?: number;
  fallbackChain?: string[];
  resolvedKeys?: Record<string, string>;
}

export function RoutingRationale({
  rationale,
  tier,
  fprName,
  workloadRatio,
  fallbackChain,
  resolvedKeys,
}: RoutingRationaleProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="mt-4" data-testid="routing-rationale">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="flex w-full items-center justify-between bg-muted/50 px-4 py-3 text-sm font-semibold hover:bg-muted">
          <span>Why this routing?</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-4 text-sm">
            <div>
              <strong>Rationale:</strong> {rationale}
            </div>

            {tier && (
              <div>
                <strong>Matched Tier:</strong>{' '}
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                  {tier}
                </Badge>
              </div>
            )}

            {fprName && (
              <div>
                <strong>Assigned FPR:</strong> {fprName}
              </div>
            )}

            {workloadRatio !== undefined && (
              <div>
                <strong>Workload Ratio:</strong> {(workloadRatio * 100).toFixed(0)}%
              </div>
            )}

            {resolvedKeys && Object.keys(resolvedKeys).length > 0 && (
              <div>
                <strong>Resolved Keys:</strong>
                <ul className="mt-1 list-disc pl-5">
                  {Object.entries(resolvedKeys).map(([key, value]) => (
                    <li key={key}>{key}: {value || 'N/A'}</li>
                  ))}
                </ul>
              </div>
            )}

            {fallbackChain && fallbackChain.length > 0 && (
              <div>
                <strong>Fallback Chain:</strong>
                <ol className="mt-1 list-decimal pl-5">
                  {fallbackChain.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
