#!/usr/bin/env node
'use strict';

/**
 * 标签与摘要预检硬约束脚本 — content_check.cjs
 *
 * 用法:
 *   node content_check.cjs --title "<标题>" --tags "<标签1,标签2,标签3>" --abstract "<摘要>" [--pdf "<PDF路径>"]
 *
 * 功能:
 *   C1: 标签数量检查（3-8 个）
 *   C2: 标签乱码检查（无 ? / \ufffd）
 *   C3: 标签非标题拆词检查（不能所有标签都是标题子串）
 *   C4: 摘要长度检查（200-300 字中文，最低 50 字）
 *   C5: 摘要乱码检查
 *   C6: 摘要非标题改写检查（摘要不能是标题翻译/复制）
 *   C7: 标签非空检查（每个标签长度 ≥ 2）
 *   C8: 摘要非空检查
 *
 * 输出 (JSON):
 *   { all_passed: true, checks: {C1..C8}, summary: "8/8 checks passed" }
 *   { all_passed: false, checks: {...}, summary: "6/8 checks passed, 2 failed" }
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

// 检查字符串是否全为 ASCII（英文标签拆词的典型特征）
function isAllAscii(text) {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) return false;
  }
  return true;
}

// 计算中文字符数
function countChinese(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) count++;
    if (code >= 0x3400 && code <= 0x4dbf) count++;
  }
  return count;
}

// ─── 校验项 ──────────────────────────────────────────────────────────────────

function checkC1(tags) {
  if (tags.length < 3) {
    return { passed: false, reason: `标签数量 ${tags.length} 少于 3 个（要求 3-8 个）` };
  }
  if (tags.length > 8) {
    return { passed: false, reason: `标签数量 ${tags.length} 超过 8 个（要求 3-8 个）` };
  }
  return { passed: true, tag_count: tags.length };
}

function checkC2(tags) {
  for (const tag of tags) {
    if (isGarbled(tag)) {
      return { passed: false, reason: `标签乱码: "${tag}"` };
    }
  }
  return { passed: true };
}

function checkC3(tags, title) {
  // 检查是否所有标签都是标题的子串（标题拆词的特征）
  if (!title) return { passed: true };

  const titleLower = title.toLowerCase();
  const allFromTitle = tags.every((tag) => {
    const tagLower = tag.toLowerCase();
    return titleLower.includes(tagLower) || tagLower.length < 2;
  });

  if (allFromTitle && tags.length <= 5) {
    return { passed: false, reason: '所有标签均为标题子串或过短，疑似仅从标题拆词未阅读内容' };
  }

  // 检查是否所有标签都是纯英文（中文标签规则）
  const allEnglish = tags.every((tag) => isAllAscii(tag));
  if (allEnglish) {
    return { passed: false, reason: '所有标签均为纯英文，应使用中文标签（可保留英文专业术语）' };
  }

  return { passed: true };
}

function checkC4(abstract) {
  const len = abstract.length;
  const chineseCount = countChinese(abstract);

  if (len < 50) {
    return { passed: false, reason: `摘要长度 ${len} 字，少于最低要求 50 字` };
  }

  if (len < 200 || len > 300) {
    return {
      passed: false,
      reason: `摘要长度 ${len} 字，不在 200-300 字要求范围内（中文字符 ${chineseCount} 个）`,
    };
  }

  return { passed: true, length: len, chinese_chars: chineseCount };
}

function checkC5(abstract) {
  if (isGarbled(abstract)) {
    return { passed: false, reason: '摘要包含乱码字符' };
  }
  return { passed: true };
}

function checkC6(abstract, title) {
  if (!title || !abstract) return { passed: true };

  // 检查摘要是否为标题的翻译/复制
  const titleLower = title.toLowerCase().trim();
  const abstractLower = abstract.toLowerCase().trim();

  // 摘要前 50 字符与标题高度相似
  if (abstractLower.startsWith(titleLower.substring(0, Math.min(30, titleLower.length)))) {
    return { passed: false, reason: '摘要开头与标题高度相似，疑似标题改写' };
  }

  // 摘要等于标题
  if (abstractLower === titleLower) {
    return { passed: false, reason: '摘要等于标题' };
  }

  // 摘要过短且与标题有高重叠
  if (abstract.length < 100) {
    const titleWords = titleLower.split(/\s+/).filter((w) => w.length > 3);
    let overlap = 0;
    for (const word of titleWords) {
      if (abstractLower.includes(word)) overlap++;
    }
    if (titleWords.length > 0 && overlap / titleWords.length > 0.8) {
      return { passed: false, reason: '摘要与标题关键词重叠率过高，疑似标题改写' };
    }
  }

  return { passed: true };
}

function checkC7(tags) {
  for (const tag of tags) {
    if (tag.trim().length < 2) {
      return { passed: false, reason: `标签过短: "${tag}"（至少 2 个字符）` };
    }
  }
  return { passed: true };
}

function checkC8(abstract) {
  if (!abstract || abstract.trim().length === 0) {
    return { passed: false, reason: '摘要为空' };
  }
  return { passed: true };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (!args.title) {
    console.log(JSON.stringify({ all_passed: false, error: '缺少必需参数: --title <标题>' }, null, 2));
    process.exit(1);
  }
  if (!args.tags) {
    console.log(JSON.stringify({ all_passed: false, error: '缺少必需参数: --tags <逗号分隔标签>' }, null, 2));
    process.exit(1);
  }
  if (!args.abstract) {
    console.log(JSON.stringify({ all_passed: false, error: '缺少必需参数: --abstract <摘要>' }, null, 2));
    process.exit(1);
  }

  const title = args.title;
  const tags = args.tags.split(/[,，]/).map((t) => t.trim()).filter((t) => t.length > 0);
  const abstract = args.abstract;

  const checks = {};
  let passedCount = 0;
  let failedCount = 0;

  const checkList = [
    ['C1', () => checkC1(tags)],
    ['C2', () => checkC2(tags)],
    ['C3', () => checkC3(tags, title)],
    ['C4', () => checkC4(abstract)],
    ['C5', () => checkC5(abstract)],
    ['C6', () => checkC6(abstract, title)],
    ['C7', () => checkC7(tags)],
    ['C8', () => checkC8(abstract)],
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
    abstract_length: abstract.length,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(allPassed ? 0 : 1);
}

main();
