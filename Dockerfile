FROM node:20

WORKDIR /app

# העתקת תלויות והתקנתן
COPY package*.json ./
RUN npm install

# העתקת הקוד
COPY . .

# קומפילציית TypeScript
RUN npm run build

# הפעלת הקוד המהודר
CMD ["node", "dist/bot.js"]
