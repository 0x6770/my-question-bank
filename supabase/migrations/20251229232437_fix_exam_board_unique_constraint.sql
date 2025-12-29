-- 修复 exam_boards 表的唯一约束，允许不同 question_bank 中有同名 exam board
-- 将约束从 (name) 改为 (name, question_bank)

ALTER TABLE exam_boards DROP CONSTRAINT exam_boards_name_key;

ALTER TABLE exam_boards ADD CONSTRAINT exam_boards_name_question_bank_key UNIQUE (name, question_bank);