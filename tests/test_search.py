import numpy as np
from server.search import cosine_search, rrf_fuse


def test_cosine_search_basic():
    query = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    embeddings = np.array([
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.7, 0.7, 0.0],
    ], dtype=np.float32)
    ids = [10, 20, 30]
    results = cosine_search(query, embeddings, ids, top_k=2)
    assert results[0][0] == 10
    assert results[0][1] > 0.99
    assert results[1][0] == 30


def test_cosine_search_empty():
    query = np.array([1.0, 0.0], dtype=np.float32)
    embeddings = np.empty((0, 2), dtype=np.float32)
    results = cosine_search(query, embeddings, [], top_k=5)
    assert results == []


def test_cosine_search_zero_vector():
    query = np.array([1.0, 0.0], dtype=np.float32)
    embeddings = np.array([[0.0, 0.0], [1.0, 0.0]], dtype=np.float32)
    ids = [1, 2]
    results = cosine_search(query, embeddings, ids, top_k=2)
    assert len(results) == 2


def test_rrf_fuse_combines():
    keyword = [(1, 0.9), (2, 0.8), (3, 0.7)]
    semantic = [(2, 0.95), (4, 0.85), (1, 0.75)]
    fused = rrf_fuse(keyword, semantic)
    assert fused[0][0] == 2
    assert fused[1][0] == 1


def test_rrf_fuse_empty_inputs():
    assert rrf_fuse([], []) == []


def test_rrf_fuse_one_empty():
    keyword = [(1, 0.9), (2, 0.8)]
    fused = rrf_fuse(keyword, [])
    assert len(fused) == 2
