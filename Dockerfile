# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads output temp

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]