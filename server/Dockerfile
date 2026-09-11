FROM node:22-bookworm-slim
WORKDIR /service
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8090
CMD ["node", "index.mjs"]
