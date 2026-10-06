import { NextResponse } from 'next/server';

// OrionTV 兼容接口
export const runtime = 'edge';

// 上游取图超时，避免慢源把 Functions 请求挂满
const FETCH_TIMEOUT_MS = 8000;

// 缓存半年会把坏图钉死，改为可较快回源的短缓存
const CACHE_CONTROL =
  'public, max-age=86400, s-maxage=604800, stale-if-error=86400';

function needsDoubanReferer(url: URL): boolean {
  return /(^|\.)douban/i.test(url.hostname);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
  }

  // 该接口已放开登录校验，只允许代理 http(s) 图片
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return NextResponse.json(
      { error: 'Unsupported URL protocol' },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      // 默认不伪装 Referer，多数采集站反而拒绝带站的请求
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    };
    // 豆瓣图站有 Referer 防盗链，只在取豆瓣图时带上
    if (needsDoubanReferer(parsedUrl)) {
      headers.Referer = 'https://movie.douban.com/';
    }

    const imageResponse = await fetch(parsedUrl.toString(), {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: imageResponse.statusText },
        { status: imageResponse.status }
      );
    }

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 502 }
      );
    }

    const contentType = imageResponse.headers.get('content-type') || '';
    // 只回传图片，避免该公开端点被当成任意内容的转发器
    if (!contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json(
        { error: 'Upstream is not an image' },
        { status: 502 }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', CACHE_CONTROL);
    responseHeaders.set('CDN-Cache-Control', 'public, s-maxage=604800');
    responseHeaders.set('Vercel-CDN-Cache-Control', 'public, s-maxage=604800');

    return new Response(imageResponse.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json(
      { error: aborted ? 'Upstream timeout' : 'Error fetching image' },
      { status: aborted ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
