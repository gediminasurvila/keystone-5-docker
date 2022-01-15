FROM node:14

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./

RUN NODE_ENV=production npm ci --only=production

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
