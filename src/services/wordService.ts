import * as translateModule from '@vitalets/google-translate-api';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import { loadUsers, saveUsers } from './userService.js';

config();

type WordEntry = {
  word: string;
  translation: string;
  example: string;
  hasQuiz: boolean;
};

const RANDOM_WORD_API = 'https://random-word-api.herokuapp.com/word?number=50';
const translate = translateModule.translate;

/**
 * מחזיר משפט לדוגמה אמיתי למילה, או משפט גנרי אם לא נמצא.
 */
async function getExampleSentence(word: string): Promise<string> {
  try {
    const res = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${word}/examples`, {
      headers: {
        'X-RapidAPI-Key': process.env.WORDS_API_KEY!,
        'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com'
      }
    });

    if (!res.ok) throw new Error(`Failed to fetch example for ${word}`);

    const data = await res.json() as { examples?: string[] };
    const example = data.examples?.[0];
    return example ?? `Try using the word ${word} in a sentence.`;
  } catch (err) {
    console.warn(`⚠️ Failed to get example for "${word}":`, err);
    return `Try using the word ${word} in a sentence.`;
  }
}

/**
 * מחזיר רשימת מילים יומית לתרגול.
 */
export async function getDailyWords(userId: number, count = 20): Promise<WordEntry[]> {
  const users = loadUsers();
  const user = users[userId] ?? { wordsLearned: [], mistakes: [] };

  const alreadySeen = new Set(user.wordsLearned || []);
  const retryWords = user.mistakes?.slice(0, 3) ?? [];

  const dailyWords: WordEntry[] = [];

  for (const word of retryWords) {
    const translation = await safeTranslate(word);
    const example = await getExampleSentence(word);
    dailyWords.push({
      word,
      translation,
      example,
      hasQuiz: true
    });
  }

  while (dailyWords.length < count) {
    const response = await fetch(RANDOM_WORD_API);
    const words = await response.json() as string[];

    for (const word of words) {
      if (alreadySeen.has(word) || retryWords.includes(word)) continue;

      const translation = await safeTranslate(word);
      const example = await getExampleSentence(word);

      dailyWords.push({
        word,
        translation,
        example,
        hasQuiz: Math.random() < 0.6
      });

      alreadySeen.add(word);
      if (dailyWords.length >= count) break;
    }
  }

  user.wordsLearned = [...(user.wordsLearned || []), ...dailyWords.map(w => w.word)];
  users[userId] = user;
  saveUsers(users);

  return dailyWords;
}

/**
 * תרגום בטוח עם טיפול בשגיאות.
 */
export async function safeTranslate(word: string): Promise<string> {
  try {
    const result = await translate(word, { to: 'he' });
    return result.text;
  } catch (err) {
    console.error(`❌ Translation failed for ${word}:`, err);
    return '[תרגום נכשל]';
  }
}
