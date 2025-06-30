import googleTTS from 'google-tts-api';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

export async function generateAudio(word: string): Promise<string> {
  const audioDir = path.join('audio');
  const filePath = path.join(audioDir, `${word}.mp3`);

  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir);
  }

  if (fs.existsSync(filePath)) {
    return filePath;
  }

  const url = googleTTS.getAudioUrl(word, {
    lang: 'en',
    slow: false,
    host: 'https://translate.google.com',
  });

  const res = await fetch(url);
  const buffer = await res.buffer();
  fs.writeFileSync(filePath, buffer);

  return filePath;
}
