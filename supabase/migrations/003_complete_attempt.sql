-- Apply after 002. All app answer and completion writes lock the same parent row.
begin;
create function public.complete_attempt(
  p_attempt_id uuid, p_verified_hash text, p_test_version text, p_question_order_key text,
  p_answers jsonb, p_result jsonb, p_answer_change_count integer, p_back_count integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  attempt public.test_attempts%rowtype;
  current_answers jsonb;
  expected_answers jsonb;
  finished_at timestamptz;
  elapsed numeric;
  outcome text := 'already_completed';
begin
  select * into attempt from public.test_attempts where id = p_attempt_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if attempt.write_token_hash is distinct from p_verified_hash then
    return jsonb_build_object('outcome', 'forbidden');
  end if;
  if attempt.test_version is distinct from p_test_version or
     attempt.question_order_key is distinct from p_question_order_key then
    return jsonb_build_object('outcome', 'version_mismatch');
  end if;

  -- Node validates every question/choice and computes p_result from this exact snapshot.
  select coalesce(jsonb_agg(jsonb_build_object('question_id', question_id, 'answer_id', answer_id)
    order by question_id), '[]'::jsonb) into current_answers
    from public.answers where attempt_id = p_attempt_id;
  select jsonb_agg(value order by value->>'question_id') into expected_answers
    from jsonb_array_elements(p_answers);
  if current_answers is distinct from expected_answers or
     jsonb_array_length(current_answers) <> cardinality(string_to_array(p_question_order_key, ',')) then
    return jsonb_build_object('outcome', 'answers_changed');
  end if;

  if not attempt.is_completed then
    finished_at := clock_timestamp();
    elapsed := round(extract(epoch from (finished_at - attempt.started_at))::numeric, 3);
    if elapsed < 0 or elapsed > 86400 then return jsonb_build_object('outcome', 'expired'); end if;
    if p_answer_change_count is null or p_answer_change_count < 0 or p_back_count is null or p_back_count < 0 then
      raise exception 'Invalid completion metrics';
    end if;
    update public.test_attempts set
      is_completed = true, completed_at = finished_at, duration_seconds = elapsed,
      last_question_index = jsonb_array_length(current_answers),
      main_type = p_result->>'main_type',
      combat_score = (p_result->>'combat_score')::integer,
      position_score = (p_result->>'position_score')::integer,
      frontline_score = (p_result->>'frontline_score')::integer,
      support_score = (p_result->>'support_score')::integer,
      pressure_score = (p_result->>'pressure_score')::integer,
      design_score = (p_result->>'design_score')::integer,
      risk_score = (p_result->>'risk_score')::integer,
      safe_score = (p_result->>'safe_score')::integer,
      main_body_score = (p_result->>'main_body_score')::integer,
      flank_score = (p_result->>'flank_score')::integer,
      hotdrop_score = (p_result->>'hotdrop_score')::integer,
      tail_score = (p_result->>'tail_score')::integer,
      full_loot_score = (p_result->>'full_loot_score')::integer,
      fast_loot_score = (p_result->>'fast_loot_score')::integer,
      center_score = (p_result->>'center_score')::integer,
      edge_score = (p_result->>'edge_score')::integer,
      standard_gear_score = (p_result->>'standard_gear_score')::integer,
      special_gear_score = (p_result->>'special_gear_score')::integer,
      top_sub_tag_1 = p_result->>'top_sub_tag_1', top_sub_tag_2 = p_result->>'top_sub_tag_2',
      answer_change_count = p_answer_change_count, back_count = p_back_count
      where id = p_attempt_id returning * into attempt;
    outcome := 'completed';
  end if;
  -- A retry never updates timestamps, counters or the result row.
  return jsonb_build_object('outcome', outcome,
    'started_at', attempt.started_at, 'completed_at', attempt.completed_at,
    'duration_seconds', attempt.duration_seconds,
    'answer_change_count', attempt.answer_change_count, 'back_count', attempt.back_count);
end;
$$;
revoke all on function public.complete_attempt(uuid, text, text, text, jsonb, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.complete_attempt(uuid, text, text, text, jsonb, jsonb, integer, integer)
  to service_role;
commit;
