#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function readText(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(readText(rel));
}

function hasPlaceholder(value) {
  if (typeof value === 'string') {
    return /REPLACE_|YOUR_|replace_with_|<repo>|C:\/path\/to/i.test(value);
  }
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (value && typeof value === 'object') return Object.values(value).some(hasPlaceholder);
  return false;
}

const checks = [];
const info = [];

function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
}

function note(name, passed, detail = '') {
  info.push({ name, passed, detail });
}

for (const rel of [
  'README.md',
  'AGENTS.md',
  'docs/setup.md',
  'docs/workflow.md',
  'skills/literature-organizer/SKILL.md',
  'skills/literature-organizer/harness/content_check.cjs',
  'skills/literature-organizer/harness/dedup_guard.cjs',
  'skills/literature-organizer/harness/next_archive_no.cjs',
  'skills/literature-organizer/harness/zotero_guard.cjs',
  'skills/ima-skill/SKILL.md',
  'skills/ima-skill/harness/preflight.cjs',
  'skills/ima-skill/harness/dedup_check.cjs',
  'skills/ima-skill/harness/upload_pdf.cjs',
  'skills/ima-skill/harness/verify_workflow.cjs',
  'skills/zotero/SKILL.md',
  'config/env.example',
  'config/workflow_config.example.json',
  'config/trae-mcp.example.json',
  'vendor/ima-skill/ima_api.cjs',
  'integrations/zotero-mcp/mcp/zotero_mcp_server.py',
]) {
  check(`存在:${rel}`, exists(rel), rel);
}

for (const rel of [
  'config/workflow_config.example.json',
  'config/trae-mcp.example.json',
  'examples/paper_record.example.json',
]) {
  try {
    readJson(rel);
    check(`JSON合法:${rel}`, true);
  } catch (err) {
    check(`JSON合法:${rel}`, false, err.message);
  }
}

try {
  const template = readJson('config/workflow_config.example.json');
  check('模板包含archive_numbering.archive_dir', Boolean(template.archive_numbering && template.archive_numbering.archive_dir));
  check('模板包含workflow_gates', Boolean(template.workflow_gates));
  note('模板仍包含占位符', hasPlaceholder(template), '这是预期状态；复制为本机配置后再替换。');
} catch (err) {
  check('读取workflow_config模板', false, err.message);
}

if (exists('skills/ima-skill/harness/workflow_config.json')) {
  try {
    const workflow = readJson('skills/ima-skill/harness/workflow_config.json');
    note('本机workflow_config已创建', true, hasPlaceholder(workflow) ? '仍有占位符，live运行前需要填写。' : '未检测到占位符。');
  } catch (err) {
    note('本机workflow_config已创建', false, `JSON解析失败: ${err.message}`);
  }
} else {
  note('本机workflow_config未创建', false, '需要时从 config/workflow_config.example.json 复制。');
}

try {
  const gitignore = readText('.gitignore');
  check('忽略本机workflow_config', gitignore.includes('skills/ima-skill/harness/workflow_config.json'));
  check('忽略.env', /^\s*\.env\s*$/m.test(gitignore));
  check('忽略PDF', /^\s*\*\.pdf\s*$/m.test(gitignore));
} catch (err) {
  check('读取.gitignore', false, err.message);
}

note('IMA凭证已设置', Boolean(process.env.IMA_OPENAPI_CLIENTID && process.env.IMA_OPENAPI_APIKEY), 'live IMA 调用需要 IMA_OPENAPI_CLIENTID 和 IMA_OPENAPI_APIKEY。');
note('Zotero凭证已设置', Boolean(process.env.ZOTERO_API_KEY && process.env.ZOTERO_USER_ID), 'Zotero Web API 写入需要 ZOTERO_API_KEY 和 ZOTERO_USER_ID。');

const failed = checks.filter((item) => !item.passed);
const result = {
  ok: failed.length === 0,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  info,
};

console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
