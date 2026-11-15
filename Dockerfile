FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY db ./db
COPY server ./server
COPY collector ./collector
EXPOSE 4000
CMD ["sh", "-c", "npm run migrate && npm start"]
