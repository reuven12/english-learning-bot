FROM node:20

WORKDIR /app

# התקנת תלויות
COPY package*.json ./
RUN npm install

# העתקת שאר הקוד
COPY . .

# הפעלת הבוט עם ts-node ו־ESM loader
CMD ["npx", "ts-node", "--loader", "ts-node/esm", "src/bot.ts"]
