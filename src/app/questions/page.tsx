import { BackToTopButton } from "@/components/back-to-top-button";
import { QuestionBrowser } from "@/components/question-browser";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .order("name", { ascending: true });

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name, subject_id, parent_chapter_id, position")
    .order("position", { ascending: true });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <QuestionBrowser
          subjects={subjects ?? []}
          chapters={
            chapters?.map((chapter) => ({
              id: chapter.id,
              name: chapter.name,
              subjectId: chapter.subject_id ?? null,
              parentChapterId: chapter.parent_chapter_id ?? null,
            })) ?? []
          }
        />
      </div>
      <BackToTopButton />
    </main>
  );
}
