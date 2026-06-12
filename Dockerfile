FROM node:24-slim

WORKDIR /app

RUN apt-get update -qq && apt-get install -y -qq python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
