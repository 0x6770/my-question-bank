import { QUESTION_BANK } from "@/lib/question-bank";
import {
  firstOrNull,
  type SubjectWithBoard,
  type UserAccessRow,
} from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "../../types";
import { UserAccessEditor } from "../user-access-editor";

export default async function ConsoleUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createClient();

  const { data: currentUserResult } = await supabase.auth.getUser();
  const currentUserId = currentUserResult.user?.id ?? null;
  const { data: currentProfile } = currentUserId
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUserId)
        .maybeSingle()
    : { data: null };
  const adminRole = isAdminRole(currentProfile?.role)
    ? currentProfile.role
    : null;

  const [
    { data: profile, error: profileError },
    { data: accessRows, error: accessError },
    { data: subjects, error: subjectsError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, role, created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_subject_access")
      .select(
        "user_id, subject:subjects(id, name, exam_board:exam_boards(name, question_bank))",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .returns<UserAccessRow[]>(),
    supabase
      .from("subjects")
      .select("id, name, exam_board:exam_boards(name, question_bank)")
      .order("name", { ascending: true })
      .returns<SubjectWithBoard[]>(),
  ]);

  const loadError =
    profileError || accessError || subjectsError
      ? "Failed to load user details. Please try again later."
      : null;

  const normalizedSubjects = (subjects ?? []).map((subject) => ({
    ...subject,
    exam_board: firstOrNull(subject.exam_board),
  }));

  const checkpointSubjects = normalizedSubjects.filter(
    (subject) => subject.exam_board?.question_bank === QUESTION_BANK.CHECKPOINT,
  );
  const questionbankSubjects = normalizedSubjects.filter(
    (subject) =>
      subject.exam_board?.question_bank === QUESTION_BANK.QUESTIONBANK,
  );
  const examPaperSubjects = normalizedSubjects.filter(
    (subject) => subject.exam_board?.question_bank === QUESTION_BANK.EXAM_PAPER,
  );
  const allowedSubjectIds = new Set(
    normalizedSubjects.map((subject) => subject.id),
  );

  const normalizedAccessRows = (accessRows ?? []).map((row) => {
    const subject = firstOrNull(row.subject);
    return {
      user_id: row.user_id,
      subject: subject
        ? {
            ...subject,
            exam_board: firstOrNull(subject.exam_board),
          }
        : null,
    };
  });

  const accessGrants = normalizedAccessRows
    .filter(
      (
        row,
      ): row is {
        user_id: string;
        subject: SubjectWithBoard;
      } => !!row.subject && allowedSubjectIds.has(row.subject.id),
    )
    .map((row) => row.subject.id);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          User Access Management
        </h1>
        <p className="text-sm text-slate-500">
          Edit subjects and credentials for a single user.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {profile ? (
        <UserAccessEditor
          user={profile}
          checkpointSubjects={checkpointSubjects}
          questionbankSubjects={questionbankSubjects}
          examPaperSubjects={examPaperSubjects}
          accessGrants={accessGrants}
          adminRole={adminRole}
          currentUserId={currentUserId}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          User not found.
        </div>
      )}
    </div>
  );
}
