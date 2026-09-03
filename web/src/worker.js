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

const SALES_HTML = `<hr><section id="sales-section"><div class="sales-heading"><div><h2>Vendas por mola</h2><p class="hint">Somente pagamentos reais aprovados. Testes de motor n&atilde;o entram.</p></div><button id="sales-this-week" class="secondary sales-week-button" type="button">Esta semana</button></div><form id="sales-filter" class="sales-filter"><label>De<input id="sales-from" type="date" required></label><label>At&eacute;<input id="sales-to" type="date" required></label><button type="submit">Atualizar</button></form><div id="sales-summary" class="sales-summary"><div class="hint">Carregando vendas...</div></div></section>`;

const SALES_CSS = `.sales-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.sales-heading h2{margin:0 0 5px}.sales-week-button{border:0;border-radius:12px;color:#fff;font:inherit;font-weight:800;padding:11px 14px;cursor:pointer}.sales-filter{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;margin:18px 0}.sales-filter button{padding:13px 18px}.sales-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sales-card{border:1px solid var(--line);border-radius:16px;background:#fff;padding:16px}.sales-card strong{display:block;font-size:1.7rem;letter-spacing:-.03em;margin-top:4px}.sales-card .sales-revenue{color:var(--muted);font-size:.86rem;margin-top:4px}.sales-total{grid-column:1/-1;background:#eefaf2}.sales-empty{grid-column:1/-1;padding:18px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);text-align:center}@media(max-width:650px){.sales-heading{display:block}.sales-week-button{margin-top:12px}.sales-filter{grid-template-columns:1fr 1fr}.sales-filter button{grid-column:1/-1}.sales-summary{grid-template-columns:1fr}.sales-total{grid-column:1}}`;

const SALES_JS = `;(()=>{const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});const from=document.querySelector("#sales-from");const to=document.querySelector("#sales-to");const form=document.querySelector("#sales-filter");const summary=document.querySelector("#sales-summary");const weekButton=document.querySelector("#sales-this-week");if(!from||!to||!form||!summary)return;function localDateValue(date){const year=date.getFullYear();const month=String(date.getMonth()+1).padStart(2,"0");const day=String(date.getDate()).padStart(2,"0");return year+"-"+month+"-"+day}function setThisWeek(){const now=new Date();const day=now.getDay();const monday=new Date(now);monday.setDate(now.getDate()-(day===0?6:day-1));const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);from.value=localDateValue(monday);to.value=localDateValue(sunday)}function card(title,count,revenue,total=false){const el=document.createElement("div");el.className="sales-card"+(total?" sales-total":"");const label=document.createElement("span");label.textContent=title;const strong=document.createElement("strong");strong.textContent=count+" venda"+(count===1?"":"s");const value=document.createElement("div");value.className="sales-revenue";value.textContent=money.format(revenue/100);el.append(label,strong,value);return el}async function loadSales(){if(!from.value||!to.value)return;if(from.value>to.value){notify("A data inicial deve ser anterior a data final.");return}summary.innerHTML='<div class="hint">Carregando vendas...</div>';try{const response=await fetch("/api/admin/sales?from="+encodeURIComponent(from.value)+"&to="+encodeURIComponent(to.value),{headers:{Accept:"application/json"}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Nao foi possivel carregar as vendas.");summary.replaceChildren();for(const item of data.by_motor)summary.append(card("Mola "+item.motor+" - "+item.name,item.sales,item.revenue_cents));summary.append(card("Total do periodo",data.total_sales,data.total_revenue_cents,true));if(!data.total_sales){const empty=document.createElement("div");empty.className="sales-empty";empty.textContent="Nenhuma venda real neste periodo.";summary.prepend(empty)}}catch(error){summary.innerHTML='<div class="sales-empty"></div>';summary.firstChild.textContent=error.message}}form.addEventListener("submit",event=>{event.preventDefault();loadSales()});weekButton?.addEventListener("click",()=>{setThisWeek();loadSales()});const originalLoadAdmin=loadAdmin;loadAdmin=async function(){await originalLoadAdmin();if(!adminPanel.classList.contains("hidden")){if(!from.value)setThisWeek();await loadSales()}};setThisWeek();})();`;

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
      .replace("<hr><h2>Trocar senha</h2>", `${SALES_HTML}<hr><h2>Trocar senha</h2>`)
      .replace("/admin.js?v=4", "/admin.js?v=5");
  }
  if (path === "/styles.css") return `${text}${SALES_CSS}`;
  if (path === "/admin.js") return `${text}${SALES_JS}`;
  return text;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00-03:00`));
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
    "SELECT id, name FROM products WHERE id IN (1,2) ORDER BY id"
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

    const response = await app.fetch(request, env, ctx);
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
