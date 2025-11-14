# Use Node.js LTS version
FROM node:20-alpine

# Install dependencies for better-sqlite3 (requires build tools)
RUN apk add --no-cache python3 make g++

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY src ./src

# Create database directory
RUN mkdir -p /app/database

# Create volume for persistent database storage
VOLUME ["/app/database"]

# Set environment variables defaults
ENV NODE_ENV=production \
    DATABASE_PATH=/app/database/bot.db \
    LOG_LEVEL=info

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Start the bot
CMD ["node", "src/index.js"]
