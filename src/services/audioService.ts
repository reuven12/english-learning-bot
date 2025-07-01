import googleTTS from 'google-tts-api';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

const AUDIO_DIR = path.join('src', 'storage', 'audio');

function sanitize(word: string): string {
  return word.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

export async function generateAudio(word: string): Promise<string> {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }

  const safeWord = sanitize(word);
  const filePath = path.join(AUDIO_DIR, `${safeWord}.mp3`);

  if (fs.existsSync(filePath)) {
    return filePath;
  }

  try {
    const url = googleTTS.getAudioUrl(word, {
      lang: 'en',
      slow: false,
      host: 'https://translate.google.com',
    });

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch audio for ${word}: ${res.status}`);
    }

    const buffer = await res.buffer();
    fs.writeFileSync(filePath, buffer);

    return filePath;
  } catch (error) {
    console.error(`❌ Error generating audio for "${word}":`, error);
    throw error;
  }
}
