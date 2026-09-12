import app from "./index.js";

const BRICK_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.br https://*.mlstatic.com",
  "style-src 'self' 'unsafe-inline' https://*.mercadopago.com https://*.mercadopago.com.br https://*.mlstatic.com",
  "img-src 'self' data: blob: https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mlstatic.com",
  "font-src 'self' data: https://*.mlstatic.com https://*.mercadopago.com https://*.mercadopago.com.br",
  "connect-src 'self' https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mlstatic.com",
  "frame-src https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mlstatic.com",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join("; ");

const SALES_HTML = `<section id="sales-section" class="admin-tab-panel hidden" data-admin-panel="sales"><div class="sales-heading"><div><h2>Vendas por mola</h2><p class="hint">Somente pagamentos reais aprovados. Testes de motor n&atilde;o entram.</p></div></div><div class="sales-quick"><button class="secondary" type="button" data-sales-range="7">7 dias</button><button class="secondary" type="button" data-sales-range="30">30 dias</button><button class="secondary" type="button" data-sales-range="12m">12 meses</button></div><form id="sales-filter" class="sales-filter"><label>De<input id="sales-from" type="date" required></label><label>At&eacute;<input id="sales-to" type="date" required></label><button type="submit">Atualizar</button></form><div id="sales-summary" class="sales-summary"><div class="hint">Carregando vendas...</div></div></section>`;

const ADMIN_TABS_HTML = `<nav class="admin-tabs" aria-label="Seções da administração">
<button type="button" class="admin-tab active" data-admin-tab="products">Produtos</button>
<button type="button" class="admin-tab" data-admin-tab="sales">Vendas</button>
<button type="button" class="admin-tab" data-admin-tab="machine">Máquina</button>
<button type="button" class="admin-tab" data-admin-tab="wifi">Wi-Fi / Ajuda</button>
</nav>`;

const MACHINE_HTML = `<section class="admin-tab-panel hidden" data-admin-panel="machine">
<h2>Status da máquina</h2>
<div id="machine-status-card" class="machine-status-card">
<div class="status-line"><span id="machine-status-dot" class="status-dot unknown"></span><strong id="machine-status-label">Verificando...</strong></div>
<div class="machine-meta"><div><span>Último contato</span><strong id="machine-last-seen">—</strong></div><div><span>Firmware</span><strong id="machine-firmware">—</strong></div><div><span>Comunicação</span><strong id="machine-transport">—</strong></div></div>
<p class="hint">O status aproveita a comunicação que o ESP32 já faz com o servidor. Não cria um ping rápido extra. Se migrarmos para MQTT, esta mesma tela continuará funcionando.</p>
</div>
</section>`;

const WIFI_HTML = `<section class="admin-tab-panel hidden" data-admin-panel="wifi">
<h2>Wi-Fi da máquina</h2>
<div class="help-card">
<div class="current-wifi"><span>Rede atual</span><strong id="wifi-current-ssid">Carregando...</strong></div>
<form id="wifi-form" class="wifi-form">
<label>Nova rede (SSID)<input id="wifi-ssid" type="text" maxlength="32" autocomplete="off" placeholder="Nome do Wi-Fi" required></label>
<label>Nova senha<div class="password-row"><input id="wifi-password" type="password" maxlength="63" autocomplete="new-password" placeholder="Senha do Wi-Fi"><button id="wifi-toggle-password" class="secondary" type="button">Exibir</button></div></label>
<button id="wifi-save" type="submit">Salvar e conectar</button>
</form>
<p id="wifi-message" class="hint">A máquina vai testar a nova rede. Se não conseguir conectar, mantém a configuração anterior.</p>
</div>
<details class="help-card wifi-recovery"><summary>Ajuda / recuperação local</summary>
<p>Se a máquina estiver sem internet, use o portal local <strong>Maquina-ESP32</strong>. Conecte o celular nessa rede e abra <strong>192.168.4.1</strong>.</p>
<p class="hint">A senha atual nunca é exibida no painel.</p>
</details>
<hr><h2>Trocar senha do painel</h2>
<div id="password-slot"></div>
</section>`;

