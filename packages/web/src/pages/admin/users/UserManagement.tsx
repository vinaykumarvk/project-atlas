import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: 'active' | 'inactive';
  lastLogin: string;
}

const MOCK_USERS: User[] = [
  { id: '1', name: 'Rajesh Kumar', email: 'rajesh@bank.com', roles: ['SYS_ADMIN'], status: 'active', lastLogin: '2026-04-27 09:15' },
  { id: '2', name: 'Amit Sharma', email: 'amit@bank.com', roles: ['COLLATERAL_OFFICER'], status: 'active', lastLogin: '2026-04-27 10:30' },
  { id: '3', name: 'Priya Patel', email: 'priya@bank.com', roles: ['COLLATERAL_OFFICER', 'TEAM_LEAD'], status: 'active', lastLogin: '2026-04-27 08:45' },
  { id: '4', name: 'Meena Desai', email: 'meena@bank.com', roles: ['REGIONAL_HEAD'], status: 'active', lastLogin: '2026-04-26 17:30' },
  { id: '5', name: 'Vendor Account', email: 'vendor@external.com', roles: ['VENDOR'], status: 'inactive', lastLogin: '2026-04-20 11:00' },
];

const ALL_ROLES = [
  'SYS_ADMIN', 'COLLATERAL_OFFICER', 'TEAM_LEAD', 'REGIONAL_HEAD',
  'COMPLIANCE_OFFICER', 'VENDOR', 'MASTER_DATA_ADMIN', 'MASTER_DATA_APPROVER',
];

export function UserManagement() {
  const [users] = useState(MOCK_USERS);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Users &amp; Roles</h3>
        <Button>+ Add User</Button>
      </div>

      <Input
        type="search"
        placeholder="Search users..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <Badge key={role} variant="secondary">{role}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={user.status === 'active' ? 'default' : 'outline'}
                  className={user.status === 'active' ? 'bg-green-600 hover:bg-green-600' : ''}
                >
                  {user.status}
                </Badge>
              </TableCell>
              <TableCell>{user.lastLogin}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}>Edit</Button>
                  <Button variant="ghost" size="sm">
                    {user.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit User: {editingUser?.name}</SheetTitle>
            <SheetDescription>
              Update user details and role assignments.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" type="text" defaultValue={editingUser?.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" defaultValue={editingUser?.email} />
            </div>
            <div className="space-y-3">
              <Label>Roles</Label>
              <div className="grid grid-cols-1 gap-3">
                {ALL_ROLES.map((role) => (
                  <div key={role} className="flex items-center space-x-2">
                    <Checkbox
                      id={`role-${role}`}
                      defaultChecked={editingUser?.roles.includes(role)}
                    />
                    <Label htmlFor={`role-${role}`} className="font-normal">
                      {role}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={() => setEditingUser(null)}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
