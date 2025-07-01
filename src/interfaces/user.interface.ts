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
  session: {
    wordList: {
      word: string;
      translation: string;
      example: string;
      hasQuiz: boolean;
    }[];
    currentIndex: number;
  } | null;
  sessionType: 'daily' | 'retry' | 'review' | null;
}