const ADMIN_TABS_CSS = `.admin-tabs{display:flex;gap:8px;overflow-x:auto;margin:0 0 22px;padding:4px}.admin-tab{flex:0 0 auto;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font:inherit;font-weight:800;padding:10px 16px;cursor:pointer}.admin-tab.active{background:var(--accent);border-color:var(--accent);color:#fff}.admin-tab-panel.hidden{display:none!important}.machine-status-card,.help-card{border:1px solid var(--line);border-radius:18px;background:#fff;padding:20px}.status-line{display:flex;align-items:center;gap:10px;font-size:1.25rem;margin-bottom:18px}.status-dot{width:13px;height:13px;border-radius:50%;display:inline-block;background:#aab1ad}.status-dot.online{background:#00a650;box-shadow:0 0 0 5px rgba(0,166,80,.12)}.status-dot.offline{background:#c43737;box-shadow:0 0 0 5px rgba(196,55,55,.12)}.machine-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px}.machine-meta>div{border:1px solid var(--line);border-radius:14px;padding:14px}.machine-meta span,.current-wifi span{display:block;color:var(--muted);font-size:.8rem;margin-bottom:4px}.machine-meta strong,.current-wifi strong{display:block}.wifi-form{display:grid;gap:14px;margin-top:18px}.password-row{display:grid;grid-template-columns:1fr auto;gap:8px}.password-row button{padding:0 14px}.current-wifi{border:1px solid var(--line);border-radius:14px;padding:14px}.wifi-recovery{margin-top:14px}.wifi-recovery summary{cursor:pointer;font-weight:800}.help-card ol{padding-left:22px;line-height:1.55}.help-card li{margin:8px 0}@media(max-width:650px){.admin-tabs{margin-left:-6px;margin-right:-6px}.machine-meta{grid-template-columns:1fr}.password-row{grid-template-columns:1fr}}`;

const ADMIN_TABS_JS = `;(()=>{const tabs=[...document.querySelectorAll("[data-admin-tab]")];const panels=[...document.querySelectorAll("[data-admin-panel]")];let statusTimer=null;function showTab(name){tabs.forEach(tab=>tab.classList.toggle("active",tab.dataset.adminTab===name));panels.forEach(panel=>panel.classList.toggle("hidden",panel.dataset.adminPanel!==name));if(name==="machine"){loadMachineStatus();if(!statusTimer)statusTimer=setInterval(loadMachineStatus,30000)}else if(statusTimer){clearInterval(statusTimer);statusTimer=null}}async function loadMachineStatus(){const label=document.querySelector("#machine-status-label");const dot=document.querySelector("#machine-status-dot");const last=document.querySelector("#machine-last-seen");const firmware=document.querySelector("#machine-firmware");const transport=document.querySelector("#machine-transport");if(!label||!dot)return;try{const response=await fetch("/api/admin/device-status",{headers:{Accept:"application/json"}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao consultar status.");label.textContent=data.online?"Online":"Offline";dot.className="status-dot "+(data.online?"online":"offline");last.textContent=data.last_seen?new Date(data.last_seen*1000).toLocaleString("pt-BR"):"Ainda não recebido";firmware.textContent=data.firmware_version?"v"+data.firmware_version:"—";transport.textContent=(data.transport||"http").toUpperCase()}catch(error){label.textContent="Status indisponível";dot.className="status-dot unknown";last.textContent=error.message}}tabs.forEach(tab=>tab.addEventListener("click",()=>showTab(tab.dataset.adminTab)));const passwordForm=document.querySelector("#password-form");const passwordSlot=document.querySelector("#password-slot");if(passwordForm&&passwordSlot){passwordSlot.append(passwordForm);const logout=document.querySelector("#logout");if(logout)passwordSlot.append(logout)}showTab("products")})();`;

const SALES_CSS = `.sales-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.sales-heading h2{margin:0 0 5px}.sales-quick{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 4px}.sales-quick button{border:0;border-radius:12px;color:#fff;font:inherit;font-weight:800;padding:11px 14px;cursor:pointer}.sales-filter{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;margin:18px 0}.sales-filter button{padding:13px 18px}.sales-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.sales-card{border:1px solid var(--line);border-radius:16px;background:#fff;padding:16px}.sales-card strong{display:block;font-size:1.7rem;letter-spacing:-.03em;margin-top:4px}.sales-card .sales-revenue{color:var(--muted);font-size:.86rem;margin-top:4px}.sales-total{grid-column:1/-1;background:#eefaf2}.sales-empty{grid-column:1/-1;padding:18px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);text-align:center}@media(max-width:650px){.sales-heading{display:block}.sales-week-button{margin-top:12px}.sales-filter{grid-template-columns:1fr 1fr}.sales-filter button{grid-column:1/-1}.sales-summary{grid-template-columns:1fr}.sales-total{grid-column:1}}`;

