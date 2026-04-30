import os
from openai import AsyncOpenAI

_client = None
MODEL = "text-embedding-3-small"
MAX_EMBED_CHARS = 24000  # ~6000 tokens
CONTEXT_DUMP_THRESHOLD = 20000


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def truncate_for_embedding(text: str) -> str:
    if len(text) <= MAX_EMBED_CHARS:
        return text
    return text[:MAX_EMBED_CHARS]


def should_skip_embedding(text: str) -> bool:
    return len(text) > CONTEXT_DUMP_THRESHOLD


async def batch_embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _get_client()
    all_embeddings = []
    for i in range(0, len(texts), 2048):
        batch = texts[i:i + 2048]
        response = await client.embeddings.create(model=MODEL, input=batch)
        all_embeddings.extend([d.embedding for d in response.data])
    return all_embeddings
