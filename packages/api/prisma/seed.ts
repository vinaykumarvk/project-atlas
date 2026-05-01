import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ============ ROLES ============
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { code: 'COLLATERAL_OFFICER' },
      update: {},
      create: { code: 'COLLATERAL_OFFICER', name: 'Collateral Officer', permissions_json: { cases: 'RWC', masters: 'R', reports: 'R' } },
    }),
    prisma.role.upsert({
      where: { code: 'COLLATERAL_LEAD' },
      update: {},
      create: { code: 'COLLATERAL_LEAD', name: 'Collateral Team Lead', permissions_json: { cases: 'RWCA', masters: 'R', reports: 'RW', team: 'RW' } },
    }),
    prisma.role.upsert({
      where: { code: 'COLLATERAL_HEAD' },
      update: {},
      create: { code: 'COLLATERAL_HEAD', name: 'Collateral Head', permissions_json: { cases: 'RWCA', masters: 'R', reports: 'RW', team: 'RW', org: 'R' } },
    }),
    prisma.role.upsert({
      where: { code: 'FPR' },
      update: {},
      create: { code: 'FPR', name: 'Field Point of Responsibility', permissions_json: { cases: 'RW', mobile: 'RW' } },
    }),
    prisma.role.upsert({
      where: { code: 'FPR_SUPERVISOR' },
      update: {},
      create: { code: 'FPR_SUPERVISOR', name: 'FPR Supervisor', permissions_json: { cases: 'RWA', mobile: 'RW', team: 'R' } },
    }),
    prisma.role.upsert({
      where: { code: 'VENDOR' },
      update: {},
      create: { code: 'VENDOR', name: 'Vendor', permissions_json: { vendor_portal: 'RW', cases: 'R' } },
    }),
    prisma.role.upsert({
      where: { code: 'MASTER_DATA_ADMIN' },
      update: {},
      create: { code: 'MASTER_DATA_ADMIN', name: 'Master Data Administrator', permissions_json: { masters: 'RWC', cases: 'R' } },
    }),
    prisma.role.upsert({
      where: { code: 'MASTER_DATA_APPROVER' },
      update: {},
      create: { code: 'MASTER_DATA_APPROVER', name: 'Master Data Approver', permissions_json: { masters: 'RA', cases: 'R' } },
    }),
    prisma.role.upsert({
      where: { code: 'SYS_ADMIN' },
      update: {},
      create: { code: 'SYS_ADMIN', name: 'System Administrator', permissions_json: { all: 'RWCDA' } },
    }),
    prisma.role.upsert({
      where: { code: 'COMPLIANCE_OFFICER' },
      update: {},
      create: { code: 'COMPLIANCE_OFFICER', name: 'Compliance / Audit Officer', permissions_json: { all: 'R', audit: 'R', compliance: 'RW' } },
    }),
    prisma.role.upsert({
      where: { code: 'MLOPS' },
      update: {},
      create: { code: 'MLOPS', name: 'ML Operations', permissions_json: { models: 'RWCA', drift: 'R', cases: 'R' } },
    }),
  ]);

  console.log(`  Created ${roles.length} roles`);

  // ============ USERS ============
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'anita.sharma@atlas-dev.com' },
      update: {},
      create: { full_name: 'Anita Sharma', email: 'anita.sharma@atlas-dev.com', region: 'West', is_active: true },
    }),
    prisma.user.upsert({
      where: { email: 'ravi.kumar@atlas-dev.com' },
      update: {},
      create: { full_name: 'Ravi Kumar', email: 'ravi.kumar@atlas-dev.com', region: 'West', is_active: true },
    }),
    prisma.user.upsert({
      where: { email: 'priya.patel@atlas-dev.com' },
      update: {},
      create: { full_name: 'Priya Patel', email: 'priya.patel@atlas-dev.com', region: 'West', is_active: true },
    }),
    prisma.user.upsert({
      where: { email: 'suresh.lead@atlas-dev.com' },
      update: {},
      create: { full_name: 'Suresh Menon', email: 'suresh.lead@atlas-dev.com', region: 'West', is_active: true },
    }),
    prisma.user.upsert({
      where: { email: 'admin@atlas-dev.com' },
      update: {},
      create: { full_name: 'System Admin', email: 'admin@atlas-dev.com', mfa_enabled: true, is_active: true },
    }),
  ]);

  // Assign roles
  const officerRole = roles.find(r => r.code === 'COLLATERAL_OFFICER')!;
  const leadRole = roles.find(r => r.code === 'COLLATERAL_LEAD')!;
  const fprRole = roles.find(r => r.code === 'FPR')!;
  const adminRole = roles.find(r => r.code === 'SYS_ADMIN')!;

  await prisma.userRole.createMany({
    data: [
      { user_id: users[0].id, role_id: fprRole.id, region: 'West' },
      { user_id: users[1].id, role_id: officerRole.id, region: 'West' },
      { user_id: users[2].id, role_id: officerRole.id, region: 'West' },
      { user_id: users[3].id, role_id: leadRole.id, region: 'West' },
      { user_id: users[4].id, role_id: adminRole.id },
    ],
    skipDuplicates: true,
  });

  console.log(`  Created ${users.length} users with role assignments`);

  // ============ FPR MASTER ============
  await prisma.fprMaster.upsert({
    where: { employee_code: 'EMP-A2289' },
    update: {},
    create: {
      user_id: users[0].id,
      employee_code: 'EMP-A2289',
      full_name: 'Anita Sharma',
      region_ids: ['Mumbai-W', 'Pune'],
      skills: ['valuation', 'legal'],
      capacity_per_day: 12,
      canonical_form: 'Anita Sharma (EMP-A2289)',
      source_forms: ['EMP-A2289', 'EMPA2289', 'A2289', 'Anita Sharma', 'anita sharma', 'ANITA SHARMA', 'A. Sharma', 'Anita S.'],
    },
  });

  await prisma.fprMaster.upsert({
    where: { employee_code: 'EMP-R4401' },
    update: {},
    create: {
      user_id: users[1].id,
      employee_code: 'EMP-R4401',
      full_name: 'Ravi Kumar',
      region_ids: ['Mumbai-E', 'Nashik'],
      skills: ['valuation', 'insurance'],
      capacity_per_day: 10,
      canonical_form: 'Ravi Kumar (EMP-R4401)',
      source_forms: ['EMP-R4401', 'EMPR4401', 'R4401', 'Ravi Kumar', 'ravi kumar', 'RAVI KUMAR', 'R. Kumar', 'Ravi K.'],
    },
  });

  console.log('  Created FPR masters');

  // ============ CASE TYPE MASTER ============
  const caseTypes = [
    {
      code: 'VALUATION_REQUEST',
      display_name: 'Property Valuation Request',
      default_priority: 'NORMAL',
      default_owner_role: 'VENDOR',
      required_skills: ['valuation'],
      confidence_threshold: 0.75,
      canonical_form: 'VALUATION_REQUEST',
      source_forms: ['VALUATION_REQUEST', 'valuation', 'property valuation', 'appraisal', 'valuation request', 'val request', 'valuation report needed', 'property appraisal', 'market valuation', 'VALUATION-REQUEST'],
    },
    {
      code: 'LEGAL_OPINION',
      display_name: 'Legal Opinion Request',
      default_priority: 'NORMAL',
      default_owner_role: 'VENDOR',
      required_skills: ['legal'],
      confidence_threshold: 0.75,
      canonical_form: 'LEGAL_OPINION',
      source_forms: ['LEGAL_OPINION', 'legal opinion', 'legal review', 'advocate opinion', 'legal vetting', 'property legal opinion', 'title opinion', 'LEGAL-OPINION', 'legal report'],
    },
    {
      code: 'TITLE_SEARCH',
      display_name: 'Title Search Report',
      default_priority: 'NORMAL',
      default_owner_role: 'VENDOR',
      required_skills: ['legal'],
      confidence_threshold: 0.75,
      canonical_form: 'TITLE_SEARCH',
      source_forms: ['TITLE_SEARCH', 'title search', 'title report', 'title verification', 'property title search', 'search report', 'TSR', 'title search report', 'TITLE-SEARCH', 'encumbrance check'],
    },
    {
      code: 'INSURANCE_RENEWAL',
      display_name: 'Insurance Renewal',
      default_priority: 'HIGH',
      default_owner_role: 'VENDOR',
      required_skills: ['insurance'],
      confidence_threshold: 0.80,
      canonical_form: 'INSURANCE_RENEWAL',
      source_forms: ['INSURANCE_RENEWAL', 'insurance renewal', 'insurance', 'policy renewal', 'property insurance', 'fire insurance', 'insurance expiry', 'renew insurance', 'INSURANCE-RENEWAL', 'ins renewal'],
    },
    {
      code: 'RELEASE_OF_COLLATERAL',
      display_name: 'Release of Collateral',
      default_priority: 'HIGH',
      default_owner_role: 'FPR',
      required_skills: ['valuation', 'legal'],
      confidence_threshold: 0.80,
      canonical_form: 'RELEASE_OF_COLLATERAL',
      source_forms: ['RELEASE_OF_COLLATERAL', 'release of collateral', 'collateral release', 'NOC', 'no objection', 'property release', 'release request', 'mortgage release', 'RELEASE-OF-COLLATERAL', 'lien release'],
    },
    {
      code: 'SITE_VISIT',
      display_name: 'Site Visit / Inspection',
      default_priority: 'NORMAL',
      default_owner_role: 'FPR',
      required_skills: ['valuation'],
      confidence_threshold: 0.70,
      canonical_form: 'SITE_VISIT',
      source_forms: ['SITE_VISIT', 'site visit', 'inspection', 'property inspection', 'field visit', 'site inspection', 'physical verification', 'property visit', 'SITE-VISIT', 'field inspection'],
    },
    {
      code: 'DOCUMENT_COLLECTION',
      display_name: 'Document Collection',
      default_priority: 'LOW',
      default_owner_role: 'FPR',
      required_skills: [],
      confidence_threshold: 0.70,
      canonical_form: 'DOCUMENT_COLLECTION',
      source_forms: ['DOCUMENT_COLLECTION', 'document collection', 'doc collection', 'collect documents', 'document pickup', 'paper collection', 'DOCUMENT-COLLECTION', 'docs needed', 'pending documents'],
    },
    {
      code: 'GENERAL_INQUIRY',
      display_name: 'General Inquiry',
      default_priority: 'LOW',
      default_owner_role: 'OFFICER',
      required_skills: [],
      confidence_threshold: 0.65,
      canonical_form: 'GENERAL_INQUIRY',
      source_forms: ['GENERAL_INQUIRY', 'general inquiry', 'general enquiry', 'query', 'question', 'inquiry', 'enquiry', 'info request', 'GENERAL-INQUIRY', 'information needed', 'help needed'],
    },
  ];

  for (const ct of caseTypes) {
    await prisma.caseTypeMaster.upsert({
      where: { code: ct.code },
      update: {},
      create: ct,
    });
  }

  console.log(`  Created ${caseTypes.length} case types`);

  // ============ PROPERTY LOCATION MASTER ============
  const locations = [
    {
      state: 'Maharashtra',
      city: 'Mumbai',
      zone: 'West',
      pin_from: '400050',
      pin_to: '400099',
      region: 'West',
      canonical_form: 'Mumbai',
      source_forms: ['Mumbai', 'mumbai', 'MUMBAI', 'Bombay', 'bombay', 'BOMBAY', 'Mumbai West', 'mumbai west', 'Mumbai-W', 'Bandra', 'Andheri', 'Juhu'],
    },
    {
      state: 'Maharashtra',
      city: 'Mumbai',
      zone: 'East',
      pin_from: '400001',
      pin_to: '400049',
      region: 'West',
      canonical_form: 'Mumbai',
      source_forms: ['Mumbai', 'mumbai', 'MUMBAI', 'Bombay', 'bombay', 'BOMBAY', 'Mumbai East', 'mumbai east', 'Mumbai-E', 'CST', 'Fort', 'Dadar', 'Parel'],
    },
    {
      state: 'Maharashtra',
      city: 'Pune',
      zone: 'Central',
      pin_from: '411001',
      pin_to: '411099',
      region: 'West',
      canonical_form: 'Pune',
      source_forms: ['Pune', 'pune', 'PUNE', 'Poona', 'poona', 'POONA', 'Pune Central', 'pune central', 'Shivajinagar', 'Deccan', 'Kothrud'],
    },
    {
      state: 'Maharashtra',
      city: 'Nashik',
      zone: 'North',
      pin_from: '422001',
      pin_to: '422099',
      region: 'West',
      canonical_form: 'Nashik',
      source_forms: ['Nashik', 'nashik', 'NASHIK', 'Nasik', 'nasik', 'NASIK', 'Nashik North', 'nashik north', 'Nashik City'],
    },
  ];

  const fprAnita = await prisma.fprMaster.findUnique({ where: { employee_code: 'EMP-A2289' } });
  const fprRavi = await prisma.fprMaster.findUnique({ where: { employee_code: 'EMP-R4401' } });

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    await prisma.propertyLocationMaster.create({
      data: {
        ...loc,
        default_fpr_id: i < 2 ? fprAnita!.id : fprRavi!.id,
      },
    });
  }

  console.log(`  Created ${locations.length} property locations`);

  // ============ VENDOR MASTER ============
  const vendors = [
    {
      vendor_code: 'V-2289',
      vendor_name: 'Apex Valuers Pvt Ltd',
      vendor_category: 'VALUER',
      contact_email: 'ops@apexvaluers.in',
      service_geographies: ['Mumbai-W', 'Mumbai-E'],
      service_case_types: ['VALUATION_REQUEST', 'SITE_VISIT'],
      contracted_tat_hours: 48,
      scorecard_quality: 4.3,
      canonical_form: 'Apex Valuers Pvt Ltd',
      source_forms: ['V-2289', 'V2289', 'Apex Valuers Pvt Ltd', 'APEX VALUERS PVT LTD', 'apex valuers', 'Apex Valuers', 'Apex', 'apex valuers pvt', 'APEX'],
    },
    {
      vendor_code: 'V-3301',
      vendor_name: 'Mumbai Realty Surveyors',
      vendor_category: 'VALUER',
      contact_email: 'info@mrsurv.in',
      service_geographies: ['Mumbai-W', 'Pune'],
      service_case_types: ['VALUATION_REQUEST', 'SITE_VISIT'],
      contracted_tat_hours: 72,
      scorecard_quality: 3.8,
      canonical_form: 'Mumbai Realty Surveyors',
      source_forms: ['V-3301', 'V3301', 'Mumbai Realty Surveyors', 'MUMBAI REALTY SURVEYORS', 'mumbai realty', 'MRS', 'Mumbai Realty', 'MR Surveyors', 'mrsurv'],
    },
    {
      vendor_code: 'V-4102',
      vendor_name: 'Legal Associates LLP',
      vendor_category: 'ADVOCATE',
      contact_email: 'cases@legalassoc.in',
      service_geographies: ['Mumbai-W', 'Mumbai-E', 'Pune', 'Nashik'],
      service_case_types: ['LEGAL_OPINION', 'TITLE_SEARCH'],
      contracted_tat_hours: 96,
      scorecard_quality: 4.5,
      canonical_form: 'Legal Associates LLP',
      source_forms: ['V-4102', 'V4102', 'Legal Associates LLP', 'LEGAL ASSOCIATES LLP', 'legal associates', 'Legal Associates', 'LA LLP', 'legalassoc', 'Legal Assoc'],
    },
  ];

  for (const v of vendors) {
    await prisma.vendorMaster.upsert({
      where: { vendor_code: v.vendor_code },
      update: {},
      create: v,
    });
  }

  console.log(`  Created ${vendors.length} vendors`);

  // ============ TAT MASTER ============
  const tats = [
    { case_type: 'VALUATION_REQUEST', priority: 'NORMAL', stage: 'VENDOR_RESPONSE', target_hours_business: 48, warn_at_percent: 80 },
    { case_type: 'VALUATION_REQUEST', priority: 'HIGH', stage: 'VENDOR_RESPONSE', target_hours_business: 24, warn_at_percent: 75 },
    { case_type: 'VALUATION_REQUEST', priority: 'CRITICAL', stage: 'VENDOR_RESPONSE', target_hours_business: 8, warn_at_percent: 50 },
    { case_type: 'LEGAL_OPINION', priority: 'NORMAL', stage: 'VENDOR_RESPONSE', target_hours_business: 96, warn_at_percent: 80 },
    { case_type: 'LEGAL_OPINION', priority: 'HIGH', stage: 'VENDOR_RESPONSE', target_hours_business: 48, warn_at_percent: 75 },
    { case_type: 'SITE_VISIT', priority: 'NORMAL', stage: 'FPR_RESPONSE', target_hours_business: 36, warn_at_percent: 80 },
    { case_type: 'INSURANCE_RENEWAL', priority: 'HIGH', stage: 'VENDOR_RESPONSE', target_hours_business: 24, warn_at_percent: 70 },
  ];

  for (const t of tats) {
    await prisma.tatMaster.upsert({
      where: { case_type_priority_stage: { case_type: t.case_type, priority: t.priority, stage: t.stage } },
      update: {},
      create: t,
    });
  }

  console.log(`  Created ${tats.length} TAT rules`);

  // ============ ESCALATION HIERARCHY ============
  const escalations = [
    { scope: 'CASE_TYPE/VALUATION_REQUEST', level: 1, delay_after_breach_hrs: 0, recipient_role: 'FPR_SUPERVISOR', channels: ['EMAIL', 'WHATSAPP'], repeat_every_hrs: 4 },
    { scope: 'CASE_TYPE/VALUATION_REQUEST', level: 2, delay_after_breach_hrs: 4, recipient_role: 'COLLATERAL_LEAD', channels: ['EMAIL', 'WHATSAPP', 'SMS'], repeat_every_hrs: 8 },
    { scope: 'CASE_TYPE/VALUATION_REQUEST', level: 3, delay_after_breach_hrs: 8, recipient_role: 'COLLATERAL_HEAD', channels: ['EMAIL', 'SMS', 'TEAMS'], repeat_every_hrs: null },
    { scope: 'CASE_TYPE/LEGAL_OPINION', level: 1, delay_after_breach_hrs: 0, recipient_role: 'COLLATERAL_LEAD', channels: ['EMAIL'], repeat_every_hrs: 8 },
    { scope: 'CASE_TYPE/LEGAL_OPINION', level: 2, delay_after_breach_hrs: 8, recipient_role: 'COLLATERAL_HEAD', channels: ['EMAIL', 'TEAMS'], repeat_every_hrs: null },
  ];

  for (const e of escalations) {
    await prisma.escalationHierarchyMaster.upsert({
      where: { scope_level: { scope: e.scope, level: e.level } },
      update: {},
      create: e,
    });
  }

  console.log(`  Created ${escalations.length} escalation rules`);

  // ============ BUSINESS HOURS ============
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  for (const day of days) {
    const isWorking = !['SAT', 'SUN'].includes(day);
    await prisma.businessHoursMaster.upsert({
      where: { region_day_of_week: { region: 'All-India', day_of_week: day } },
      update: {},
      create: {
        region: 'All-India',
        day_of_week: day,
        open_time: '09:30',
        close_time: '18:30',
        is_working: isWorking,
      },
    });
  }

  console.log('  Created business hours (Mon-Fri 09:30-18:30 IST)');

  // ============ HOLIDAY CALENDAR ============
  const holidays = [
    { region: 'Maharashtra', date: new Date('2026-01-26'), name: 'Republic Day', type: 'NATIONAL' },
    { region: 'Maharashtra', date: new Date('2026-03-14'), name: 'Holi', type: 'NATIONAL' },
    { region: 'Maharashtra', date: new Date('2026-05-01'), name: 'Maharashtra Day', type: 'STATE' },
    { region: 'Maharashtra', date: new Date('2026-08-15'), name: 'Independence Day', type: 'NATIONAL' },
    { region: 'Maharashtra', date: new Date('2026-10-02'), name: 'Gandhi Jayanti', type: 'NATIONAL' },
    { region: 'Maharashtra', date: new Date('2026-10-21'), name: 'Diwali', type: 'NATIONAL' },
    { region: 'Maharashtra', date: new Date('2026-11-04'), name: 'Diwali (Bhai Dooj)', type: 'STATE' },
    { region: 'Maharashtra', date: new Date('2026-12-25'), name: 'Christmas', type: 'NATIONAL' },
  ];

  for (const h of holidays) {
    await prisma.holidayCalendarMaster.upsert({
      where: { region_date: { region: h.region, date: h.date } },
      update: {},
      create: h,
    });
  }

  console.log(`  Created ${holidays.length} holidays`);

  // ============ NOTIFICATION TEMPLATES ============
  const templates = [
    { code: 'CASE_ACK', name: 'Case Acknowledgement', channel: 'EMAIL', subject: 'Your request has been received — Case {{case_number}}', body_template: 'Dear {{sender_name}},\n\nYour email has been received and assigned Case ID: {{case_number}}.\n\nClassification: {{case_type}}\nPriority: {{priority}}\nExpected resolution by: {{tat_target_at}}\n\nTrack status: {{status_url}}\n\nThis is an automated message from the Collateral Management System.' },
    { code: 'ESCALATION_L1', name: 'Escalation Level 1', channel: 'EMAIL', subject: 'ESCALATION: Case {{case_number}} breached SLA', body_template: 'Case {{case_number}} ({{case_type}}) has breached its SLA target.\n\nAssigned to: {{assigned_to}}\nTAT Target: {{tat_target_at}}\nOverdue by: {{overdue_hours}} hours\n\nPlease take immediate action.' },
    { code: 'PENDENCY_DAILY', name: 'Daily Pendency Report', channel: 'EMAIL', subject: 'Your Daily Pendency Report — {{date}}', body_template: 'Hi {{recipient_name}},\n\nHere is your pendency report for {{date}}:\n\n{{#each sections}}{{section_title}}:\n{{#each items}}- {{case_number}} | {{case_type}} | Due: {{due_date}}\n{{/each}}\n{{/each}}' },
    { code: 'VENDOR_DISPATCH', name: 'Vendor Case Dispatch', channel: 'EMAIL', subject: 'New Assignment: {{case_type}} — Case {{case_number}}', body_template: 'Dear {{vendor_name}},\n\nYou have a new assignment:\n\nCase: {{case_number}}\nType: {{case_type}}\nProperty: {{property_address}}\nRequired by: {{tat_target_at}}\n\nPlease respond within your contracted TAT.\n\nSubmit via portal: {{portal_url}}' },
  ];

  for (const t of templates) {
    await prisma.notificationTemplate.upsert({
      where: { code: t.code },
      update: {},
      create: t,
    });
  }

  console.log(`  Created ${templates.length} notification templates`);

  console.log('\nSeeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
