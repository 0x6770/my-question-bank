import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pageParam = searchParams.get("page");
  const page = pageParam ? Number.parseInt(pageParam, 10) : 1;
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const pageSize = 20;
  const offset = (safePage - 1) * pageSize;
  const fetchLimit = pageSize + 1; // +1 to check if there's more

  // Fetch user's papers (RLS automatically filters by user_id)
  const { data: papers, error } = await supabase
    .from("generated_papers")
    .select("id, title, question_bank, show_answers, created_at, updated_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + fetchLimit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hasMore = (papers?.length ?? 0) > pageSize;
  const limitedPapers = hasMore
    ? (papers ?? []).slice(0, pageSize)
    : (papers ?? []);

  // Get question counts for each paper
  const paperIds = limitedPapers.map((paper) => paper.id);

  if (paperIds.length === 0) {
    return NextResponse.json({
      papers: [],
      hasMore: false,
      page: safePage,
    });
  }

  const { data: questionCounts, error: countError } = await supabase
    .from("generated_paper_questions")
    .select("paper_id")
    .in("paper_id", paperIds);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  // Count questions per paper
  const countMap = new Map<number, number>();
  for (const row of questionCounts ?? []) {
    countMap.set(row.paper_id, (countMap.get(row.paper_id) ?? 0) + 1);
  }

  const papersWithCounts = limitedPapers.map((paper) => ({
    ...paper,
    question_count: countMap.get(paper.id) ?? 0,
  }));

  return NextResponse.json({
    papers: papersWithCounts,
    hasMore,
    page: safePage,
  });
}
