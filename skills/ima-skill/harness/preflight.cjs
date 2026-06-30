#!/usr/bin/env node
'use strict';

/**
 * IMA 预检 Harness — 凭证验证 + API 连通性 + 知识库列表
 *
 * 用法:
 *   node preflight.cjs                          # 检查凭证和 API 连通性
 *   node preflight.cjs --list-kb                # 列出可添加的知识库
 *   node preflight.cjs --resolve-kb <name>      # 解析知识库名称为 ID
 *
 * 输出 (JSON to stdout):
 *   { credentials_ok, api_ok, kb_list?, resolved_kb? }
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

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].replace(/^--/, '');
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[i + 1] : true;
      args[key] = val;
      if (val !== true) i += 1;
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
    return { code: -1, msg: errMsg, _error: true };
  }
}

function checkCredentials() {
  // 检查环境变量
  const envClientId = process.env.IMA_OPENAPI_CLIENTID || process.env.IMA_CLIENT_ID;
  const envApiKey = process.env.IMA_OPENAPI_APIKEY || process.env.IMA_API_KEY;

  // 检查配置文件
  const homeDir = require('node:os').homedir();
  const configClientId = fs.existsSync(path.join(homeDir, '.config', 'ima', 'client_id'));
  const configApiKey = fs.existsSync(path.join(homeDir, '.config', 'ima', 'api_key'));

  const hasEnv = envClientId && envApiKey;
  const hasConfig = configClientId && configApiKey;

  return {
    ok: hasEnv || hasConfig,
    source: hasEnv ? 'environment' : (hasConfig ? 'config_file' : 'none'),
    client_id_present: !!(envClientId || configClientId),
    api_key_present: !!(envApiKey || configApiKey),
  };
}

function main() {
  const args = parseArgs(process.argv);

  // 1. 凭证检查
  const credCheck = checkCredentials();

  if (!credCheck.ok) {
    const result = {
      credentials_ok: false,
      api_ok: false,
      error: '未找到 IMA 凭证。请设置环境变量 IMA_OPENAPI_CLIENTID 和 IMA_OPENAPI_APIKEY，或创建 ~/.config/ima/client_id 和 ~/.config/ima/api_key 文件。',
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // 2. API 连通性检查 + 知识库列表
  const listResp = callImaApi('openapi/wiki/v1/get_addable_knowledge_base_list', {
    cursor: '',
    limit: 50,
  });

  const apiOk = listResp.code === 0;

  if (!apiOk) {
    const result = {
      credentials_ok: true,
      credential_source: credCheck.source,
      api_ok: false,
      error: `API 调用失败: ${listResp.msg || '未知错误'}`,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const kbList = (listResp.data && listResp.data.addable_knowledge_base_list) || [];

  // 3. 解析知识库
  if (args['resolve-kb'] && args['resolve-kb'] !== true) {
    const kbName = args['resolve-kb'];
    const found = kbList.find((kb) => kb.name === kbName);

    if (!found) {
      const result = {
        credentials_ok: true,
        api_ok: true,
        resolved_kb: null,
        error: `知识库 "${kbName}" 不在可添加列表中`,
        available_kbs: kbList.map((kb) => kb.name),
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    const result = {
      credentials_ok: true,
      credential_source: credCheck.source,
      api_ok: true,
      resolved_kb: { id: found.id, name: found.name },
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // 4. 默认输出：凭证 + API + 知识库列表
  const defaultKb = config.default_knowledge_base;
  const defaultKbInList = kbList.find((kb) => kb.name === defaultKb);

  const result = {
    credentials_ok: true,
    credential_source: credCheck.source,
    api_ok: true,
    default_knowledge_base: defaultKb,
    default_kb_resolved: defaultKbInList ? defaultKbInList.id : null,
    addable_knowledge_bases: kbList.map((kb) => ({ id: kb.id, name: kb.name })),
    total_addable: kbList.length,
  };

  if (args['list-kb']) {
    result.kb_list_only = true;
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main();
