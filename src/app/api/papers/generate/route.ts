import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const QUOTA_LIMIT = 30; // 30 papers per quota period
const QUOTA_PERIOD_DAYS = 30; // 30 days

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
  const validBanks = [
    "past paper questions",
    "topical questions",
    "exam paper",
  ];
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

  // Step 1: Check user quota
  const { data: quotaData, error: quotaError } = await supabase
    .from("user_paper_quotas")
    .select("papers_generated, quota_reset_at")
    .eq("user_id", user.id)
    .single();

  let currentQuota = quotaData;

  // If no quota record exists, create one
  if (quotaError?.code === "PGRST116") {
    // Not found
    const resetAt = new Date();
    resetAt.setDate(resetAt.getDate() + QUOTA_PERIOD_DAYS);

    const { data: newQuota, error: createQuotaError } = await supabase
      .from("user_paper_quotas")
      .insert({
        user_id: user.id,
        papers_generated: 0,
        quota_reset_at: resetAt.toISOString(),
      })
      .select("papers_generated, quota_reset_at")
      .single();

    if (createQuotaError) {
      return NextResponse.json(
        { error: createQuotaError.message },
        { status: 500 },
      );
    }

    currentQuota = newQuota;
  } else if (quotaError) {
    return NextResponse.json({ error: quotaError.message }, { status: 500 });
  }

  if (!currentQuota) {
    return NextResponse.json(
      { error: "Failed to retrieve quota information" },
      { status: 500 },
    );
  }

  // Check if quota needs to be reset
  const now = new Date();
  const resetAt = new Date(currentQuota.quota_reset_at);

  if (now >= resetAt) {
    // Reset quota
    const newResetAt = new Date();
    newResetAt.setDate(newResetAt.getDate() + QUOTA_PERIOD_DAYS);

    const { data: updatedQuota, error: resetError } = await supabase
      .from("user_paper_quotas")
      .update({
        papers_generated: 0,
        quota_reset_at: newResetAt.toISOString(),
      })
      .eq("user_id", user.id)
      .select("papers_generated, quota_reset_at")
      .single();

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 });
    }

    currentQuota = updatedQuota;
  }

  // Check if user has exceeded quota
  if (currentQuota.papers_generated >= QUOTA_LIMIT) {
    return NextResponse.json(
      {
        error: "Quota exceeded",
        message: `You have reached the limit of ${QUOTA_LIMIT} papers per ${QUOTA_PERIOD_DAYS} days`,
        quota_reset_at: currentQuota.quota_reset_at,
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

  // Step 4: Update user quota
  const { error: updateQuotaError } = await supabase
    .from("user_paper_quotas")
    .update({
      papers_generated: currentQuota.papers_generated + 1,
    })
    .eq("user_id", user.id);

  if (updateQuotaError) {
    // Note: We don't rollback the paper creation if quota update fails
    // This is to prevent losing the generated paper
    console.error("Failed to update quota:", updateQuotaError);
  }

  // Return success with paper ID
  return NextResponse.json({
    success: true,
    paper_id: paper.id,
    quota_remaining: QUOTA_LIMIT - (currentQuota.papers_generated + 1),
  });
}
