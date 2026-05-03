import { UserManagement } from './users/UserManagement';
import { FeatureFlags } from './feature-flags/FeatureFlags';
import { HealthDashboard } from './health/HealthDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function AdminConsole() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Admin Console</h2>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users &amp; Roles</TabsTrigger>
          <TabsTrigger value="feature-flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="health">System Health</TabsTrigger>
          <TabsTrigger value="mailbox">Mailbox Config</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UserManagement />
        </TabsContent>
        <TabsContent value="feature-flags">
          <FeatureFlags />
        </TabsContent>
        <TabsContent value="health">
          <HealthDashboard />
        </TabsContent>
        <TabsContent value="mailbox">
          <MailboxConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MailboxConfig() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Mailbox Configuration</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mailbox</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Polled</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>collateral-ops@bank.com</TableCell>
            <TableCell>Microsoft Graph</TableCell>
            <TableCell>
              <Badge variant="default" className="bg-green-600 hover:bg-green-600">Active</Badge>
            </TableCell>
            <TableCell>2 min ago</TableCell>
            <TableCell>
              <Button variant="outline" size="sm">Edit</Button>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>collateral-backup@bank.com</TableCell>
            <TableCell>Gmail API</TableCell>
            <TableCell>
              <Badge variant="default" className="bg-green-600 hover:bg-green-600">Active</Badge>
            </TableCell>
            <TableCell>5 min ago</TableCell>
            <TableCell>
              <Button variant="outline" size="sm">Edit</Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
