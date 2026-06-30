#!/usr/bin/env node
'use strict';

/**
 * IMA PDF 上传 Harness — 带安全门的工作流约束脚本
 *
 * 用法:
 *   node upload_pdf.cjs --file <path> [--kb-name <name>] [--kb-id <id>] [--folder-id <id>]
 *
 * 输出 (JSON to stdout):
 *   成功: { success: true, media_id, kb_id, kb_name, file_name, file_size, gates_passed: [...] }
 *   失败: { success: false, error, gate, file_name }
 *
 * 安全门:
 *   GATE 1 — 文件类型检查 (preflight-check.cjs)
 *   GATE 2 — 命名规则 (title = file_name)
 *   GATE 3 — 重复检查 (check_repeated_names)
 *   GATE 4 — COS 上传退出码 (cos-upload.cjs)
 *   GATE 5 — add_knowledge 验证 (code=0)
 */

const fs = require('node:fs');
const path = require('node:path');
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
const PREFLIGHT_CHECK = path.join(GLOBAL_SKILL_DIR, 'knowledge-base', 'scripts', 'preflight-check.cjs');
const COS_UPLOAD = path.join(GLOBAL_SKILL_DIR, 'knowledge-base', 'scripts', 'cos-upload.cjs');

// ─── 日志 ────────────────────────────────────────────────────────────────────

