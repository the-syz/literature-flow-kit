#!/usr/bin/env node
'use strict';

/**
 * IMA 去重检查 Harness — 检查知识库中是否存在同名文件
 *
 * 用法:
 *   node dedup_check.cjs --file <path> --kb-name <name>
 *   node dedup_check.cjs --file-name <filename> --media-type 1 --kb-id <id>
 *
 * 输出 (JSON to stdout):
 *   { is_repeated: bool, file_name, kb_name, suggestion }
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const HARNESS_DIR = __dirname;
const CONFIG_PATH = path.join(HARNESS_DIR, 'workflow_config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function repoRoot() {
  return path.resolve(HARNESS_DIR, '..', '..', '..');
}

function resolveConfiguredPath(rawPath) {
  const value = process.env.IMA_SKILL_DIR || rawPath;
  if (!value) return '';
  return path.isAbsolute(value) ? value : path.resolve(repoRoot(), value);
}

const GLOBAL_SKILL_DIR = resolveConfiguredPath(config.global_ima_skill_dir);
const IMA_API = path.join(GLOBAL_SKILL_DIR, 'ima_api.cjs');
const PREFLIGHT_CHECK = path.join(GLOBAL_SKILL_DIR, 'knowledge-base', 'scripts', 'preflight-check.cjs');

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

function callImaApi(apiPath, body) {
  const bodyStr = JSON.stringify(body);
  try {
    const stdout = execFileSync('node', [IMA_API, apiPath, bodyStr, '{}'], {
      encoding: 'utf8',
      timeout: 30000,
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

function resolveKbId(kbName, kbId) {
  if (kbId) return { kb_id: kbId, kb_name: kbName || kbId };

  const name = kbName || config.default_knowledge_base;
  const mappedId = config.knowledge_base_mapping[name];
  if (mappedId) return { kb_id: mappedId, kb_name: name };

  // 从 API 查询
  const resp = callImaApi('openapi/wiki/v1/get_addable_knowledge_base_list', {
    cursor: '', limit: 50,
  });
  if (resp.code !== 0) throw new Error(`获取知识库列表失败: ${resp.msg}`);

  const found = (resp.data.addable_knowledge_base_list || []).find((kb) => kb.name === name);
  if (!found) throw new Error(`知识库 "${name}" 不存在`);
  return { kb_id: found.id, kb_name: found.name };
}

function getMediaType(filePath, fileName) {
  // 如果有文件路径，用 preflight-check 获取 media_type
  if (filePath && fs.existsSync(filePath)) {
    try {
      const stdout = execFileSync('node', [PREFLIGHT_CHECK, '--file', filePath], {
        encoding: 'utf8',
        timeout: 30000,
      });
      const result = JSON.parse(stdout);
      if (result.pass) {
        return { media_type: result.media_type, file_name: result.file_name };
      }
    } catch {}
  }

  // 否则从扩展名推断
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const extMap = {
    pdf: 1, doc: 3, docx: 3, ppt: 4, pptx: 4,
    xls: 5, xlsx: 5, csv: 5, md: 7, markdown: 7,
    png: 9, jpg: 9, jpeg: 9, webp: 9, txt: 13, xmind: 14,
    mp3: 15, m4a: 15, wav: 15, aac: 15,
  };

  return { media_type: extMap[ext] || 1, file_name: fileName };
}

function main() {
  const args = parseArgs(process.argv);

  let fileName = args['file-name'];
  let filePath = args.file;
  let mediaType = args['media-type'] ? parseInt(args['media-type'], 10) : null;

  if (!fileName && !filePath) {
    const result = { error: '缺少必需参数: --file <path> 或 --file-name <filename>' };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (filePath) {
    filePath = path.resolve(filePath);
    fileName = fileName || path.basename(filePath);
  }

  if (!mediaType) {
    const info = getMediaType(filePath, fileName);
    mediaType = info.media_type;
    fileName = info.file_name || fileName;
  }

  try {
    const { kb_id, kb_name } = resolveKbId(args['kb-name'], args['kb-id']);

    const body = {
      params: [{ name: fileName, media_type: mediaType }],
      knowledge_base_id: kb_id,
    };
    if (args['folder-id']) {
      body.folder_id = args['folder-id'];
    }

    const resp = callImaApi('openapi/wiki/v1/check_repeated_names', body);

    if (resp.code !== 0) {
      const result = {
        error: `重复检查失败: ${resp.msg}`,
        file_name: fileName,
        kb_name: kb_name,
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    const results = resp.data.results || [];
    const isRepeated = results.length > 0 && results[0].is_repeated;

    let suggestion = null;
    if (isRepeated) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      const now = new Date();
      const ts = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      suggestion = `${base}_${ts}${ext}`;
    }

    const result = {
      is_repeated: isRepeated,
      file_name: fileName,
      media_type: mediaType,
      kb_id: kb_id,
      kb_name: kb_name,
      suggestion: suggestion,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);

  } catch (err) {
    const result = {
      error: err.message,
      file_name: fileName,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

main();
