import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./helpers/analyticsHarness.mjs";

// Execute the actual page, preview and content together with controlled hook state
// and browser APIs. This catches a missing onShare prop as well as stale UI copy.
for (const outcome of ["shared", "copied", "cancelled", "error"]) {
  test(`result page button runs browser sharing and re-enables after ${outcome}`, async () => {
    const values = [], refs = [];
    let stateIndex = 0, refIndex = 0, snapshot, resolve, reject, calls = 0, payload;
    const invoke = data => {
      calls++;
      payload = data;
      return new Promise((yes, no) => { resolve = yes; reject = no; });
    };
    const h = createHarness({
      navigator: outcome === "copied" ? { clipboard: { writeText: invoke } } : { share: invoke },
      mocks: {
        react: {
          useEffect(effect) { effect(); },
          useSyncExternalStore() { return snapshot; },
          useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
          useState(initial) {
            const i = stateIndex++;
            if (!(i in values)) values[i] = initial;
            return [values[i], value => { values[i] = value; }];
          },
        },
        "next/navigation": { useRouter: () => ({ push() { assert.fail("Sharing must not navigate"); } }) },
      },
    });
    const answers = h.load("src/data/questionOrder.ts").orderedQuestions.map(q => ({ questionId: q.id, choiceId: q.choices[0].id }));
    snapshot = { status: "ready", attemptId: "completed-attempt", result: h.load("src/lib/scoring.ts").calculateScore(answers) };
    const Page = h.load("src/app/result/page.tsx").default;
    function render() {
      stateIndex = 0;
      refIndex = 0;
      const page = Page();
      const preview = page.type(page.props);
      const content = preview.props.children.find(child => child.type === "div").props.children[1];
      assert.equal(typeof content.props.onShare, "function");
      const tree = content.type(content.props);
      const actions = tree.props.children.at(-1).props.children;
      assert.ok(!renderToStaticMarkup(tree).includes("공유 기능은 준비 중입니다."));
      return { share: actions[0], retry: actions[2], note: actions[1] };
    }
    let ui = render();
    assert.equal(ui.share.props.disabled, false);
    assert.equal(ui.retry.props.disabled, false);
    const pending = ui.share.props.onClick();
    await ui.share.props.onClick();
    assert.equal(calls, 1);
    ui = render();
    assert.equal(ui.share.props.disabled, true);
    assert.ok(JSON.stringify(payload).includes(snapshot.result.mainResult.name));
    if (outcome === "cancelled") reject(new DOMException("cancel", "AbortError"));
    else if (outcome === "error") reject(new Error("private-error"));
    else resolve();
    await pending;
    ui = render();
    assert.equal(ui.share.props.disabled, false);
    assert.equal(ui.retry.props.disabled, false);
    assert.equal(ui.note.props.children, outcome === "copied" ? "복사했어요" : outcome === "error" ? "공유하지 못했어요. 다시 시도해주세요." : "");
    await h.load("src/lib/analytics.ts").initializeAnalytics();
    assert.deepEqual(h.events.map(e => e.name), ["result_view", "share_click", ...(outcome === "shared" ? ["share_success"] : outcome === "copied" ? ["copy_link"] : [])]);
    for (const event of h.events) assert.equal(event.properties.test_version, "v2");
  });
}
