import os
import pytest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("API_KEY", "test-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("TESTING", "1")


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture
def mock_openai():
    """Mock OpenAI embeddings API to return deterministic vectors."""
    async def fake_embed(texts):
        import numpy as np
        return [np.random.default_rng(hash(t) % 2**32).random(1536).astype("float32").tolist() for t in texts]

    with patch("server.embeddings.batch_embed", new_callable=AsyncMock, side_effect=fake_embed) as mock:
        yield mock
