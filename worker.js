const TOKEN = "888"; // 🔒 这里设置你的网页登录密码 / 机器上报 Token

// ==========================================
// 🛠️ 核心工具函数区
// ==========================================

function replaceNodeName(link, serverName) {
  try {
    const hashIndex = link.indexOf("#");
    if (hashIndex === -1) {
      return `${link}#${encodeURIComponent(serverName)}`;
    }
    return link.substring(0, hashIndex + 1) + encodeURIComponent(serverName);
  } catch {
    return link;
  }
}

function displayNodeLink(link) {
  try {
    const hashIndex = link.indexOf("#");
    if (hashIndex === -1) {
      return link;
    }
    return link.substring(0, hashIndex + 1) + decodeURIComponent(link.substring(hashIndex + 1));
  } catch {
    return link;
  }
}

function getProtocol(link) {
  try {
    const protocol = link.split("://")[0];
    return protocol ? protocol.toLowerCase() : "unknown";
  } catch {
    return "unknown";
  }
}

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeYamlString(str) {
  return str ? str.replace(/"/g, "'").trim() : "";
}

// 精准提取节点中的 IP 或 域名
function parseHost(link) {
  try {
    const url = new URL(link);
    return url.hostname;
  } catch {
    return null;
  }
}

// 自动根据节点名称识别地区并赋予国旗 Emoji
function getRegionEmojiAndGroup(name) {
  const n = name.toUpperCase();
  if (n.includes("香港") || n.includes("HK")) return { emoji: "🇭🇰", group: "🇭🇰 香港节点" };
  if (n.includes("日本") || n.includes("JP") || n.includes("TOKYO")) return { emoji: "🇯🇵", group: "🇯🇵 日本节点" };
  if (n.includes("美国") || n.includes("US") || n.includes("SAN")) return { emoji: "🇺🇸", group: "🇺🇸 美国节点" };
  if (n.includes("首尔") || n.includes("韩国") || n.includes("KR")) return { emoji: "🇰🇷", group: "🇰🇷 韩国节点" };
  if (n.includes("新加坡") || n.includes("SG")) return { emoji: "🇸🇬", group: "🇸🇬 新加坡节点" };
  return { emoji: "🌐", group: "🌐 其它节点" };
}

function parseNodeToClash(link) {
  try {
    const url = new URL(link);
    const protocol = url.protocol.replace(":", "").toLowerCase();
    const hashIndex = link.indexOf("#");
    let originalName = hashIndex !== -1 ? decodeURIComponent(link.substring(hashIndex + 1)) : url.hostname;
    const protoTag = protocol === "vless" ? "[VLESS]" : protocol === "hysteria2" || protocol === "hy2" ? "[Hy2]" : "";
    const { emoji } = getRegionEmojiAndGroup(originalName);
    
    if (!originalName.includes(emoji)) {
      originalName = `${emoji} ${originalName}`;
    }
    const finalName = safeYamlString(`${originalName} ${protoTag}`);

    if (protocol === "vless") {
      const proxy = {
        name: finalName,
        type: "vless",
        server: url.hostname,
        port: parseInt(url.port),
        uuid: url.username,
        udp: true,
        tls: url.searchParams.get("security") === "reality",
        "skip-cert-verify": true,
        network: url.searchParams.get("type") || "tcp"
      };
      if (url.searchParams.get("flow")) proxy["flow"] = url.searchParams.get("flow");
      if (url.searchParams.get("security") === "reality") {
        proxy["reality-opts"] = {
          public_key: url.searchParams.get("pbk") || "",
          short_id: url.searchParams.get("sid") || ""
        };
        if (url.searchParams.get("sni")) proxy["servername"] = url.searchParams.get("sni");
      }
      if (url.searchParams.get("fp")) proxy["client-fingerprint"] = url.searchParams.get("fp");
      return proxy;
    } 
    
    if (protocol === "hysteria2" || protocol === "hy2") {
      return {
        name: finalName,
        type: "hysteria2",
        server: url.hostname,
        port: parseInt(url.port),
        password: url.username,
        udp: true,
        "skip-cert-verify": url.searchParams.get("insecure") === "1",
        servername: url.searchParams.get("sni") || url.hostname
      };
    }
    return null;
  } catch {
    return null;
  }
}

function generateClashYaml(proxies) {
  let yamlProxies = "";
  const regionGroups = {};
  proxies.forEach(p => {
    yamlProxies += `  - name: "${p.name}"\n    type: ${p.type}\n    server: ${p.server}\n    port: ${p.port}\n`;
    if (p.type === "vless") {
      yamlProxies += `    uuid: ${p.uuid}\n    udp: ${p.udp}\n    tls: ${p.tls}\n    skip-cert-verify: ${p["skip-cert-verify"]}\n    network: ${p.network}\n`;
      if (p.flow) yamlProxies += `    flow: ${p.flow}\n`;
      if (p["client-fingerprint"]) yamlProxies += `    client-fingerprint: ${p["client-fingerprint"]}\n`;
      if (p.servername) yamlProxies += `    servername: ${p.servername}\n`;
      if (p["reality-opts"]) {
        yamlProxies += `    reality-opts:\n      public-key: ${p["reality-opts"].public_key}\n      short-id: ${p["reality-opts"].short_id}\n`;
      }
    } else if (p.type === "hysteria2") {
      yamlProxies += `    password: ${p.password}\n    udp: ${p.udp}\n    skip-cert-verify: ${p["skip-cert-verify"]}\n    servername: ${p.servername}\n`;
    }

    const { group } = getRegionEmojiAndGroup(p.name);
    if (!regionGroups[group]) regionGroups[group] = [];
    regionGroups[group].push(p.name);
  });

  let yamlRegionGroups = "";
  const activeGroups = Object.keys(regionGroups);
  
  activeGroups.forEach(gName => {
    yamlRegionGroups += `  - name: "${gName}"\n    type: url-test\n    url: "http://www.gstatic.com/generate_204"\n    interval: 300\n    proxies:\n`;
    regionGroups[gName].forEach(pName => {
      yamlRegionGroups += `      - "${pName}"\n`;
    });
  });
  const allProxyNames = proxies.map(p => `      - "${p.name}"`).join("\n");
  return `port: 7890
socks-port: 7891
allow-lan: true
mode: rule
log-level: info

proxies:
${yamlProxies}

proxy-groups:
  - name: "🚀 节点选择"
    type: select
    proxies:
      - "⚡ 自动测速"
${activeGroups.map(g => `      - "${g}"`).join("\n")}
      - "DIRECT"

  - name: "⚡ 自动测速"
    type: url-test
    url: "http://www.gstatic.com/generate_204"
    interval: 300
    tolerance: 50
    proxies:
${allProxyNames}

${yamlRegionGroups}

rules:
  - DOMAIN-SUFFIX,openai.com,🚀 节点选择
  - DOMAIN-SUFFIX,chatgpt.com,🚀 节点选择
  - DOMAIN-SUFFIX,netflix.com,🚀 节点选择
  - DOMAIN-SUFFIX,google.com,🚀 节点选择
  - GEOIP,CN,DIRECT
  - MATCH,🚀 节点选择
`;
}

// ==========================================
// 🚀 核心适配层（使用底层原生 Sockets）
// ==========================================

import { connect } from 'cloudflare:sockets';

if (typeof addEventListener === "function") {
  addEventListener("fetch", event => {
    event.respondWith(handleRequest(event.request, globalThis));
  });
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const STORE = env.NODES_STORE || globalThis.NODES_STORE;
  if (!STORE) {
    return new Response("KV namespace 'NODES_STORE' not bound.", { status: 500 });
  }

  // 1. API: 节点上报
  if (request.method === "POST" && url.pathname === "/api/report") {
    if (url.searchParams.get("token") !== TOKEN) return new Response("Forbidden", { status: 403 });
    const data = await request.json();
    const { server_id, server_name, links } = data;
    if (!server_id || !server_name) return new Response("invalid data", { status: 400 });
    const renamedLinks = (links || []).map(link => replaceNodeName(link, server_name));
    const raw = await STORE.get("servers");
    let servers = raw ? JSON.parse(raw) : [];
    const idx = servers.findIndex(s => s.server_id === server_id  && s.server_name === server_name);
    
    const item = { server_id, server_name, updated: new Date().toISOString(), links: renamedLinks };
    if (idx >= 0) servers[idx] = item;
    else servers.push(item);

    await STORE.put("servers", JSON.stringify(servers));
    return Response.json({ success: true });
  }

  // 2. API: 删除服务器（修改为 server_id + server_name 判断）
  if (request.method === "POST" && url.pathname === "/api/delete") {
    if (url.searchParams.get("token") !== TOKEN) return new Response("Forbidden", { status: 403 });
    const { server_id, server_name } = await request.json(); // 接收 server_name
    const raw = await STORE.get("servers");
    let servers = raw ? JSON.parse(raw) : [];
    servers = servers.filter(s => !(s.server_id === server_id && s.server_name === server_name)); // 联合判断删除
    await STORE.put("servers", JSON.stringify(servers));
    return Response.json({ success: true });
  }

  // 3. API: 切换禁用/启用
  if (request.method === "POST" && url.pathname === "/api/toggle-disable") {
    if (url.searchParams.get("token") !== TOKEN) return new Response("Forbidden", { status: 403 });
    const { link, disable } = await request.json();
    if (!link) return new Response("invalid data", { status: 400 });
    const rawDisabled = await STORE.get("disabled_links");
    let disabledLinks = rawDisabled ? JSON.parse(rawDisabled) : [];
    if (disable) {
      if (!disabledLinks.includes(link)) disabledLinks.push(link);
    } else {
      disabledLinks = disabledLinks.filter(l => l !== link);
    }
    await STORE.put("disabled_links", JSON.stringify(disabledLinks));
    return Response.json({ success: true });
  }

  
  // 3. API: 切换禁用/启用
  if (request.method === "POST" && url.pathname === "/api/toggle-disable") {
    if (url.searchParams.get("token") !== TOKEN) return new Response("Forbidden", { status: 403 });
    const { link, disable } = await request.json();
    if (!link) return new Response("invalid data", { status: 400 });
    const rawDisabled = await STORE.get("disabled_links");
    let disabledLinks = rawDisabled ? JSON.parse(rawDisabled) : [];
    if (disable) {
      if (!disabledLinks.includes(link)) disabledLinks.push(link);
    } else {
      disabledLinks = disabledLinks.filter(l => l !== link);
    }
    await STORE.put("disabled_links", JSON.stringify(disabledLinks));
    return Response.json({ success: true });
  }

  // 4. API: 客户端下发订阅
  if (url.pathname === "/sub" || url.pathname === "/clash") {
    if (url.searchParams.get("token") !== TOKEN) return new Response("Forbidden", { status: 403 });
    const [rawServers, rawDisabled] = await Promise.all([
      STORE.get("servers"),
      STORE.get("disabled_links")
    ]);
    const servers = rawServers ? JSON.parse(rawServers) : [];
    const disabledLinks = rawDisabled ? JSON.parse(rawDisabled) : [];

    const activeLinks = [];
    for (const server of servers) {
      for (const link of server.links || []) {
        if (!disabledLinks.includes(link) && link.trim() !== "") {
          activeLinks.push(link);
        }
      }
    }

    const uniqueLinks = [...new Set(activeLinks)];
    if (url.pathname === "/clash" || url.searchParams.get("flag") === "clash") {
      const clashProxies = uniqueLinks.map(l => parseNodeToClash(l)).filter(p => p !== null);
      const yamlContent = generateClashYaml(clashProxies);
      return new Response(yamlContent, {
        headers: { 
          "Content-Type": "application/x-yaml;charset=utf-8",
          "Content-Disposition": "attachment; filename=Clash_Sub.yaml"
        }
      });
    }

    return new Response(uniqueLinks.join("\n"), {
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
  }

  // 5. WEB UI: 登录拦截
  const clientToken = url.searchParams.get("token");
  const headerToken = request.headers.get("X-Access-Token");
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookieToken = cookieHeader.match(/(?:^|; )node_manager_token=([^;]*)/)?.[1];
  if (clientToken !== TOKEN && headerToken !== TOKEN && cookieToken !== TOKEN) {
    if (request.headers.get("X-Requested-With") === "XMLHttpRequest") {
      return Response.json({ success: false, msg: "密码错误！" }, { status: 401 });
    }
    return new Response(getLoginHtml(), { headers: { "content-type": "text/html;charset=utf-8" } });
  }

  // 6. WEB UI: 渲染管理面板首页
  const [rawServers, rawDisabled] = await Promise.all([
    STORE.get("servers"),
    STORE.get("disabled_links")
  ]);
  const servers = rawServers ? JSON.parse(rawServers) : [];
  const disabledLinks = rawDisabled ? JSON.parse(rawDisabled) : [];

  let totalNodesCount = 0;
  let activeNodesCount = 0;
  
  const processedServers = servers.map(s => {
    const groups = {};
    (s.links || []).forEach(link => {
      if (link && link.trim() !== "") {
        totalNodesCount++;
        if (!disabledLinks.includes(link)) {
          activeNodesCount++;
        }
      }
      const proto = getProtocol(link);
      if (!groups[proto]) groups[proto] = [];
      groups[proto].push(link);
    });
    return { ...s, groups };
  });

  // 💡 在 Worker 服务端：不再纠结任何代理端口，直接通过 TCP 探测每台机器 IP 是否存活
  const statusResults = await Promise.all(
    processedServers.map(async (s) => {
      // 随机挑一个节点的链接用来取 IP/域名
      const anyLink = (s.links || []).find(l => l && l.trim() !== "");
      if (!anyLink) return { server_id: s.server_id, online: false };
      
      const host = parseHost(anyLink);
      if (!host) return { server_id: s.server_id, online: false };

      let socket;
      try {
        // 设置极短的 1.0 秒网络超时
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000));
        
        const connectPromise = (async () => {
          // 💡 盲测核心：随便拨打一个常规网络端口（如 443）。
          // 无论是 A 还是 B，只要触发了非超时结果，就 100% 确认机器 IP 畅通。
          socket = connect({ hostname: host, port: 443 });
          await socket.opened;
        })();

        await Promise.race([connectPromise, timeoutPromise]);
        
        try { socket.close(); } catch(_) {}
        return { server_id: s.server_id, online: true };
      } catch (err) {
        try { if(socket) socket.close(); } catch(_) {}
        // 如果错误类型是“Connection refused”或者协议握手失败（非 timeout），说明 IP 通了但端口没开服务，这依然判定在线
        if (err && err.message && (err.message.includes('refused') || !err.message.includes('timeout'))) {
          return { server_id: s.server_id, online: true };
        }
        // 唯独彻底超时无任何包响应，判定为彻底断网离线
        return { server_id: s.server_id, online: false };
      }
    })
  );

  const statusMap = Object.fromEntries(statusResults.map(r => [r.server_id, r.online]));

  return new Response(getDashboardHtml(processedServers, disabledLinks, url.origin, totalNodesCount, activeNodesCount, statusMap), { 
    headers: { 
      "content-type": "text/html;charset=utf-8",
      "Set-Cookie": `node_manager_token=${TOKEN}; Path=/; Max-Age=31536000; SameSite=Strict`
    } 
  });
}

// ==========================================
// 🎨 前端 HTML 静态模板
// ==========================================
function getLoginHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>安全认证</title><style>body { margin: 0; background: #f8fafc; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }.lock-box { background: white; border: 1px solid #e2e8f0; padding: 35px 30px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); width: 100%; max-width: 360px; text-align: center; }.logo { font-size: 42px; margin-bottom: 12px; }.title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }.desc { color: #64748b; margin-bottom: 24px; font-size: 13px; }.input-pwd { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; font-size: 14px; box-sizing: border-box; margin-bottom: 15px; outline: none; text-align: center; }.btn-login { width: 100%; border: none; background: #2563eb; color: white; border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 600; cursor: pointer; }</style></head><body><div class="lock-box"><div class="logo">🔒</div><div class="title">安全身份认证</div><div class="desc">系统处于保护状态，请输入访问凭证</div><input type="password" id="pwd" class="input-pwd" placeholder="请输入系统安全 TOKEN" onkeydown="if(event.key==='Enter')verify()"><button class="btn-login" onclick="verify()">验证并进入</button></div><script>const urlParams = new URLSearchParams(window.location.search);let savedToken = urlParams.get('token') || localStorage.getItem('node_manager_token');if(savedToken) fetchDataAndRender(savedToken);async function verify() { const input = document.getElementById('pwd').value; if(!input) return alert('请输入访问密码！'); fetchDataAndRender(input); }async function fetchDataAndRender(token) { const res = await fetch(window.location.pathname, { headers: { 'X-Access-Token': token, 'X-Requested-With': 'XMLHttpRequest' } }); if(res.ok) { localStorage.setItem('node_manager_token', token); document.cookie = "node_manager_token=" + token + "; path=/; max-age=31536000; SameSite=Strict"; const html = await res.text(); document.open(); document.write(html); document.close(); } else { alert('认证失败！'); } }</script></body></html>`;
}

function getDashboardHtml(processedServers, disabledLinks, origin, totalNodesCount, activeNodesCount, statusMap) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>轻量VPS订阅管理</title><style>*{box-sizing:border-box;}body{margin:0;padding:20px;background:#f8fafc;color:#334155;font-family:system-ui,-apple-system,sans-serif;}.container{max-width:1000px;margin:auto;}.header{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);position:relative;}.title{font-size:24px;font-weight:700;color:#1e293b;margin-bottom:4px;}.stats{font-size:13px;color:#64748b;margin-bottom:15px;display:flex;gap:15px;flex-wrap:wrap;}.sub-box{display:flex;flex-direction:column;gap:10px;margin-top:5px;}.sub-row{display:flex;gap:8px;align-items:center;}.sub-label{font-size:12px;font-weight:600;color:#64748b;width:90px;}.sub-input{flex:1;border:1px solid #cbd5e1;border-radius:10px;background:#f1f5f9;padding:10px 12px;font-size:13px;color:#475569;}.btn{border:none;border-radius:10px;cursor:pointer;font-weight:600;padding:10px 16px;font-size:13px;transition:all 0.2s;}.btn-copy{background:#2563eb;color:white;}.btn-copy:hover{background:#1d4ed8;}.btn-clash{background:#10b981;color:white;}.btn-clash:hover{background:#059669;}.btn-delete{background:#fee2e2;color:#ef4444;padding:6px 12px;font-size:12px;}.btn-logout{position:absolute;right:20px;top:20px;background:#f1f5f9;color:#64748b;padding:6px 12px;border-radius:8px;font-size:12px;border:none;cursor:pointer;font-weight:600;}.server-list{display:flex;flex-direction:column;gap:14px;}.card{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);}.card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}.server-info-zone{cursor:pointer;flex:1;display:inline-flex;align-items:center;}.server-name{font-size:18px;font-weight:700;color:#1e293b;}.badge{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#64748b;font-size:11px;font-weight:500;}.status-dot{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;}.status-online{background:#ecfdf5;color:#059669;}.status-offline{background:#fef2f2;color:#dc2626;}.meta{font-size:12px;color:#94a3b8;margin-bottom:12px;display:flex;gap:15px;}.protocol-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}.proto-tag{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}.proto-tag.active{background:#1d4ed8;color:white;border-color:#1d4ed8;}.proto-count{background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:4px;font-size:10px;}.proto-tag.active .proto-count{background:rgba(255,255,255,0.2);}.links-container{display:none;margin-top:12px;padding-top:12px;border-top:1px dashed #e2e8f0;flex-direction:column;gap:8px;}.links-container.active{display:flex;}.link-item{display:flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid #f1f5f9;border-radius:8px;padding:10px 12px;}.link-item.disabled-status{opacity:0.55;background:#f1f5f9;}.link-item.disabled-status .link-text{text-decoration:line-through;color:#94a3b8;}.link-text{flex:1;color:#475569;font-size:13px;word-break:break-all;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.copy-small{flex-shrink:0;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;background:white;font-size:11px;cursor:pointer;}.btn-toggle-disable{flex-shrink:0;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;color:#64748b;font-size:11px;cursor:pointer;}.btn-toggle-disable.is-disabled{background:#ef4444;color:white;border-color:#ef4444;}</style></head><body><div class="container"><div class="header"><div class="title">轻量VPS订阅管理</div><div class="stats"><span>在线 VPS 数量：${processedServers.length}</span><span>总节点数量：${totalNodesCount}</span><span>激活节点数量：${activeNodesCount}</span></div><button class="btn-logout" onclick="logout()">安全退出</button><div class="sub-box"><div class="sub-row"><span class="sub-label">通用纯文本：</span><input id="subUrl" class="sub-input" readonly value="${origin}/sub?token=${TOKEN}"><button class="btn btn-copy" onclick="copySub('subUrl')">复制链接</button></div><div class="sub-row"><span class="sub-label">Clash 订阅：</span><input id="clashUrl" class="sub-input" readonly value="${origin}/clash?token=${TOKEN}"><button class="btn btn-clash" onclick="copySub('clashUrl')">复制链接</button></div></div></div><div class="server-list">${processedServers.map((s, sIdx) => { const protocols = Object.keys(s.groups); 

  // 读取 Worker 纯服务端底层 TCP 盲测 IP 响应的数据
  const isOnline = statusMap[s.server_id] || false;
  const statusHtml = isOnline 
    ? `<span class="status-dot status-online">🟢 在线</span>`
    : `<span class="status-dot status-offline">🔴 离线</span>`;

  return `<div class="card" id="card-${sIdx}"><div class="card-top"><div class="server-info-zone" onclick="collapseAllInCard(${sIdx})"><span class="server-name">${escapeHtml(s.server_name)}</span><button class="copy-small" style="margin-left:6px; vertical-align:middle;" onclick="copyLink(\`${s.server_name.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$')}\`, this, event)">复制</button><span class="badge">ID: ${escapeHtml(s.server_id)}</span>${statusHtml}</div><button class="btn btn-delete" onclick="deleteServer('${s.server_id}','${escapeHtml(s.server_name)}')">删除</button></div><div class="meta" onclick="collapseAllInCard(${sIdx})" style="cursor:pointer; user-select:none;"><div>总节点数：${s.links?.length || 0}</div><div>上报时间：${escapeHtml(s.updated ? s.updated.replace('T', ' ').substring(0, 19) : '未知')}</div></div><div class="protocol-tags">${protocols.length === 0 ? '<span style="font-size:12px;color:#94a3b8;">暂无可用节点</span>' : ''}${protocols.map(proto => `<div class="proto-tag" onclick="toggleProtocol(this, 'panel-${sIdx}-${proto}', event)">${proto.toUpperCase()} <span class="proto-count">${s.groups[proto].length}</span></div>`).join("")}</div>${protocols.map(proto => `<div id="panel-${sIdx}-${proto}" class="links-container">${s.groups[proto].map(l => { const isDisabled = disabledLinks.includes(l); return `<div class="link-item ${isDisabled ? 'disabled-status' : ''}"><div class="link-text" title="${escapeHtml(displayNodeLink(l))}">${escapeHtml(displayNodeLink(l))}</div><button class="copy-small" onclick="copyLink(\`${l.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$')}\`, this, event)">复制</button><button class="btn-toggle-disable ${isDisabled ? 'is-disabled' : ''}" onclick="toggleDisableNode(\`${l.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$')}\`, ${!isDisabled}, this, event)">${isDisabled ? '已禁用' : '禁用'}</button></div>`; }).join("")}</div>`).join("")}</div>`; }).join("")}</div></div><script>function copySub(id){ const el = document.getElementById(id); el.select(); document.execCommand("copy"); alert("链接已成功复制到剪贴板"); }async function copyLink(text, btn, event){ if(event) event.stopPropagation(); try { await navigator.clipboard.writeText(text); const old = btn.innerText; btn.innerText = "已复制"; btn.style.background = "#2563eb"; btn.style.color = "white"; setTimeout(()=>{ btn.innerText = old; btn.style.background = "white"; btn.style.color = "#334155"; }, 1200); } catch(e) { alert("复制失败"); } }function toggleProtocol(tagEl, panelId, event) { if(event) event.stopPropagation(); const panel = document.getElementById(panelId); const wasActive = tagEl.classList.contains('active'); const card = tagEl.closest('.card'); card.querySelectorAll('.proto-tag').forEach(t => t.classList.remove('active')); card.querySelectorAll('.links-container').forEach(p => p.classList.remove('active')); if (!wasActive) { tagEl.classList.add('active'); panel.classList.add('active'); } }function collapseAllInCard(cardIdx) { const card = document.getElementById("card-" + cardIdx); if (card) { card.querySelectorAll('.proto-tag').forEach(t => t.classList.remove('active')); card.querySelectorAll('.links-container').forEach(p => p.classList.remove('active')); } }async function toggleDisableNode(link, shouldDisable, btnEl, event) { if(event) event.stopPropagation(); const token = localStorage.getItem('node_manager_token') || ''; btnEl.disabled = true; btnEl.innerText = "处理中..."; try { const res = await fetch("/api/toggle-disable?token=" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link: link, disable: shouldDisable }) }); if(res.ok){ location.reload(); }else{ alert("操作失败，请检查登录状态"); btnEl.disabled = false; btnEl.innerText = shouldDisable ? '禁用' : '已禁用'; } } catch(e) { alert("网络请求失败"); btnEl.disabled = false; } } async function deleteServer(serverId, serverName){ if(!confirm("确定要删除服务器 " + serverId + " 吗?")) return; const token = localStorage.getItem('node_manager_token') || ''; const res = await fetch("/api/delete?token=" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ server_id: serverId,server_name: serverName }) }); if(res.ok){ location.reload(); }else{ alert("删除失败"); } }function logout() { localStorage.removeItem('node_manager_token'); document.cookie = "node_manager_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;"; location.reload(); }</script></body></html>`;
}
