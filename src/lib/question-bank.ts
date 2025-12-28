export const QUESTION_BANK = {
  EXAM_PAPER: "exam paper",
  PAST_PAPER_QUESTIONS: "past paper questions",
  TOPICAL_QUESTIONS: "topical questions",
} as const;

export type QuestionBank = (typeof QUESTION_BANK)[keyof typeof QUESTION_BANK];
