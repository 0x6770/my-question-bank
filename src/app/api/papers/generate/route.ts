import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let body: {
    title?: string;
    question_bank: string;
    show_answers?: boolean;
    question_ids: number[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    title = "Worksheet",
    question_bank,
    show_answers = false,
    question_ids,
  } = body;

  // Validate required fields
  if (!question_bank || !question_ids || !Array.isArray(question_ids)) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: question_bank and question_ids (array)",
      },
      { status: 400 },
    );
  }

  // Validate question_bank value
  const validBanks = ["questionbank", "checkpoint", "exam paper"];
  if (!validBanks.includes(question_bank)) {
    return NextResponse.json(
      { error: "Invalid question_bank value" },
      { status: 400 },
    );
  }

  // Validate question_ids is not empty
  if (question_ids.length === 0) {
    return NextResponse.json(
      { error: "question_ids cannot be empty" },
      { status: 400 },
    );
  }

  // Step 1: Check and consume paper generation quota using new quota system
  // Note: We pass null as paper_id initially, will update after paper is created
  const { data: quotaResult, error: quotaCheckError } = await supabase.rpc(
    "check_and_consume_paper_quota",
    {
      p_user_id: user.id,
      p_paper_id: null,
    },
  );

  if (quotaCheckError) {
    console.error("Quota check failed:", quotaCheckError);
    return NextResponse.json(
      { error: "Quota check failed", details: quotaCheckError.message },
      { status: 500 },
    );
  }

  if (!quotaResult || quotaResult.length === 0) {
    return NextResponse.json(
      { error: "Quota check failed - no data returned" },
      { status: 500 },
    );
  }

  const quota = quotaResult[0];

  // If quota check failed, return error
  if (!quota.success) {
    return NextResponse.json(
      {
        error: "Quota exceeded",
        message: quota.message,
        code: quota.code,
        quota: {
          used: quota.used,
          total: quota.total,
          resetAt: quota.reset_at,
        },
      },
      { status: 403 },
    );
  }

  // Step 2: Create paper record
  const { data: paper, error: paperError } = await supabase
    .from("generated_papers")
    .insert({
      user_id: user.id,
      title,
      question_bank,
      show_answers,
    })
    .select("id")
    .single();

  if (paperError) {
    return NextResponse.json({ error: paperError.message }, { status: 500 });
  }

  // Step 3: Create paper-question associations with positions
  const paperQuestions = question_ids.map((questionId, index) => ({
    paper_id: paper.id,
    question_id: questionId,
    position: index + 1, // 1-indexed positions
  }));

  const { error: questionsError } = await supabase
    .from("generated_paper_questions")
    .insert(paperQuestions);

  if (questionsError) {
    // Rollback: delete the paper if questions insertion fails
    await supabase.from("generated_papers").delete().eq("id", paper.id);

    return NextResponse.json(
      { error: questionsError.message },
      { status: 500 },
    );
  }

  const completedAt = new Date().toISOString();
  const uniqueQuestionIds = Array.from(new Set(question_ids));
  const { error: completionError } = await supabase
    .from("user_questions")
    .upsert(
      uniqueQuestionIds.map((questionId) => ({
        user_id: user.id,
        question_id: questionId,
        completed_at: completedAt,
      })),
      { onConflict: "user_id,question_id" },
    );

  if (completionError) {
    console.warn(
      "Failed to mark generated questions as completed:",
      completionError,
    );
  }

  // Step 4: Update quota record with paper ID for tracking
  // This is optional but useful for auditing
  const { data: quotaRow } = await supabase
    .from("user_paper_quotas")
    .select("current_period_papers")
    .eq("user_id", user.id)
    .maybeSingle();

  const { error: quotaUpdateError } = await supabase
    .from("user_paper_quotas")
    .update({
      current_period_papers: [
        ...(quotaRow?.current_period_papers ?? []),
        paper.id,
      ],
    })
    .eq("user_id", user.id);

  if (quotaUpdateError) {
    console.warn("Failed to update quota tracking:", quotaUpdateError);
  }

  // Return success with paper ID and quota information
  return NextResponse.json({
    success: true,
    paper_id: paper.id,
    quota: {
      used: quota.used,
      total: quota.total,
      remaining: quota.total - quota.used,
      resetAt: quota.reset_at,
    },
  });
}
