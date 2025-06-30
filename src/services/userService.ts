import * as fs from 'fs';
import path from 'path';

const USERS_PATH = path.join('src', 'storage', 'users.json');

export function loadUsers(): Record<string, any> {
  if (!fs.existsSync(USERS_PATH)) {
    fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
    fs.writeFileSync(USERS_PATH, '{}');
  }

  const data = fs.readFileSync(USERS_PATH, 'utf-8');
  return JSON.parse(data);
}

export function saveUsers(users: Record<string, any>) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
}

export function getOrCreateUser(users: Record<string, any>, chatId: number) {
  if (!users[chatId]) {
    users[chatId] = {
      currentDay: 1,
      mistakes: [],
      wordsLearned: [],
      active: false,
      lastTrainedAt: null,
      stats: {
        correct: 0,
        incorrect: 0
      }
    };
  }

  users[chatId].mistakes ||= [];
  users[chatId].wordsLearned ||= [];
  users[chatId].currentDay ||= 1;
  users[chatId].active ??= false;
  users[chatId].lastTrainedAt ??= null;
  users[chatId].stats ||= { correct: 0, incorrect: 0 };

  return users[chatId];
}
