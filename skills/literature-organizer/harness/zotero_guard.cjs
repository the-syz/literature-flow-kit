#!/usr/bin/env node
'use strict';

/**
 * Zotero 写入前防乱码硬约束脚本 — zotero_guard.cjs
 *
 * 用法:
 *   node zotero_guard.cjs --title "<标题>" --tags "<标签1,标签2>" --extra "<extra字段内容>"
 *
 * 功能:
 *   在调用 zotero_web_create_or_update_index_item 之前，对待写入的
 *   title、tags、extra 三个字段做乱码检查和格式校验。
 *
 *   Z1: 标题乱码检查（无 ? / \ufffd / 全 ? ）
 *   Z2: 标题非空检查
 *   Z3: 标签乱码检查（每个标签无 ? / \ufffd）
 *   Z4: 标签非空检查（至少 1 个标签）
 *   Z5: extra 字段格式检查（必须包含 SHA256、Local-Path、Managed-By）
 *   Z6: extra 字段乱码检查
 *   Z7: SHA256 格式检查（64 位十六进制）
 *   Z8: Local-Path 路径检查（无乱码、无 ? 字符）
 *
 * 输出 (JSON):
 *   { all_passed: true, checks: {Z1..Z8}, summary: "8/8 checks passed" }
 *   { all_passed: false, checks: {...}, summary: "... failed" }
 */

const fs = require('node:fs');
const path = require('node:path');

// ─── 参数解析 ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      args[argv[i].replace(/^--/, '')] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function isGarbled(text) {
  if (!text) return false;
  if (/\?{2,}/.test(text)) return true;
  if (text.includes('\ufffd')) return true;
  if (/^\?+$/.test(text)) return true;
  return false;
}

function parseExtraField(extra, fieldName) {
  if (!extra) return null;
  const lines = extra.split('\n');
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.substring(0, idx).trim();
      const val = line.substring(idx + 1).trim();
      if (key.toLowerCase() === fieldName.toLowerCase()) {
        return val;
      }
    }
  }
  return null;
}

// ─── 校验项 ──────────────────────────────────────────────────────────────────

function checkZ1(title) {
  if (isGarbled(title)) {
    return { passed: false, reason: `标题乱码: "${title.substring(0, 50)}..."` };
  }
  return { passed: true };
}

function checkZ2(title) {
  if (!title || title.trim().length === 0) {
    return { passed: false, reason: '标题为空' };
  }
  return { passed: true, title_length: title.length };
}

function checkZ3(tags) {
  for (const tag of tags) {
    if (isGarbled(tag)) {
      return { passed: false, reason: `标签乱码: "${tag}"` };
    }
  }
  return { passed: true, tag_count: tags.length };
}

function checkZ4(tags) {
  if (tags.length === 0) {
    return { passed: false, reason: '标签数量为 0（至少需要 1 个标签）' };
  }
  return { passed: true, tag_count: tags.length };
}

function checkZ5(extra) {
  if (!extra) {
    return { passed: false, reason: 'extra 字段为空' };
  }

  const required = ['SHA256', 'Local-Path', 'Managed-By'];
  const missing = [];

  for (const field of required) {
    if (!parseExtraField(extra, field)) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return { passed: false, reason: `extra 字段缺少必需字段: ${missing.join(', ')}` };
  }

  return { passed: true, required_fields: required };
}

function checkZ6(extra) {
  if (!extra) return { passed: true };
  if (isGarbled(extra)) {
    return { passed: false, reason: 'extra 字段包含乱码字符' };
  }
  return { passed: true };
}

function checkZ7(extra) {
  const sha256 = parseExtraField(extra, 'SHA256');
  if (!sha256) {
    return { passed: false, reason: 'extra 字段缺少 SHA256' };
  }

  // SHA256 应为 64 位十六进制
  if (!/^[0-9a-fA-F]{64}$/.test(sha256)) {
    return { passed: false, reason: `SHA256 格式错误: 应为 64 位十六进制，实际长度 ${sha256.length}` };
  }

  return { passed: true, sha256_prefix: sha256.substring(0, 16) + '...' };
}

function checkZ8(extra) {
  const localPath = parseExtraField(extra, 'Local-Path');
  if (!localPath) {
    return { passed: false, reason: 'extra 字段缺少 Local-Path' };
  }

  if (isGarbled(localPath)) {
    return { passed: false, reason: `Local-Path 路径乱码: "${localPath}"` };
  }

  // 路径中不应包含 ? 字符（Windows 路径）
  if (localPath.includes('?')) {
    return { passed: false, reason: `Local-Path 包含非法字符 ?: "${localPath}"` };
  }

  return { passed: true, path: localPath };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (!args.title) {
    console.log(JSON.stringify({ all_passed: false, error: '缺少必需参数: --title <标题>' }, null, 2));
    process.exit(1);
  }
  if (!args.tags && !args.extra) {
    console.log(JSON.stringify({ all_passed: false, error: '至少需要 --tags 或 --extra 参数' }, null, 2));
    process.exit(1);
  }

  const title = args.title;
  const tags = args.tags ? args.tags.split(/[,，]/).map((t) => t.trim()).filter((t) => t.length > 0) : [];
  const extra = args.extra || '';

  const checks = {};
  let passedCount = 0;
  let failedCount = 0;

  const checkList = [
    ['Z1', () => checkZ1(title)],
    ['Z2', () => checkZ2(title)],
    ['Z3', () => checkZ3(tags)],
    ['Z4', () => checkZ4(tags)],
    ['Z5', () => checkZ5(extra)],
    ['Z6', () => checkZ6(extra)],
    ['Z7', () => checkZ7(extra)],
    ['Z8', () => checkZ8(extra)],
  ];

  for (const [name, checkFn] of checkList) {
    try {
      const result = checkFn();
      checks[name] = result;
      if (result.passed) passedCount++;
      else failedCount++;
    } catch (err) {
      checks[name] = { passed: false, reason: err.message };
      failedCount++;
    }
  }

  const allPassed = failedCount === 0;
  const summary = `${passedCount}/8 checks passed${failedCount > 0 ? `, ${failedCount} failed` : ''}`;

  const result = {
    all_passed: allPassed,
    checks,
    passed_count: passedCount,
    failed_count: failedCount,
    summary,
    checked_at: new Date().toISOString(),
    title_preview: title.substring(0, 60),
    tag_count: tags.length,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(allPassed ? 0 : 1);
}

main();
