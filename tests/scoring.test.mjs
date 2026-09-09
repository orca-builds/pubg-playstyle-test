import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

// 추가 라이브러리 없이 기존 TypeScript로 변환해 Node 내장 테스트에서 실행합니다.
const root = fileURLToPath(new URL("../", import.meta.url));
const modules = new Map();
function loadSource(relativePath) {
  if (modules.has(relativePath)) return modules.get(relativePath);
  const source = readFileSync(path.join(root, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (id) => {
    assert.ok(id.startsWith("@/"));
    return loadSource(`src/${id.slice(2)}.ts`);
  });
  modules.set(relativePath, exports);
  return exports;
}

const { calculateScore, calculateMainResult, calculateSubResult, ScoringError } = loadSource("src/lib/scoring.ts");
const { questionSet } = loadSource("src/data/questions.ts");
const { resultTypes } = loadSource("src/data/resultTypes.ts");
const { subTraitTags } = loadSource("src/data/subTraits.ts");

function answersWith(overrides = {}) {
  return questionSet.questions.map((question) => ({
    questionId: question.id,
    choiceId: question.choices[overrides[question.id] ?? 0].id,
  }));
}
const zeroSubScores = {
  mainBody: 0, flank: 0, hotdrop: 0, tail: 0, fullLoot: 0,
  fastLoot: 0, center: 0, edge: 0, standardGear: 0, specialGear: 0,
};
const mainScores = {
  combat: 4, position: 1, frontline: 3, support: 2,
  pressure: 2, design: 3, risk: 1, safe: 4,
};
const hasCode = (code) => (error) => error instanceof ScoringError && error.code === code;

test("24문항의 고정 내부 ID는 choice-1/choice-2이며 전체 48개가 고유함", () => {
  assert.equal(questionSet.questions.length, 24);
  const ids = [];
  for (const question of questionSet.questions) {
    assert.deepEqual(question.choices.map(choice => choice.id), [
      `${question.id}-choice-1`, `${question.id}-choice-2`,
    ]);
    ids.push(...question.choices.map(choice => choice.id));
  }
  assert.equal(new Set(ids).size, 48);
});

// ID 변경 전에 기존 데이터와 계산 함수로 확보한 전체 결과입니다.
const scoringBaseline = JSON.parse(readFileSync(new URL("./fixtures/scoring-before-choice-ids.json", import.meta.url), "utf8"));
for (const { name, choiceIndexes, expected } of scoringBaseline) {
  test(`${name}: ID 변경 전과 원점수·퍼센트·결과 유형·보조 성향 모두 동일`, () => {
    const answers = questionSet.questions.map((question, index) => ({
      questionId: question.id, choiceId: question.choices[choiceIndexes[index]].id,
    }));
    assert.deepEqual(calculateScore(answers), expected);
  });
}

test("legacy ID와 존재하지 않는 ID는 점수 계산에 사용하지 않음", () => {
  for (const choiceId of ["q01-a", "q01-b", "q01-choice-3"]) {
    const answers = answersWith();
    answers[0] = { questionId: "q01", choiceId };
    assert.throws(() => calculateScore(answers), hasCode("INVALID_CHOICE"));
  }
});

test("24개 답변의 원점수와 80/20 퍼센트", () => {
  const result = calculateScore(answersWith({ q05: 1 }));
  assert.equal(result.testVersion, "v1");
  assert.deepEqual(result.mainScores, {
    combat: 4, position: 1, frontline: 5, support: 0,
    pressure: 5, design: 0, risk: 5, safe: 0,
  });
  assert.equal(result.mainPercentages.combat, 80);
  assert.equal(result.mainPercentages.position, 20);
  assert.equal(result.mainPercentages.support, 0);
  assert.equal(result.mainPercentages.frontline, 100);
  assert.deepEqual(result.subScores, {
    mainBody: 2, flank: 0, hotdrop: 2, tail: 0, fullLoot: 2,
    fastLoot: 0, center: 1, edge: 0, standardGear: 1, specialGear: 0,
  });
  assert.equal(result.mainResult.name, "화끈한 돌격대장");
});

test("실제 질문 응답으로 16개 메인 결과 모두 정확히 판정", () => {
  const ids = new Set();
  for (const a of ["combat", "position"])
    for (const b of ["frontline", "support"])
      for (const c of ["pressure", "design"])
        for (const d of ["risk", "safe"]) {
          const expected = `${a}-${b}-${c}-${d}`;
          const overrides = {};
          const choices = [a === "combat", b === "frontline", c === "pressure", d === "risk"];
          for (let n = 1; n <= 20; n++) {
            overrides[`q${String(n).padStart(2, "0")}`] = choices[Math.floor((n - 1) / 5)] ? 0 : 1;
          }
          const result = calculateScore(answersWith(overrides));
          assert.deepEqual(result.mainResult, resultTypes[expected]);
          ids.add(result.mainResult.id);
        }
  assert.equal(ids.size, 16);
});

test("메인축 2:2와 0:0 동점은 임의 판정하지 않음", () => {
  assert.throws(() => calculateMainResult({ ...mainScores, combat: 2, position: 2 }), hasCode("MAIN_AXIS_TIE"));
  assert.throws(() => calculateMainResult({ ...mainScores, risk: 0, safe: 0 }), hasCode("MAIN_AXIS_TIE"));
});

test("누락과 빈 응답은 오류이며 누락 문항 ID를 제공", () => {
  assert.throws(() => calculateScore([]), hasCode("MISSING_ANSWERS"));
  assert.throws(() => calculateScore(answersWith().slice(0, -1)), (error) =>
    hasCode("MISSING_ANSWERS")(error) && error.message.includes("q24"));
});

test("동일하거나 서로 다른 선택지를 제출해도 질문 중복을 거부", () => {
  for (const choiceId of ["q01-choice-1", "q01-choice-2"]) {
    assert.throws(() => calculateScore([...answersWith(), { questionId: "q01", choiceId }]), hasCode("DUPLICATE_ANSWER"));
  }
});

test("없는 질문, 다른 질문의 선택지, 잘못된 입력 형태를 거부", () => {
  assert.throws(() => calculateScore([{ questionId: "q99", choiceId: "q99-choice-1" }]), hasCode("UNKNOWN_QUESTION"));
  assert.throws(() => calculateScore([{ questionId: "q01", choiceId: "q02-choice-1" }]), hasCode("INVALID_CHOICE"));
  for (const input of [null, {}, [null], [{}]]) {
    assert.throws(() => calculateScore(input), hasCode("INVALID_ANSWER"));
  }
});

test("강한 성향의 0.5 경계와 편향도 내림차순", () => {
  const result = calculateSubResult({ ...zeroSubScores, mainBody: 3, flank: 1, tail: 4 });
  assert.equal(result.subAxes.mainBodyFlank.bias, 0.5);
  assert.equal(result.subAxes.mainBodyFlank.strength, "strong");
  assert.equal(result.subAxes.mainBodyFlank.direction, "mainBody");
  assert.deepEqual(result.displaySubTags, ["꼬리형", "본대형"]);
});

test("0.25 이상 0.5 미만은 약한 방향을 보존하되 표시 후보에서 제외", () => {
  const result = calculateSubResult({ ...zeroSubScores, mainBody: 3, flank: 5, hotdrop: 2, tail: 1 });
  assert.equal(result.subAxes.mainBodyFlank.bias, 0.25);
  assert.equal(result.subAxes.mainBodyFlank.strength, "weak");
  assert.equal(result.subAxes.mainBodyFlank.direction, "flank");
  assert.equal(result.subAxes.hotdropTail.strength, "weak");
  assert.deepEqual(result.displaySubTags, ["올라운더"]);
});

test("0.25 미만은 점수 차이가 있어도 중립, 0:0 편향도는 0", () => {
  const result = calculateSubResult({ ...zeroSubScores, mainBody: 5, flank: 4 });
  assert.equal(result.subAxes.mainBodyFlank.bias, 1 / 9);
  assert.equal(result.subAxes.mainBodyFlank.direction, "neutral");
  assert.equal(result.subAxes.mainBodyFlank.label, "유동형");
  assert.equal(result.subAxes.hotdropTail.bias, 0);
  assert.equal(result.subAxes.hotdropTail.direction, "neutral");
  assert.deepEqual(result.displaySubTags, ["올라운더"]);
});

test("강한 후보 5개 동률은 고정된 축 순서로 2개 선택", () => {
  assert.deepEqual(calculateScore(answersWith()).displaySubTags, ["본대형", "대꼴형"]);
  const result = calculateSubResult({ ...zeroSubScores, fullLoot: 2, center: 1, specialGear: 1 });
  assert.deepEqual(result.displaySubTags, ["풀세팅형", "중앙 선점형"]);
});

test("실제 응답에서 강한 후보 1개이면 해당 태그와 올라운더", () => {
  const result = calculateScore(answersWith({ q13: 1, q15: 1, q23: 1, q24: 1 }));
  assert.deepEqual(result.displaySubTags, ["중앙 선점형", "올라운더"]);
});

test("강한 후보가 전혀 없으면 올라운더만 표시", () => {
  assert.deepEqual(calculateSubResult(zeroSubScores).displaySubTags, ["올라운더"]);
});

test("음수, NaN, 무한대, 소수, 안전 범위 초과 점수를 거부", () => {
  for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => calculateMainResult({ ...mainScores, combat: value }), hasCode("INVALID_SCORE"));
    assert.throws(() => calculateSubResult({ ...zeroSubScores, flank: value }), hasCode("INVALID_SCORE"));
  }
});

test("응답 순서와 반복 호출에 무관하며 입력과 원본 데이터를 변경하지 않음", () => {
  const answers = answersWith({ q01: 1, q11: 1 });
  const snapshot = JSON.stringify({ answers, questionSet, resultTypes, subTraitTags });
  const first = calculateScore(answers);
  assert.deepEqual(calculateScore([...answers].reverse()), first);
  assert.deepEqual(calculateScore(answers), first);
  first.mainResult.mainTraits.combatPosition = "position";
  first.mainScores.combat = 999;
  first.subScores.mainBody = 999;
  first.displaySubTags.push("변경");
  assert.equal(JSON.stringify({ answers, questionSet, resultTypes, subTraitTags }), snapshot);
  assert.notEqual(calculateScore(answers).mainScores.combat, 999);
});
