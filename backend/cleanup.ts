import { PrismaClient } from './prisma/generated-client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up database...');
  
  // Order matters due to foreign key constraints
  await prisma.auditLog.deleteMany({});
  await prisma.manualCorrection.deleteMany({});
  await prisma.attendanceEvent.deleteMany({});
  await prisma.dailyOverride.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.worker.deleteMany({});
  await prisma.shift.deleteMany({});
  // SystemSetting is usually kept as it holds configuration, but we can clear it if needed.
  // For now, let's keep it to ensure the app doesn't break.
  
  console.log('Database cleared successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
