import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createHarness } from "./analyticsHarness.mjs";

const source = ts.createSourceFile("TestRunner.tsx",
  readFileSync(new URL("../../src/components/TestRunner.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["commit", "ensureFresh", "handleSelect", "persistAnswers", "handleNext"];
const declarations = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) declarations.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(declarations.length, names.length);
const code = ts.transpileModule(declarations.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS },
}).outputText;

export const token = "A".repeat(43);
export const tick = () => new Promise(resolve => setImmediate(resolve));
export function saved(init) {
  return Response.json({ saved: true, last_question_index: JSON.parse(init.body).question_index });
}

export function setup(options = {}) {
  const requests = [], calls = [];
  const h = createHarness({ ...options, fetch: async (url, init) => {
    requests.push({ url, init });
    if (options.fetch) return options.fetch(url, init);
    return saved(init);
  } });
  const progressLib = h.load("src/lib/testProgress.ts");
  const credentials = h.load("src/lib/attemptCredentials.ts");
  const sync = h.load("src/lib/syncDatabaseAnswers.ts");
  const tracking = h.load("src/lib/testAnalytics.ts");
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  const restored = progressLib.restoreAttempt(h.window.localStorage.getItem(progressLib.TEST_STORAGE_KEY));
  const progress = restored.kind === "in_progress" ? restored.progress : progressLib.createAttempt(randomUUID());
  if (restored.kind !== "in_progress") {
    progressLib.saveAttempt(h.window.localStorage, progress);
    h.window.localStorage.setItem(credentials.CREDENTIAL_STORAGE_KEY, JSON.stringify({
      attemptId: progress.attemptId, writeToken: token, startedAt: progress.startedAt,
    }));
  }
  const state = { progress, answerStatus: sync.hasUnsyncedAnswers(h.window.localStorage, progress) ? "pending" : "ready",
    error: "", route: "", navigating: false, completionPending: false };
  const mounted = { current: true }, activeAttempt = { current: progress.attemptId };
  const completionLock = { current: false }, completionDraft = { current: null };
  function render() {
    const dependencies = {
      ...progressLib, ...sync, ...tracking, ...credentials,
      progress: state.progress, answerStatus: state.answerStatus,
      completionPending: state.completionPending, completionDraft, completionLock, activeAttempt,
      setCompletionPending: value => { state.completionPending = value; },
      finishAttempt: value => { calls.push("calculate"); return progressLib.finishAttempt(value); },
      completeDatabaseAttempt: async (...args) => {
        calls.push("complete");
        return options.complete ? options.complete(...args) : undefined;
      },
      clearPendingCompletion() {}, mounted, startLock: { current: false },
      window: h.window, orderedQuestions: questions,
      setProgress: value => { state.progress = value; },
      setAnswerStatus: value => { state.answerStatus = value; },
      setError: value => { state.error = value; },
      setScreen() {}, setNeedsNewStart() {},
      setIsNavigating: value => { state.navigating = value; },
      startNew() { throw new Error("Unexpected start"); },
      prepareResultSnapshot: h.load("src/lib/resultSnapshot.ts").prepareResultSnapshot,
      router: { push: value => { state.route = value; } },
    };
    return new Function("d", `const { ${Object.keys(dependencies).join(",")} } = d; ${code}; return { ${names.join(",")} };`)(dependencies);
  }
  function back() {
    const previous = state.progress;
    const next = progressLib.moveQuestion(previous, -1);
    if (render().commit(next)) tracking.trackBack(previous, next.currentQuestionIndex);
  }
  async function settle() {
    await sync.syncDatabaseAnswers(state.progress).catch(() => {});
    await tick();
  }
  return { ...h, requests, calls, progressLib, credentials, sync, questions, state, render, back, settle,
    mounted, activeAttempt, completionDraft };
}
