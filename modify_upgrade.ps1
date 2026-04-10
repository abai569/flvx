with open('C:/Users/57064/flvx/go-backend/internal/http/handler/upgrade.go', 'r', encoding='utf-8') as f:
    lines = f.readlines()

insert_lines = [
    chr(9) + '// 节点上线时重置流量' + chr(10),
    chr(9) + 'h.sendNodeCommandWithTimeout(' + chr(10),
    chr(9) + chr(9) + 'nodeID,' + chr(10),
    chr(9) + chr(9) + '"ResetTraffic",' + chr(10),
    chr(9) + chr(9) + 'map[string]interface{}{' + chr(10),
    chr(9) + chr(9) + chr(9) + '"reason": "节点上线",' + chr(10),
    chr(9) + chr(9) + chr(9) + '"nodeId": nodeID,' + chr(10),
    chr(9) + chr(9) + '},' + chr(10),
    chr(9) + chr(9) + '10*time.Second,' + chr(10),
    chr(9) + chr(9) + 'false,' + chr(10),
    chr(9) + chr(9) + 'false,' + chr(10),
    chr(9) + ')' + chr(10),
    chr(10),
]

new_lines = lines[:416] + insert_lines + lines[416:]

with open('C:/Users/57064/flvx/go-backend/internal/http/handler/upgrade.go', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Done')
