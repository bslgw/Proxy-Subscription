// ==========================================
// 🔒 安全配置：請更換為你的私密暗號
// ==========================================
const SECRETPASSWORD = "888"; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!env.NODES_STORE) return new Response("錯誤：未綁定 KV 命名空間 NODES_STORE", { status: 500 });

    const userToken = url.searchParams.get('token');
    if (userToken !== SECRETPASSWORD) return new Response("404 Not Found", { status: 404 });

    const getProtocol = (link) => {
      try { return link.split('://')[0].toLowerCase(); } catch (e) { return 'unknown'; }
    };

    // --- 路由 1: 訂閱接口 (供客戶端使用) ---
    if (url.pathname === '/sub') {
      const rawData = await env.NODES_STORE.get('nodes_list');
      let nodes = rawData ? JSON.parse(rawData) : [];
      nodes.sort((a, b) => getProtocol(a.link).localeCompare(getProtocol(b.link)));
      return new Response(nodes.map(n => n.link).join('\n'), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // --- 路由 2: 保存/修改 API ---
    if (request.method === 'POST' && url.pathname === '/api/save') {
      try {
        const { id, link, customName } = await request.json();
        if (!link) return new Response("鏈接不能為空", { status: 400 });

        let processedLink = link.trim();
        if (processedLink.includes('#')) processedLink = processedLink.split('#')[0];
        if (customName) processedLink = `${processedLink}#${customName.trim()}`;

        const rawData = await env.NODES_STORE.get('nodes_list');
        let nodes = rawData ? JSON.parse(rawData) : [];

        if (id) {
          const index = nodes.findIndex(n => n.id === id);
          if (index !== -1) {
            nodes[index] = { id, originalName: customName || '未命名', link: processedLink };
          }
        } else {
          nodes.push({ id: Date.now().toString(), originalName: customName || '未命名', link: processedLink });
        }

        await env.NODES_STORE.put('nodes_list', JSON.stringify(nodes));
        return new Response(JSON.stringify({ success: true }));
      } catch (e) { return new Response(e.message, { status: 500 }); }
    }

    // --- 路由 3: 刪除 API ---
    if (request.method === 'POST' && url.pathname === '/api/delete') {
      const { id } = await request.json();
      const rawData = await env.NODES_STORE.get('nodes_list');
      let nodes = (rawData ? JSON.parse(rawData) : []).filter(n => n.id !== id);
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
      <title>Dae 節點管理系統</title>
      <style>
        body { font-family: system-ui; background: #f4f7f9; max-width: 700px; margin: 20px auto; padding: 0 15px; color: #333; }
        .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 20px; }
        .sub-url-box { background: #fffbe6; padding: 12px; border: 1px dashed #ffe58f; border-radius: 6px; font-family: monospace; font-size: 13px; word-break: break-all; margin-top: 10px; color: #856404; font-weight: bold; }
        .form-group { margin-bottom: 12px; }
        label { display: block; font-size: 13px; font-weight: bold; margin-bottom: 5px; }
        input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        .btn-group { display: flex; gap: 10px; }
        button { flex: 1; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
        .btn-primary { background: #1a73e8; color: white; }
        .btn-cancel { background: #eee; color: #666; display: none; }
        .node-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; }
        .node-info { flex: 1; min-width: 0; margin-right: 10px; }
        .node-name { font-size: 14px; font-weight: 600; }
        .node-link { font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .actions { display: flex; gap: 5px; }
        .btn-sm { padding: 4px 8px; font-size: 12px; flex: none; }
        .btn-edit { background: #34a853; color: white; }
        .btn-del { background: #ea4335; color: white; }
        .group-tag { background: #f8f9fa; padding: 5px 10px; font-weight: bold; font-size: 12px; border-left: 3px solid #1a73e8; margin: 15px 0 5px; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2 style="margin-top:0; color:#1a73e8;">🔗 你的專屬訂閱鏈接</h2>
        <p style="font-size:13px; color:#666;">將下方地址複製到你的客戶端 (如 Dae/Daed)：</p>
        <div class="sub-url-box">${url.origin}/sub?token=${SECRETPASSWORD}</div>
      </div>

      <div class="card">
        <h2 id="formTitle" style="margin-top:0;">➕ 添加新節點</h2>
        <input type="hidden" id="nodeId">
        <div class="form-group">
          <label>節點鏈接</label>
          <textarea id="nodeLink" rows="2" placeholder="vless://..."></textarea>
        </div>
        <div class="form-group">
          <label>備註名稱</label>
          <input type="text" id="nodeName" placeholder="不填則保留鏈接內名稱">
        </div>
        <div class="btn-group">
          <button class="btn-primary" onclick="saveNode()" id="saveBtn">保存節點</button>
          <button class="btn-cancel" onclick="resetForm()" id="cancelBtn">取消修改</button>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0;">📋 已存節點 (${currentNodes.length})</h2>
        ${Object.keys(groupedNodes).length === 0 ? '<p style="text-align:center;color:#999;font-size:14px;">暫無節點，請在上方添加</p>' : ''}
        ${Object.entries(groupedNodes).map(([proto, items]) => `
          <div class="group-tag">${proto}</div>
          ${items.map(n => `
            <div class="node-item">
              <div class="node-info">
                <div class="node-name">${n.originalName}</div>
                <div class="node-link">${n.link}</div>
              </div>
              <div class="actions">
                <button class="btn-sm btn-edit" onclick='editNode(${JSON.stringify(n)})'>修改</button>
                <button class="btn-sm btn-del" onclick="deleteNode('${n.id}')">刪除</button>
              </div>
            </div>
          `).join('')}
        `).join('')}
      </div>

      <script>
        const token = new URLSearchParams(window.location.search).get('token');

        function editNode(node) {
          document.getElementById('nodeId').value = node.id;
          document.getElementById('nodeLink').value = node.link.split('#')[0];
          document.getElementById('nodeName').value = node.originalName;
          document.getElementById('formTitle').innerText = "📝 修改節點";
          document.getElementById('saveBtn').innerText = "確認修改";
          document.getElementById('cancelBtn').style.display = "block";
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function resetForm() {
          document.getElementById('nodeId').value = "";
          document.getElementById('nodeLink').value = "";
          document.getElementById('nodeName').value = "";
          document.getElementById('formTitle').innerText = "➕ 添加新節點";
          document.getElementById('saveBtn').innerText = "保存節點";
          document.getElementById('cancelBtn').style.display = "none";
        }

        async function saveNode() {
          const id = document.getElementById('nodeId').value;
          const link = document.getElementById('nodeLink').value;
          const customName = document.getElementById('nodeName').value;
          if(!link) return alert("請填寫鏈接");
          const res = await fetch('/api/save?token=' + token, {
            method: 'POST',
            body: JSON.stringify({ id, link, customName })
          });
          if(res.ok) location.reload();
        }

        async function deleteNode(id) {
          if(confirm('確定要刪除這個節點嗎？')) {
            const res = await fetch('/api/delete?token=' + token, { 
              method: 'POST', 
              body: JSON.stringify({ id }) 
            });
            if(res.ok) location.reload();
          }
        }
      </script>
    </body>
    </html>
    `;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
};
