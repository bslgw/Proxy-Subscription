const TOKEN = "888"; // 🔒 这里设置你的网页登录密码 / 机器上报 Token

function replaceNodeName(link, serverName) {
  try {
    const hashIndex = link.indexOf("#");
    if (hashIndex === -1) {
      return `${link}#${encodeURIComponent(serverName)}`;
    }

    return link.substring(0, hashIndex + 1) +
           encodeURIComponent(serverName);
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

    return (
      link.substring(0, hashIndex + 1) +
      decodeURIComponent(link.substring(hashIndex + 1))
    );
  } catch {
    return link;
  }
}

// 提取节点协议
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.NODES_STORE) {
      return new Response("KV not bound");
    }

    // ----------------------------------------------------
    // API 路由 1: 节点上报 (供各 VPS 上的 Shell 脚本调用)
    // ----------------------------------------------------
    if (
      request.method === "POST" &&
      url.pathname === "/api/report"
    ) {
      if (url.searchParams.get("token") !== TOKEN) {
        return new Response("Forbidden", { status: 403 });
      }

      const data = await request.json();
      const { server_id, server_name, links } = data;

      if (!server_id || !server_name) {
        return new Response("invalid data", { status: 400 });
      }

      const renamedLinks = (links || []).map(link =>
        replaceNodeName(link, server_name)
      );
      const raw = await env.NODES_STORE.get("servers");
      let servers = raw ? JSON.parse(raw) : [];
      const idx = servers.findIndex(s => s.server_id === server_id);
      
      const item = {
        server_id,
        server_name,
        updated: new Date().toISOString(),
        links: renamedLinks
      };
      if (idx >= 0) {
        servers[idx] = item;
      } else {
        servers.push(item);
      }

      await env.NODES_STORE.put("servers", JSON.stringify(servers));
      return Response.json({ success: true });
    }

    // ----------------------------------------------------
    // API 路由 2: 删除服务器
    // ----------------------------------------------------
    if (
      request.method === "POST" &&
      url.pathname === "/api/delete"
    ) {
      if (url.searchParams.get("token") !== TOKEN) {
        return new Response("Forbidden", { status: 403 });
      }

      const { server_id } = await request.json();
      const raw = await env.NODES_STORE.get("servers");
      let servers = raw ? JSON.parse(raw) : [];
      servers = servers.filter(s => s.server_id !== server_id);
      
      await env.NODES_STORE.put("servers", JSON.stringify(servers));
      return Response.json({ success: true });
    }

    // ----------------------------------------------------
    // 新增 API 路由: 切换节点禁用/启用状态
    // ----------------------------------------------------
    if (
      request.method === "POST" &&
      url.pathname === "/api/toggle-disable"
    ) {
      if (url.searchParams.get("token") !== TOKEN) {
        return new Response("Forbidden", { status: 403 });
      }

      const { link, disable } = await request.json();
      if (!link) return new Response("invalid data", { status: 400 });

      const rawDisabled = await env.NODES_STORE.get("disabled_links");
      let disabledLinks = rawDisabled ? JSON.parse(rawDisabled) : [];

      if (disable) {
        if (!disabledLinks.includes(link)) {
          disabledLinks.push(link);
        }
      } else {
        disabledLinks = disabledLinks.filter(l => l !== link);
      }

      await env.NODES_STORE.put("disabled_links", JSON.stringify(disabledLinks));
      return Response.json({ success: true });
    }

    // ----------------------------------------------------
    // API 路由 3: 客户端纯文本订阅下发 (排除已禁用节点)
    // ----------------------------------------------------
    if (url.pathname === "/sub") {
      if (url.searchParams.get("token") !== TOKEN) {
        return new Response("Forbidden", { status: 403 });
      }

      const raw = await env.NODES_STORE.get("servers");
      const servers = raw ? JSON.parse(raw) : [];
      
      const rawDisabled = await env.NODES_STORE.get("disabled_links");
      const disabledLinks = rawDisabled ? JSON.parse(rawDisabled) : [];

      const output = [];
      for (const server of servers) {
        for (const link of server.links || []) {
          // 只有不在禁用列表里的节点才下发
          if (!disabledLinks.includes(link)) {
            output.push(link);
          }
        }
      }

      return new Response(output.join("\n"), {
        headers: { "Content-Type": "text/plain;charset=utf-8" }
      });
    }

    // ----------------------------------------------------
    // 🔑 核心安全拦截屏障：Web UI 访问控制
    // ----------------------------------------------------
    const clientToken = url.searchParams.get("token");
    const headerToken = request.headers.get("X-Access-Token");
    
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookieToken = cookieHeader.match(/(?:^|; )node_manager_token=([^;]*)/)?.[1];
    
    if (clientToken !== TOKEN && headerToken !== TOKEN && cookieToken !== TOKEN) {
      if (request.headers.get("X-Requested-With") === "XMLHttpRequest") {
        return Response.json({ success: false, msg: "访问密码错误！" }, { status: 401 });
      }

      return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>安全认证 - Oracle Node Manager</title>
<style>
body { margin: 0; background: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
.lock-box { background: white; border: 1px solid #e2e8f0; padding: 35px 30px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); width: 100%; max-width: 360px; text-align: center; }
.logo { font-size: 42px; margin-bottom: 12px; }
.title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
.desc { font-size: 13px; color: #64748b; margin-bottom: 24px; }
.input-pwd { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; font-size: 14px; box-sizing: border-box; margin-bottom: 15px; outline: none; text-align: center; transition: border 0.15s; }
.input-pwd:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
.btn-login { width: 100%; border: none; background: #2563eb; color: white; border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.btn-login:hover { background: #1d4ed8; }
</style>
</head>
<body>
<div class="lock-box">
  <div class="logo">🔒</div>
  <div class="title">安全身份认证</div>
  <div class="desc">系统处于保护状态，请输入访问凭证</div>
  <input type="password" id="pwd" class="input-pwd" placeholder="请输入系统安全 TOKEN" onkeydown="if(event.key==='Enter')verify()">
  <button class="btn-login" onclick="verify()">验证并进入</button>
</div>
<script>
const urlParams = new URLSearchParams(window.location.search);
let savedToken = urlParams.get('token') || localStorage.getItem('node_manager_token');

if(savedToken) {
  fetchDataAndRender(savedToken);
}

async function verify() {
  const input = document.getElementById('pwd').value;
  if(!input) return alert('请输入访问密码！');
  fetchDataAndRender(input);
}

async function fetchDataAndRender(token) {
  const res = await fetch(window.location.pathname, {
    headers: { 'X-Access-Token': token, 'X-Requested-With': 'XMLHttpRequest' }
  });
  if(res.ok) {
    localStorage.setItem('node_manager_token', token);
    document.cookie = "node_manager_token=" + token + "; path=/; max-age=31536000; SameSite=Strict";
    const html = await res.text();
    document.open();
    document.write(html);
    document.close();
    if(urlParams.has('token')) window.history.replaceState({}, '', window.location.pathname);
  } else {
    localStorage.removeItem('node_manager_token');
    document.cookie = "node_manager_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
    alert('认证失败：访问密码无效！');
  }
}
</script>
</body>
</html>
`, { headers: { "content-type": "text/html;charset=utf-8" } });
    }

    // ----------------------------------------------------
    // 🎉 【已登录状态】代码和数据将直接顺畅下发
    // ----------------------------------------------------
    const raw = await env.NODES_STORE.get("servers");
    const servers = raw ? JSON.parse(raw) : [];

    const rawDisabled = await env.NODES_STORE.get("disabled_links");
    const disabledLinks = rawDisabled ? JSON.parse(rawDisabled) : [];

    const processedServers = servers.map(s => {
      const groups = {};
      (s.links || []).forEach(link => {
        const proto = getProtocol(link);
        if (!groups[proto]) groups[proto] = [];
        groups[proto].push(link);
      });
      return { ...s, groups };
    });

    return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Oracle Node Manager</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 20px; background: #f8fafc; color: #334155; font-family: system-ui, -apple-system, sans-serif; }
.container { max-width: 1000px; margin: auto; }
.header { background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); position: relative; }
.title { font-size: 24px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
.stats { font-size: 13px; color: #64748b; margin-bottom: 15px; }
.sub-box { display: flex; gap: 8px; }
.sub-input { flex: 1; border: 1px solid #cbd5e1; border-radius: 10px; background: #f1f5f9; padding: 10px 12px; font-size: 13px; color: #475569; }
.btn { border: none; border-radius: 10px; cursor: pointer; font-weight: 600; padding: 10px 16px; font-size: 13px; transition: all 0.2s; }
.btn-copy { background: #2563eb; color: white; }
.btn-copy:hover { background: #1d4ed8; }
.btn-delete { background: #fee2e2; color: #ef4444; padding: 6px 12px; font-size: 12px; }
.btn-delete:hover { background: #fca5a5; }
.btn-logout { position: absolute; right: 20px; top: 20px; background: #f1f5f9; color: #64748b; padding: 6px 12px; border-radius: 8px; font-size: 12px; border: none; cursor: pointer; font-weight: 600; transition: all 0.2s; }
.btn-logout:hover { background: #fee2e2; color: #ef4444; }

.server-list { display: flex; flex-direction: column; gap: 14px; }
.card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }

.server-info-zone { cursor: pointer; flex: 1; }
.server-name { font-size: 18px; font-weight: 700; color: #1e293b; transition: color 0.15s; user-select: text; }
.server-info-zone:hover .server-name { color: #2563eb; }

.badge { display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 6px; background: #f1f5f9; color: #64748b; font-size: 11px; font-weight: 500; }
.meta { font-size: 12px; color: #94a3b8; margin-bottom: 12px; display: flex; gap: 15px; }

.protocol-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.proto-tag { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; user-select: none; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; }
.proto-tag:hover { background: #dbeafe; }
.proto-tag.active { background: #1d4ed8; color: white; border-color: #1d4ed8; }
.proto-count { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 4px; font-size: 10px; }
.proto-tag.active .proto-count { background: rgba(255,255,255,0.2); }

.links-container { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e2e8f0; flex-direction: column; gap: 8px; }
.links-container.active { display: flex; }
.link-item { display: flex; align-items: center; gap: 10px; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px; padding: 10px 12px; transition: opacity 0.2s; }
.link-item.disabled-status { opacity: 0.55; background: #f1f5f9; border-color: #e2e8f0; }
.link-item.disabled-status .link-text { text-decoration: line-through; color: #94a3b8; }
.link-text { flex: 1; color: #475569; font-size: 13px; word-break: break-all; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.copy-small { flex-shrink: 0; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; color: #334155; font-size: 11px; font-weight: 600; cursor: pointer; }
.copy-small:hover { background: #f1f5f9; border-color: #94a3b8; }

.btn-toggle-disable { flex-shrink: 0; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; color: #64748b; font-size: 11px; font-weight: 600; cursor: pointer; }
.btn-toggle-disable:hover { background: #fee2e2; color: #ef4444; border-color: #fca5a5; }
.btn-toggle-disable.is-disabled { background: #ef4444; color: white; border-color: #ef4444; }
.btn-toggle-disable.is-disabled:hover { background: #dc2626; }
</style>
</head>
<body>

<div class="container">
  <div class="header">
    <div class="title">Oracle Node Manager</div>
    <div class="stats">在线服务器数量：${processedServers.length}</div>
    <button class="btn-logout" onclick="logout()">安全退出</button>
    <div class="sub-box">
      <input id="subUrl" class="sub-input" readonly value="${url.origin}/sub?token=${TOKEN}">
      <button class="btn btn-copy" onclick="copySub()">复制订阅链接</button>
    </div>
  </div>

  <div class="server-list">
    ${processedServers.map((s, sIdx) => {
      const protocols = Object.keys(s.groups);
      return `
      <div class="card" id="card-${sIdx}">
        <div class="card-top">
          <div class="server-info-zone" onclick="collapseAllInCard(${sIdx})">
            <span class="server-name">${escapeHtml(s.server_name)}</span>
            <button class="copy-small" style="margin-left:6px; vertical-align:middle;" onclick="copyLink(\`${s.server_name.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$')}\`, this, event)">复制</button>
            <span class="badge">ID: ${escapeHtml(s.server_id)}</span>
          </div>
          <button class="btn btn-delete" onclick="deleteServer('${s.server_id}')">删除</button>
        </div>
        
        <div class="meta" onclick="collapseAllInCard(${sIdx})" style="cursor:pointer; user-select:none;">
          <div>总节点数：${s.links?.length || 0}</div>
          <div>更新时间：${escapeHtml(s.updated ? s.updated.replace('T', ' ').substring(0, 19) : '未知')}</div>
        </div>

        <div class="protocol-tags">
          ${protocols.length === 0 ? '<span style="font-size:12px;color:#94a3b8;">暂无可用节点</span>' : ''}
          ${protocols.map(proto => `
            <div class="proto-tag" onclick="toggleProtocol(this, 'panel-${sIdx}-${proto}', event)">
              ${proto.toUpperCase()} <span class="proto-count">${s.groups[proto].length}</span>
            </div>
          `).join("")}
        </div>

        ${protocols.map(proto => `
          <div id="panel-${sIdx}-${proto}" class="links-container">
            ${s.groups[proto].map(l => {
              const isDisabled = disabledLinks.includes(l);
              return `
              <div class="link-item ${isDisabled ? 'disabled-status' : ''}">
                <div class="link-text" title="${escapeHtml(displayNodeLink(l))}">
                  ${escapeHtml(displayNodeLink(l))}
                </div>
                <button class="copy-small" onclick="copyLink(\`${l.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$')}\`, this, event)">
                  复制
                </button>
                <button class="btn-toggle-disable ${isDisabled ? 'is-disabled' : ''}" onclick="toggleDisableNode(\`${l.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$')}\`, ${!isDisabled}, this, event)">
                  ${isDisabled ? '已禁用' : '禁用'}
                </button>
              </div>
              `;
            }).join("")}
          </div>
        `).join("")}
      </div>
      `;
    }).join("")}
  </div>
</div>

<script>
function copySub(){
  const el = document.getElementById("subUrl");
  el.select();
  document.execCommand("copy");
  alert("订阅链接已复制到剪贴板");
}

async function copyLink(text, btn, event){
  if(event) event.stopPropagation(); 
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.innerText;
    btn.innerText = "已复制";
    btn.style.background = "#2563eb";
    btn.style.color = "white";
    setTimeout(()=>{
      btn.innerText = old;
      btn.style.background = "white";
      btn.style.color = "#334155";
    }, 1200);
  } catch(e) {
    alert("复制失败");
  }
}

function toggleProtocol(tagEl, panelId, event) {
  if(event) event.stopPropagation();
  const panel = document.getElementById(panelId);
  const wasActive = tagEl.classList.contains('active');
  const card = tagEl.closest('.card');
  card.querySelectorAll('.proto-tag').forEach(t => t.classList.remove('active'));
  card.querySelectorAll('.links-container').forEach(p => p.classList.remove('active'));
  if (!wasActive) {
    tagEl.classList.add('active');
    panel.classList.add('active');
  }
}

function collapseAllInCard(cardIdx) {
  const card = document.getElementById("card-" + cardIdx);
  if (card) {
    card.querySelectorAll('.proto-tag').forEach(t => t.classList.remove('active'));
    card.querySelectorAll('.links-container').forEach(p => p.classList.remove('active'));
  }
}

async function toggleDisableNode(link, shouldDisable, btnEl, event) {
  if(event) event.stopPropagation();
  const token = localStorage.getItem('node_manager_token') || '';
  
  btnEl.disabled = true;
  btnEl.innerText = "处理中...";

  try {
    const res = await fetch("/api/toggle-disable?token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link: link, disable: shouldDisable })
    });
    if(res.ok){
      // 成功后直接刷新页面刷新节点显示状态
      location.reload();
    }else{
      alert("操作失败，请检查登录状态");
      btnEl.disabled = false;
      btnEl.innerText = shouldDisable ? '禁用' : '已禁用';
    }
  } catch(e) {
    alert("网络请求失败");
    btnEl.disabled = false;
  }
}

async function deleteServer(serverId){
  if(!confirm("确定要删除服务器 " + serverId + " 吗?")) return;
  const token = localStorage.getItem('node_manager_token') || '';
  const res = await fetch("/api/delete?token=" + encodeURIComponent(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server_id: serverId })
  });
  if(res.ok){
    location.reload();
  }else{
    alert("删除失败");
  }
}

function logout() {
  localStorage.removeItem('node_manager_token');
  document.cookie = "node_manager_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
  location.reload();
}
</script>
</body>
</html>
`, { 
      headers: { 
        "content-type": "text/html;charset=utf-8",
        "Set-Cookie": `node_manager_token=${TOKEN}; Path=/; Max-Age=31536000; SameSite=Strict`
      } 
    });
  }
};
