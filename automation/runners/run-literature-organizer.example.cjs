#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const workflowConfig = process.env.LITERATURE_WORKFLOW_CONFIG
  || path.join(root, 'skills', 'ima-skill', 'harness', 'workflow_config.json');
const logDir = process.env.LITERATURE_AUTOMATION_LOG_DIR
  || path.join(root, '.workflow-state', 'automation-logs');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function runNodeScript(rel, args = []) {
  const script = path.join(root, rel);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LITERATURE_WORKFLOW_CONFIG: workflowConfig },
  });
  return {
    command: `node ${rel} ${args.join(' ')}`.trim(),
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function main() {
  ensureDir(logDir);

  const startedAt = new Date().toISOString();
  const safeRunId = timestamp();
  const logPath = path.join(logDir, `literature-organizer-example-${safeRunId}.log`);
  const recordsPath = path.join(logDir, `literature-organizer-example-${safeRunId}.records.json`);

  const record = {
    example: true,
    started_at: startedAt,
    root,
    workflow_config: workflowConfig,
    note: '这是示例 runner。复制为正式 runner 并补齐真实扫描、归档、IMA 和 Zotero 写入逻辑后再用于自动化。',
    checks: [],
  };

  record.checks.push({
    name: 'workflow_config_exists',
    passed: fs.existsSync(workflowConfig),
    detail: workflowConfig,
  });

  record.checks.push(runNodeScript('scripts/doctor.cjs'));

  fs.writeFileSync(logPath, [
    'literature-organizer example runner',
    `started_at=${startedAt}`,
    `root=${root}`,
    `workflow_config=${workflowConfig}`,
    'status=example_only',
    '复制本文件为正式 runner 后，再添加真实文献扫描、归档、IMA 上传和 Zotero 写入逻辑。',
    '',
  ].join('\n'), 'utf8');

  fs.writeFileSync(recordsPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    example: true,
    log_path: logPath,
    records_path: recordsPath,
  }, null, 2));
}

main();
