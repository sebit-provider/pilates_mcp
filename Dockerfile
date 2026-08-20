FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app

ENV PILATES_MCP_DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start:railway"]
