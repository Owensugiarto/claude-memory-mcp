import json
import os
import pytest
from ingesters.sync_claude_code import extract_content, parse_jsonl_entry, should_include_entry


def make_entry(type_="user", role="user", content="hello", uuid="u1", timestamp="2026-04-30T10:00:00Z"):
    entry = {
        "type": type_,
        "uuid": uuid,
        "timestamp": timestamp,
        "sessionId": "s1",
        "message": {
            "role": role,
            "content": content,
        },
    }
    return entry


def test_should_include_user():
    assert should_include_entry(make_entry(type_="user")) is True


def test_should_include_assistant():
    assert should_include_entry(make_entry(type_="assistant", role="assistant")) is True


def test_should_exclude_progress():
    assert should_include_entry(make_entry(type_="progress")) is False


def test_extract_content_string():
    assert extract_content("hello world") == "hello world"


def test_extract_content_array_text_only():
    content = [
        {"type": "text", "text": "hello "},
        {"type": "text", "text": "world"},
    ]
    assert extract_content(content) == "hello world"


def test_extract_content_array_skip_tool_use():
    content = [
        {"type": "text", "text": "thinking..."},
        {"type": "tool_use", "id": "t1", "name": "Bash", "input": {}},
    ]
    assert extract_content(content) == "thinking..."


def test_extract_content_array_skip_thinking():
    content = [
        {"type": "thinking", "thinking": "hmm"},
        {"type": "text", "text": "answer"},
    ]
    assert extract_content(content) == "answer"


def test_extract_content_thinking_only():
    content = [{"type": "thinking", "thinking": "hmm"}]
    assert extract_content(content) == ""


def test_extract_content_tool_result():
    content = [{"type": "tool_result", "tool_use_id": "t1", "content": "output"}]
    assert extract_content(content) == ""


def test_parse_jsonl_entry_valid():
    entry = make_entry()
    result = parse_jsonl_entry(entry)
    assert result is not None
    assert result["uuid"] == "u1"
    assert result["role"] == "user"
    assert result["content"] == "hello"


def test_parse_jsonl_entry_empty_content():
    entry = make_entry(content=[{"type": "thinking", "thinking": "..."}])
    result = parse_jsonl_entry(entry)
    assert result is None


def test_parse_jsonl_entry_progress():
    entry = make_entry(type_="progress")
    result = parse_jsonl_entry(entry)
    assert result is None
