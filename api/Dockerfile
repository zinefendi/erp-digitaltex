FROM node:22-alpine
ENV NODE_ENV=production TZ=Africa/Tunis
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
COPY lib ./lib
COPY migrations ./migrations
COPY scripts ./scripts
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/sante >/dev/null || exit 1
CMD ["node", "server.js"]
