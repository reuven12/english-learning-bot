import googleTTS from 'google-tts-api';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

const AUDIO_DIR = '/tmp/audio';
const MAX_FILE_AGE_MINUTES = 10;

function sanitize(word: string): string {
  return word.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

export async function generateAudio(word: string): Promise<string> {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }

  const filename = `${sanitize(word)}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);

  if (fs.existsSync(filepath)) {
    return filepath;
  }

  try {
    const url = googleTTS.getAudioUrl(word, {
      lang: 'en',
      slow: false,
      host: 'https://translate.google.com'
    });

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch audio for ${word}`);

    const buffer = await res.buffer();
    fs.writeFileSync(filepath, buffer);

    return filepath;
  } catch (err) {
    console.error(`❌ Error generating audio for "${word}":`, err);
    throw err;
  }
}

export function cleanupAudio(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`⚠️ Failed to delete audio file ${filePath}:`, err);
  }
}

export function cleanupOldAudioFiles() {
  if (!fs.existsSync(AUDIO_DIR)) return;

  const now = Date.now();
  const maxAgeMs = MAX_FILE_AGE_MINUTES * 60 * 1000;

  fs.readdirSync(AUDIO_DIR).forEach((file) => {
    const filePath = path.join(AUDIO_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      const age = now - stat.mtimeMs;
      if (age > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Deleted old audio file: ${file}`);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to check or delete file: ${filePath}`, err);
    }
  });
}
