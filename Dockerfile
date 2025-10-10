# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Install FFmpeg and build dependencies for canvas
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads output temp

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]