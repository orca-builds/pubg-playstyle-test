import "server-only";

import { orderedQuestions } from "@/data/questionOrder";

export function isAttemptId(value: string): boolean {
  return value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseAnswerInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const fields = ["write_token", "question_id", "answer_id", "question_index"];
  if (Object.keys(input).length !== fields.length || !fields.every(field => Object.hasOwn(input, field)) ||
      typeof input.write_token !== "string" || typeof input.question_id !== "string" ||
      typeof input.answer_id !== "string" || typeof input.question_index !== "number" ||
      !Number.isInteger(input.question_index)) return null;
  const question = orderedQuestions[input.question_index - 1];
  if (!question || question.id !== input.question_id ||
      !question.choices.some(choice => choice.id === input.answer_id)) return null;
  return { writeToken: input.write_token, questionId: question.id,
    answerId: input.answer_id, questionIndex: input.question_index };
}
