import * as fs from 'fs';
import path from 'path';
import { UserData } from '../interfaces/user.interface.js';

const USERS_PATH = path.join('src', 'storage', 'users.json');

export function loadUsers(): Record<string, UserData> {
  if (!fs.existsSync(USERS_PATH)) {
    fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
    fs.writeFileSync(USERS_PATH, '{}');
  }

  const data = fs.readFileSync(USERS_PATH, 'utf-8');
  return JSON.parse(data);
}

export function saveUsers(users: Record<string, UserData>) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
}

export function getOrCreateUser(users: Record<string, UserData>, chatId: number): UserData {
  if (!users[chatId]) {
    users[chatId] = {
      currentDay: null,
      trainingDays: [],
      mistakes: [],
      wordsLearned: [],
      active: false,
      lastTrainedAt: null,
      stats: {
        correct: 0,
        incorrect: 0
      },
      session: null,
      sessionType: null // 🆕 ברירת מחדל
    };
  }

  const user = users[chatId];

  user.currentDay ??= null;
  user.trainingDays ||= [];
  user.mistakes ||= [];
  user.wordsLearned ||= [];
  user.active ??= false;
  user.lastTrainedAt ??= null;
  user.stats ||= { correct: 0, incorrect: 0 };
  user.session ??= null;
  user.sessionType ??= null; // 🆕 הבטחה שלא חסר

  return user;
}

