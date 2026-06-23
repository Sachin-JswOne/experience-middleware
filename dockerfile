# --------------------
# Build stage
# --------------------
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy only dependency files first (better caching)
COPY package*.json ./

# Install dependencies (including dev deps for build)
RUN npm ci

# Copy source code
COPY . .

# Build the NestJS app
RUN npm run build

# Build the admin UI
RUN npm run build:admin

# --------------------
# Production stage
# --------------------
FROM node:20-alpine

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

# Copy admin UI build output
COPY --from=builder /app/dist-admin ./public/admin

# Create logs directory and set ownership
RUN mkdir -p logs && chown -R node:node /app

# Bake deploy provenance into the image (passed via --build-arg from CI)
ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG IMAGE_TAG=unknown
ENV GIT_BRANCH=$GIT_BRANCH
ENV GIT_COMMIT=$GIT_COMMIT
ENV IMAGE_TAG=$IMAGE_TAG

# Use non-root user for security
USER node

# Expose port
EXPOSE 3000

# Run the app
CMD ["node", "dist/main.js"]