function log(level, message, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  const logDir = resolveConfiguredPath(config.logging.log_dir || '.workflow-state/logs');
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, `upload_${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // 日志写入失败不应阻塞主流程
  }
  if (level === 'error') {
    console.error(`[HARNESS] ${message}`);
  }
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

// ─── IMA API 调用封装 ────────────────────────────────────────────────────────

function callImaApi(apiPath, body) {
  const bodyStr = JSON.stringify(body);
  const optsStr = '{}';
  try {
    const stdout = execFileSync('node', [IMA_API, apiPath, bodyStr, optsStr], {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    let errMsg = err.message;
    try {
      const errJson = JSON.parse(stderr);
      errMsg = errJson.msg || errMsg;
    } catch {}
    throw new Error(`IMA API 调用失败 (${apiPath}): ${errMsg}`);
  }
}

// ─── 知识库 ID 解析 ──────────────────────────────────────────────────────────

function resolveKbId(kbName, kbId) {
  if (kbId) {
    return { kb_id: kbId, kb_name: kbName || kbId };
  }

  const name = kbName || config.default_knowledge_base;
  const mappedId = config.knowledge_base_mapping[name];

  if (mappedId) {
    return { kb_id: mappedId, kb_name: name };
  }

  // 如果配置中没有，从 API 查询
  log('info', `知识库 "${name}" 不在配置映射中，从 API 查询`);
  const resp = callImaApi('openapi/wiki/v1/get_addable_knowledge_base_list', {
    cursor: '',
    limit: 50,
  });

  if (resp.code !== 0) {
    throw new Error(`获取知识库列表失败: ${resp.msg}`);
  }

  const kbList = resp.data.addable_knowledge_base_list || [];
  const found = kbList.find((kb) => kb.name === name);

  if (!found) {
    const available = kbList.map((kb) => kb.name).join(', ');
    throw new Error(`知识库 "${name}" 不存在。可用的知识库: ${available}`);
  }

  return { kb_id: found.id, kb_name: found.name };
}

// ─── GATE 1: 文件类型检查 ───────────────────────────────────────────────────

function gate1_typeCheck(filePath) {
  log('info', 'GATE 1: 文件类型检查', { file: filePath });

  let stdout;
  try {
    stdout = execFileSync('node', [PREFLIGHT_CHECK, '--file', filePath], {
      encoding: 'utf8',
      timeout: 30000,
    });
  } catch (err) {
    const output = err.stdout ? err.stdout.toString() : '';
    let reason = err.message;
    try {
      const result = JSON.parse(output);
      reason = result.reason || reason;
    } catch {}
    return { passed: false, reason: `GATE 1 失败: ${reason}` };
  }

  const result = JSON.parse(stdout);
  if (!result.pass) {
    return { passed: false, reason: `GATE 1 失败: ${result.reason}` };
  }

  return {
    passed: true,
    data: {
      file_name: result.file_name,
      file_ext: result.file_ext,
      file_size: result.file_size,
      media_type: result.media_type,
      content_type: result.content_type,
    },
  };
}

// ─── GATE 2: 命名规则 ───────────────────────────────────────────────────────

function gate2_naming(fileName) {
  log('info', 'GATE 2: 命名规则检查', { file_name: fileName });

  // title 必须等于 file_name（含扩展名）
  // 这个 gate 是在 add_knowledge 阶段强制执行的
  // 这里仅做日志记录
  return { passed: true, data: { title: fileName } };
}

// ─── GATE 3: 重复检查 ───────────────────────────────────────────────────────

function gate3_duplicates(fileName, mediaType, kbId, folderId) {
  log('info', 'GATE 3: 重复检查', { file_name: fileName, kb_id: kbId });

  const body = {
    params: [{ name: fileName, media_type: mediaType }],
    knowledge_base_id: kbId,
  };
  if (folderId) {
    body.folder_id = folderId;
  }

  const resp = callImaApi('openapi/wiki/v1/check_repeated_names', body);

  if (resp.code !== 0) {
    return { passed: false, reason: `GATE 3 失败: ${resp.msg}` };
  }

  const results = resp.data.results || [];
  const isRepeated = results.length > 0 && results[0].is_repeated;

  if (isRepeated) {
    const strategy = config.dedup_strategy.on_duplicate;
    if (strategy === 'append_timestamp') {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      const now = new Date();
      const ts = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      const newFileName = `${base}_${ts}${ext}`;
      log('warn', 'GATE 3: 检测到重复，追加时间戳', {
        original: fileName,
        renamed: newFileName,
      });
      return { passed: true, data: { file_name: newFileName, renamed: true } };
    } else {
      return { passed: false, reason: `GATE 3 失败: 文件名 "${fileName}" 已存在` };
    }
  }

  return { passed: true, data: { file_name: fileName, renamed: false } };
}

// ─── GATE 4: COS 上传 ───────────────────────────────────────────────────────

function gate4_cosUpload(filePath, cosCredential, contentType) {
  log('info', 'GATE 4: COS 上传', { file: filePath, cos_key: cosCredential.cos_key });

  const timeoutMs = config.retry_policy.cos_upload_timeout_ms || 300000;

  const args = [
    COS_UPLOAD,
    '--file', filePath,
    '--secret-id', cosCredential.secret_id,
    '--secret-key', cosCredential.secret_key,
    '--token', cosCredential.token,
    '--bucket', cosCredential.bucket_name,
    '--region', cosCredential.region,
    '--cos-key', cosCredential.cos_key,
    '--content-type', contentType,
    '--start-time', String(cosCredential.start_time),
    '--expired-time', String(cosCredential.expired_time),
    '--timeout', String(timeoutMs),
  ];

  try {
    const stdout = execFileSync('node', args, {
      encoding: 'utf8',
      timeout: timeoutMs + 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    log('info', 'GATE 4: COS 上传成功', { output: stdout.trim() });
    return { passed: true };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    return { passed: false, reason: `GATE 4 失败: COS 上传出错 — ${stderr || err.message}` };
  }
}

// ─── GATE 5: add_knowledge 验证 ─────────────────────────────────────────────

function gate5_addKnowledge(mediaType, mediaId, title, kbId, folderId, cosCredential, fileName, fileSize) {
  log('info', 'GATE 5: add_knowledge', { media_id: mediaId, title, kb_id: kbId });

  const body = {
    media_type: mediaType,
    media_id: mediaId,
    title: title,
    knowledge_base_id: kbId,
    file_info: {
      cos_key: cosCredential.cos_key,
      file_size: fileSize,
      file_name: fileName,
    },
  };
  if (folderId) {
    body.folder_id = folderId;
  }

  const resp = callImaApi('openapi/wiki/v1/add_knowledge', body);

  if (resp.code !== 0) {
    return { passed: false, reason: `GATE 5 失败: ${resp.msg}` };
  }

  return { passed: true, data: { media_id: resp.data.media_id || mediaId } };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (!args.file) {
    const result = { success: false, error: '缺少必需参数: --file <path>', gate: 'args' };
    console.log(JSON.stringify(result));
    process.exit(1);
  }

  const filePath = path.resolve(args.file);

  if (!fs.existsSync(filePath)) {
    const result = { success: false, error: `文件不存在: ${filePath}`, gate: 'args' };
    console.log(JSON.stringify(result));
    process.exit(1);
  }

  const gatesPassed = [];
  let finalFileName = path.basename(filePath);

  try {
    // 解析知识库
    const { kb_id, kb_name } = resolveKbId(args['kb-name'], args['kb-id']);
    log('info', '知识库已解析', { kb_id, kb_name });

    // GATE 1: 文件类型检查
    const gate1 = gate1_typeCheck(filePath);
    if (!gate1.passed) {
      const result = { success: false, error: gate1.reason, gate: 'gate1_type_check', file_name: finalFileName };
      log('error', 'GATE 1 失败', result);
      console.log(JSON.stringify(result));
      process.exit(1);
    }
    gatesPassed.push('gate1_type_check');
    const fileInfo = gate1.data;
    finalFileName = fileInfo.file_name;

    // GATE 2: 命名规则
    const gate2 = gate2_naming(finalFileName);
    if (!gate2.passed) {
      const result = { success: false, error: gate2.reason, gate: 'gate2_naming', file_name: finalFileName };
      log('error', 'GATE 2 失败', result);
      console.log(JSON.stringify(result));
      process.exit(1);
    }
    gatesPassed.push('gate2_naming');

    // GATE 3: 重复检查
    const gate3 = gate3_duplicates(finalFileName, fileInfo.media_type, kb_id, args['folder-id']);
    if (!gate3.passed) {
      const result = { success: false, error: gate3.reason, gate: 'gate3_duplicates', file_name: finalFileName };
      log('error', 'GATE 3 失败', result);
      console.log(JSON.stringify(result));
      process.exit(1);
    }
    gatesPassed.push('gate3_duplicates');
    if (gate3.data.renamed) {
      finalFileName = gate3.data.file_name;
      log('info', '文件已重命名以避免重复', { new_name: finalFileName });
    }

    // Step 4: create_media
    log('info', '创建媒体 (create_media)', { file_name: finalFileName, file_size: fileInfo.file_size });
    const createMediaBody = {
      file_name: finalFileName,
      file_size: fileInfo.file_size,
      content_type: fileInfo.content_type,
      knowledge_base_id: kb_id,
      file_ext: fileInfo.file_ext,
    };
    const createMediaResp = callImaApi('openapi/wiki/v1/create_media', createMediaBody);

    if (createMediaResp.code !== 0) {
      const result = { success: false, error: `create_media 失败: ${createMediaResp.msg}`, gate: 'create_media', file_name: finalFileName };
      log('error', 'create_media 失败', result);
      console.log(JSON.stringify(result));
      process.exit(1);
    }

    const mediaId = createMediaResp.data.media_id;
    const cosCredential = createMediaResp.data.cos_credential;
    log('info', '媒体创建成功', { media_id: mediaId });

    // GATE 4: COS 上传
    const gate4 = gate4_cosUpload(filePath, cosCredential, fileInfo.content_type);
    if (!gate4.passed) {
      const result = { success: false, error: gate4.reason, gate: 'gate4_cos_upload', file_name: finalFileName, media_id: mediaId };
      log('error', 'GATE 4 失败', result);
      console.log(JSON.stringify(result));
      process.exit(1);
    }
    gatesPassed.push('gate4_cos_upload');

    // GATE 5: add_knowledge
    const gate5 = gate5_addKnowledge(
      fileInfo.media_type,
      mediaId,
      finalFileName,
      kb_id,
      args['folder-id'],
      cosCredential,
      finalFileName,
      fileInfo.file_size,
    );
    if (!gate5.passed) {
      const result = { success: false, error: gate5.reason, gate: 'gate5_add_knowledge', file_name: finalFileName, media_id: mediaId };
      log('error', 'GATE 5 失败', result);
      console.log(JSON.stringify(result));
      process.exit(1);
    }
    gatesPassed.push('gate5_add_knowledge');

    // 成功
    const result = {
      success: true,
      media_id: gate5.data.media_id,
      kb_id: kb_id,
      kb_name: kb_name,
      file_name: finalFileName,
      file_size: fileInfo.file_size,
      original_file: path.basename(filePath),
      renamed: finalFileName !== path.basename(filePath),
      gates_passed: gatesPassed,
    };
    log('info', '上传成功', result);
    console.log(JSON.stringify(result));
    process.exit(0);

  } catch (err) {
    const result = {
      success: false,
      error: err.message,
      gate: 'unexpected',
      file_name: finalFileName,
      gates_passed: gatesPassed,
    };
    log('error', '意外错误', result);
    console.log(JSON.stringify(result));
    process.exit(1);
  }
}

main();
