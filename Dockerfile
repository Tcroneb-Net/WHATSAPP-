# Use Node.js base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy only package.json and install deps first (for Docker caching)
COPY package.json ./

# Install only if package.json is valid
RUN npm install

# Copy rest of project files
COPY . .

# Create needed folders
RUN mkdir -p .sessions sessions public

# Puppeteer/Chromium deps for whatsapp-web.js
RUN apt-get update && apt-get install -y \
    fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libnspr4 libnss3 \
    libxcomposite1 libxdamage1 libxrandr2 xdg-utils wget ca-certificates \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Expose your app port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
