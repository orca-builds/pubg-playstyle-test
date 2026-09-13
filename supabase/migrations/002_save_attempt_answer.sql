-- Apply after 001. Browser roles cannot execute this function.
begin;

comment on column public.test_attempts.last_question_index is
  'Highest successfully saved 1-based question index; 0 means no saved answers. Never decreases through the answer API.';

create function public.save_attempt_answer(
  p_attempt_id uuid,
  p_verified_hash text,
  p_test_version text,
  p_question_order_key text,
  p_question_id text,
  p_answer_id text,
  p_question_index integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  attempt public.test_attempts%rowtype;
  highest_index integer;
begin
  -- All answer writers lock the same parent, including writes to different questions.
  select * into attempt from public.test_attempts where id = p_attempt_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if attempt.write_token_hash is distinct from p_verified_hash then
    return jsonb_build_object('outcome', 'forbidden');
  end if;
  if attempt.is_completed then return jsonb_build_object('outcome', 'completed'); end if;
  if attempt.test_version is distinct from p_test_version or
     attempt.question_order_key is distinct from p_question_order_key then
    return jsonb_build_object('outcome', 'version_mismatch');
  end if;
  -- Exact question/choice validation belongs to the authenticated server route.
  if p_question_index is null or p_question_index < 1 then
    raise exception 'Invalid question index';
  end if;

  insert into public.answers (attempt_id, question_id, answer_id, answered_at)
  values (p_attempt_id, p_question_id, p_answer_id, clock_timestamp())
  on conflict (attempt_id, question_id) do update
    set answer_id = excluded.answer_id, answered_at = excluded.answered_at;
  -- created_at is preserved; updated_at is managed by the existing trigger.
  update public.test_attempts
    set last_question_index = greatest(last_question_index, p_question_index)
    where id = p_attempt_id
    returning last_question_index into highest_index;
  return jsonb_build_object('outcome', 'saved', 'last_question_index', highest_index);
end;
$$;

revoke all on function public.save_attempt_answer(uuid, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.save_attempt_answer(uuid, text, text, text, text, text, integer)
  to service_role;
commit;
