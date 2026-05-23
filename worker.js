// ==========================================
// 🔒 安全配置
// ==========================================
const SECRETPASSWORD = "bbsok828"; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!env.NODES_STORE) return new Response("錯誤：未綁定 KV", { status: 500 });

    const userToken = url.searchParams.get('token');
    if (userToken !== SECRETPASSWORD) return new Response("404 Not Found", { status: 404 });

    const getProtocol = (link) => {
      try { return link.split('://')[0].toLowerCase(); } catch (e) { return 'unknown'; }
    };

    // --- 路由 1: 檢測接口 ---
    if (url.pathname === '/api/check') {
      const host = url.searchParams.get('host');
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        await fetch(`http://${host}`, { mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeout);
        return new Response(JSON.stringify({ online: true }));
      } catch (e) {
        return new Response(JSON.stringify({ online: false }));
      }
    }

    // --- 路由 2: 訂閱接口 ---
    if (url.pathname === '/sub') {
      const rawData = await env.NODES_STORE.get('nodes_list');
      let nodes = rawData ? JSON.parse(rawData) : [];
      nodes.sort((a, b) => getProtocol(a.link).localeCompare(getProtocol(b.link)));
      const subText = nodes.map(n => {
        const proto = getProtocol(n.link).toUpperCase();
        return `${n.link.split('#')[0]}#[${proto}] ${n.originalName || '未命名'}`;
      }).join('\n');
      return new Response(subText, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // --- 路由 3: 保存與刪除 ---
    if (request.method === 'POST' && (url.pathname === '/api/save' || url.pathname === '/api/delete')) {
      const rawData = await env.NODES_STORE.get('nodes_list');
      let nodes = rawData ? JSON.parse(rawData) : [];
      const body = await request.json();

      if (url.pathname === '/api/save') {
        const { id, link, customName } = body;
        const cleanLink = link.trim().split('#')[0];
        if (id) {
          const i = nodes.findIndex(n => n.id === id);
          if (i !== -1) nodes[i] = { id, originalName: customName, link: cleanLink };
        } else {
          nodes.push({ id: Date.now().toString(), originalName: customName, link: cleanLink });
        }
      } else {
        nodes = nodes.filter(n => n.id !== body.id);
      }
      await env.NODES_STORE.put('nodes_list', JSON.stringify(nodes));
      return new Response(JSON.stringify({ success: true }));
    }

    // --- 路由 4: 管理介面 ---
    const rawData = await env.NODES_STORE.get('nodes_list');
    const currentNodes = rawData ? JSON.parse(rawData) : [];
    const groupedNodes = currentNodes.reduce((acc, node) => {
      const p = getProtocol(node.link);
      if (!acc[p]) acc[p] = [];
      acc[p].push(node);
      return acc;
    }, {});

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dae 管理器</title>
      <style>
        body { font-family: system-ui; background: #f4f7f9; max-width: 700px; margin: 20px auto; padding: 0 15px; }
        .card { background: white; padding: 18px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 15px; }
        .node-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee; }
        .status-dot { width: 20px; display: inline-block; text-align: center; }
        .online { color: #28a745; } .offline { color: #dc3545; }
        .group-tag { background: #e8f0fe; color: #1a73e8; padding: 3px 8px; font-size: 11px; font-weight: bold; border-radius: 4px; margin-top: 10px; display: inline-block; }
        .sub-url { background: #fffbe6; padding: 10px; font-family: monospace; font-size: 11px; border: 1px dashed #ffe58f; word-break: break-all; margin-bottom: 10px; }
        textarea, input { width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 14px; }
        button { cursor: pointer; border: none; border-radius: 6px; padding: 10px 15px; font-weight: bold; transition: 0.2s; }
        .btn-main { background: #1a73e8; color: white; width: 100%; margin-top: 8px; }
        .btn-cancel { background: #6c757d; color: white; width: 100%; margin-top: 8px; display: none; }
        .btn-edit { background: #34a853; color: white; font-size: 11px; padding: 5px 10px; }
        .btn-del { background: #ea4335; color: white; font-size: 11px; padding: 5px 10px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="sub-url">${url.origin}/sub?token=${SECRETPASSWORD}</div>
      </div>

      <div class="card">
        <h4 id="formTitle" style="margin:0 0 10px">➕ 添加節點</h4>
        <input type="hidden" id="nodeId">
        <input type="text" id="nodeName" placeholder="節點名稱">
        <textarea id="nodeLink" rows="2" placeholder="vless://..."></textarea>
        <button class="btn-main" onclick="saveNode()" id="saveBtn">保存到雲端</button>
        <button class="btn-cancel" onclick="resetForm()" id="cancelBtn">取消修改</button>
      </div>

      <div class="card">
        <h4 style="margin:0 0 10px">📋 節點列表</h4>
        ${Object.entries(groupedNodes).map(([proto, items]) => `
          <div class="group-tag">${proto.toUpperCase()}</div>
          ${items.map(n => `
            <div class="node-item">
              <div style="flex:1; min-width:0; margin-right:10px;">
                <div style="font-size:14px; font-weight:600;">
                  <span id="status-${n.id}" class="status-dot">⏳</span> ${n.originalName}
                </div>
                <div style="font-size:11px; color:#999; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${n.link}</div>
              </div>
              <div style="display:flex; gap:5px;">
                <button class="btn-edit" onclick='editNode(${JSON.stringify(n)})'>修改</button>
                <button class="btn-del" onclick="deleteNode('${n.id}')">刪除</button>
              </div>
            </div>
          `).join('')}
        `).join('')}
      </div>

      <script>
        const token = new URLSearchParams(window.location.search).get('token');
        const nodesData = ${JSON.stringify(currentNodes)};

        function getHost(link) {
          try {
            const match = link.match(/@([^/:?#]+)/);
            return match ? match[1] : null;
          } catch(e) { return null; }
        }

        async function checkAll() {
          for (const n of nodesData) {
            const host = getHost(n.link);
            const el = document.getElementById('status-' + n.id);
            if(!host) { el.innerText = '❓'; continue; }
            
            fetch('/api/check?token=' + token + '&host=' + host)
              .then(r => r.json())
              .then(data => {
                el.innerText = data.online ? '✅' : '❌';
                el.className = 'status-dot ' + (data.online ? 'online' : 'offline');
              }).catch(() => el.innerText = '❌');
          }
        }

        async function saveNode() {
          const id = document.getElementById('nodeId').value;
          const link = document.getElementById('nodeLink').value;
          const customName = document.getElementById('nodeName').value;
          if(!link) return alert("請填寫鏈接");
          await fetch('/api/save?token=' + token, { method: 'POST', body: JSON.stringify({ id, link, customName }) });
          location.reload();
        }

        function editNode(node) {
          document.getElementById('nodeId').value = node.id;
          document.getElementById('nodeLink').value = node.link;
          document.getElementById('nodeName').value = node.originalName;
          document.getElementById('formTitle').innerText = "📝 修改節點";
          document.getElementById('saveBtn').innerText = "更新節點";
          document.getElementById('cancelBtn').style.display = "block";
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function resetForm() {
          document.getElementById('nodeId').value = "";
          document.getElementById('nodeLink').value = "";
          document.getElementById('nodeName').value = "";
          document.getElementById('formTitle').innerText = "➕ 添加節點";
          document.getElementById('saveBtn').innerText = "保存到雲端";
          document.getElementById('cancelBtn').style.display = "none";
        }

        async function deleteNode(id) {
          if(confirm('確定要刪除嗎？')) {
            await fetch('/api/delete?token=' + token, { method: 'POST', body: JSON.stringify({ id }) });
            location.reload();
          }
        }

        window.onload = checkAll;
      </script>
    </body>
    </html>
    `;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
};
