# ---- Stage 1: Build ----
FROM node:23-slim AS builder

# Set working directory
WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
COPY package*.json ./
RUN pnpm install

# Copy source
COPY . .

# Build the app
RUN pnpm run build

# ---- Stage 2: Production image ----
FROM node:23-slim

# Set working directory
WORKDIR /app

# Install build dependencies for native modules (needed for Sentry profiling)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package*.json ./

# Install production dependencies (this will compile native modules for the target architecture)
RUN pnpm install --prod

# Copy built app from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Expose NestJS default port
EXPOSE 3000

# Run the app
CMD ["node", "dist/main"]
