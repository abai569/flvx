with open("C:/Users/57064/flvx/install.sh", "r", encoding="utf-8") as f:
    lines = f.readlines()

# 在第 381 行后插入（索引 380）
insert_lines = [
    "    \n",
    "    # 安装完成后重置流量\n",
    '    echo "🔄 重置流量统计..."\n',
    "    \n",
    "    # 从 config.json 读取 NODE_ID\n",
    "    NODE_ID=$(cat /etc/flux_agent/config.json 2>/dev/null | grep -o '\"nodeId\"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*')\n",
    "    \n",
    '    if [[ -n "$NODE_ID" ]]; then\n',
    "      # 自动检测是否 HTTPS\n",
    '      if [[ "$SERVER_ADDR" == https://* ]]; then\n',
    '        CURL_CMD="curl -k"\n',
    "      else\n",
    '        CURL_CMD="curl"\n',
    "      fi\n",
    "      \n",
    "      # 调用重置流量 API\n",
    '      ${CURL_CMD} -X POST "${SERVER_ADDR}/api/v1/node/batch-reset-traffic" \\\n',
    '        -H "Content-Type: application/json" \\\n',
    '        -d "{\\"nodeIds\\": [${NODE_ID}], \\"reason\\": \\"节点安装\\"}" \\\n',
    '        2>/dev/null && echo "✅ 流量已重置" || echo "⚠️ 流量重置失败（可手动重置）"\n',
    "    else\n",
    '      echo "⚠️ 无法获取节点 ID，跳过流量重置"\n',
    "    fi\n",
    "    \n",
]

# 在第 381 行后插入（索引 380 之后）
new_lines = lines[:381] + insert_lines + lines[381:]

with open("C:/Users/57064/flvx/install.sh", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Done")
