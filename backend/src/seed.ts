import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.auditLog.deleteMany();
  await prisma.manualCorrection.deleteMany();
  await prisma.attendanceEvent.deleteMany();
  await prisma.worker.deleteMany();
  await prisma.shift.deleteMany();

  // Seed Shifts
  await prisma.shift.createMany({
    data: [
      { name: 'Morning Shift', startTime: '06:00', endTime: '14:00', capacity: 72 },
      { name: 'Afternoon Shift', startTime: '14:00', endTime: '22:00', capacity: 84 },
    ],
  });

  // Seed Workers
  const workersData = [
    { employeeCode: 'W-001', name: 'John Martinez', department: 'Assembly', role: 'Senior Technician', hourlyRate: 450 },
    { employeeCode: 'W-002', name: 'Sarah Chen', department: 'Quality Control', role: 'QC Inspector', hourlyRate: 380 },
    { employeeCode: 'W-003', name: 'Michael Johnson', department: 'Assembly', role: 'Operator', hourlyRate: 320 },
    { employeeCode: 'W-004', name: 'Emma Wilson', department: 'Packaging', role: 'Team Lead', hourlyRate: 400 },
    { employeeCode: 'W-005', name: 'David Brown', department: 'Maintenance', role: 'Technician', hourlyRate: 350 },
    { employeeCode: 'W-006', name: 'Lisa Anderson', department: 'Assembly', role: 'Operator', hourlyRate: 320 },
    { employeeCode: 'W-007', name: 'James Taylor', department: 'Quality Control', role: 'QC Inspector', hourlyRate: 380 },
    { employeeCode: 'W-008', name: 'Maria Garcia', department: 'Packaging', role: 'Operator', hourlyRate: 310 },
    { employeeCode: 'W-009', name: 'Robert Lee', department: 'Assembly', role: 'Senior Operator', hourlyRate: 340 },
    { employeeCode: 'W-010', name: 'Jennifer Wang', department: 'Maintenance', role: 'Team Lead', hourlyRate: 420 },
    { employeeCode: 'W-011', name: 'William Davis', department: 'Assembly', role: 'Operator', hourlyRate: 320 },
    { employeeCode: 'W-012', name: 'Patricia Miller', department: 'Packaging', role: 'Operator', hourlyRate: 310 },
  ];

  const workers = await Promise.all(
    workersData.map((w: any) => prisma.worker.create({ data: w }))
  );

  // Map to easily find the CUIDs by employeeCode
  const workerMap = Object.fromEntries(workers.map((w: any) => [w.employeeCode, w]));

  // Helper: create timestamp from today at given hour:minute
  const todayAt = (h: number, m: number) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };

  // Seed Attendance Events
  const events = [
    { employeeCode: 'W-001', eventType: 'checked-in', method: 'face', confidence: 98, time: [6, 15] },
    { employeeCode: 'W-002', eventType: 'checked-in', method: 'face', confidence: 95, time: [6, 0] },
    { employeeCode: 'W-002', eventType: 'lunch-break', method: 'face', confidence: 96, time: [12, 30] },
    { employeeCode: 'W-003', eventType: 'checked-in', method: 'face', confidence: 97, time: [6, 5] },
    { employeeCode: 'W-003', eventType: 'tea-break', method: 'face', confidence: 95, time: [14, 15] },
    { employeeCode: 'W-004', eventType: 'checked-in', method: 'manual', time: [6, 0] },
    { employeeCode: 'W-005', eventType: 'checked-in', method: 'face', confidence: 99, time: [6, 10] },
    { employeeCode: 'W-005', eventType: 'checked-out', method: 'face', confidence: 97, time: [14, 0] },
    { employeeCode: 'W-006', eventType: 'checked-in', method: 'face', confidence: 96, time: [6, 10] },
    { employeeCode: 'W-008', eventType: 'checked-in', method: 'face', confidence: 94, time: [6, 5] },
    { employeeCode: 'W-008', eventType: 'tea-break', method: 'face', confidence: 93, time: [14, 20] },
    { employeeCode: 'W-009', eventType: 'checked-in', method: 'face', confidence: 97, time: [6, 5] },
    { employeeCode: 'W-010', eventType: 'checked-in', method: 'face', confidence: 98, time: [6, 0] },
    { employeeCode: 'W-010', eventType: 'lunch-break', method: 'face', confidence: 95, time: [12, 45] },
    { employeeCode: 'W-011', eventType: 'checked-in', method: 'face', confidence: 96, time: [6, 8] },
    { employeeCode: 'W-012', eventType: 'checked-in', method: 'face', confidence: 95, time: [6, 12] },
  ];

  for (const e of events) {
    const worker = workerMap[e.employeeCode];
    if (!worker) continue;
    await prisma.attendanceEvent.create({
      data: {
        workerId: worker.id,
        eventType: e.eventType,
        method: e.method,
        confidence: e.confidence ?? null,
        timestamp: todayAt(e.time[0], e.time[1]),
      },
    });
  }

  // Seed Manual Corrections
  const w4 = workerMap['W-004'];
  const w8 = workerMap['W-008'];

  const corrections = [
    {
      workerId: w4.id,
      requestedBy: 'Supervisor John',
      reason: 'Check-in time changed from 06:30 to 06:00 due to system delay',
      originalTime: todayAt(6, 30),
      correctedTime: todayAt(6, 0),
      status: 'pending',
    },
    {
      workerId: w8.id,
      requestedBy: 'Supervisor Sarah',
      reason: 'Manually logged tea break start - device offline',
      originalTime: null,
      correctedTime: todayAt(14, 20),
      status: 'approved',
    },
  ];

  await prisma.manualCorrection.createMany({ data: corrections });

  // Seed Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        actor: 'Supervisor John',
        action: 'Manual Override',
        target: 'Emma Wilson (W-004)',
        details: 'Check-in time changed from 06:30 to 06:00',
        ipAddress: '192.168.1.45',
        createdAt: todayAt(14, 23),
      },
      {
        actor: 'System',
        action: 'Face Recognition',
        target: 'John Martinez (W-001)',
        details: 'Worker checked in via face scan (confidence: 98%)',
        ipAddress: '192.168.1.23',
        createdAt: todayAt(14, 15),
      },
      {
        actor: 'HR Manager',
        action: 'Correction Approved',
        target: 'Maria Garcia (W-008)',
        details: 'Approved manual correction for tea break start',
        ipAddress: '192.168.1.101',
        createdAt: todayAt(14, 10),
      },
      {
        actor: 'Supervisor Sarah',
        action: 'Manual Event',
        target: 'Patricia Miller (W-012)',
        details: 'Manually logged tea break start',
        ipAddress: '192.168.1.46',
        createdAt: todayAt(13, 45),
      },
      {
        actor: 'Admin User',
        action: 'Settings Changed',
        target: 'System Configuration',
        details: 'Updated break duration rules',
        ipAddress: '192.168.1.100',
        createdAt: todayAt(13, 30),
      },
      {
        actor: 'System',
        action: 'Sync Completed',
        target: 'All Devices',
        details: 'Synced 47 attendance events from 3 devices',
        ipAddress: 'Server',
        createdAt: todayAt(12, 55),
      },
    ],
  });

  // Seed a stable browser-kiosk credential for local/dev
  await prisma.systemSetting.upsert({
    where: { key: 'sec_kiosk_token' },
    update: {},
    create: { key: 'sec_kiosk_token', value: 'fams-kiosk-secure-device-token' },
  });

  console.log('✅ Database seeded successfully!');
  console.log(`   Workers: ${workers.length}`);
  console.log(`   Events:  ${events.length}`);
  console.log(`   Corrections: ${corrections.length}`);
  console.log('   Kiosk token: fams-kiosk-secure-device-token (localStorage key: fams_kiosk_token)');
}

main()
  .catch((e) => { console.error('❌ Seeding failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
