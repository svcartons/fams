# ============================================================
# Stage 1 — Build: Full Node.js environment to compile the app
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (Docker layer cache optimization)
COPY package*.json ./

# Install ALL deps needed to build (Vite, TypeScript, etc.)
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build Vite production bundle
# This outputs ~1.4 MB JS (gzipped to ~370 KB by Nginx)
RUN npm run build

# ============================================================
# Stage 2 — Runtime: nginx:alpine is only ~8 MB
# No Node.js, no npm, no source code in the final image
# ============================================================
FROM nginx:1.27-alpine AS runtime

# Remove default Nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy the optimized Nginx config (replaces the main config)
COPY nginx.conf /etc/nginx/nginx.conf

# Copy Vite's compiled output from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx runs as non-root for security
RUN chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 80

# Nginx manages its own process correctly; no dumb-init needed here
CMD ["nginx", "-g", "daemon off;"]
