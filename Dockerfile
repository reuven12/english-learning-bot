FROM node:20

WORKDIR /app

# העתקת קבצי תלויות
COPY package*.json ./
RUN npm install

# העתקת שאר הפרויקט
COPY . .

# הפעלת הבוט
CMD ["npm", "start"]
