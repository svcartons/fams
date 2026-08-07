import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  console.log('Extracting data from SQLite...');
  
  const data = {
    users: await prisma.user.findMany(),
    workers: await prisma.worker.findMany(),
    attendanceEvents: await prisma.attendanceEvent.findMany(),
    dailyOverrides: await prisma.dailyOverride.findMany(),
    manualCorrections: await prisma.manualCorrection.findMany(),
    auditLogs: await prisma.auditLog.findMany(),
    shifts: await prisma.shift.findMany(),
    systemSettings: await prisma.systemSetting.findMany(),
  };

  fs.writeFileSync('data_dump.json', JSON.stringify(data, null, 2));
  console.log('Data successfully extracted to data_dump.json');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