const SALES_JS = `;(()=>{const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});const from=document.querySelector("#sales-from");const to=document.querySelector("#sales-to");const form=document.querySelector("#sales-filter");const summary=document.querySelector("#sales-summary");const quick=[...document.querySelectorAll("[data-sales-range]")];if(!from||!to||!form||!summary)return;function localDateValue(date){const year=date.getFullYear();const month=String(date.getMonth()+1).padStart(2,"0");const day=String(date.getDate()).padStart(2,"0");return year+"-"+month+"-"+day}function setRange(value){const now=new Date();const start=new Date(now);if(value==="12m")start.setFullYear(start.getFullYear()-1);else start.setDate(start.getDate()-(Number(value)-1));from.value=localDateValue(start);to.value=localDateValue(now)}function card(title,count,revenue,total=false){const el=document.createElement("div");el.className="sales-card"+(total?" sales-total":"");const label=document.createElement("span");label.textContent=title;const strong=document.createElement("strong");strong.textContent=count+" venda"+(count===1?"":"s");const value=document.createElement("div");value.className="sales-revenue";value.textContent=money.format(revenue/100);el.append(label,strong,value);return el}async function loadSales(){if(!from.value||!to.value)return;if(from.value>to.value){notify("A data inicial deve ser anterior a data final.");return}summary.innerHTML='<div class="hint">Carregando vendas...</div>';try{const response=await fetch("/api/admin/sales?from="+encodeURIComponent(from.value)+"&to="+encodeURIComponent(to.value),{headers:{Accept:"application/json"}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Nao foi possivel carregar as vendas.");summary.replaceChildren();for(const item of data.by_motor)summary.append(card("Mola "+item.motor+" - "+item.name,item.sales,item.revenue_cents));summary.append(card("Total do periodo",data.total_sales,data.total_revenue_cents,true));if(!data.total_sales){const empty=document.createElement("div");empty.className="sales-empty";empty.textContent="Nenhuma venda real neste periodo.";summary.prepend(empty)}}catch(error){summary.innerHTML='<div class="sales-empty"></div>';summary.firstChild.textContent=error.message}}form.addEventListener("submit",event=>{event.preventDefault();loadSales()});quick.forEach(button=>button.addEventListener("click",()=>{setRange(button.dataset.salesRange);loadSales()}));const originalLoadAdmin=loadAdmin;loadAdmin=async function(){await originalLoadAdmin();if(!adminPanel.classList.contains("hidden")){if(!from.value)setRange("7");await loadSales()}};setRange("7");loadAdmin()})();`;

function promoteBrickCheckout(path, text) {
  if (path === "/") {
    return text.replace("<div class=\"brand\">NOVO PAGAMENTO</div>", "<div class=\"brand\">PAGAMENTO</div>");
  }

  if (path !== "/app.js") return text;

  const oldButtons = 'const button=document.createElement("button");button.type="button";button.textContent="Comprar agora";button.addEventListener("click",()=>startCheckout(item,button));const newButton=document.createElement("button");newButton.type="button";newButton.className="new-payment";newButton.textContent="Novo pagamento (teste)";newButton.addEventListener("click",()=>startBrick(item,newButton));card.append(visual,title,price,button,newButton);container.append(card)';
  const primaryButton = 'const button=document.createElement("button");button.type="button";button.textContent="Comprar agora";button.addEventListener("click",()=>startBrick(item,button));card.append(visual,title,price,button);container.append(card)';

  return text.replace(oldButtons, primaryButton);
}

