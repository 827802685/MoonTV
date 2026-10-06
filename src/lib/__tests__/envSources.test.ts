import { ApiSite } from '../config';
import { applyEnvSources } from '../envSources';

const base: Record<string, ApiSite> = {
  ruyi: {
    key: 'ruyi',
    api: 'http://cj.rycjapi.com/api.php/provide/vod',
    name: '如意资源',
  },
  heimuer: {
    key: 'heimuer',
    api: 'https://json.heimuer.xyz/api.php/provide/vod',
    name: '黑木耳',
    detail: 'https://heimuer.tv',
  },
};

describe('applyEnvSources', () => {
  it('没有环境变量时原样返回内置源', () => {
    expect(applyEnvSources(base, undefined)).toEqual([
      { ...base.ruyi, disabled: false },
      { ...base.heimuer, disabled: false },
    ]);
  });

  it('追加新源并保持内置源在前', () => {
    const result = applyEnvSources(
      base,
      JSON.stringify({
        iqiyi: {
          api: 'https://www.iqiyizyapi.com/api.php/provide/vod',
          name: 'iqiyi资源',
        },
      })
    );

    expect(result.map((s) => s.key)).toEqual(['ruyi', 'heimuer', 'iqiyi']);
    expect(result[2]).toMatchObject({
      name: 'iqiyi资源',
      disabled: false,
    });
  });

  it('同名 key 覆盖 api 与 detail', () => {
    const result = applyEnvSources(
      base,
      JSON.stringify({
        ruyi: {
          api: 'https://cj.rycjapi.com/api.php/provide/vod',
          name: '如意资源',
        },
      })
    );

    expect(result.find((s) => s.key === 'ruyi')?.api).toBe(
      'https://cj.rycjapi.com/api.php/provide/vod'
    );
  });

  it('支持只写 disabled 下线某个内置源', () => {
    const result = applyEnvSources(
      base,
      JSON.stringify({ ruyi: { disabled: true } })
    );

    expect(result.find((s) => s.key === 'ruyi')).toMatchObject({
      disabled: true,
      api: base.ruyi.api,
    });
  });

  it('忽略禁用不存在源的条目', () => {
    const result = applyEnvSources(
      base,
      JSON.stringify({ nope: { disabled: true } })
    );

    expect(result.find((s) => s.key === 'nope')).toBeUndefined();
  });

  it('非法 JSON 时保留内置源而不是抛错', () => {
    expect(applyEnvSources(base, '{oops')).toEqual([
      { ...base.ruyi, disabled: false },
      { ...base.heimuer, disabled: false },
    ]);
  });

  it('缺少 api 或 name 的单条被跳过，其余仍生效', () => {
    const result = applyEnvSources(
      base,
      JSON.stringify({
        broken: { name: '缺地址' },
        ok: {
          api: 'https://ok.example.com/api.php/provide/vod',
          name: '可用源',
        },
      })
    );

    expect(result.map((s) => s.key)).toEqual(['ruyi', 'heimuer', 'ok']);
  });

  it('数组等非对象结构直接忽略', () => {
    expect(applyEnvSources(base, '[]')).toHaveLength(2);
  });
});
