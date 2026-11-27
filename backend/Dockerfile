# Stage 1: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

WORKDIR /app

# Copy dependency files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN pnpm exec prisma generate && \
    node -e "const fs=require('fs');const path=require('path');const dir=path.dirname(require.resolve('@prisma/client'));fs.cpSync(path.join(dir,'.prisma/client'), '/app/node_modules/.prisma/client',{recursive:true,force:true})"

# Copy source code and build
COPY src ./src
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
RUN pnpm build

# Stage 2: Run
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

WORKDIR /app

# Install only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client
# Copy generated Prisma client into @prisma/client package directory
RUN node -e "const fs=require('fs');const path=require('path');const dir=path.dirname(require.resolve('@prisma/client'));fs.cpSync('/app/node_modules/.prisma/client', path.join(dir,'.prisma/client'),{recursive:true})"

# Create non-root user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Health check for the API server
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

EXPOSE 3000

# Default command runs the API server. Override CMD to run the worker:
#   docker run --rm my-image node dist/worker.js
CMD ["node", "dist/main.js"]
