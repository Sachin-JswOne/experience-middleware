# ---- Stage 1: Build ----
FROM node:23-alpine AS builder

# Set working directory
WORKDIR /app

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
FROM node:23-alpine

# Set working directory
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy only needed files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Expose NestJS default port
EXPOSE 3000

# Run the app
CMD ["node", "dist/main"]
