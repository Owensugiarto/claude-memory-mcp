import numpy as np


def cosine_search(query_embedding: np.ndarray, all_embeddings: np.ndarray,
                  all_ids: list[int], top_k: int = 20) -> list[tuple[int, float]]:
    if len(all_ids) == 0:
        return []
    query = np.asarray(query_embedding, dtype=np.float32)
    norms = np.linalg.norm(all_embeddings, axis=1) * np.linalg.norm(query) + 1e-10
    sims = all_embeddings @ query / norms
    k = min(top_k, len(all_ids))
    top_indices = np.argsort(sims)[-k:][::-1]
    return [(all_ids[i], float(sims[i])) for i in top_indices]


def rrf_fuse(keyword_results: list[tuple[int, float]],
             semantic_results: list[tuple[int, float]],
             k: int = 60) -> list[tuple[int, float]]:
    scores: dict[int, float] = {}
    for rank, (msg_id, _) in enumerate(keyword_results):
        scores[msg_id] = scores.get(msg_id, 0) + 1.0 / (k + rank + 1)
    for rank, (msg_id, _) in enumerate(semantic_results):
        scores[msg_id] = scores.get(msg_id, 0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
