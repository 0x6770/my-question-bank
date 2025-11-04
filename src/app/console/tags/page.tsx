import { createClient } from "@/lib/supabase/server";

import { TagManagement } from "./tag-management-client";

export default async function ConsoleTagsPage() {
  const supabase = await createClient();
  const { data: tags, error } = await supabase
    .from("tags")
    .select("id, name, parent_id, created_at")
    .order("name", { ascending: true });

  return (
    <TagManagement
      initialTags={tags ?? []}
      loadError={error ? "无法加载标签列表，请稍后重试。" : null}
    />
  );
}
