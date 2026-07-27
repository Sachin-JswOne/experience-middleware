# --------------------
# Build stage
# --------------------
# Node 22: the frontend toolchain (jsdom 30 and its whatwg-url/undici tree,
# @testing-library/jest-dom 7) declares engines of ^22.22 or newer. On Node 20
# these installed with EBADENGINE warnings; matching the CI runner keeps the
# build quiet and stops a future engine-strict npm from breaking the image.
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy only dependency files first (better caching)
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies (including dev deps for build)
RUN npm ci && npm ci --prefix frontend

# Copy source code
COPY . .

# Build the NestJS app
RUN npm run build

# --------------------
# Production stage
# --------------------
FROM node:22-alpine

# Set NODE_ENV to production
ENV NODE_ENV=production

# Create app directory
WORKDIR /app

# Copy only package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-frontend ./dist-frontend

# Create logs directory and set ownership
RUN mkdir -p logs && chown -R node:node /app

# Use non-root user for security
USER node

# Expose port
EXPOSE 3000

# Run the app
CMD ["node", "dist/main.js"]
