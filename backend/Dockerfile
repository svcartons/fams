# ============================================================
# Stage 1 — Build: Install ALL deps and compile TypeScript
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

# Copy dependency manifests first
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client (defaults to node_modules/.prisma/client)
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ============================================================
# Stage 2 — Runtime: Ultra-lean production image
# ============================================================
FROM node:20-alpine AS runtime

# Install dumb-init for proper PID 1 signal handling and openssl for Prisma
RUN apk add --no-cache dumb-init openssl

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
# Note: Prisma Client needs to be generated in node_modules
RUN npm ci --omit=dev

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist
# Copy prisma schema and generated client from builder
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

ENV NODE_OPTIONS="--max-old-space-size=256 --max-semi-space-size=16"
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
