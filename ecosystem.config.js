module.exports = {
  apps: [{
    name: "claude-memory-sync",
    script: "ingesters/sync_claude_code.py",
    interpreter: "C:/Users/Owen/AppData/Local/Python/pythoncore-3.14-64/python.exe",
    args: "--watch",
    cwd: "C:/dev/claude-memory-mcp",
    env: {
      MEMORY_SERVER_URL: "https://owen-claude-memory.fly.dev",
      API_KEY: "XytIKR_iFdmt0O-MFiYBuouq-YRwSAc64h4vTSn50CM"
    }
  }]
};
