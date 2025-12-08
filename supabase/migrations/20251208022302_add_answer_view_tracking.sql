-- Track answer views per user/question

-- Function to record an answer view for the current user
create or replace function public.track_answer_view(q_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_questions (user_id, question_id, answer_viewed_at, answer_view_count)
  values (auth.uid(), q_id, now(), 1)
  on conflict (user_id, question_id)
  do update set
    answer_viewed_at = now(),
    answer_view_count = coalesce(public.user_questions.answer_view_count, 0) + 1;
end;
$$;

revoke all on function public.track_answer_view(bigint) from public;
grant execute on function public.track_answer_view(bigint) to authenticated;
