FROM node:20

WORKDIR /app

# התקנת התלויות
COPY package*.json ./
RUN npm install

# העתקת כל הקוד
COPY . .

# הפעלת הבוט עם ts-node
CMD ["npx", "ts-node", "src/bot.ts"]
