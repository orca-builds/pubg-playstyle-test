import { orderedQuestions } from "@/data/questionOrder";
import type { Question } from "@/types/test";

export type ChoiceDisplayOrder = Readonly<Record<string, readonly [string, string]>>;

// Shuffle question positions, then reverse exactly half of the choice pairs.
export function createChoiceDisplayOrder(random = Math.random): ChoiceDisplayOrder {
  const positions = orderedQuestions.map((_, index) => index);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const reversed = new Set(positions.slice(0, positions.length / 2));
  return Object.fromEntries(orderedQuestions.map((question, index) => {
    const [first, second] = question.choices;
    return [question.id, reversed.has(index) ? [second.id, first.id] : [first.id, second.id]];
  }));
}

export function isChoiceDisplayOrder(value: unknown): value is ChoiceDisplayOrder {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== orderedQuestions.length) return false;
  const record = value as Record<string, unknown>;
  return orderedQuestions.every(question => {
    const pair = record[question.id];
    return Array.isArray(pair) && pair.length === 2 && pair[0] !== pair[1] &&
      pair.every(id => question.choices.some(choice => choice.id === id));
  });
}

export function getDisplayedChoices(question: Question, order?: ChoiceDisplayOrder) {
  // Attempts created before randomization retain their original display order.
  const pair = order?.[question.id];
  return pair ? pair.map(id => question.choices.find(choice => choice.id === id)!) : question.choices;
}
