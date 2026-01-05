import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/questions/[id]/view-answer
 * Check quota and consume answer viewing quota
 * This should be called BEFORE showing the answer to the user
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id } = await params;
  const questionId = parseInt(id, 10);

  if (isNaN(questionId)) {
    return NextResponse.json({ error: "Invalid question ID" }, { status: 400 });
  }

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Call database function to check and consume quota
  const { data, error } = await supabase.rpc("check_and_consume_answer_quota", {
    p_user_id: user.id,
    p_question_id: questionId,
  });

  if (error) {
    console.error("Failed to check answer quota:", error);
    return NextResponse.json(
      { error: "Quota check failed", details: error.message },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Quota check failed - no data returned" },
      { status: 500 },
    );
  }

  const result = data[0];

  // If quota check failed, return 403 Forbidden
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        code: result.code,
        message: result.message,
        quota: {
          used: result.used,
          total: result.total,
          resetAt: result.reset_at,
        },
      },
      { status: 403 }, // Forbidden
    );
  }

  // If successful, also update the user_questions table to track the view
  await supabase.rpc("track_answer_view", { q_id: questionId });

  // Return success with quota information
  return NextResponse.json({
    success: true,
    code: result.code,
    message: result.message,
    quota: {
      used: result.used,
      total: result.total,
      resetAt: result.reset_at,
    },
  });
}
