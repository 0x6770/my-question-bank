-- 更新 exam_papers 的唯一约束，添加 time_zone
-- 确保同一张卷的不同时区版本可以共存

ALTER TABLE exam_papers DROP CONSTRAINT IF EXISTS uq_exam_paper;

ALTER TABLE exam_papers
ADD CONSTRAINT uq_exam_paper
UNIQUE (subject_id, year, season, paper_code, time_zone);
