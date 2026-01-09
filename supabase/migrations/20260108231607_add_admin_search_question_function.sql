-- Create RPC function for admins to search questions bypassing RLS
CREATE OR REPLACE FUNCTION admin_search_question(question_id_param INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Check if user is admin or super_admin
  IF NOT in_roles(VARIADIC ARRAY['admin'::user_role, 'super_admin'::user_role]) THEN
    RAISE EXCEPTION 'Only admins can search all questions';
  END IF;

  -- Fetch question with all related data
  SELECT json_build_object(
    'id', q.id,
    'marks', q.marks,
    'difficulty', q.difficulty,
    'calculator', q.calculator,
    'created_at', q.created_at,
    'question_chapters', (
      SELECT json_agg(
        json_build_object(
          'chapter_id', c.id,
          'chapter_name', c.name,
          'subject_id', s.id,
          'subject_name', s.name,
          'question_bank', eb.question_bank
        )
      )
      FROM question_chapters qc
      JOIN chapters c ON c.id = qc.chapter_id
      JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
      WHERE qc.question_id = q.id
    ),
    'question_images', (
      SELECT json_agg(
        json_build_object(
          'id', qi.id,
          'storage_path', qi.storage_path,
          'position', qi.position
        ) ORDER BY qi.position
      )
      FROM question_images qi
      WHERE qi.question_id = q.id
    ),
    'answer_images', (
      SELECT json_agg(
        json_build_object(
          'id', ai.id,
          'storage_path', ai.storage_path,
          'position', ai.position
        ) ORDER BY ai.position
      )
      FROM answer_images ai
      WHERE ai.question_id = q.id
    )
  ) INTO result
  FROM questions q
  WHERE q.id = question_id_param;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_search_question(INTEGER) TO authenticated;
