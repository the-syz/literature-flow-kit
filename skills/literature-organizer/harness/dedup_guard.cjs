#!/usr/bin/env node
'use strict';

/**
 * 去重硬约束脚本 — dedup_guard.cjs
 *
 * 核心原则：本地归档与 IMA 知识库一一对应，不可重复。
 *           Zotero 是独立索引层，可单独补全，但不触发 IMA 上传。
 *
 * 用法:
 *   node dedup_guard.cjs --file <待处理PDF路径> --title <论文标题> [--kb-name <知识库>] [--doi <DOI>]
 *
 * 校验项:
 *   D1 — 本地 SHA256 去重（阻塞型）：遍历归档目录所有 PDF，检查 SHA256 是否已存在
 *   D2 — IMA 去重（阻塞型）：读 IMA 笔记索引用标题匹配 + search_knowledge API 兜底
 *   D3 — Zotero 状态检查（信息型）：检查 Zotero 中是否有对应条目，只报告不阻塞
 *
 * D1/D2 失败 → 阻塞整个流程，文件已归档/已上传，不得重复操作
 * D3 失败 → 仅报告 Zotero 状态，可单独补全 Zotero，但绝不触发 IMA 上传
 *
 * 输出 (JSON):
 *   { all_passed: true, checks: {D1,D2,D3}, summary: "..." }
 *   D1/D2 失败时 all_passed=false，D3 不影响 all_passed
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// ─── 路径解析 ────────────────────────────────────────────────────────────────

const HARNESS_DIR = __dirname;
const CONFIG_PATH = path.join(HARNESS_DIR, '..', '..', 'ima-skill', 'harness', 'workflow_config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function repoRoot() {
  return path.resolve(HARNESS_DIR, '..', '..', '..');
}

function resolveConfiguredPath(rawPath, fallbackBase = repoRoot()) {
  if (!rawPath) return '';
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(fallbackBase, rawPath);
}

const ARCHIVE_DIR = resolveConfiguredPath(config.archive_numbering.archive_dir).replace(/\//g, '\\');
const GLOBAL_SKILL_DIR = resolveConfiguredPath(process.env.IMA_SKILL_DIR || config.global_ima_skill_dir);
const IMA_API = path.join(GLOBAL_SKILL_DIR, 'ima_api.cjs');

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

function computeSHA256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
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

function callImaApi(apiPath, body) {
  const bodyStr = JSON.stringify(body);
  try {
    const stdout = execFileSync('node', [IMA_API, apiPath, bodyStr, '{}'], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    let errMsg = err.message;
    try { const e = JSON.parse(stderr); errMsg = e.msg || errMsg; } catch {}
    return { code: -1, msg: errMsg, _error: true };
  }
}

// ─── D1: 本地 SHA256 去重（阻塞型）──────────────────────────────────────────

function checkD1(fileSha256, filePath) {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    return { passed: true, reason: '归档目录不存在，无本地文件可比较', scanned: 0 };
  }

  const entries = fs.readdirSync(ARCHIVE_DIR);
  const pdfFiles = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
  const fileName = path.basename(filePath);

  for (const pdf of pdfFiles) {
    if (pdf === fileName) continue; // 跳过自身
    const pdfPath = path.join(ARCHIVE_DIR, pdf);
    try {
      const sha = computeSHA256(pdfPath);
      if (sha.toLowerCase() === fileSha256.toLowerCase()) {
        return {
          passed: false,
          blocking: true,
          reason: `本地归档中已存在相同 SHA256 的文件: ${pdf}`,
          duplicate_file: pdf,
          duplicate_path: pdfPath,
          scanned: pdfFiles.length,
        };
      }
    } catch (err) {
      // 跳过无法读取的文件
    }
  }

  return { passed: true, blocking: false, scanned: pdfFiles.length, message: '本地无重复' };
}

// ─── D2: IMA 去重（阻塞型）— 标题匹配索引 + search_knowledge 兜底 ─────────────

function checkD2(title, kbName) {
  if (!title) {
    return { passed: true, blocking: false, skipped: true, reason: '未提供论文标题，跳过 IMA 去重' };
  }

  const kbId = config.knowledge_base_mapping[kbName];
  if (!kbId) {
    return { passed: true, blocking: false, skipped: true, reason: `知识库 "${kbName}" 未配置，跳过 IMA 去重` };
  }

  const NOTE_ID = config.ima_note_index.note_id;
  const results = { d2a_index: null, d2b_search: null };

  // ── D2a: 读 IMA 笔记索引，用标题匹配 ──────────────────────────────────────
  try {
    const noteResp = callImaApi('openapi/note/v1/get_doc_content', { note_id: NOTE_ID });
    if (noteResp.code === 0) {
      const content = (noteResp.data && (noteResp.data.content || noteResp.data.doc_content || noteResp.data.text)) || '';
      // 索引格式: "{编号}、论文名称：{标题}\n"
      // 用标题做子串匹配（标题可能包含特殊字符，子串匹配最可靠）
      const titleClean = title.trim();
      if (content.includes(titleClean)) {
        // 提取匹配到的编号
        const match = content.match(new RegExp(`(\\d+)、论文名称：${titleClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        results.d2a_index = {
          found: true,
          archive_no: match ? match[1] : null,
          message: `IMA 笔记索引中已包含此标题`,
        };
      } else {
        results.d2a_index = { found: false, message: 'IMA 笔记索引中未找到此标题' };
      }
    } else {
      results.d2a_index = { found: false, error: `读取笔记失败: ${noteResp.msg}`, message: '笔记索引不可读' };
    }
  } catch (err) {
    results.d2a_index = { found: false, error: err.message, message: '笔记索引检查异常' };
  }

  // ── D2b: 调 search_knowledge API，用标题搜知识库（兜底）────────────────────
  try {
    const searchResp = callImaApi('openapi/wiki/v1/search_knowledge', {
      query: title,
      cursor: '',
      knowledge_base_id: kbId,
    });

    if (searchResp.code === 0) {
      const infoList = (searchResp.data && searchResp.data.info_list) || [];
      // 检查搜索结果中是否有标题完全匹配的文件
      const titleLower = title.toLowerCase().trim();
      const matches = infoList.filter((item) => {
        const itemTitle = (item.title || '').toLowerCase().trim();
        // 标题可能含/不含 .pdf 后缀，去掉后缀比较
        const itemTitleNoExt = itemTitle.replace(/\.pdf$/, '');
        return itemTitle === titleLower || itemTitleNoExt === titleLower || itemTitle.includes(titleLower);
      });

      results.d2b_search = {
        found: matches.length > 0,
        match_count: matches.length,
        matches: matches.map((m) => ({ media_id: m.media_id, title: m.title })),
        message: matches.length > 0 ? `IMA 知识库中找到 ${matches.length} 个匹配文件` : 'IMA 知识库中未找到匹配文件',
      };
    } else {
      results.d2b_search = { found: false, error: `搜索失败: ${searchResp.msg}`, message: '知识库搜索不可用' };
    }
  } catch (err) {
    results.d2b_search = { found: false, error: err.message, message: '知识库搜索异常' };
  }

  // ── 综合判定 ──────────────────────────────────────────────────────────────
  const indexFound = results.d2a_index && results.d2a_index.found;
  const searchFound = results.d2b_search && results.d2b_search.found;

  if (indexFound || searchFound) {
    const reasons = [];
    if (indexFound) reasons.push(`笔记索引中已存在（编号: ${results.d2a_index.archive_no || '未知'}）`);
    if (searchFound) reasons.push(`知识库中已存在 ${results.d2b_search.match_count} 个匹配文件`);

    return {
      passed: false,
      blocking: true,
      reason: `IMA 中已存在此论文: ${reasons.join('; ')}`,
      d2a_index: results.d2a_index,
      d2b_search: results.d2b_search,
      kb_name: kbName,
    };
  }

  // 两者都没找到 — 但如果其中一个因错误跳过，报告数据不一致风险
  const indexError = results.d2a_index && results.d2a_index.error;
  const searchError = results.d2b_search && results.d2b_search.error;
  const warnings = [];
  if (indexError) warnings.push(`笔记索引检查异常: ${indexError}`);
  if (searchError) warnings.push(`知识库搜索异常: ${searchError}`);

  return {
    passed: true,
    blocking: false,
    d2a_index: results.d2a_index,
    d2b_search: results.d2b_search,
    kb_name: kbName,
    warnings: warnings.length > 0 ? warnings : null,
    message: 'IMA 中无重复',
  };
}

// ─── D3: Zotero 状态检查（信息型，不阻塞）────────────────────────────────────

function checkD3(fileSha256, doi) {
  let allItems;
  try {
    const apiKey = process.env.ZOTERO_API_KEY;
    const userId = process.env.ZOTERO_USER_ID;
    if (!apiKey || !userId) {
      return { passed: true, informational: true, skipped: true, reason: '缺少 Zotero 环境变量，跳过检查' };
    }

    // 分页遍历所有 journalArticle 条目
    let start = 0;
    let hasMore = true;
    allItems = [];

    while (hasMore) {
      const pagePath = `/users/${userId}/items?limit=50&start=${start}&itemType=journalArticle`;
      const stdout = execFileSync('node', ['-e', `
        const https = require('https');
        const options = {
          hostname: 'api.zotero.org',
          path: '${pagePath}',
          method: 'GET',
          headers: { 'Zotero-API-Key': '${apiKey}', 'Zotero-API-Version': '3' },
        };
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            process.stdout.write(JSON.stringify({ status: res.statusCode, total: res.headers['total-results'], body: data }));
          });
        });
        req.on('error', (e) => process.stdout.write(JSON.stringify({ status: 0, error: e.message })));
        req.end();
      `], { encoding: 'utf8', timeout: 30000 });

      const pageResult = JSON.parse(stdout);
      if (pageResult.status !== 200) {
        return { passed: true, informational: true, skipped: true, reason: `Zotero API 失败 (HTTP ${pageResult.status})` };
      }

      let pageItems;
      try { pageItems = JSON.parse(pageResult.body); } catch {
        return { passed: true, informational: true, skipped: true, reason: 'Zotero 响应解析失败' };
      }

      allItems = allItems.concat(pageItems);
      const total = parseInt(pageResult.total || '0', 10);
      hasMore = allItems.length < total && pageItems.length > 0;
      start += 50;
      if (start > 1000) break;
    }
  } catch (err) {
    return { passed: true, informational: true, skipped: true, reason: `Zotero API 调用失败: ${err.message}` };
  }

  // 检查 SHA256 是否已存在于 Zotero
  const shaMatches = allItems.filter((item) => {
    const extra = (item.data && item.data.extra) || '';
    const extraSha = parseExtraField(extra, 'SHA256');
    return extraSha && extraSha.toLowerCase() === fileSha256.toLowerCase();
  });

  // 检查 DOI 是否已存在于 Zotero
  let doiMatches = [];
  if (doi) {
    const normalizedDoi = doi.toLowerCase().trim().replace(/^https?:\/\/doi\.org\//, '');
    doiMatches = allItems.filter((item) => {
      const itemDoi = (item.data && item.data.DOI) || '';
      if (!itemDoi) return false;
      return itemDoi.toLowerCase().trim().replace(/^https?:\/\/doi\.org\//, '') === normalizedDoi;
    });
  }

  const allMatches = [...new Set([...shaMatches, ...doiMatches])];

  if (allMatches.length > 0) {
    // Zotero 中已有条目 — 信息性报告，不阻塞
    return {
      passed: true,
      informational: true,
      zotero_status: 'exists',
      message: `Zotero 中已有 ${allMatches.length} 条对应条目（可单独补全标签/摘要，但不要重新上传 IMA）`,
      existing_keys: allMatches.map((i) => i.key),
      existing_titles: allMatches.map((i) => (i.data && i.data.title) || ''),
      scanned: allItems.length,
    };
  }

  // Zotero 中没有对应条目 — 信息性报告，不阻塞，不触发上传
  return {
    passed: true,
    informational: true,
    zotero_status: 'missing',
    message: 'Zotero 中未找到对应条目（可单独创建 Zotero 索引，但不要重新上传 IMA）',
    scanned: allItems.length,
  };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (!args.file) {
    console.log(JSON.stringify({ all_passed: false, error: '缺少必需参数: --file <PDF路径>' }, null, 2));
    process.exit(1);
  }

  if (!fs.existsSync(args.file)) {
    console.log(JSON.stringify({ all_passed: false, error: `文件不存在: ${args.file}` }, null, 2));
    process.exit(1);
  }

  const filePath = args.file;
  const fileName = path.basename(filePath);
  const title = args.title || null;
  const kbName = args['kb-name'] || config.default_knowledge_base;
  const doi = args.doi || null;

  // 计算待处理文件的 SHA256
  let fileSha256;
  try {
    fileSha256 = computeSHA256(filePath);
  } catch (err) {
    console.log(JSON.stringify({ all_passed: false, error: `SHA256 计算失败: ${err.message}` }, null, 2));
    process.exit(1);
  }

  const checks = {};
  let blockingPassed = true; // D1/D2 是阻塞型
  let blockingCount = 0;
  let blockingFailed = 0;

  // D1: 本地 SHA256 去重（阻塞型）
  try {
    checks.D1 = checkD1(fileSha256, filePath);
    blockingCount++;
    if (!checks.D1.passed) {
      blockingFailed++;
      blockingPassed = false;
    }
  } catch (err) {
    checks.D1 = { passed: false, blocking: true, reason: err.message };
    blockingFailed++;
    blockingPassed = false;
  }

  // D2: IMA 去重（阻塞型）— 标题匹配索引 + search_knowledge 兜底
  try {
    checks.D2 = checkD2(title, kbName);
    blockingCount++;
    if (!checks.D2.passed && checks.D2.blocking) {
      blockingFailed++;
      blockingPassed = false;
    }
  } catch (err) {
    checks.D2 = { passed: false, blocking: true, reason: err.message };
    blockingFailed++;
    blockingPassed = false;
  }

  // D3: Zotero 状态检查（信息型，不阻塞）
  // 即使 D1/D2 失败也执行，提供完整的重复状态报告
  try {
    checks.D3 = checkD3(fileSha256, doi);
  } catch (err) {
    checks.D3 = { passed: true, informational: true, skipped: true, reason: err.message };
  }

  // all_passed 只由 D1/D2 决定，D3 是信息型
  const allPassed = blockingPassed;
  const passedCount = blockingCount - blockingFailed;
  const summary = blockingPassed
    ? `${passedCount}/${blockingCount} blocking checks passed, Zotero: ${checks.D3.zotero_status || 'skipped'}`
    : `${passedCount}/${blockingCount} blocking checks passed (${blockingFailed} failed), Zotero: ${checks.D3.zotero_status || 'skipped'}`;

  const result = {
    all_passed: allPassed,
    checks,
    blocking_passed: blockingPassed,
    summary,
    file_sha256: fileSha256,
    file_path: filePath,
    file_name: fileName,
    kb_name: kbName,
    doi: doi,
    checked_at: new Date().toISOString(),
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(allPassed ? 0 : 1);
}

main();
