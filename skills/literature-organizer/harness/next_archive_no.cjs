#!/usr/bin/env node
'use strict';

/**
 * 归档编号硬约束脚本 — next_archive_no.cjs
 *
 * 用法:
 *   node next_archive_no.cjs [--dir <归档目录>] [--check <候选编号>]
 *
 * 功能:
 *   1. 扫描归档目录下所有 PDF 文件，提取现有编号
 *   2. 计算下一个编号 = 现有最大编号 + 1
 *   3. 若传入 --check <候选编号>，验证该编号是否合法（= max+1 且不重复）
 *
 * 输出 (JSON):
 *   { ok: true, next_no: 243, max_no: 242, total_files: 243, existing_nos: [...] }
 *   { ok: false, error: "...", next_no: 243, checked_no: 250, reason: "..." }
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

// ─── 配置 ────────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, '..', '..', 'ima-skill', 'harness', 'workflow_config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function repoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function resolveConfiguredPath(rawPath, fallbackBase = repoRoot()) {
  if (!rawPath) return '';
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(fallbackBase, rawPath);
}

const archiveDir = process.argv.includes('--dir')
  ? parseArgs(process.argv).dir
  : resolveConfiguredPath(config.archive_numbering.archive_dir).replace(/\//g, '\\');

// ─── 主逻辑 ──────────────────────────────────────────────────────────────────

function extractNumber(fileName) {
  // 从文件名前缀提取数字: "239-xxx.pdf" → 239
  const match = fileName.match(/^(\d+)\s*-/);
  return match ? parseInt(match[1], 10) : null;
}

function scanArchive(dir) {
  if (!fs.existsSync(dir)) {
    return { files: [], nos: [], error: `归档目录不存在: ${dir}` };
  }

  const entries = fs.readdirSync(dir);
  const pdfFiles = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
  const nos = [];
  const files = [];

  for (const f of pdfFiles) {
    const num = extractNumber(f);
    if (num !== null) {
      nos.push(num);
      files.push({ file: f, no: num });
    }
  }

  return { files, nos, error: null };
}

function main() {
  const args = parseArgs(process.argv);
  const targetDir = args.dir || archiveDir;

  const scanResult = scanArchive(targetDir);

  if (scanResult.error) {
    const result = { ok: false, error: scanResult.error, archive_dir: targetDir };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const { nos, files } = scanResult;
  const maxNo = nos.length > 0 ? Math.max(...nos) : 0;
  const nextNo = maxNo + 1;

  // 检查编号重复
  const noCount = {};
  for (const n of nos) {
    noCount[n] = (noCount[n] || 0) + 1;
  }
  const duplicates = Object.entries(noCount).filter(([, count]) => count > 1);

  const result = {
    ok: true,
    next_no: nextNo,
    max_no: maxNo,
    total_files: files.length,
    archive_dir: targetDir,
    duplicates: duplicates.length > 0 ? duplicates.map(([n, c]) => ({ no: parseInt(n), count: c })) : [],
  };

  // 如果传入 --check，验证候选编号
  if (args.check) {
    const checkedNo = parseInt(args.check, 10);
    result.checked_no = checkedNo;

    if (isNaN(checkedNo)) {
      result.ok = false;
      result.error = `候选编号不是合法数字: ${args.check}`;
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    if (checkedNo !== nextNo) {
      result.ok = false;
      result.error = `候选编号 ${checkedNo} 不合法：应为 ${nextNo}（当前最大编号 ${maxNo} + 1）`;
      result.reason = '编号必须等于现有最大编号 + 1';
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    if (nos.includes(checkedNo)) {
      result.ok = false;
      result.error = `候选编号 ${checkedNo} 已存在`;
      result.reason = '编号必须唯一';
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    result.check_passed = true;
    result.message = `候选编号 ${checkedNo} 验证通过`;
  }

  // 如果存在重复编号，发出警告但不阻塞
  if (duplicates.length > 0) {
    result.warning = `归档目录中存在 ${duplicates.length} 组重复编号，建议清理`;
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main();
