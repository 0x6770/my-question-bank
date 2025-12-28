import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Paper = {
  id: number;
  title: string;
  question_bank: string;
  show_answers: boolean;
  created_at: string;
  updated_at: string;
  question_count: number;
};

export default async function PapersListPage() {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch papers directly from database
  const pageSize = 20;
  const fetchLimit = pageSize + 1; // +1 to check if there's more

  const { data: papersData, error } = await supabase
    .from("generated_papers")
    .select("id, title, question_bank, show_answers, created_at, updated_at")
    .order("created_at", { ascending: false })
    .range(0, fetchLimit - 1);

  if (error) {
    console.error("Error fetching papers:", error);
  }

  const hasMore = (papersData?.length ?? 0) > pageSize;
  const limitedPapers = hasMore
    ? (papersData ?? []).slice(0, pageSize)
    : (papersData ?? []);

  // Get question counts for each paper
  const paperIds = limitedPapers.map((paper) => paper.id);

  let papers: Paper[] = limitedPapers.map((paper) => ({
    ...paper,
    question_count: 0,
  }));

  if (paperIds.length > 0) {
    const { data: questionCounts } = await supabase
      .from("generated_paper_questions")
      .select("paper_id")
      .in("paper_id", paperIds);

    // Count questions per paper
    const countMap = new Map<number, number>();
    for (const row of questionCounts ?? []) {
      countMap.set(row.paper_id, (countMap.get(row.paper_id) ?? 0) + 1);
    }

    papers = limitedPapers.map((paper) => ({
      ...paper,
      question_count: countMap.get(paper.id) ?? 0,
    }));
  }

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">My Papers</h1>
        <Link
          href="/paper-builder"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Create New Paper
        </Link>
      </div>

      {papers.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <p className="text-gray-500 mb-4">
            You haven't generated any papers yet.
          </p>
          <Link
            href="/paper-builder"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Create Your First Paper
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Question Bank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Questions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Answers
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {papers.map((paper) => (
                <tr key={paper.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/my-papers/${paper.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {paper.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {paper.question_bank}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {paper.question_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(paper.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {paper.show_answers ? (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Included
                      </span>
                    ) : (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        Not Included
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/my-papers/${paper.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600">
                More papers available. Pagination coming soon.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
