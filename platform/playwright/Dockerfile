FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Dependencies installieren
COPY package.json ./
RUN npm install --omit=dev

# App-Code kopieren
COPY server.js crm-browser.js logger.js popup-handler.js file-upload-handler.js ./

# Data-Verzeichnis für Browser-Sessions
RUN mkdir -p /app/data && chown -R pwuser:pwuser /app/data

USER pwuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>{if(!r.ok)throw r;process.exit(0)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
