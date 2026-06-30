#!/usr/bin/env node
'use strict';

/**
 * 文献整理流程验证 Harness — 8 项交叉校验
 *
 * 用法:
 *   node verify_workflow.cjs --file <PDF路径> --zotero-key <itemKey> [--kb-name <名称>] [--media-id <id>]
 *
 * 校验项:
 *   V1 — 本地归档完整性（文件存在、大小>0、SHA256可计算）
 *   V2 — IMA 上传一致性（media_id 存在、文件名匹配、可搜索）
 *   V3 — Zotero 索引完整性（条目存在、extra格式正确、SHA256匹配）
 *   V4 — 标签非空非乱码（tags≥1、无?/\ufffd、非标题拆词）
 *   V5 — 摘要非空非乱码（abstractNote≥50字、无乱码）
 *   V6 — 无重复 Zotero 条目（同一SHA256仅一条）
 *   V7 — index-only 纯净性（无PDF附件）
 *   V8 — IMA-Zotero 关联一致（extra中IMA-Media-ID在IMA端可查）
 *
 * 输出 (JSON to stdout):
 *   { all_passed, checks: {V1..V8}, passed_count, failed_count, summary }
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// ─── 路径解析 ────────────────────────────────────────────────────────────────

const HARNESS_DIR = __dirname;
const CONFIG_PATH = path.join(HARNESS_DIR, 'workflow_config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function repoRoot() {
  return path.resolve(HARNESS_DIR, '..', '..', '..');
}

function resolveConfiguredPath(rawPath, fallbackBase = repoRoot()) {
  if (!rawPath) return '';
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(fallbackBase, rawPath);
}

const GLOBAL_SKILL_DIR = resolveConfiguredPath(process.env.IMA_SKILL_DIR || config.global_ima_skill_dir);
const IMA_API = path.join(GLOBAL_SKILL_DIR, 'ima_api.cjs');

// ─── 日志 ────────────────────────────────────────────────────────────────────

function log(level, message, data = {}) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...data };
  try {
    const logDir = resolveConfiguredPath(config.logging.log_dir || '.workflow-state/logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `verify_${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch {}
}

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

// ─── IMA API 调用 ────────────────────────────────────────────────────────────

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

// ─── Zotero Web API 调用 ────────────────────────────────────────────────────

function getZoteroEnv() {
  const apiKey = process.env.ZOTERO_API_KEY;
  const userId = process.env.ZOTERO_USER_ID;
  if (!apiKey || !userId) {
    throw new Error('缺少 ZOTERO_API_KEY 或 ZOTERO_USER_ID 环境变量');
  }
  return { apiKey, userId };
}

function zoteroGet(itemKey) {
  const { apiKey, userId } = getZoteroEnv();
  const url = `https://api.zotero.org/users/${userId}/items/${itemKey}`;
  try {
    const stdout = execFileSync('node', ['-e', `
      const https = require('https');
      const options = {
        hostname: 'api.zotero.org',
        path: '/users/${userId}/items/${itemKey}',
        method: 'GET',
        headers: {
          'Zotero-API-Key': '${apiKey}',
          'Zotero-API-Version': '3',
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          process.stdout.write(JSON.stringify({ status: res.statusCode, body: data, version: res.headers['last-modified-version'] }));
        });
      });
      req.on('error', (e) => process.stdout.write(JSON.stringify({ status: 0, error: e.message })));
      req.end();
    `], { encoding: 'utf8', timeout: 30000 });
    return JSON.parse(stdout);
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

function zoteroSearchSha256(sha256) {
  const { apiKey, userId } = getZoteroEnv();
  const query = encodeURIComponent(sha256);
  try {
    const stdout = execFileSync('node', ['-e', `
      const https = require('https');
      const options = {
        hostname: 'api.zotero.org',
        path: '/users/${userId}/items?q=${query}&limit=10&itemType=journalArticle',
        method: 'GET',
        headers: {
          'Zotero-API-Key': '${apiKey}',
          'Zotero-API-Version': '3',
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          process.stdout.write(JSON.stringify({ status: res.statusCode, body: data }));
        });
      });
      req.on('error', (e) => process.stdout.write(JSON.stringify({ status: 0, error: e.message })));
      req.end();
    `], { encoding: 'utf8', timeout: 30000 });
    return JSON.parse(stdout);
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

function zoteroGetChildren(itemKey) {
  const { apiKey, userId } = getZoteroEnv();
  try {
    const stdout = execFileSync('node', ['-e', `
      const https = require('https');
      const options = {
        hostname: 'api.zotero.org',
        path: '/users/${userId}/items/${itemKey}/children',
        method: 'GET',
        headers: {
          'Zotero-API-Key': '${apiKey}',
          'Zotero-API-Version': '3',
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          process.stdout.write(JSON.stringify({ status: res.statusCode, body: data }));
        });
      });
      req.on('error', (e) => process.stdout.write(JSON.stringify({ status: 0, error: e.message })));
      req.end();
    `], { encoding: 'utf8', timeout: 30000 });
    return JSON.parse(stdout);
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

function isGarbled(text) {
  if (!text) return false;
  // 检测连续 ? 字符
  if (/\?{2,}/.test(text)) return true;
  // 检测替换字符
  if (text.includes('\ufffd')) return true;
  // 检测全为 ? 字符
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

// V1: 本地归档完整性
function checkV1(filePath) {
  log('info', 'V1: 本地归档完整性检查', { file: filePath });

  if (!fs.existsSync(filePath)) {
    return { passed: false, reason: `文件不存在: ${filePath}` };
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    return { passed: false, reason: '文件大小为 0' };
  }

  let sha256;
  try {
    sha256 = computeSha256(filePath);
  } catch (err) {
    return { passed: false, reason: `SHA256 计算失败: ${err.message}` };
  }

  return {
    passed: true,
    file_path: filePath,
    file_size: stat.size,
    sha256: sha256,
  };
}

// V2: IMA 上传一致性
function checkV2(fileName, mediaId, kbName, kbId) {
  log('info', 'V2: IMA 上传一致性检查', { media_id: mediaId, kb_name: kbName });

  if (!mediaId) {
    return { passed: false, reason: '未提供 IMA media_id' };
  }

  // 通过搜索知识库验证文件存在
  const searchResp = callImaApi('openapi/wiki/v1/search_knowledge', {
    query: fileName,
    knowledge_base_id: kbId,
    cursor: '',
  });

  if (searchResp.code !== 0) {
    return { passed: false, reason: `IMA 搜索失败: ${searchResp.msg}` };
  }

  const infoList = (searchResp.data && searchResp.data.info_list) || [];
  const found = infoList.find((item) => item.media_id === mediaId);

  if (!found) {
    return { passed: false, reason: `IMA 知识库中未找到 media_id: ${mediaId}` };
  }

  // 检查文件名是否匹配（title 应等于 file_name）
  if (found.title !== fileName) {
    return { passed: false, reason: `IMA 文件名不匹配: 期望 "${fileName}"，实际 "${found.title}"` };
  }

  return {
    passed: true,
    media_id: mediaId,
    title: found.title,
    media_type: found.media_type,
  };
}

// V3: Zotero 索引完整性
function checkV3(zoteroKey, localSha256) {
  log('info', 'V3: Zotero 索引完整性检查', { zotero_key: zoteroKey });

  const resp = zoteroGet(zoteroKey);

  if (resp.status !== 200) {
    return { passed: false, reason: `Zotero 条目获取失败 (HTTP ${resp.status}): ${resp.body || resp.error}` };
  }

  let item;
  try {
    item = JSON.parse(resp.body);
  } catch {
    return { passed: false, reason: 'Zotero 响应不是合法 JSON' };
  }

  const data = item.data || {};
  const extra = data.extra || '';

  // 检查 extra 字段格式
  const extraSha256 = parseExtraField(extra, 'SHA256');
  const extraLocalPath = parseExtraField(extra, 'Local-Path');
  const extraManagedBy = parseExtraField(extra, 'Managed-By');

  if (!extraSha256) {
    return { passed: false, reason: 'Zotero extra 字段缺少 SHA256' };
  }
  if (!extraLocalPath) {
    return { passed: false, reason: 'Zotero extra 字段缺少 Local-Path' };
  }
  if (!extraManagedBy) {
    return { passed: false, reason: 'Zotero extra 字段缺少 Managed-By' };
  }

  // 检查 SHA256 匹配
  if (extraSha256.toLowerCase() !== localSha256.toLowerCase()) {
    return {
      passed: false,
      reason: `SHA256 不匹配: 本地 ${localSha256} vs Zotero ${extraSha256}`,
    };
  }

  return {
    passed: true,
    item_key: zoteroKey,
    item_type: data.itemType,
    title: data.title,
    extra_sha256: extraSha256,
    extra_local_path: extraLocalPath,
  };
}

// V4: 标签非空非乱码
function checkV4(zoteroKey) {
  log('info', 'V4: 标签非空非乱码检查', { zotero_key: zoteroKey });

  const resp = zoteroGet(zoteroKey);

  if (resp.status !== 200) {
    return { passed: false, reason: `Zotero 条目获取失败 (HTTP ${resp.status})` };
  }

  let item;
  try {
    item = JSON.parse(resp.body);
  } catch {
    return { passed: false, reason: 'Zotero 响应不是合法 JSON' };
  }

  const tags = (item.data && item.data.tags) || [];

  if (tags.length === 0) {
    return { passed: false, reason: 'Zotero 标签数量为 0' };
  }

  // 检查每个标签
  for (const tag of tags) {
    const tagStr = typeof tag === 'string' ? tag : (tag.tag || '');
    if (!tagStr) {
      return { passed: false, reason: '存在空标签' };
    }
    if (isGarbled(tagStr)) {
      return { passed: false, reason: `标签乱码: "${tagStr}"` };
    }
  }

  // 检查标签是否仅为标题拆词（简单启发式：如果所有标签都是标题的子串）
  const title = (item.data && item.data.title) || '';
  if (title) {
    const allFromTitle = tags.every((t) => {
      const tagStr = typeof t === 'string' ? t : (t.tag || '');
      return title.toLowerCase().includes(tagStr.toLowerCase());
    });
    if (allFromTitle && tags.length <= 3) {
      return { passed: false, reason: '所有标签均为标题子串，疑似仅从标题拆词未阅读内容' };
    }
  }

  return {
    passed: true,
    tags: tags.map((t) => (typeof t === 'string' ? t : t.tag)),
    tag_count: tags.length,
  };
}

// V5: 摘要非空非乱码
function checkV5(zoteroKey) {
  log('info', 'V5: 摘要非空非乱码检查', { zotero_key: zoteroKey });

  const resp = zoteroGet(zoteroKey);

  if (resp.status !== 200) {
    return { passed: false, reason: `Zotero 条目获取失败 (HTTP ${resp.status})` };
  }

  let item;
  try {
    item = JSON.parse(resp.body);
  } catch {
    return { passed: false, reason: 'Zotero 响应不是合法 JSON' };
  }

  const abstract = (item.data && item.data.abstractNote) || '';

  if (!abstract || abstract.trim().length === 0) {
    return { passed: false, reason: 'Zotero abstractNote 字段为空' };
  }

  if (abstract.length < 50) {
    return { passed: false, reason: `摘要过短 (${abstract.length} 字)，要求 ≥ 50 字` };
  }

  if (isGarbled(abstract)) {
    return { passed: false, reason: '摘要包含乱码字符' };
  }

  return {
    passed: true,
    abstract_length: abstract.length,
  };
}

// V6: 无重复 Zotero 条目
// 注意：Zotero 的 q 搜索不索引 extra 字段，因此改用遍历所有条目的方式
function checkV6(localSha256, knownItemKey) {
  log('info', 'V6: 无重复 Zotero 条目检查', { sha256: localSha256, known_key: knownItemKey });

  // 获取所有条目（分页）
  const { apiKey, userId } = getZoteroEnv();
  let allItems = [];
  let start = 0;
  let hasMore = true;

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
      return { passed: false, reason: `Zotero 列表获取失败 (HTTP ${pageResult.status})` };
    }

    let pageItems;
    try {
      pageItems = JSON.parse(pageResult.body);
    } catch {
      return { passed: false, reason: 'Zotero 列表响应不是合法 JSON' };
    }

    allItems = allItems.concat(pageItems);

    const total = parseInt(pageResult.total || '0', 10);
    hasMore = allItems.length < total && pageItems.length > 0;
    start += 50;

    // 安全限制：最多 20 页
    if (start > 1000) break;
  }

  // 过滤出 extra 中包含该 SHA256 的条目
  const matchingItems = allItems.filter((item) => {
    const extra = (item.data && item.data.extra) || '';
    const extraSha = parseExtraField(extra, 'SHA256');
    return extraSha && extraSha.toLowerCase() === localSha256.toLowerCase();
  });

  if (matchingItems.length === 0) {
    // 没找到包含该 SHA256 的条目，但如果已知 key 存在，说明 extra 可能刚更新还未索引
    // 直接检查已知 key 的条目
    const knownItem = allItems.find((i) => i.key === knownItemKey);
    if (knownItem) {
      const extra = (knownItem.data && knownItem.data.extra) || '';
      const extraSha = parseExtraField(extra, 'SHA256');
      if (extraSha && extraSha.toLowerCase() === localSha256.toLowerCase()) {
        return { passed: true, unique_count: 1, note: '通过已知 key 确认' };
      }
    }
    return { passed: false, reason: 'Zotero 中未找到包含该 SHA256 的条目' };
  }

  if (matchingItems.length > 1) {
    return {
      passed: false,
      reason: `Zotero 中存在 ${matchingItems.length} 条相同 SHA256 的条目: ${matchingItems.map((i) => i.key).join(', ')}`,
    };
  }

  return {
    passed: true,
    unique_count: matchingItems.length,
  };
}

// V7: index-only 纯净性
function checkV7(zoteroKey) {
  log('info', 'V7: index-only 纯净性检查', { zotero_key: zoteroKey });

  const resp = zoteroGetChildren(zoteroKey);

  if (resp.status !== 200) {
    return { passed: false, reason: `Zotero 子条目获取失败 (HTTP ${resp.status})` };
  }

  let children;
  try {
    children = JSON.parse(resp.body);
  } catch {
    return { passed: false, reason: 'Zotero 子条目响应不是合法 JSON' };
  }

  if (!Array.isArray(children)) {
    children = [];
  }

  // 检查是否有 imported_file 类型的附件
  const attachments = children.filter((child) => {
    const itemType = (child.data && child.data.itemType) || '';
    return itemType === 'attachment' && (child.data && child.data.linkMode === 'imported_file');
  });

  if (attachments.length > 0) {
    return {
      passed: false,
      reason: `index-only 条目包含 ${attachments.length} 个 PDF 附件（应无附件）`,
      attachment_keys: attachments.map((a) => a.key),
    };
  }

  return {
    passed: true,
    attachment_count: 0,
  };
}

// V8: IMA-Zotero 关联一致
function checkV8(zoteroKey, kbId, kbName) {
  log('info', 'V8: IMA-Zotero 关联一致性检查', { zotero_key: zoteroKey, kb_name: kbName });

  const resp = zoteroGet(zoteroKey);

  if (resp.status !== 200) {
    return { passed: false, reason: `Zotero 条目获取失败 (HTTP ${resp.status})` };
  }

  let item;
  try {
    item = JSON.parse(resp.body);
  } catch {
    return { passed: false, reason: 'Zotero 响应不是合法 JSON' };
  }

  const extra = (item.data && item.data.extra) || '';
  const imaMediaId = parseExtraField(extra, 'IMA-Media-ID');
  const imaKb = parseExtraField(extra, 'IMA-KB');
  const imaStatus = parseExtraField(extra, 'IMA-Status');

  if (!imaStatus || imaStatus === 'pending') {
    return {
      passed: false,
      reason: `IMA-Status 为 ${imaStatus || '空'}，未完成上传`,
    };
  }

  if (imaStatus !== 'uploaded') {
    // 非 uploaded 状态（如 skipped-duplicate, failed-cos 等）视为警告但不阻塞
    return {
      passed: true,
      warning: `IMA-Status 为 ${imaStatus}，非 uploaded`,
    };
  }

  if (!imaMediaId) {
    return { passed: false, reason: 'IMA-Status=uploaded 但 extra 中缺少 IMA-Media-ID' };
  }

  if (!imaKb) {
    return { passed: false, reason: 'IMA-Status=uploaded 但 extra 中缺少 IMA-KB' };
  }

  // 在 IMA 端验证 media_id 可查
  const searchResp = callImaApi('openapi/wiki/v1/search_knowledge', {
    query: (item.data && item.data.title) || '',
    knowledge_base_id: kbId,
    cursor: '',
  });

  if (searchResp.code !== 0) {
    return { passed: false, reason: `IMA 搜索失败: ${searchResp.msg}` };
  }

  const infoList = (searchResp.data && searchResp.data.info_list) || [];
  const found = infoList.find((item) => item.media_id === imaMediaId);

  if (!found) {
    return { passed: false, reason: `IMA 端未找到 media_id: ${imaMediaId}` };
  }

  return {
    passed: true,
    ima_media_id: imaMediaId,
    ima_kb: imaKb,
    ima_status: imaStatus,
  };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (!args.file) {
    const result = { all_passed: false, error: '缺少必需参数: --file <PDF路径>' };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (!args['zotero-key']) {
    const result = { all_passed: false, error: '缺少必需参数: --zotero-key <Zotero item key>' };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const filePath = path.resolve(args.file);
  const zoteroKey = args['zotero-key'];
  const kbName = args['kb-name'] || config.default_knowledge_base;
  const kbId = args['kb-id'] || config.knowledge_base_mapping[kbName];
  const mediaId = args['media-id'];

  log('info', '开始流程校验', { file: filePath, zotero_key: zoteroKey, kb_name: kbName });

  const checks = {};
  let passedCount = 0;
  let failedCount = 0;
  let localSha256 = null;

  // V1: 本地归档完整性
  try {
    const v1 = checkV1(filePath);
    checks.V1 = v1;
    if (v1.passed) { passedCount++; localSha256 = v1.sha256; }
    else failedCount++;
  } catch (err) {
    checks.V1 = { passed: false, reason: err.message };
    failedCount++;
  }

  // V2: IMA 上传一致性（需要 media_id）
  if (mediaId && kbId) {
    try {
      const fileName = path.basename(filePath);
      const v2 = checkV2(fileName, mediaId, kbName, kbId);
      checks.V2 = v2;
      if (v2.passed) passedCount++; else failedCount++;
    } catch (err) {
      checks.V2 = { passed: false, reason: err.message };
      failedCount++;
    }
  } else {
    checks.V2 = { passed: false, reason: '未提供 --media-id 或知识库 ID 不可用，跳过 IMA 校验' };
    failedCount++;
  }

  // V3: Zotero 索引完整性（需要 localSha256）
  if (localSha256) {
    try {
      const v3 = checkV3(zoteroKey, localSha256);
      checks.V3 = v3;
      if (v3.passed) passedCount++; else failedCount++;
    } catch (err) {
      checks.V3 = { passed: false, reason: err.message };
      failedCount++;
    }
  } else {
    checks.V3 = { passed: false, reason: 'V1 失败，无法校验 SHA256 匹配' };
    failedCount++;
  }

  // V4: 标签非空非乱码
  try {
    const v4 = checkV4(zoteroKey);
    checks.V4 = v4;
    if (v4.passed) passedCount++; else failedCount++;
  } catch (err) {
    checks.V4 = { passed: false, reason: err.message };
    failedCount++;
  }

  // V5: 摘要非空非乱码
  try {
    const v5 = checkV5(zoteroKey);
    checks.V5 = v5;
    if (v5.passed) passedCount++; else failedCount++;
  } catch (err) {
    checks.V5 = { passed: false, reason: err.message };
    failedCount++;
  }

  // V6: 无重复 Zotero 条目
  if (localSha256) {
    try {
      const v6 = checkV6(localSha256, zoteroKey);
      checks.V6 = v6;
      if (v6.passed) passedCount++; else failedCount++;
    } catch (err) {
      checks.V6 = { passed: false, reason: err.message };
      failedCount++;
    }
  } else {
    checks.V6 = { passed: false, reason: 'V1 失败，无法校验重复' };
    failedCount++;
  }

  // V7: index-only 纯净性
  try {
    const v7 = checkV7(zoteroKey);
    checks.V7 = v7;
    if (v7.passed) passedCount++; else failedCount++;
  } catch (err) {
    checks.V7 = { passed: false, reason: err.message };
    failedCount++;
  }

  // V8: IMA-Zotero 关联一致
  if (kbId) {
    try {
      const v8 = checkV8(zoteroKey, kbId, kbName);
      checks.V8 = v8;
      if (v8.passed) passedCount++; else failedCount++;
    } catch (err) {
      checks.V8 = { passed: false, reason: err.message };
      failedCount++;
    }
  } else {
    checks.V8 = { passed: false, reason: '知识库 ID 不可用' };
    failedCount++;
  }

  const allPassed = failedCount === 0;
  const summary = `${passedCount}/8 checks passed${failedCount > 0 ? `, ${failedCount} failed` : ''}`;

  const result = {
    all_passed: allPassed,
    checks: checks,
    passed_count: passedCount,
    failed_count: failedCount,
    summary: summary,
    verified_at: new Date().toISOString(),
    file: filePath,
    zotero_key: zoteroKey,
    kb_name: kbName,
  };

  log(allPassed ? 'info' : 'warn', '流程校验完成', { all_passed: allPassed, summary });
  console.log(JSON.stringify(result, null, 2));
  process.exit(allPassed ? 0 : 1);
}

main();
