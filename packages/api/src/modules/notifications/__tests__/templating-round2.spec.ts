import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { NotificationChannel } from '../types';

describe('Phase 3 — FR-101 A1: Handlebars-style Templating', () => {
  let dispatchService: NotificationDispatchService;

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPrisma = createMockPrismaService() as any;

    mockPrisma.notificationLog.create.mockResolvedValue({
      id: 'mock-id',
      created_at: new Date(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    dispatchService = module.get(NotificationDispatchService);
  });

  describe('Simple variable interpolation (backward compat)', () => {
    it('should replace {{variable}} with string values', () => {
      const result = dispatchService.interpolate(
        'Hello {{name}}, your case is {{case_number}}.',
        { name: 'Amit', case_number: 'ATL-2026-000001' },
      );
      expect(result).toBe('Hello Amit, your case is ATL-2026-000001.');
    });

    it('should leave unmatched variables as-is', () => {
      const result = dispatchService.interpolate(
        'Hello {{name}}, priority: {{priority}}.',
        { name: 'Amit' },
      );
      expect(result).toBe('Hello Amit, priority: {{priority}}.');
    });

    it('should handle empty variables object', () => {
      const result = dispatchService.interpolate(
        'Hello {{name}}.',
        {},
      );
      expect(result).toBe('Hello {{name}}.');
    });

    it('should handle template with no variables', () => {
      const result = dispatchService.interpolate(
        'Hello world, no variables here.',
        { name: 'Amit' },
      );
      expect(result).toBe('Hello world, no variables here.');
    });

    it('should handle numeric values', () => {
      const result = dispatchService.interpolate(
        'Count: {{count}}',
        { count: 42 },
      );
      expect(result).toBe('Count: 42');
    });
  });

  describe('{{#if condition}}...{{/if}} conditionals', () => {
    it('should render if block when condition is truthy string', () => {
      const result = dispatchService.interpolate(
        '{{#if isUrgent}}URGENT: {{/if}}Case {{case_number}}',
        { isUrgent: 'yes', case_number: 'ATL-001' },
      );
      expect(result).toBe('URGENT: Case ATL-001');
    });

    it('should skip if block when condition is falsy', () => {
      const result = dispatchService.interpolate(
        '{{#if isUrgent}}URGENT: {{/if}}Case {{case_number}}',
        { isUrgent: false, case_number: 'ATL-001' },
      );
      expect(result).toBe('Case ATL-001');
    });

    it('should skip if block when condition is undefined', () => {
      const result = dispatchService.interpolate(
        '{{#if isUrgent}}URGENT: {{/if}}Case {{case_number}}',
        { case_number: 'ATL-001' },
      );
      expect(result).toBe('Case ATL-001');
    });

    it('should skip if block when condition is null', () => {
      const result = dispatchService.interpolate(
        '{{#if isUrgent}}URGENT: {{/if}}Normal',
        { isUrgent: null },
      );
      expect(result).toBe('Normal');
    });

    it('should skip if block when condition is empty string', () => {
      const result = dispatchService.interpolate(
        '{{#if isUrgent}}URGENT: {{/if}}Normal',
        { isUrgent: '' },
      );
      expect(result).toBe('Normal');
    });

    it('should skip if block when condition is 0', () => {
      const result = dispatchService.interpolate(
        '{{#if count}}Has items{{/if}}',
        { count: 0 },
      );
      expect(result).toBe('');
    });

    it('should render if block when condition is a non-empty array', () => {
      const result = dispatchService.interpolate(
        '{{#if items}}Has items{{/if}}',
        { items: [1, 2, 3] },
      );
      expect(result).toBe('Has items');
    });

    it('should skip if block when condition is an empty array', () => {
      const result = dispatchService.interpolate(
        '{{#if items}}Has items{{/if}}',
        { items: [] },
      );
      expect(result).toBe('');
    });

    it('should render if block when condition is true boolean', () => {
      const result = dispatchService.interpolate(
        '{{#if active}}Active{{/if}}',
        { active: true },
      );
      expect(result).toBe('Active');
    });

    it('should support {{else}} clause', () => {
      const result = dispatchService.interpolate(
        '{{#if isBreached}}BREACHED{{else}}On Track{{/if}}',
        { isBreached: false },
      );
      expect(result).toBe('On Track');
    });

    it('should render if body when truthy with {{else}} present', () => {
      const result = dispatchService.interpolate(
        '{{#if isBreached}}BREACHED{{else}}On Track{{/if}}',
        { isBreached: true },
      );
      expect(result).toBe('BREACHED');
    });

    it('should support nested variables inside if blocks', () => {
      const result = dispatchService.interpolate(
        '{{#if show}}Value: {{value}}{{/if}}',
        { show: true, value: 'hello' },
      );
      expect(result).toBe('Value: hello');
    });

    it('should handle nested if blocks', () => {
      const result = dispatchService.interpolate(
        '{{#if outer}}[{{#if inner}}INNER{{/if}}]{{/if}}',
        { outer: true, inner: true },
      );
      expect(result).toBe('[INNER]');
    });

    it('should handle nested if blocks with outer true inner false', () => {
      const result = dispatchService.interpolate(
        '{{#if outer}}[{{#if inner}}INNER{{/if}}]{{/if}}',
        { outer: true, inner: false },
      );
      expect(result).toBe('[]');
    });
  });

  describe('{{#each items}}...{{/each}} loops', () => {
    it('should iterate over an array of strings', () => {
      const result = dispatchService.interpolate(
        'Items: {{#each items}}{{this}}, {{/each}}done.',
        { items: ['a', 'b', 'c'] },
      );
      expect(result).toBe('Items: a, b, c, done.');
    });

    it('should iterate over an array of objects', () => {
      const result = dispatchService.interpolate(
        '{{#each cases}}Case: {{case_number}} ({{status}})\n{{/each}}',
        {
          cases: [
            { case_number: 'ATL-001', status: 'OPEN' },
            { case_number: 'ATL-002', status: 'CLOSED' },
          ],
        },
      );
      expect(result).toBe('Case: ATL-001 (OPEN)\nCase: ATL-002 (CLOSED)\n');
    });

    it('should expose @index in each iteration', () => {
      const result = dispatchService.interpolate(
        '{{#each items}}{{@index}}: {{this}};{{/each}}',
        { items: ['x', 'y', 'z'] },
      );
      expect(result).toBe('0: x;1: y;2: z;');
    });

    it('should expose @first and @last', () => {
      const result = dispatchService.interpolate(
        '{{#each items}}{{#if @first}}[FIRST]{{/if}}{{this}}{{#if @last}}[LAST]{{/if}}{{/each}}',
        { items: ['a', 'b', 'c'] },
      );
      expect(result).toBe('[FIRST]abc[LAST]');
    });

    it('should handle empty array', () => {
      const result = dispatchService.interpolate(
        'Before{{#each items}}ITEM{{/each}}After',
        { items: [] },
      );
      expect(result).toBe('BeforeAfter');
    });

    it('should handle undefined collection', () => {
      const result = dispatchService.interpolate(
        'Before{{#each items}}ITEM{{/each}}After',
        {},
      );
      expect(result).toBe('BeforeAfter');
    });

    it('should iterate over object keys with @key', () => {
      const result = dispatchService.interpolate(
        '{{#each counts}}{{@key}}: {{this}};{{/each}}',
        { counts: { open: 5, closed: 3 } },
      );
      expect(result).toBe('open: 5;closed: 3;');
    });

    it('should support nested each and if blocks', () => {
      const result = dispatchService.interpolate(
        '{{#each cases}}{{#if isBreached}}BREACH:{{/if}}{{case_number}};{{/each}}',
        {
          cases: [
            { case_number: 'ATL-001', isBreached: true },
            { case_number: 'ATL-002', isBreached: false },
            { case_number: 'ATL-003', isBreached: true },
          ],
        },
      );
      expect(result).toBe('BREACH:ATL-001;ATL-002;BREACH:ATL-003;');
    });

    it('should access parent context variables inside each', () => {
      const result = dispatchService.interpolate(
        '{{#each items}}{{title}}: {{this}};{{/each}}',
        { title: 'Report', items: ['a', 'b'] },
      );
      expect(result).toBe('Report: a;Report: b;');
    });
  });

  describe('Dotted path resolution', () => {
    it('should resolve nested object paths', () => {
      const result = dispatchService.interpolate(
        'Name: {{user.name}}, Email: {{user.email}}',
        { user: { name: 'Amit', email: 'amit@example.com' } },
      );
      expect(result).toBe('Name: Amit, Email: amit@example.com');
    });

    it('should return placeholder for missing nested path', () => {
      const result = dispatchService.interpolate(
        'Value: {{a.b.c}}',
        { a: { b: {} } },
      );
      expect(result).toBe('Value: {{a.b.c}}');
    });
  });

  describe('Safety — no eval or Function constructor', () => {
    it('should not execute JavaScript expressions in templates', () => {
      const result = dispatchService.interpolate(
        '{{constructor}}{{__proto__}}{{prototype}}',
        {},
      );
      // Should return the raw placeholders, not execute anything
      expect(result).toBe('{{constructor}}{{__proto__}}{{prototype}}');
    });

    it('should safely handle deeply nested paths', () => {
      const result = dispatchService.interpolate(
        '{{a.b.c.d.e.f.g}}',
        { a: { b: { c: 'found' } } },
      );
      expect(result).toBe('{{a.b.c.d.e.f.g}}');
    });
  });

  describe('Integration with send()', () => {
    it('should render templates with conditional blocks via send()', async () => {
      dispatchService.registerTemplate({
        code: 'COND_TEST',
        subject: '{{#if isUrgent}}URGENT: {{/if}}Case {{case_number}}',
        body: 'Priority: {{priority}}. {{#if note}}Note: {{note}}{{/if}}',
      });

      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'COND_TEST',
        { isUrgent: 'true', case_number: 'ATL-001', priority: 'HIGH', note: 'Please review' },
      );

      expect(result.status).toBe('SENT');
      expect(result.renderedSubject).toBe('URGENT: Case ATL-001');
      expect(result.renderedBody).toBe('Priority: HIGH. Note: Please review');
    });

    it('should preserve backward compatibility with simple {{var}} templates', async () => {
      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      expect(result.status).toBe('SENT');
      expect(result.renderedSubject).toBe('Case ATL-2026-000001 assigned to you');
      expect(result.renderedBody).toBe(
        'Dear Amit Sharma, case ATL-2026-000001 has been assigned to you. Priority: HIGH.',
      );
    });
  });

  describe('FR-101 A3: Template Preview Controller', () => {
    it('should expose interpolate as a public method for preview', () => {
      // The interpolate method must be public for the controller to use it
      expect(typeof dispatchService.interpolate).toBe('function');
    });

    it('should render complex templates for preview', () => {
      const template = [
        'Report for {{date}}:',
        '{{#if hasOverdue}}',
        'OVERDUE CASES:',
        '{{#each overdue}}  - {{case_number}} ({{hoursOverdue}}h overdue)',
        '{{/each}}',
        '{{else}}',
        'No overdue cases.',
        '{{/if}}',
      ].join('\n');

      const result = dispatchService.interpolate(template, {
        date: '2026-04-29',
        hasOverdue: true,
        overdue: [
          { case_number: 'ATL-001', hoursOverdue: 12 },
          { case_number: 'ATL-002', hoursOverdue: 3 },
        ],
      });

      expect(result).toContain('Report for 2026-04-29');
      expect(result).toContain('OVERDUE CASES');
      expect(result).toContain('ATL-001 (12h overdue)');
      expect(result).toContain('ATL-002 (3h overdue)');
      expect(result).not.toContain('No overdue cases');
    });
  });
});