function enhanceAdmin(path, text) {
  if (path === "/admin") {
    return text
      .replace('<section id="admin-panel" class="panel hidden">', '<section id="admin-panel" class="panel hidden">'+ADMIN_TABS_HTML+'<section class="admin-tab-panel" data-admin-panel="products">')
      .replace('</form><hr><h2>Trocar senha</h2>', '</form></section>'+SALES_HTML+MACHINE_HTML+WIFI_HTML+'<div class="legacy-account hidden"><hr><h2>Trocar senha</h2>')
      .replace('<button id="logout" class="link-button" type="button">Sair</button></section>', '<button id="logout" class="link-button" type="button">Sair</button></div></section>');
  }
  if (path === "/styles.css") return `${text}${SALES_CSS}${ADMIN_TABS_CSS}`;
  if (path === "/admin.js") return `${text}${SALES_JS}${ADMIN_TABS_JS}`;
  return text;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00-03:00`));
}

async function requireAdminThroughApp(request, env) {
  const authUrl = new URL(request.url);
  authUrl.pathname = "/api/admin/products";
  authUrl.search = "";
  const authRequest = new Request(authUrl, { method: "GET", headers: request.headers });
  return app.fetch(authRequest, env);
}

async function adminDeviceStatus(request, env) {
  const authResponse = await requireAdminThroughApp(request, env);
  if (!authResponse.ok) return authResponse;
  try {
    const device = await env.DB.prepare("SELECT device_id, enabled, last_seen, firmware_version, transport, wifi_ssid FROM devices WHERE device_id = ?").bind("machine-1").first();
    const now = Math.floor(Date.now() / 1000);
    const lastSeen = Number(device?.last_seen || 0);
    return Response.json({
      device_id: "machine-1",
      online: Boolean(device?.enabled) && lastSeen > 0 && (now - lastSeen) <= 20,
      last_seen: lastSeen || null,
      firmware_version: device?.firmware_version || null,
      transport: device?.transport || "http",
      wifi_ssid: device?.wifi_ssid || ""
    });
  } catch {
    return Response.json({ error: "A atualização de status da máquina ainda não foi aplicada ao banco." }, { status: 503 });
  }
}

async function adminSales(request, env) {
  const url = new URL(request.url);
  const authUrl = new URL(request.url);
  authUrl.pathname = "/api/admin/products";
  authUrl.search = "";
  const authRequest = new Request(authUrl, {
    method: "GET",
    headers: request.headers
  });
  const authResponse = await app.fetch(authRequest, env);
  if (!authResponse.ok) return authResponse;

  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!validDate(from) || !validDate(to) || from > to) {
    return Response.json({ error: "Periodo invalido." }, { status: 400 });
  }

  const fromEpoch = Math.floor(new Date(`${from}T00:00:00-03:00`).getTime() / 1000);
  const toEpoch = Math.floor(new Date(`${to}T23:59:59-03:00`).getTime() / 1000);
  const maxDays = 366;
  if ((toEpoch - fromEpoch) > maxDays * 86400) {
    return Response.json({ error: "Escolha um periodo de ate 366 dias." }, { status: 400 });
  }

  const productsResult = await env.DB.prepare(
    "SELECT id, name FROM products WHERE id IN (1,2,3,4) ORDER BY id"
  ).all();
  const salesResult = await env.DB.prepare(
    "SELECT product_id AS motor, COUNT(*) AS sales, COALESCE(SUM(price_cents),0) AS revenue_cents FROM payment_orders WHERE paid_at IS NOT NULL AND paid_at BETWEEN ? AND ? GROUP BY product_id ORDER BY product_id"
  ).bind(fromEpoch, toEpoch).all();
  const dailyResult = await env.DB.prepare(
    "SELECT date(paid_at, 'unixepoch', '-3 hours') AS sale_date, product_id AS motor, COUNT(*) AS sales, COALESCE(SUM(price_cents),0) AS revenue_cents FROM payment_orders WHERE paid_at IS NOT NULL AND paid_at BETWEEN ? AND ? GROUP BY sale_date, product_id ORDER BY sale_date, product_id"
  ).bind(fromEpoch, toEpoch).all();

  const salesMap = new Map(salesResult.results.map((row) => [Number(row.motor), row]));
  const byMotor = productsResult.results.map((product) => {
    const row = salesMap.get(Number(product.id));
    return {
      motor: Number(product.id),
      name: product.name,
      sales: Number(row?.sales || 0),
      revenue_cents: Number(row?.revenue_cents || 0)
    };
  });

  return Response.json({
    from,
    to,
    total_sales: byMotor.reduce((sum, item) => sum + item.sales, 0),
    total_revenue_cents: byMotor.reduce((sum, item) => sum + item.revenue_cents, 0),
    by_motor: byMotor,
    daily: dailyResult.results.map((row) => ({
      date: row.sale_date,
      motor: Number(row.motor),
      sales: Number(row.sales),
      revenue_cents: Number(row.revenue_cents)
    }))
  });
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;

    if (request.method === "GET" && path === "/api/admin/sales") {
      return adminSales(request, env);
    }
    if (request.method === "GET" && path === "/api/admin/device-status") {
      return adminDeviceStatus(request, env);
    }

    const response = await app.fetch(request, env, ctx);

    if (request.method === "GET" && path === "/api/device/commands/next" && response.ok) {
      const url = new URL(request.url);
      const deviceId = url.searchParams.get("device_id") || "";
      const firmwareVersion = Number(request.headers.get("X-Firmware-Version") || 0);
      const wifiSsid = (request.headers.get("X-Wifi-SSID") || "").slice(0, 64);
      try {
        await env.DB.prepare("UPDATE devices SET last_seen = ?, firmware_version = CASE WHEN ? > 0 THEN ? ELSE firmware_version END, transport = 'http', wifi_ssid = CASE WHEN ? <> '' THEN ? ELSE wifi_ssid END WHERE device_id = ?")
          .bind(Math.floor(Date.now()/1000), firmwareVersion, firmwareVersion, wifiSsid, wifiSsid, deviceId).run();
      } catch {}
    }
    const headers = new Headers(response.headers);

    headers.set("Content-Security-Policy", BRICK_CSP);

    if (path === "/" || path === "/styles.css" || path === "/app.js" || path === "/admin" || path === "/admin.js") {
      headers.set("Cache-Control", "no-store, max-age=0");
    }

    if ((path === "/" || path === "/app.js" || path === "/admin" || path === "/styles.css" || path === "/admin.js") && response.ok) {
      let text = await response.text();
      text = promoteBrickCheckout(path, text);
      text = enhanceAdmin(path, text);
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
