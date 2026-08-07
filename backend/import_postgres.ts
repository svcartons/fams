import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  console.log('Reading data_dump.json...');
  const data = JSON.parse(fs.readFileSync('data_dump.json', 'utf-8'));

  console.log('Importing Shifts...');
  for (const shift of data.shifts || []) {
    await prisma.shift.create({ data: shift });
  }

  console.log('Importing Workers...');
  for (const worker of data.workers || []) {
    await prisma.worker.create({ data: worker });
  }

  console.log('Importing Users...');
  for (const user of data.users || []) {
    await prisma.user.create({ data: user });
  }

  console.log('Importing Attendance Events...');
  for (const event of data.attendanceEvents || []) {
    await prisma.attendanceEvent.create({ data: event });
  }

  console.log('Importing Daily Overrides...');
  for (const override of data.dailyOverrides || []) {
    await prisma.dailyOverride.create({ data: override });
  }

  console.log('Importing Manual Corrections...');
  for (const correction of data.manualCorrections || []) {
    await prisma.manualCorrection.create({ data: correction });
  }

  console.log('Importing Audit Logs...');
  for (const log of data.auditLogs || []) {
    await prisma.auditLog.create({ data: log });
  }

  console.log('Importing System Settings...');
  for (const setting of data.systemSettings || []) {
    await prisma.systemSetting.create({ data: setting });
  }

  console.log('PostgreSQL migration complete! All data has been imported.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
