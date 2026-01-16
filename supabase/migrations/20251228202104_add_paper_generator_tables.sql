-- Paper Generator Tables Migration
-- This migration adds tables for the paper generator feature
-- Note: This is separate from the existing exam_papers table which stores official exam PDFs

-- =====================================================
-- 1. generated_papers table (stores user-generated papers)
-- =====================================================
CREATE TABLE IF NOT EXISTS generated_papers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL DEFAULT 'Worksheet',
  question_bank TEXT NOT NULL,
  show_answers BOOLEAN DEFAULT false,
  one_question_per_page BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster user queries
CREATE INDEX idx_generated_papers_user_id ON generated_papers(user_id);
CREATE INDEX idx_generated_papers_created_at ON generated_papers(created_at DESC);

-- Add RLS policies
ALTER TABLE generated_papers ENABLE ROW LEVEL SECURITY;

-- Users can view their own papers
CREATE POLICY "Users can view their own generated papers"
  ON generated_papers
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own papers
CREATE POLICY "Users can insert their own generated papers"
  ON generated_papers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own papers
CREATE POLICY "Users can update their own generated papers"
  ON generated_papers
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own papers
CREATE POLICY "Users can delete their own generated papers"
  ON generated_papers
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- 2. generated_paper_questions table (paper-question associations)
-- =====================================================
CREATE TABLE IF NOT EXISTS generated_paper_questions (
  id BIGSERIAL PRIMARY KEY,
  paper_id BIGINT REFERENCES generated_papers ON DELETE CASCADE NOT NULL,
  question_id BIGINT REFERENCES questions ON DELETE CASCADE NOT NULL,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(paper_id, question_id)
);

-- Add indexes
CREATE INDEX idx_generated_paper_questions_paper_id ON generated_paper_questions(paper_id);
CREATE INDEX idx_generated_paper_questions_question_id ON generated_paper_questions(question_id);
CREATE INDEX idx_generated_paper_questions_position ON generated_paper_questions(paper_id, position);

-- Add RLS policies (inherit from generated_papers)
ALTER TABLE generated_paper_questions ENABLE ROW LEVEL SECURITY;

-- Users can view questions for their own papers
CREATE POLICY "Users can view their own generated paper questions"
  ON generated_paper_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM generated_papers
      WHERE generated_papers.id = generated_paper_questions.paper_id
      AND generated_papers.user_id = auth.uid()
    )
  );

-- Users can insert questions for their own papers
CREATE POLICY "Users can insert their own generated paper questions"
  ON generated_paper_questions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM generated_papers
      WHERE generated_papers.id = generated_paper_questions.paper_id
      AND generated_papers.user_id = auth.uid()
    )
  );

-- Users can update questions for their own papers
CREATE POLICY "Users can update their own generated paper questions"
  ON generated_paper_questions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM generated_papers
      WHERE generated_papers.id = generated_paper_questions.paper_id
      AND generated_papers.user_id = auth.uid()
    )
  );

-- Users can delete questions for their own papers
CREATE POLICY "Users can delete their own generated paper questions"
  ON generated_paper_questions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM generated_papers
      WHERE generated_papers.id = generated_paper_questions.paper_id
      AND generated_papers.user_id = auth.uid()
    )
  );

-- =====================================================
-- 3. user_paper_quotas table (quota tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_paper_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  papers_generated INTEGER DEFAULT 0 NOT NULL,
  quota_reset_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add index
CREATE INDEX idx_user_paper_quotas_reset_at ON user_paper_quotas(quota_reset_at);

-- Add RLS policies
ALTER TABLE user_paper_quotas ENABLE ROW LEVEL SECURITY;

-- Users can view their own quota
CREATE POLICY "Users can view their own quota"
  ON user_paper_quotas
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own quota
CREATE POLICY "Users can update their own quota"
  ON user_paper_quotas
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can insert their own quota
CREATE POLICY "Users can insert their own quota"
  ON user_paper_quotas
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 4. Helper function to update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_generated_papers_updated_at
  BEFORE UPDATE ON generated_papers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_paper_quotas_updated_at
  BEFORE UPDATE ON user_paper_quotas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. Comments for documentation
-- =====================================================
COMMENT ON TABLE generated_papers IS 'Stores user-generated custom papers/worksheets';
COMMENT ON COLUMN generated_papers.user_id IS 'User who created the paper';
COMMENT ON COLUMN generated_papers.title IS 'Paper title, default "Worksheet"';
COMMENT ON COLUMN generated_papers.question_bank IS 'Question bank used: "past paper questions", "topical questions", or "exam paper"';
COMMENT ON COLUMN generated_papers.show_answers IS 'Whether to show answers in PDF';
COMMENT ON COLUMN generated_papers.one_question_per_page IS 'Whether to render one question per page in PDF';

COMMENT ON TABLE generated_paper_questions IS 'Junction table linking generated papers to questions with ordering';
COMMENT ON COLUMN generated_paper_questions.position IS 'Display order of question in paper (1-indexed)';

COMMENT ON TABLE user_paper_quotas IS 'Tracks user paper generation quotas';
COMMENT ON COLUMN user_paper_quotas.papers_generated IS 'Number of papers generated in current quota period';
COMMENT ON COLUMN user_paper_quotas.quota_reset_at IS 'When the quota counter will reset';
