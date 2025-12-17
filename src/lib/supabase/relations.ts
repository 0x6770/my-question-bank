import type { Tables } from "../../../database.types";

export type ExamBoardRow = Tables<"exam_boards">;
export type SubjectRow = Tables<"subjects">;
export type SubjectWithBoard = SubjectRow & { exam_board: ExamBoardRow | null };

export type TagValueRow = Tables<"subject_exam_tag_values">;
export type SubjectExamTagWithValues = Tables<"subject_exam_tags"> & {
  values?: TagValueRow[] | null;
};

export type ExamPaperWithRelations = Tables<"exam_papers"> & {
  subject: (SubjectRow & { exam_board: ExamBoardRow | null }) | null;
  tag_values: { tag_value_id: number; tag_value: TagValueRow | null }[];
};

export type UserAccessRow = {
  user_id: string;
  subject: SubjectWithBoard | null;
};

export const firstOrNull = <T>(
  value: T | T[] | null | undefined,
): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};
