#!/bin/bash
# 与worker里填写的一样
TOKEN="888"
# 你的worker链接
WORKER_URL="https://xxxx.xxxx.workers.dev"  

# =========================
# 机器唯一ID
# =========================
SERVER_ID=$(cat /etc/machine-id | cut -c1-4 | tr 'a-z' 'A-Z')

# =========================
# 架构
# =========================
ARCH_RAW=$(uname -m)
if [[ "$ARCH_RAW" == "aarch64" ]];
then
    ARCH="ARM"
else
    ARCH="AMD"
fi

# =========================
# 公网IP
# =========================
PUBLIC_IP=$(curl -4 -s --max-time 5 https://api.ipify.org)
[ -z "$PUBLIC_IP" ] && exit 1

# =========================
# 中文城市（只取一次，不重复请求）
# =========================
CITY_JSON=$(curl -s --max-time 8 "http://ip-api.com/json/${PUBLIC_IP}?lang=zh-CN")

CITY=$(echo "$CITY_JSON" | jq -r '.city')
if [[ -z "$CITY" || "$CITY" == "null" ]]; then
    CITY=$(echo "$CITY_JSON" | jq -r '.regionName')
fi

# 清理城市后缀
CITY=$(echo "$CITY" | sed 's/特别市//g;s/广域市//g;s/自治市//g;s/市$//g;s/州$//g;s/都$//g;s/府$//g')

SERVER_NAME="${CITY}-${ARCH}-${SERVER_ID}"

# =========================
# ⭐关键修复：只取“最新订阅文件”并智能筛选端口跳跃 hysteria2
# =========================
SUB_DIR="/etc/v2ray-agent/subscribe_local/default"

if [ ! -d "$SUB_DIR" ]; then
    echo "no subscribe dir"
    exit 1
fi

LATEST_FILE=$(ls -t "$SUB_DIR" 2>/dev/null | head -n 1)

TMP=$(mktemp)

if [ -n "$LATEST_FILE" ]; then
    # 1. 先把基础节点提取出来并去重，存入临时文件
    cat "$SUB_DIR/$LATEST_FILE" | grep -E '://' | sed 's/\r//g' | sort -u > "${TMP}.raw"
    
    # 2. 通过 awk 进行智能筛选：
    #    - 修正匹配条件为 /^hysteria2:\/\//
    #    - 非 hysteria2 协议正常保留。
    #    - hysteria2 协议如果存在多条，优先保留带有端口范围(如 32000-33000)或跳跃参数(mport/hop)的节点；
    #    - 如果没有检测到端口跳跃特征，则保留默认的单端口 hysteria2 节点。
    awk '
    !/^hysteria2:\/\// { print; next }
    /^hysteria2:\/\// {
        # 匹配端口跳跃特征：包含端口范围（- 或 ,）或者包含 mport/hop 参数
        if ($0 ~ /:[0-9]+-[0-9]+/ || $0 ~ /:[0-9]+,[0-9]+/ || $0 ~ /mport=/ || $0 ~ /hop=/) {
            hop_nodes[++hop_cnt] = $0
        } else {
            def_nodes[++def_cnt] = $0
        }
    }
    END {
        if (hop_cnt > 0) {
            for (i=1; i<=hop_cnt; i++) print hop_nodes[i]
        } else if (def_cnt > 0) {
            for (i=1; i<=def_cnt; i++) print def_nodes[i]
        }
    }' "${TMP}.raw" > "$TMP"

    rm -f "${TMP}.raw"
fi

# =========================
# JSON 打包
# =========================
JSON_LINKS=$(jq -R . < "$TMP" | jq -s .)

jq -n \
  --arg sid "$SERVER_ID" \
  --arg sname "$SERVER_NAME" \
  --argjson links "$JSON_LINKS" \
'{
  server_id:$sid,
  server_name:$sname,
  links:$links
}' > /tmp/upload.json

# =========================
# 输出调试
# =========================
echo "上传内容："
cat /tmp/upload.json
echo

# =========================
# 上传至 Worker
# =========================
curl -s -X POST \
"${WORKER_URL}/api/report?token=${TOKEN}" \
-H "Content-Type: application/json" \
-d @/tmp/upload.json

rm -f "$TMP"
rm -f /tmp/upload.json
