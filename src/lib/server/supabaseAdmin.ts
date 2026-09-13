import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/server/supabaseEnv";
import type { toResultColumns } from "@/lib/completionResult";
import type {
  AnswerRow, AnswerUpsert, TestAttemptInsert, TestAttemptRow, TestAttemptUpdate,
} from "@/types/database";

// Minimal SDK schema adapter; row definitions remain in types/database.ts.
type Database = {
  public: {
    Tables: {
      test_attempts: {
        Row: TestAttemptRow;
        Insert: TestAttemptInsert;
        Update: TestAttemptUpdate;
        Relationships: [];
      };
      answers: {
        Row: AnswerRow;
        Insert: AnswerUpsert;
        Update: Partial<Pick<AnswerUpsert, "answer_id" | "answered_at">>;
        Relationships: [{
          foreignKeyName: "answers_attempt_id_fkey";
          columns: ["attempt_id"];
          isOneToOne: false;
          referencedRelation: "test_attempts";
          referencedColumns: ["id"];
        }];
      };
    };
    Views: Record<string, never>;
    Functions: {
      complete_attempt: {
        Args: {
          p_attempt_id: string; p_verified_hash: string; p_test_version: string; p_question_order_key: string;
          p_answers: { question_id: string; answer_id: string }[];
          p_result: ReturnType<typeof toResultColumns>; p_answer_change_count: number; p_back_count: number;
        };
        Returns: { outcome: string; started_at?: string; completed_at?: string;
          duration_seconds?: number; answer_change_count?: number; back_count?: number };
      };
      save_attempt_answer: {
        Args: {
          p_attempt_id: string; p_verified_hash: string; p_test_version: string;
          p_question_order_key: string; p_question_id: string; p_answer_id: string;
          p_question_index: number;
        };
        Returns: { outcome: string; last_question_index?: number };
      };
    };
  };
};

/** Privileged server client. Call only after API authorization; never return it to a browser. */
export function createSupabaseAdmin() {
  const { url, key } = getSupabaseEnv();
  try {
    return createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  } catch {
    // SDK initialization errors must not expose configuration or credentials.
    throw new Error("Unable to initialize the server database client");
  }
}
