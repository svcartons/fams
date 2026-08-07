-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "securityQuestion" TEXT,
    "securityAnswerHash" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'supervisor',
    "avatarUrl" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "workerId" TEXT,
    "hasSeenOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "dailyWage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "faceDescriptor" TEXT,
    "avatarPhoto" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shiftId" TEXT,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEvent" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'face',
    "confidence" DOUBLE PRECISION,
    "hourlyRate" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workDate" TEXT,
    "terminalId" TEXT,
    "actorId" TEXT,
    "clientEventId" TEXT,
    "deviceSequence" INTEGER,
    "syncStatus" TEXT NOT NULL DEFAULT 'accepted',

    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyOverride" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "regularHours" DOUBLE PRECISION,
    "overtimeHours" DOUBLE PRECISION,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualCorrection" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'checked-in',
    "originalTime" TIMESTAMP(3),
    "correctedTime" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requesterId" TEXT,
    "approverId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "appliedEventId" TEXT,
    "originalSnapshot" TEXT,
    "afterSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL DEFAULT 'System',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousHash" TEXT,
    "hash" TEXT,
    "retentionClass" TEXT NOT NULL DEFAULT 'compliance',

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollExport" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "format" TEXT NOT NULL,
    "workerCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "filename" TEXT,
    "site" TEXT NOT NULL DEFAULT 'main',
    "calculationVersion" TEXT NOT NULL DEFAULT 'v1',
    "calculationHash" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" TEXT,

    CONSTRAINT "PayrollExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileTerminal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceModel" TEXT,
    "pairingCode" TEXT NOT NULL,
    "token" TEXT,
    "tokenHash" TEXT,
    "bluetoothUuid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "batteryLevel" INTEGER,
    "networkQuality" TEXT,
    "pendingQueueSize" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pairingExpiresAt" TIMESTAMP(3),
    "lastTokenRotatedAt" TIMESTAMP(3),
    "pairingAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MobileTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_workerId_key" ON "User"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_workerId_key" ON "Worker"("workerId");

-- CreateIndex
CREATE INDEX "Worker_isActive_idx" ON "Worker"("isActive");

-- CreateIndex
CREATE INDEX "Worker_shiftId_idx" ON "Worker"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceEvent_clientEventId_key" ON "AttendanceEvent"("clientEventId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_workerId_idx" ON "AttendanceEvent"("workerId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_timestamp_idx" ON "AttendanceEvent"("timestamp");

-- CreateIndex
CREATE INDEX "AttendanceEvent_workerId_timestamp_idx" ON "AttendanceEvent"("workerId", "timestamp");

-- CreateIndex
CREATE INDEX "AttendanceEvent_workerId_workDate_idx" ON "AttendanceEvent"("workerId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceEvent_terminalId_idx" ON "AttendanceEvent"("terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyOverride_workerId_date_key" ON "DailyOverride"("workerId", "date");

-- CreateIndex
CREATE INDEX "ManualCorrection_status_idx" ON "ManualCorrection"("status");

-- CreateIndex
CREATE INDEX "ManualCorrection_workerId_idx" ON "ManualCorrection"("workerId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MobileTerminal_pairingCode_key" ON "MobileTerminal"("pairingCode");

-- CreateIndex
CREATE UNIQUE INDEX "MobileTerminal_token_key" ON "MobileTerminal"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MobileTerminal_tokenHash_key" ON "MobileTerminal"("tokenHash");

-- CreateIndex
CREATE INDEX "MobileTerminal_status_idx" ON "MobileTerminal"("status");

-- CreateIndex
CREATE INDEX "MobileTerminal_pairingCode_idx" ON "MobileTerminal"("pairingCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "MobileTerminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyOverride" ADD CONSTRAINT "DailyOverride_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualCorrection" ADD CONSTRAINT "ManualCorrection_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
