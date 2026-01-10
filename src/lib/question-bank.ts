export const QUESTION_BANK = {
  EXAM_PAPER: "exam paper",
  QUESTIONBANK: "questionbank",
  CHECKPOINT: "checkpoint",
} as const;

export type QuestionBank = (typeof QUESTION_BANK)[keyof typeof QUESTION_BANK];
