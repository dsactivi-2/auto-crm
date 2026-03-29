FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Dependencies installieren
COPY package.json ./
RUN npm ci --production

# App-Code kopieren
COPY server.js crm-browser.js logger.js ./

# Data-Verzeichnis für Browser-Sessions
RUN mkdir -p /app/data && chown -R pwuser:pwuser /app/data

USER pwuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD wget -q --spider http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
