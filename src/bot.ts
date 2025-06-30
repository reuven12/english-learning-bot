import TelegramBot from 'node-telegram-bot-api';
import { config } from 'dotenv';
import * as fs from 'fs';
import cron from 'node-cron';
import { safeTranslate, getDailyWords } from './services/wordService.ts';
import { generateAudio } from './services/audioService.js';
import { loadUsers, saveUsers, getOrCreateUser } from './services/userService.js';

config();
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN!, { polling: true });

const allowedUsers = [
  315595801, 
  316291178,
  111222333
];

function withAuthorization(pattern: RegExp, handler: (msg: TelegramBot.Message) => void) {
  bot.onText(pattern, (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(chatId)) {
      bot.sendMessage(chatId, "⛔ אין לך גישה לבוט הזה.");
      return;
    }
    handler(msg);
  });
}

const pollAnswerMap = new Map<string, {
  correctWord: string,
  userId: number,
  options: string[]
}>();

const users = loadUsers();

function shuffleArray(array: string[]) {
  return array.sort(() => Math.random() - 0.5);
}

function generateWrongAnswers(correctWord: string): string[] {
  const allWords = Object.values(users)
    .flatMap(user => user.wordsLearned || [])
    .filter(w => w !== correctWord);
  return shuffleArray(allWords).slice(0, 3);
}

withAuthorization(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = getOrCreateUser(users, chatId);

  const wordList = await getDailyWords(chatId, 20);
  if (!wordList || wordList.length === 0) {
    bot.sendMessage(chatId, "😅 לא הצלחתי להביא מילים חדשות להיום.");
    return;
  }

  await bot.sendMessage(chatId, `📅 יום ${user.currentDay} – הנה המילים שלך:`);

  for (const word of wordList) {
    const text = `🟩 *${word.word}* – ${word.translation}\n📝 ${word.example}`;
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    const audioPath = await generateAudio(word.word);
    await bot.sendAudio(chatId, fs.createReadStream(audioPath));

    if (word.hasQuiz) {
      const wrongOptions = generateWrongAnswers(word.word);
      const options = shuffleArray([word.word, ...wrongOptions]);

      const poll = await bot.sendPoll(chatId, `❓ מהי המילה המתאימה ל: *${word.translation}*`, options, {
        is_anonymous: false,
        type: 'quiz',
        correct_option_id: options.indexOf(word.word),
        explanation: `✔️ התשובה הנכונה: ${word.word}`,
      });

      if (poll.poll && poll.poll.id) {
        pollAnswerMap.set(poll.poll.id, {
          correctWord: word.word,
          userId: chatId,
          options
        });
      }
    }
  }

  user.currentDay += 1;
  user.active = true;
  user.lastTrainedAt = new Date().toISOString().slice(0, 10);
  saveUsers(users);
});

withAuthorization(/\/retry/, async (msg) => {
  const chatId = msg.chat.id;
  const user = getOrCreateUser(users, chatId);

  const mistakes = user.mistakes || [];
  if (mistakes.length === 0) {
    bot.sendMessage(chatId, "🎉 אין טעויות לחזור עליהן! כל הכבוד.");
    return;
  }

  bot.sendMessage(chatId, `🔁 חזרה על ${mistakes.length} מילים שטעית בהן:`);

  for (const word of mistakes) {
    const translation = await safeTranslate(word);
    const text = `🟧 *${word}* – ${translation}\n📝 Try to remember this word.`;
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    const audioPath = await generateAudio(word);
    await bot.sendAudio(chatId, fs.createReadStream(audioPath));

    const wrongOptions = generateWrongAnswers(word);
    const options = shuffleArray([word, ...wrongOptions]);

    const poll = await bot.sendPoll(chatId, `❓ מהי המילה המתאימה ל: *${translation}*`, options, {
      is_anonymous: false,
      type: 'quiz',
      correct_option_id: options.indexOf(word),
      explanation: `✔️ התשובה הנכונה: ${word}`,
    });

    if (poll.poll && poll.poll.id) {
      pollAnswerMap.set(poll.poll.id, {
        correctWord: word,
        userId: chatId,
        options
      });
    }
  }
});

withAuthorization(/\/review/, async (msg) => {
  const chatId = msg.chat.id;
  const user = getOrCreateUser(users, chatId);
  const learned = user.wordsLearned || [];

  if (learned.length === 0) {
    bot.sendMessage(chatId, "עדיין לא למדת מילים.");
    return;
  }

  const sample = shuffleArray(learned).slice(0, 10);
  bot.sendMessage(chatId, "🔁 שינון קצר – 10 מילים שלמדת:");

  for (const word of sample) {
    const translation = await safeTranslate(word);
    const text = `📘 *${word}* – ${translation}`;
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    const audioPath = await generateAudio(word);
    await bot.sendAudio(chatId, fs.createReadStream(audioPath));
  }
});

withAuthorization(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  const user = getOrCreateUser(users, chatId);
  user.active = false;
  saveUsers(users);
  bot.sendMessage(chatId, "⏹️ הופסק התרגול היומי. תוכל לחזור עם /start מתי שתרצה.");
});

withAuthorization(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const user = getOrCreateUser(users, chatId);

  const correct = user.stats?.correct || 0;
  const incorrect = user.stats?.incorrect || 0;
  const total = correct + incorrect;
  const successRate = total > 0 ? ((correct / total) * 100).toFixed(1) : '0.0';

  const text = `
📊 *התקדמות אישית:*
- ✅ תשובות נכונות: ${correct}
- ❌ תשובות שגויות: ${incorrect}
- 🎯 אחוז הצלחה: ${successRate}%
  `;
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

bot.on('poll_answer', (answer) => {
  const pollId = answer.poll_id;
  const data = pollAnswerMap.get(pollId);
  if (!data) return;

  const { correctWord, userId, options } = data;
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

cron.schedule('0 9 * * *', async () => {
  console.log('📤 התחיל שליחה אוטומטית');

  const today = new Date().toISOString().slice(0, 10);

  for (const chatId of Object.keys(users)) {
    const numericId = parseInt(chatId);
    if (!allowedUsers.includes(numericId)) continue;

    const user = getOrCreateUser(users, numericId);
    if (!user.active || user.lastTrainedAt === today) continue;

    const wordList = await getDailyWords(numericId, 20);
    if (!wordList || wordList.length === 0) continue;

    await bot.sendMessage(numericId, `📅 יום ${user.currentDay} – תרגול יומי:`);

    for (const word of wordList) {
      const text = `🟩 *${word.word}* – ${word.translation}\n📝 ${word.example}`;
      await bot.sendMessage(numericId, text, { parse_mode: 'Markdown' });

      const audioPath = await generateAudio(word.word);
      await bot.sendAudio(numericId, fs.createReadStream(audioPath));

      if (word.hasQuiz) {
        const wrongOptions = generateWrongAnswers(word.word);
        const options = shuffleArray([word.word, ...wrongOptions]);

        const poll = await bot.sendPoll(numericId, `❓ מהי המילה המתאימה ל: *${word.translation}*`, options, {
          is_anonymous: false,
          type: 'quiz',
          correct_option_id: options.indexOf(word.word),
          explanation: `✔️ התשובה הנכונה: ${word.word}`,
        });

        if (poll.poll && poll.poll.id) {
          pollAnswerMap.set(poll.poll.id, {
            correctWord: word.word,
            userId: numericId,
            options
          });
        }
      }
    }

    user.currentDay += 1;
    user.lastTrainedAt = today;
    saveUsers(users);
  }
});
