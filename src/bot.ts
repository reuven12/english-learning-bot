import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import { config } from 'dotenv';
import * as fs from 'fs';
import { generateAudio, cleanupAudio, cleanupOldAudioFiles } from './services/audioService.js';
import { safeTranslate, getDailyWords } from './services/wordService.js';
import { loadUsers, saveUsers, getOrCreateUser } from './services/userService.js';

config();

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN!, { webHook: true });
bot.setWebHook(`${process.env.BOT_URL}/bot${process.env.TELEGRAM_TOKEN}`);

const allowedUsers = [136488396, 316291178, 111222333];
const pollAnswerMap = new Map<string, { correctWord: string, userId: number, options: string[] }>();
const users = loadUsers();

function isAuthorized(chatId: number): boolean {
  return allowedUsers.includes(chatId);
}

function shuffleArray(array: string[]) {
  return array.sort(() => Math.random() - 0.5);
}

function generateWrongAnswers(correctWord: string): string[] {
  const allWords = Object.values(users)
    .flatMap(user => user.wordsLearned || [])
    .filter(w => w !== correctWord);
  return shuffleArray(allWords).slice(0, 3);
}

function getMenuButton() {
  return [{ text: '🏠 חזור לתפריט', callback_data: 'show_menu' }];
}

async function sendMainMenu(chatId: number) {
  if (!isAuthorized(chatId)) return;

  await bot.sendMessage(chatId, '🧭 *תפריט ראשי* – בחר פעולה:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '▶️ תרגול יומי', callback_data: 'daily_training' },
          { text: '🔁 חזרה על טעויות', callback_data: 'retry_training' }
        ],
        [
          { text: '📚 שינון מילים', callback_data: 'review_training' },
          { text: '📊 סטטיסטיקות', callback_data: 'show_stats' }
        ],
        [
          { text: '⏹️ הפסק תרגול', callback_data: 'stop_training' }
        ]
      ]
    }
  });
}

async function sendNextWord(chatId: number) {
  if (!isAuthorized(chatId)) return;

  const user = getOrCreateUser(users, chatId);
  const session = user.session;

  if (!session || session.currentIndex >= session.wordList.length) {
    await bot.sendMessage(chatId, "🎉 סיימת את כל המילים להיום! כל הכבוד 🔥", {
      reply_markup: { inline_keyboard: [getMenuButton()] }
    });
    await bot.sendSticker(chatId, 'CAACAgUAAxkBAAEDi75lVweBe-4jXMIo9EjO3HITt2NeEgACDgADVp29VYKwsmV_t0jzNAQ');

    if (user.sessionType === 'daily') {
      await bot.sendMessage(chatId, "🧠 צברת 20 נקודות על התרגול של היום!\n💾 ההתקדמות נשמרה.");

      const words = user.session?.wordList.map(w => w.word) ?? [];
      const correctWord = shuffleArray(words)[0];
      const wrongOptions = generateWrongAnswers(correctWord);
      const options = shuffleArray([correctWord, ...wrongOptions]);

      if (options.length >= 2) {
        const poll = await bot.sendPoll(chatId, `❓ מהי המשמעות של המילה: *${correctWord}*`, options, {
          is_anonymous: false,
          type: 'quiz',
          correct_option_id: options.indexOf(correctWord),
          explanation: `✔️ התשובה הנכונה: ${correctWord}`
        });

        if (poll.poll?.id) {
          pollAnswerMap.set(poll.poll.id, {
            correctWord,
            userId: chatId,
            options
          });
        }
      }
    }

    user.session = null;
    user.sessionType = null;
    saveUsers(users);
    return;
  }

  const word = session.wordList[session.currentIndex];
  const text = `🟩 *${word.word}* – ${word.translation}\n📝 ${word.example}`;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

  const audioPath = await generateAudio(word.word);
  await bot.sendAudio(chatId, fs.createReadStream(audioPath));

  session.currentIndex++;
  saveUsers(users);

  await bot.sendMessage(chatId, '⬇️ לחץ על "המשך" למילה הבאה:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 טוען…', callback_data: 'loading' }],
        getMenuButton()
      ]
    }
  });
}

// הקוד ממשיך כרגיל עם callback_query ויתר הפונקציות...
