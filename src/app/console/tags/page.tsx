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
      loadError={
        error ? "Failed to load tag list. Please try again later." : null
      }
    />
  );
}
