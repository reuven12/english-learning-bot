# שלב build
FROM node:20 AS builder
WORKDIR /app

COPY package*.json ./
COPY .env ./ 
RUN npm install

COPY . .
RUN npm run build

# שלב הרצה
FROM node:20
WORKDIR /app

# העתקת התלויות המותקנות והקבצים הדרושים בלבד
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.env ./

# ודא שאתה מריץ את הבוט במודול ESM
CMD ["node", "dist/bot.js"]
