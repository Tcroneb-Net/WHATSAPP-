# 1. Use official Node.js base image
FROM node:18

# 2. Set working directory
WORKDIR /app

# 3. Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# 4. Copy the rest of the application
COPY . .

# 5. Ensure required folders exist
RUN mkdir -p /app/.sessions /app/sessions /app/public

# 6. Puppeteer dependencies (needed for Chromium headless in Docker)
RUN apt-get update && apt-get install -y \
    fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libnspr4 libnss3 \
    libxcomposite1 libxdamage1 libxrandr2 xdg-utils wget ca-certificates \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# 7. Expose the web server port
EXPOSE 3000

# 8. Launch the bot
CMD ["npm", "start"]
