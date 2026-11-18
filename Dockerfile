# ==========================================
# Multi-stage Dockerfile for NestJS App
# ==========================================

# ------------------------------------------
# Stage 1: Build stage
# ------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency definition files
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy TypeScript configs and application sources
COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# Remove development dependencies to keep only production packages
RUN npm prune --omit=dev && npm cache clean --force

# ------------------------------------------
# Stage 2: Production runtime stage
# ------------------------------------------
FROM node:20-alpine AS production

# Install dumb-init to properly handle process signals (SIGTERM, SIGINT) as PID 1
RUN apk add --no-cache dumb-init

# Set production environment
ENV NODE_ENV=production
WORKDIR /usr/src/app

# Enforce security best practices: run as non-root user 'node'
USER node

# Copy built application and production dependencies from builder stage
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist
COPY --chown=node:node --from=builder /usr/src/app/package*.json ./

# Default port (overridable via environment variable)
EXPOSE 3000

# Container healthcheck monitoring the Swagger OpenAPI docs endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/docs || exit 1

# Launch with dumb-init for graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
