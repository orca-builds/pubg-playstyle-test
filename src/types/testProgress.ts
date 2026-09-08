import type { TestAnswer } from "@/lib/scoring";

type ProgressBase = {
  readonly testVersion: string;
  readonly questionOrderKey: string;
  readonly currentQuestionIndex: number;
  readonly answers: readonly TestAnswer[];
  readonly startedAt: string;
  readonly attemptId: string;
};

export type InProgressAttempt = ProgressBase & {
  readonly status: "in_progress";
};

export type CompletedAttempt = ProgressBase & {
  readonly status: "completed";
  readonly completedAt: string;
};

export type TestProgress = InProgressAttempt | CompletedAttempt;
