with open("C:/Users/57064/flvx/install.sh", "r", encoding="utf-8") as f:
    content = f.read()

# 找到插入位置（在 "done" 之后，"echo 配置目录" 之前）
old_code = '''    done
    
    
    echo "📁 配置目录：$INSTALL_DIR"'''

new_code = '''    done
    
    # 安装完成后重置流量
    echo "🔄 重置流量统计..."
    
    # 从 config.json 读取 NODE_ID
    NODE_ID=$(cat /etc/flux_agent/config.json 2>/dev/null | grep -o '"nodeId"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*')
    
    if [[ -n "$NODE_ID" ]]; then
      # 自动检测是否 HTTPS
      if [[ "$SERVER_ADDR" == https://* ]]; then
        CURL_CMD="curl -k"
      else
        CURL_CMD="curl"
      fi
      
      # 调用重置流量 API
      ${CURL_CMD} -X POST "${SERVER_ADDR}/api/v1/node/batch-reset-traffic" \\
        -H "Content-Type: application/json" \\
        -d "{\\\"nodeIds\\\": [${NODE_ID}], \\\"reason\\\": \\\"节点安装\\\"}" \\
        2>/dev/null && echo "✅ 流量已重置" || echo "⚠️ 流量重置失败（可手动重置）"
    else
      echo "⚠️ 无法获取节点 ID，跳过流量重置"
    fi
    
    echo "📁 配置目录：$INSTALL_DIR"'''

content = content.replace(old_code, new_code)

with open("C:/Users/57064/flvx/install.sh", "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
