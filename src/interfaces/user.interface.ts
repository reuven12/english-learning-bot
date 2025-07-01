export type WordEntry = {
  word: string;
  translation: string;
  example: string;
  hasQuiz: boolean;
};

export type UserSession = {
  wordList: WordEntry[];
  currentIndex: number;
};

export interface UserData {
  currentDay: string | null;
  trainingDays: string[];
  mistakes: string[];
  wordsLearned: string[];
  active: boolean;
  lastTrainedAt: string | null;
  stats: {
    correct: number;
    incorrect: number;
  };
  session: UserSession | null;
}
