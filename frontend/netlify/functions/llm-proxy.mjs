/**
 * Netlify Function: LLM CORS Proxy
 * 
 * 为前端静态模式提供 LLM API 代理，解决 CORS 问题
 * 支持 OpenAI 和 Anthropic API 格式
 */

export default async (request, context) => {
  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 只接受 POST 请求
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  try {
    // 解析请求体
    const body = await request.json();
    const { endpoint, apiKey, model, apiType = 'openai', messages, temperature = 0.7, max_tokens = 2048 } = body;

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing endpoint' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      if (apiType === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    let response;

    if (apiType === 'anthropic') {
      // Anthropic API 格式
      const systemMessage = messages.find(m => m.role === 'system')?.content || '';
      const userMessages = messages.filter(m => m.role !== 'system');

      response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model || 'claude-3-sonnet-20240229',
          max_tokens,
          temperature,
          system: systemMessage,
          messages: userMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
      });
    } else {
      // OpenAI 兼容 API 格式
      response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages,
          temperature,
        }),
      });
    }

    // 获取响应数据
    const data = await response.json();

    // 返回响应，添加 CORS 头
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('LLM Proxy Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Proxy error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
};
