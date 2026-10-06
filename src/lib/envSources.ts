/* eslint-disable no-console */

import type { ApiSite } from './config';

export const ENV_SOURCES_KEY = 'CUSTOM_SOURCES';

export type OverlayApiSite = ApiSite & { disabled?: boolean };

/**
 * 在内置片源之上叠加 CUSTOM_SOURCES 环境变量，使部署方无需重新构建即可增删片源。
 * 环境变量格式与 config.json 的 api_site 同构：
 *   {"iqiyi":{"api":"https://.../provide/vod","name":"iqiyi资源","detail":"https://..."}}
 * 同名 key 覆盖内置源的 api/name/detail；额外支持 disabled 字段用于下线某个源：
 *   {"ruyi":{"disabled":true}}
 */
export function applyEnvSources(
  base: Record<string, ApiSite>,
  rawEnv: string | undefined = process.env[ENV_SOURCES_KEY]
): OverlayApiSite[] {
  const merged = new Map<string, OverlayApiSite>();

  Object.entries(base || {}).forEach(([key, site]) => {
    merged.set(key, { ...site, key, disabled: false });
  });

  const envSources = parseEnvSources(rawEnv);
  envSources.forEach((envSite) => {
    const existing = merged.get(envSite.key);

    if (!existing) {
      if (!envSite.api || !envSite.name) {
        console.warn(
          `${ENV_SOURCES_KEY} 中的 ${envSite.key} 试图禁用不存在的源，已忽略`
        );
        return;
      }
      merged.set(envSite.key, envSite);
      return;
    }

    if (envSite.api) existing.api = envSite.api;
    if (envSite.name) existing.name = envSite.name;
    if (envSite.detail) existing.detail = envSite.detail;
    if (envSite.disabled) existing.disabled = true;
  });

  return Array.from(merged.values());
}

function parseEnvSources(rawEnv: string | undefined): OverlayApiSite[] {
  if (!rawEnv?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawEnv);
  } catch (err) {
    console.error(
      `${ENV_SOURCES_KEY} 不是合法 JSON，已忽略全部环境变量源:`,
      err
    );
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.error(
      `${ENV_SOURCES_KEY} 应为 { key: { api, name, detail?, disabled? } } 结构，已忽略`
    );
    return [];
  }

  const sources: OverlayApiSite[] = [];
  Object.entries(parsed as Record<string, RawEnvSource>).forEach(
    ([key, value]) => {
      const entry = value ?? ({} as RawEnvSource);
      const { api, name, detail, disabled } = entry;

      if (typeof key !== 'string' || !key.trim()) {
        console.warn(`${ENV_SOURCES_KEY} 中存在空的源 key，已忽略`);
        return;
      }

      const disableOnly = disabled === true && !api && !name;
      if (
        !disableOnly &&
        (typeof api !== 'string' ||
          !api.trim() ||
          typeof name !== 'string' ||
          !name.trim())
      ) {
        console.warn(
          `${ENV_SOURCES_KEY} 中的 ${key} 缺少 api 或 name，已忽略（仅禁用请写 {"disabled":true}）`
        );
        return;
      }

      sources.push({
        key: key.trim(),
        api: typeof api === 'string' ? api.trim() : '',
        name: typeof name === 'string' ? name.trim() : '',
        detail: typeof detail === 'string' ? detail.trim() : undefined,
        disabled: disabled === true,
      });
    }
  );

  return sources;
}

type RawEnvSource = {
  api?: unknown;
  name?: unknown;
  detail?: unknown;
  disabled?: unknown;
};
