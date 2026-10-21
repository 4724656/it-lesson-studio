/** OpenAI-compatible transport. No prompts, credentials or response bodies in telemetry. */
export async function callLlmApi({ apiBase, apiKey, model, messages, temperature = 0.3, signal, onMetadata }) {
  const started = performance.now();
  const metadata = { startedAt: new Date().toISOString(), model, status: 'request_failed' };
  try {
    const response = await fetch(`${apiBase.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature }),
      signal
    });
    metadata.httpStatus = response.status;
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI 服务请求失败 [HTTP ${response.status}]: ${errText}`);
    }
    const data = await response.json();
    const choice = data.choices?.[0];
    metadata.finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;
    metadata.usage = Object.fromEntries(
      ['prompt_tokens', 'completion_tokens', 'total_tokens'].map(key => [
        key, Number.isSafeInteger(data.usage?.[key]) && data.usage[key] >= 0 ? data.usage[key] : null
      ])
    );
    const content = choice?.message?.content || '';
    // Opt-in guard: the legacy path keeps its existing behavior.
    if (onMetadata && ['length', 'max_tokens', 'content_filter'].includes(metadata.finishReason)) {
      metadata.status = 'incomplete';
      throw new Error(`AI 输出未完整结束 (${metadata.finishReason})，未写入本阶段文件`);
    }
    if (!content || (onMetadata && (typeof content !== 'string' || !content.trim()))) {
      metadata.status = 'empty_content';
      throw new Error('AI 未返回有效内容');
    }
    metadata.status = 'success';
    return content;
  } catch (error) {
    if (signal?.aborted) metadata.status = 'cancelled';
    if (error?.name === 'TypeError' && error?.message === 'fetch failed') {
      const cause = error.cause?.message || error.cause?.code || (error.cause ? String(error.cause) : '');
      const detail = cause ? ` (${cause})` : '';
      const enhancedError = new Error(`网络连接失败 [fetch failed${detail}]，请检查 API Base URL 连通性、网络代理或网络环境`);
      enhancedError.cause = error.cause;
      throw enhancedError;
    }
    throw error;
  } finally {
    metadata.elapsedMs = Math.round(performance.now() - started);
    if (onMetadata) {
      // Observability failures must not turn a usable lesson into a failed task.
      try { onMetadata(metadata); } catch { console.warn('AI 元数据记录失败'); }
    }
  }
}
