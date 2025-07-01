import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import { config } from 'dotenv';
import * as fs from 'fs';
import cron from 'node-cron';
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
  cleanupAudio(audioPath);

  if (word.hasQuiz) {
    const wrongOptions = generateWrongAnswers(word.word);
    const options = shuffleArray([word.word, ...wrongOptions]);

    const poll = await bot.sendPoll(chatId, `❓ מהי המילה המתאימה ל: *${word.translation}*`, options, {
      is_anonymous: false,
      type: 'quiz',
      correct_option_id: options.indexOf(word.word),
      explanation: `✔️ התשובה הנכונה: ${word.word}`
    });

    if (poll.poll && poll.poll.id) {
      pollAnswerMap.set(poll.poll.id, {
        correctWord: word.word,
        userId: chatId,
        options
      });
    }
  }

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

bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat.id;
  if (!chatId || !isAuthorized(chatId)) {
    if (chatId) await bot.sendMessage(chatId, '⛔ אין לך גישה לבוט הזה.');
    return;
  }

  await bot.answerCallbackQuery(query.id);

  switch (query.data) {
    case 'next_word': return sendNextWord(chatId);
    case 'daily_training': return startDailyTraining(chatId);
    case 'retry_training': return startRetryTraining(chatId);
    case 'review_training': return startReviewTraining(chatId);
    case 'show_stats': return sendStats(chatId);
    case 'stop_training': {
      const user = getOrCreateUser(users, chatId);
      user.active = false;
      saveUsers(users);
      return bot.sendMessage(chatId, "⏹️ הופסק התרגול. תוכל להתחיל מחדש דרך /start", {
        reply_markup: { inline_keyboard: [getMenuButton()] }
      });
    }
    case 'show_menu': return sendMainMenu(chatId);
  }
});

async function startDailyTraining(chatId: number) {
  if (!isAuthorized(chatId)) return;

  const user = getOrCreateUser(users, chatId);
  const today = new Date().toISOString().slice(0, 10);
  if (!user.trainingDays.includes(today)) user.trainingDays.push(today);
  user.currentDay = today;

  const wordList = await getDailyWords(chatId, 20);
  if (!wordList || wordList.length === 0) {
    return bot.sendMessage(chatId, '😅 לא הצלחתי להביא מילים חדשות להיום.', {
      reply_markup: { inline_keyboard: [getMenuButton()] }
    });
  }

  user.sessionType = 'daily';
  user.session = { wordList, currentIndex: 0 };
  user.active = true;
  user.lastTrainedAt = today;
  saveUsers(users);

  await sendNextWord(chatId);
}

async function startRetryTraining(chatId: number) {
  if (!isAuthorized(chatId)) return;

  const user = getOrCreateUser(users, chatId);
  const mistakes = user.mistakes || [];

  if (mistakes.length === 0) {
    return bot.sendMessage(chatId, '🎉 אין טעויות לחזור עליהן! כל הכבוד.', {
      reply_markup: { inline_keyboard: [getMenuButton()] }
    });
  }

  const wordList = await Promise.all(mistakes.map(async word => ({
    word,
    translation: await safeTranslate(word),
    example: `Try to remember the word ${word}.`,
    hasQuiz: true
  })));

  user.sessionType = 'retry';
  user.session = { wordList, currentIndex: 0 };
  saveUsers(users);

  await sendNextWord(chatId);
}

async function startReviewTraining(chatId: number) {
  if (!isAuthorized(chatId)) return;

  const user = getOrCreateUser(users, chatId);
  const learned = user.wordsLearned || [];

  if (learned.length === 0) {
    return bot.sendMessage(chatId, 'עדיין לא למדת מילים.', {
      reply_markup: { inline_keyboard: [getMenuButton()] }
    });
  }

  const sampleWords = shuffleArray(learned).slice(0, 10);
  const wordList = await Promise.all(sampleWords.map(async word => ({
    word,
    translation: await safeTranslate(word),
    example: `Reminder: use the word ${word} in context.`,
    hasQuiz: false
  })));

  user.sessionType = 'review';
  user.session = { wordList, currentIndex: 0 };
  saveUsers(users);

  await sendNextWord(chatId);
}

async function sendStats(chatId: number) {
  if (!isAuthorized(chatId)) return;

  const user = getOrCreateUser(users, chatId);
  const correct = user.stats?.correct || 0;
  const incorrect = user.stats?.incorrect || 0;
  const total = correct + incorrect;
  const successRate = total > 0 ? ((correct / total) * 100).toFixed(1) : '0.0';
  const dayNumber = user.trainingDays.length;

  const text = `📊 *התקדמות אישית:*\n- 📅 ימים מתורגלים: ${dayNumber}\n- ✅ תשובות נכונות: ${correct}\n- ❌ תשובות שגויות: ${incorrect}\n- 🎯 אחוז הצלחה: ${successRate}%`;
  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [getMenuButton()] }
  });
}

bot.on('poll_answer', (answer) => {
  const pollId = answer.poll_id;
  const data = pollAnswerMap.get(pollId);
  if (!data) return;

  const { correctWord, userId, options } = data;
  if (!isAuthorized(userId)) return;

  const user = getOrCreateUser(users, userId);
  const selectedIndex = answer.option_ids[0];

  user.stats = user.stats || {};

  if (selectedIndex === options.indexOf(correctWord)) {
    user.stats.correct = (user.stats.correct || 0) + 1;
    user.mistakes = user.mistakes?.filter((w: string) => w !== correctWord);
  } else {
    user.stats.incorrect = (user.stats.incorrect || 0) + 1;
    if (!user.mistakes.includes(correctWord)) {
      user.mistakes.push(correctWord);
    }
  }

  pollAnswerMap.delete(pollId);
  saveUsers(users);
});

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

app.post(`/bot${process.env.TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (_, res) => {
  res.send('Bot is up ✅');
});

app.listen(port, () => {
  console.log(`🚀 Webhook server is running on port ${port}`);
});

cron.schedule('*/10 * * * *', () => {
  console.log('🧹 Running scheduled audio cleanup…');
  cleanupOldAudioFiles();
});
