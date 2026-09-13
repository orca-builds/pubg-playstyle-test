import type { MainScores, ScoringResult, SubScores } from "@/lib/scoring";
import type { VisitorContext } from "@/lib/visitorContext";
import type { TestProgress } from "@/types/testProgress";

// PostgreSQL UUID/timestamptz arrive as strings. Validate untrusted input on the server.
type AttemptContext = Omit<VisitorContext, "device_type"> & {
  id: TestProgress["attemptId"];
  test_version: TestProgress["testVersion"];
  question_order_key: TestProgress["questionOrderKey"];
  started_at: TestProgress["startedAt"];
};

type ResultColumns = {
  main_type: ScoringResult["mainResult"]["id"] | null;
  combat_score: MainScores["combat"] | null;
  position_score: MainScores["position"] | null;
  frontline_score: MainScores["frontline"] | null;
  support_score: MainScores["support"] | null;
  pressure_score: MainScores["pressure"] | null;
  design_score: MainScores["design"] | null;
  risk_score: MainScores["risk"] | null;
  safe_score: MainScores["safe"] | null;
  main_body_score: SubScores["mainBody"] | null;
  flank_score: SubScores["flank"] | null;
  hotdrop_score: SubScores["hotdrop"] | null;
  tail_score: SubScores["tail"] | null;
  full_loot_score: SubScores["fullLoot"] | null;
  fast_loot_score: SubScores["fastLoot"] | null;
  center_score: SubScores["center"] | null;
  edge_score: SubScores["edge"] | null;
  standard_gear_score: SubScores["standardGear"] | null;
  special_gear_score: SubScores["specialGear"] | null;
  top_sub_tag_1: ScoringResult["displaySubTags"][number] | null;
  top_sub_tag_2: ScoringResult["displaySubTags"][number] | null;
};

export type TestAttemptRow = AttemptContext & ResultColumns & {
  // Server-only SHA-256 hex digest. Never serialize this row directly to the browser.
  write_token_hash: string;
  completed_at: string | null;
  is_completed: boolean;
  is_retry: boolean;
  duration_seconds: number | null;
  // Highest successfully saved 1-based question number; 0 means none.
  last_question_index: number;
  answer_change_count: number;
  back_count: number;
  created_at: string;
  updated_at: string;
};

// Required context has no SQL defaults. Other insert fields have defaults or allow NULL.
export type TestAttemptInsert = AttemptContext & Pick<TestAttemptRow, "write_token_hash"> &
  Partial<Omit<TestAttemptRow, keyof AttemptContext | "created_at" | "updated_at">>;

// Identity, token hash, initial attribution, version/order, start time and retry status are immutable in the API.
export type TestAttemptUpdate = Partial<
  Omit<TestAttemptRow, keyof AttemptContext | "write_token_hash" | "is_retry" | "created_at" | "updated_at">
>;

export type AnswerRow = {
  attempt_id: TestAttemptRow["id"];
  question_id: string;
  answer_id: string;
  answered_at: string;
  created_at: string;
  updated_at: string;
};

// Upsert on (attempt_id, question_id). DB manages audit timestamps.
export type AnswerUpsert = Omit<AnswerRow, "created_at" | "updated_at">;
