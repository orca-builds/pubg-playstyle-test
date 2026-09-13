import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const sql = readFileSync(new URL("../supabase/migrations/001_create_test_tables.sql", import.meta.url), "utf8")
  .replace(/--[^\n]*/g, "");

test("DB tables deny browser access and limit server grants", () => {
  for (const table of ["test_attempts", "answers"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /revoke all on table public\.test_attempts, public\.answers from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.test_attempts, public\.answers from service_role/i);
  assert.match(sql, /grant select, insert, update on table public\.test_attempts, public\.answers to service_role/i);
  assert.doesNotMatch(sql, /create policy|security definer|grant[^;]*\bto\s+(?:public|anon|authenticated)\b/i);
});

test("answers support one latest answer per question and cascading parent cleanup", () => {
  assert.match(sql, /primary key\s*\(attempt_id, question_id\)/i);
  assert.match(sql, /references public\.test_attempts\(id\) on delete cascade/i);
  assert.match(sql, /new\.updated_at := now\(\)/i);
  for (const table of ["test_attempts", "answers"]) {
    assert.match(sql, new RegExp(`before update on public\\.${table}`, "i"));
  }
});

test("v1 score bounds fit INTEGER and every scoring trait has a nullable nonnegative column", () => {
  const { questionSet } = createHarness().load("src/data/questions.ts");
  const maxima = {};
  for (const question of questionSet.questions) {
    const perQuestion = {};
    for (const choice of question.choices) {
      for (const group of ["main", "sub"]) {
        for (const [trait, delta] of Object.entries(choice.scoreDelta[group] ?? {})) {
          assert.ok(Number.isInteger(delta) && delta >= 0);
          perQuestion[trait] = Math.max(perQuestion[trait] ?? 0, delta);
        }
      }
    }
    for (const [trait, value] of Object.entries(perQuestion)) maxima[trait] = (maxima[trait] ?? 0) + value;
  }
  assert.equal(Object.keys(maxima).length, 18);
  for (const [trait, max] of Object.entries(maxima)) {
    assert.ok(max <= 2147483647);
    const column = `${trait.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_score`;
    assert.match(sql, new RegExp(`${column} integer check \\(\\s*${column} >= 0\\)`));
  }
  assert.deepEqual(maxima, {
    combat: 5, position: 5, frontline: 5, support: 5, pressure: 5, mainBody: 2,
    design: 5, flank: 2, hotdrop: 2, tail: 2, risk: 5, safe: 5,
    fullLoot: 2, fastLoot: 2, center: 1, edge: 1, standardGear: 1, specialGear: 2,
  });
});

test("migration requires a SHA-256 hash and has no raw write token column", () => {
  assert.match(sql, /write_token_hash text not null check \(write_token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
  assert.doesNotMatch(sql, /^\s*(?:write_token|raw_write_token|token)\s+(?:text|varchar|bytea)\b/im);
});

test("manual DB types match columns and restrict the token hash to required Row/Insert fields", () => {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFiles().find((file) => file.fileName.replaceAll("\\", "/").endsWith("/src/types/database.ts"));
  assert.ok(source);
  function getType(typeName) {
    const declaration = source.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === typeName);
    assert.ok(declaration, typeName);
    return checker.getTypeAtLocation(declaration);
  }
  for (const typeName of ["TestAttemptRow", "TestAttemptInsert", "TestAttemptUpdate", "AnswerRow", "AnswerUpsert"]) {
    const type = getType(typeName);
    const hash = checker.getPropertyOfType(type, "write_token_hash");
    if (["TestAttemptRow", "TestAttemptInsert"].includes(typeName)) {
      assert.ok(hash, `${typeName} must include the hash`);
      assert.equal(hash.flags & ts.SymbolFlags.Optional, 0, `${typeName} hash must be required`);
      assert.equal(checker.typeToString(checker.getTypeOfSymbolAtLocation(hash, source)), "string");
    } else {
      assert.equal(hash, undefined, `${typeName} must not accept hash changes`);
    }
    const tokenFields = checker.getPropertiesOfType(type).filter((property) => /token/i.test(property.name));
    assert.ok(tokenFields.every((property) => property.name === "write_token_hash"), "No raw token in DB types");
  }
  assert.equal(checker.getPropertyOfType(getType("AttemptContext"), "write_token_hash"), undefined);
  for (const [table, typeName] of [["test_attempts", "TestAttemptRow"], ["answers", "AnswerRow"]]) {
    const body = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`, "i"))[1];
    const columns = [...body.matchAll(/^  (\w+) (?:uuid|text|timestamptz|boolean|numeric|integer)\b/gm)].map((match) => match[1]);
    const declaration = source.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === typeName);
    const properties = checker.getPropertiesOfType(checker.getTypeAtLocation(declaration)).map((property) => property.name);
    assert.deepEqual(properties.sort(), columns.sort());
  }
});
