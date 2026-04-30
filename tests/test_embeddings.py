from unittest.mock import AsyncMock, patch, MagicMock
import pytest
from server.embeddings import truncate_for_embedding, should_skip_embedding, batch_embed


def test_truncate_short_text():
    text = "hello world"
    result = truncate_for_embedding(text)
    assert result == text


def test_truncate_long_text():
    text = "word " * 10000  # ~50000 chars
    result = truncate_for_embedding(text)
    assert len(result) <= 24000


def test_should_skip_embedding_short():
    assert should_skip_embedding("hello world") is False


def test_should_skip_embedding_context_dump():
    huge_text = "x" * 20001
    assert should_skip_embedding(huge_text) is True


def test_should_skip_embedding_at_boundary():
    text = "x" * 20000
    assert should_skip_embedding(text) is False


@pytest.mark.asyncio
async def test_batch_embed():
    mock_response = MagicMock()
    mock_response.data = [
        MagicMock(embedding=[0.1] * 1536),
        MagicMock(embedding=[0.2] * 1536),
    ]
    mock_client = MagicMock()
    mock_client.embeddings.create = AsyncMock(return_value=mock_response)

    with patch("server.embeddings._get_client", return_value=mock_client):
        results = await batch_embed(["hello", "world"])
        assert len(results) == 2
        assert len(results[0]) == 1536
