import * as translateModule from '@vitalets/google-translate-api';
import fetch from 'node-fetch';
import { loadUsers, saveUsers } from './userService.ts';

type WordEntry = {
  word: string;
  translation: string;
  example: string;
  hasQuiz: boolean;
};

const RANDOM_WORD_API = 'https://random-word-api.herokuapp.com/word?number=50';
const translate = translateModule.translate;
export async function getDailyWords(userId: number, count = 20): Promise<WordEntry[]> {
  const users = loadUsers();
  const user = users[userId] ?? { wordsLearned: [], mistakes: [] };

  const alreadySeen = new Set(user.wordsLearned || []);
  const retryWords = user.mistakes?.slice(0, 3) ?? [];

  const dailyWords: WordEntry[] = [];

  for (const word of retryWords) {
    const translation = await safeTranslate(word);
    dailyWords.push({
      word,
      translation,
      example: `I need to remember the word ${word}.`,
      hasQuiz: true
    });
  }

  while (dailyWords.length < count) {
    const response = await fetch(RANDOM_WORD_API);
    const words = await response.json() as string[];

    for (const word of words) {
      if (alreadySeen.has(word) || retryWords.includes(word)) continue;

      const translation = await safeTranslate(word);
      dailyWords.push({
        word,
        translation,
        example: `This is an example with the word ${word}.`,
        hasQuiz: Math.random() < 0.6 // בערך 60% מהמילים יהיו עם חידון
      });

      alreadySeen.add(word);
      if (dailyWords.length >= count) break;
    }
  }

  // נעדכן את המשתמש
  user.wordsLearned = [...(user.wordsLearned || []), ...dailyWords.map(w => w.word)];
  users[userId] = user;
  saveUsers(users);

  return dailyWords;
}

export async function safeTranslate(word: string): Promise<string> {
  try {
    const result = await translate(word, { to: 'he' });
    return result.text;
  } catch (err) {
    console.error(`❌ Translation failed for ${word}:`, err);
    return '[תרגום נכשל]';
  }
}
