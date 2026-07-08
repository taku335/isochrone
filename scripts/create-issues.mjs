#!/usr/bin/env node
// docs/issues/*.md から GitHub ラベル・マイルストーン・Issue を一括作成する。
// 冪等: 既存の同名ラベル / マイルストーン / 同タイトル Issue はスキップするので、
// 途中で失敗しても再実行すれば続きから作成される。
//
// 前提: gh CLI が認証済み(gh auth status)であること。
// 使い方:
//   node scripts/create-issues.mjs            # 作成を実行
//   node scripts/create-issues.mjs --dry-run  # 実行内容の表示のみ
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');
const ISSUES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'issues');

const LABELS = [
  ['area:pipeline', '1d76db', 'GTFS 前処理パイプライン'],
  ['area:engine', '5319e7', 'RAPTOR 経路探索エンジン'],
  ['area:frontend', '0e8a16', 'Web フロントエンド'],
  ['area:infra', 'c5def5', 'CI/CD・開発環境'],
  ['type:feature', 'a2eeef', '機能追加'],
  ['type:chore', 'fef2c0', '整備・雑務'],
  ['type:test', 'd4c5f9', 'テスト・検証'],
  ['type:future', 'e4e669', '将来フェーズのプレースホルダ'],
];

const MILESTONES = [
  'M0 開発基盤',
  'M1 データ基盤',
  'M2 経路探索エンジン',
  'M3 フロントエンド',
  'M4 公開・運用',
];

function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', ...opts }).trim();
}

function parseIssueFile(path) {
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`frontmatter が見つかりません: ${path}`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    meta[key.trim()] = rest.join(':').trim().replace(/^"|"$/g, '');
  }
  return {
    title: meta.title,
    labels: (meta.labels ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    milestone: meta.milestone || null,
    blockedBy: (meta.blockedBy ?? '').split(',').map((s) => Number(s.trim())).filter(Boolean),
    body: m[2].trim(),
  };
}

const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
console.log(`リポジトリ: ${repo}${DRY_RUN ? ' (dry-run)' : ''}`);

// --- ラベル ---
const existingLabels = new Set(
  JSON.parse(gh(['label', 'list', '--limit', '100', '--json', 'name'])).map((l) => l.name),
);
for (const [name, color, description] of LABELS) {
  if (existingLabels.has(name)) {
    console.log(`label   skip   ${name}`);
  } else if (DRY_RUN) {
    console.log(`label   create ${name}`);
  } else {
    gh(['label', 'create', name, '--color', color, '--description', description]);
    console.log(`label   create ${name}`);
  }
}

// --- マイルストーン ---
const existingMilestones = new Map(
  JSON.parse(gh(['api', `repos/${repo}/milestones?state=all&per_page=100`])).map((m) => [m.title, m.number]),
);
for (const title of MILESTONES) {
  if (existingMilestones.has(title)) {
    console.log(`mstone  skip   ${title}`);
  } else if (DRY_RUN) {
    console.log(`mstone  create ${title}`);
  } else {
    gh(['api', '-X', 'POST', `repos/${repo}/milestones`, '-f', `title=${title}`]);
    console.log(`mstone  create ${title}`);
  }
}

// --- Issue ---
// ファイル番号順(= 依存のトポロジカル順)に作成し、作成時に返る実番号で
// blockedBy(論理キー = ファイル番号)を「Blocked by #実番号」に解決する。
const files = readdirSync(ISSUES_DIR).filter((f) => /^\d{2}-.*\.md$/.test(f)).sort();
const existingIssues = new Map(
  JSON.parse(gh(['issue', 'list', '--state', 'all', '--limit', '200', '--json', 'number,title']))
    .map((i) => [i.title, i.number]),
);
const numberByKey = new Map(); // 論理キー(1..30) → 実 Issue 番号
const tmp = mkdtempSync(join(tmpdir(), 'issues-'));
const created = [];

for (const file of files) {
  const key = Number(file.slice(0, 2));
  const issue = parseIssueFile(join(ISSUES_DIR, file));

  if (existingIssues.has(issue.title)) {
    const num = existingIssues.get(issue.title);
    numberByKey.set(key, num);
    console.log(`issue   skip   #${num} ${issue.title}`);
    continue;
  }

  let body = issue.body;
  if (issue.blockedBy.length > 0) {
    const refs = issue.blockedBy.map((dep) => {
      const num = numberByKey.get(dep);
      if (!num && !DRY_RUN) throw new Error(`依存 ${dep} が未解決です(${file})`);
      return num ? `#${num}` : `#{key:${dep}}`;
    });
    body = `Blocked by ${refs.join(', ')}\n\n${body}`;
  }

  if (DRY_RUN) {
    numberByKey.set(key, -key);
    console.log(`issue   create ${issue.title}`);
    console.log(`               labels=[${issue.labels}] milestone=${issue.milestone ?? '-'} blockedBy=[${issue.blockedBy}]`);
    continue;
  }

  const bodyFile = join(tmp, file);
  writeFileSync(bodyFile, body);
  const args = ['issue', 'create', '--title', issue.title, '--body-file', bodyFile];
  for (const label of issue.labels) args.push('--label', label);
  if (issue.milestone) args.push('--milestone', issue.milestone);
  const url = gh(args);
  const num = Number(url.match(/\/issues\/(\d+)$/)?.[1]);
  if (!num) throw new Error(`Issue 番号を取得できませんでした: ${url}`);
  numberByKey.set(key, num);
  created.push(url);
  console.log(`issue   create #${num} ${issue.title}`);
}

console.log(`\n完了: ${created.length} 件作成 / ${files.length - created.length} 件スキップ`);
for (const url of created) console.log(url);
