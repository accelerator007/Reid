// Retrieval by meaning instead of by substring. The vectors were already being
// written after every run; nothing ever queried them, so the assistant could
// only find a memory whose wording the person happened to repeat.
export function toVectorLiteral(vector) {
  if (!Array.isArray(vector) || !vector.length || vector.length > 4096) return null;
  const numbers = vector.map(Number);
  if (numbers.some(value => !Number.isFinite(value))) return null;
  return `[${numbers.join(',')}]`;
}

export function createRecall({ admin, embed, minSimilarity = 0.3 }) {
  return async function semantic(scopeId, query, { limit = 6 } = {}) {
    const text = String(query ?? '').trim();
    if (!text || !scopeId) return [];
    const literal = toVectorLiteral(await embed(text).catch(() => null));
    if (!literal) return [];
    const { data, error } = await admin.rpc('match_memories', {
      query_embedding: literal, wanted_scope: 'user', wanted_scope_id: scopeId, match_count: limit,
    });
    // Recall is an enhancement. A retrieval failure answers without it rather
    // than failing the reply.
    if (error) { console.error('semantic_recall_unavailable'); return []; }
    return (data || [])
      .filter(row => Number(row?.similarity) >= minSimilarity)
      .map(row => String(row?.content || '').trim())
      .filter(Boolean)
      .slice(0, limit);
  };
}
