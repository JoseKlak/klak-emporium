/* ============================================================
   Importa — app.js
   Gestão local de importação e revenda. Sem servidor, offline.
   Dados no navegador (localStorage: chave "importa.v1").
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "importa.v1";
  var APP_VERSAO = "8";   // aparece em Configurações — confere se o aparelho está atualizado

  /* ══════════════════════════════════════════════════════════════
     CONFIGURAÇÃO DA NUVEM — preencha a chave abaixo UMA vez.
     Assim, em qualquer aparelho (celular, outro PC) você só precisa
     entrar com e-mail e senha; não precisa colar nada de novo.
     A chave "anon/publishable" pode ficar aqui: ela é pública por
     design, e quem protege seus dados é a trava (RLS) do Supabase.
     NUNCA coloque aqui a chave "service_role"/"secret".
     ══════════════════════════════════════════════════════════════ */
  var NUVEM_URL = "https://bjyjtokmtkqtpdpfnlcb.supabase.co";
  var NUVEM_KEY = "sb_publishable_UPia2wVbWJXcSjS_ln9Nhg_Wxf0-_bS";
  var MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  var MESES_LONGO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  var CATEGORIAS = ["Celular","Notebook","Tablet","TV","Áudio","Games","Câmera","Drone","Acessórios","Informática","Outro"];
  var PLATAFORMAS = ["Mercado Livre","Shopee","OLX","WhatsApp","Loja física","Amazon","Outro"];

  /* ---------- utils ---------- */
  function $(s, c) { return (c || document).querySelector(s); }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.slice(0,2) === "on" && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return n;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function escHtml(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function hashStr(s){ var h=5381; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)+h)+s.charCodeAt(i); h=h&0xffffffff; } return "h"+(h>>>0).toString(36); }
  function fmtBRL(v) {
    var s = Math.abs(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? "-" : "") + "R$ " + s;
  }
  function fmtBRLk(v) {
    var a = Math.abs(v || 0);
    if (a >= 1000000) return (v<0?"-":"") + "R$ " + (a/1000000).toFixed(1).replace(".",",") + "M";
    if (a >= 1000) return (v<0?"-":"") + "R$ " + (a/1000).toFixed(1).replace(".",",") + "k";
    return fmtBRL(v);
  }
  function pct(v) { return (v*100).toFixed(0) + "%"; }
  function parseNum(str) {
    if (typeof str === "number") return str;
    if (str == null) return 0;
    var s = String(str).trim().replace(/[R$US\s]/g,"");
    var lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > ld) s = s.replace(/\./g,"").replace(",",".");
    else s = s.replace(/,/g,"");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
  function fmtDateTime(ts){
    var d=new Date(ts);
    return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear()+
      " "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  }
  function fmtDateBR(iso) { if (!iso) return ""; var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function monthKey(iso) { return (iso||"").slice(0,7); }
  function monthLabel(mk) { var p = mk.split("-"); return MESES[parseInt(p[1],10)-1] + "/" + p[0].slice(2); }
  function monthLabelFull(mk) { var p = mk.split("-"); return MESES_LONGO[parseInt(p[1],10)-1] + " " + p[0]; }

  /* ---------- estado ---------- */
  var state = null;
  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (raw) { try { state = JSON.parse(raw); } catch (e) { state = null; } }
    if (!state) {
      state = { produtos: [], vendas: [], viagens: [], settings: { theme: "light" }, atualizadoEm: 0 };
      saveLocalOnly();
    }
    loadStateFix();
  }

  // normaliza/migra o estado (usado ao carregar e ao baixar da nuvem)
  function loadStateFix() {
    if (!state.settings) state.settings = { theme: "light" };
    if (!state.settings.admin) state.settings.admin = { pass: hashStr("klak2026") }; // senha padrão: klak2026
    if (!state.settings.lojaNome) state.settings.lojaNome = "Klak Emporium";
    if (state.settings.whatsapp == null) state.settings.whatsapp = "5545998309108";
    // nuvem já vem configurada pelo próprio app (vale para qualquer aparelho)
    if (!state.settings.sbUrl && NUVEM_URL) state.settings.sbUrl = NUVEM_URL;
    if (!state.settings.sbKey && NUVEM_KEY) state.settings.sbKey = NUVEM_KEY;
    if (state.settings.entregaTexto == null) state.settings.entregaTexto = "Entrega grátis para Toledo, Cascavel e Marechal";
    // migração: produtos que já estavam visíveis na vitrine continuam visíveis
    if (!state.settings.migrouVitrine){
      (state.produtos||[]).forEach(function(p){ if(p.anunciado==null || p.anunciado===false) p.anunciado = true; });
      state.settings.migrouVitrine = 1;
    }
    // migração: foto única -> galeria de fotos
    (state.produtos||[]).forEach(function(p){
      if (!p.imagens) p.imagens = p.imagem ? [p.imagem] : [];
      if (p.entregaGratis == null) p.entregaGratis = true;
    });
    ["produtos","vendas","viagens"].forEach(function (k) { if (!state[k]) state[k] = []; });
  }
  var saveTimer = null;
  function saveLocalOnly(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Erro ao salvar. Armazenamento cheio? Fotos ocupam espaço.", "err"); }
  }
  // impressão digital barata do que realmente importa (sem carregar as fotos inteiras)
  function assinaturaDados(){
    var p=(state.produtos||[]).map(function(x){
      var fotos=(x.imagens||[]).reduce(function(a,i){ return a+(i?i.length:0); },0);
      return [x.id,x.nome,x.precoVenda,x.custoUnit,x.quantidade,x.anunciado,x.entregaGratis,x.categoria,(x.descricao||"").length,x.video||"",fotos].join(",");
    }).join("|");
    var v=(state.vendas||[]).map(function(x){ return [x.id,x.data,x.quantidade,x.precoUnit,x.taxaPct,x.plataforma,x.produtoId].join(","); }).join("|");
    var t=(state.viagens||[]).map(function(x){ return [x.id,x.data,x.nome,x.destino,(x.custos||[]).map(function(c){return c.desc+":"+c.valor;}).join(";")].join(","); }).join("|");
    var st=state.settings||{};
    var c=[st.lojaNome,st.whatsapp,st.slogan,st.entregaTexto,st.siteUrl,(st.admin&&st.admin.pass)].join("~");
    return hashStr(p+"#"+v+"#"+t+"#"+c);
  }
  var ultimaAssinatura = null;

  function saveState() {
    var sig = assinaturaDados();
    if (ultimaAssinatura === null) ultimaAssinatura = sig;      // 1ª vez: só registra
    else if (sig !== ultimaAssinatura){ state.atualizadoEm = Date.now(); ultimaAssinatura = sig; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveLocalOnly();
      if (typeof agendarEnvio === "function") agendarEnvio();
    }, 60);
  }

  /* ---------- domínio ---------- */
  function prodById(id) { for (var i=0;i<state.produtos.length;i++) if (state.produtos[i].id===id) return state.produtos[i]; return null; }
  function tripById(id) { for (var i=0;i<state.viagens.length;i++) if (state.viagens[i].id===id) return state.viagens[i]; return null; }
  function custoProduto(p) { return (p.custoUnit || 0) + (p.custoExtra || 0); } // BRL por unidade
  function vendidoQtd(p) { return state.vendas.filter(function(v){return v.produtoId===p.id;}).reduce(function(s,v){return s+(v.quantidade||0);},0); }
  function estoqueQtd(p) { return Math.max(0, (p.quantidade||0) - vendidoQtd(p)); }
  function margemBruta(p) { if (!p.precoVenda) return 0; return (p.precoVenda - custoProduto(p)) / p.precoVenda; }
  function tripTotal(t) { return (t.custos||[]).reduce(function(s,c){return s+(c.valor||0);},0); }

  function vendaLucro(v) {
    var receita = (v.precoUnit||0) * (v.quantidade||0);
    var taxa = receita * (v.taxaPct||0)/100;
    var custo = (v.custoUnitSnapshot||0) * (v.quantidade||0);
    return receita - taxa - custo;
  }
  function vendaReceita(v) { return (v.precoUnit||0)*(v.quantidade||0); }

  function statusProduto(p) {
    var est = estoqueQtd(p);
    if (est <= 0 && (p.quantidade||0) > 0) return "vendido";
    if (p.anunciado) return "anunciado";   // publicado na vitrine
    return "estoque";                      // tem estoque, mas fora da vitrine
  }

  // agrega período (mk = "YYYY-MM" ou "all")
  function aggregate(mk) {
    var vendas = state.vendas.filter(function(v){ return mk==="all" || monthKey(v.data)===mk; });
    var viagens = state.viagens.filter(function(t){ return mk==="all" || monthKey(t.data)===mk; });
    var receita = vendas.reduce(function(s,v){return s+vendaReceita(v);},0);
    var lucroVendas = vendas.reduce(function(s,v){return s+vendaLucro(v);},0);
    var despViagem = viagens.reduce(function(s,t){return s+tripTotal(t);},0);
    var unidadesVendidas = vendas.reduce(function(s,v){return s+(v.quantidade||0);},0);
    return {
      receita: receita, lucroVendas: lucroVendas, despViagem: despViagem,
      lucroLiquido: lucroVendas - despViagem,
      margem: receita ? lucroVendas/receita : 0,
      nVendas: vendas.length, unidadesVendidas: unidadesVendidas
    };
  }
  function capitalEstoque() { return state.produtos.reduce(function(s,p){return s+estoqueQtd(p)*custoProduto(p);},0); }
  function potencialEstoque() { return state.produtos.reduce(function(s,p){return s+estoqueQtd(p)*(p.precoVenda||0);},0); }
  function unidadesEstoque() { return state.produtos.reduce(function(s,p){return s+estoqueQtd(p);},0); }

  function allSaleMonths() {
    var set = {}; state.vendas.forEach(function(v){ if(v.data) set[monthKey(v.data)]=true; });
    state.viagens.forEach(function(t){ if(t.data) set[monthKey(t.data)]=true; });
    return Object.keys(set).sort();
  }

  /* ---------- gráficos (SVG) ---------- */
  var tipEl;
  function showTip(html,x,y){ tipEl=tipEl||$("#chartTip"); tipEl.innerHTML=html; tipEl.style.left=x+"px"; tipEl.style.top=y+"px"; tipEl.style.opacity="1"; }
  function hideTip(){ if(tipEl) tipEl.style.opacity="0"; }
  function svgNS(tag, attrs){ var n=document.createElementNS("http://www.w3.org/2000/svg",tag); if(attrs) for(var k in attrs) n.setAttribute(k,attrs[k]); return n; }
  function cssColor(v){ if(v&&v.indexOf("var(")===0){ var name=v.slice(4,-1).trim(); return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||"#888"; } return v; }
  var PALETTE = ["var(--c1)","var(--c2)","var(--c3)","var(--c4)","var(--c5)","var(--c6)","var(--c7)","var(--c8)"];

  function donutChart(data, total) {
    var size=200, r=82, cx=size/2, cy=size/2, sw=26;
    var svg=svgNS("svg",{viewBox:"0 0 "+size+" "+size, width:"100%", style:"max-width:210px"});
    if (total<=0){ svg.appendChild(svgNS("circle",{cx:cx,cy:cy,r:r,fill:"none",stroke:cssColor("var(--surface-2)"),"stroke-width":sw})); }
    else {
      var ang=-Math.PI/2;
      data.forEach(function(d){ if(d.value<=0) return;
        var frac=d.value/total, a2=ang+frac*Math.PI*2, large=frac>0.5?1:0;
        var x1=cx+r*Math.cos(ang), y1=cy+r*Math.sin(ang), x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
        var path=svgNS("path",{d:"M "+x1+" "+y1+" A "+r+" "+r+" 0 "+large+" 1 "+x2+" "+y2, fill:"none", stroke:cssColor(d.color),"stroke-width":sw, class:"seg-arc"});
        (function(dd){ path.addEventListener("mousemove",function(e){ showTip("<strong>"+dd.label+"</strong><br>"+fmtBRL(dd.value)+" · "+Math.round(dd.value/total*100)+"%",e.clientX,e.clientY); }); path.addEventListener("mouseleave",hideTip); })(d);
        svg.appendChild(path); ang=a2;
      });
    }
    var t1=svgNS("text",{x:cx,y:cy-4,"text-anchor":"middle","font-size":"12",fill:cssColor("var(--muted)")}); t1.textContent="Total"; svg.appendChild(t1);
    var t2=svgNS("text",{x:cx,y:cy+16,"text-anchor":"middle","font-size":"17","font-weight":"700",fill:cssColor("var(--ink)")}); t2.textContent=fmtBRLk(total); svg.appendChild(t2);
    return svg;
  }

  function barsChart(items) { // [{label, value, color?}]
    var W=Math.max(320, items.length*80), H=200, pad=28;
    var max=1; items.forEach(function(m){ max=Math.max(max, m.value); });
    var svg=svgNS("svg",{viewBox:"0 0 "+W+" "+H, width:"100%", preserveAspectRatio:"xMidYMid meet"});
    var chartH=H-pad-22;
    for(var g=0;g<=3;g++){ var yy=pad+chartH*(g/3); svg.appendChild(svgNS("line",{x1:34,y1:yy,x2:W-8,y2:yy,stroke:cssColor("var(--border)"),"stroke-width":1})); }
    var slot=(W-44)/items.length, bw=Math.min(46, slot*0.5);
    items.forEach(function(m,i){
      var cx=40+slot*i+slot/2, h=(m.value/max)*chartH, x=cx-bw/2, y=pad+chartH-h;
      var col=m.value<0?cssColor("var(--danger)"):(m.color?cssColor(m.color):cssColor("var(--brand)"));
      var rect=svgNS("rect",{x:x,y:m.value<0?pad+chartH:y,width:bw,height:Math.abs(h)||1,rx:4,fill:col,class:"bar-rect"});
      (function(mm){ rect.addEventListener("mousemove",function(e){ showTip("<strong>"+mm.label+"</strong><br>"+fmtBRL(mm.value),e.clientX,e.clientY); }); rect.addEventListener("mouseleave",hideTip); })(m);
      svg.appendChild(rect);
      var lab=svgNS("text",{x:cx,y:H-6,"text-anchor":"middle","font-size":"11",fill:cssColor("var(--muted)")}); lab.textContent=m.label; svg.appendChild(lab);
    });
    return svg;
  }

  /* ---------- imagem (resize -> base64) ---------- */
  function fileToResizedDataURL(file, cb) {
    var reader = new FileReader();
    reader.onload = function(e){
      var img = new Image();
      img.onload = function(){
        var max=700, w=img.width, h=img.height;
        if (w>h && w>max){ h=h*max/w; w=max; } else if (h>=w && h>max){ w=w*max/h; h=max; }
        var cv=document.createElement("canvas"); cv.width=w; cv.height=h;
        cv.getContext("2d").drawImage(img,0,0,w,h);
        cb(cv.toDataURL("image/jpeg", 0.72));
      };
      img.onerror=function(){ cb(null); };
      img.src=e.target.result;
    };
    reader.onerror=function(){ cb(null); };
    reader.readAsDataURL(file);
  }

  /* ---------- admin / acesso ---------- */
  var isAdmin = false;
  var ADMIN_ROUTES = ["dashboard","estoque","vendas","viagens","config","ideias"];
  function loadAdmin(){ try{ isAdmin = localStorage.getItem("importa.admin")==="1"; }catch(e){ isAdmin=false; } }
  function applyAdminUI(){
    document.querySelectorAll(".nav-item").forEach(function(b){
      var r=b.getAttribute("data-route");
      b.style.display = (r==="vitrine" || isAdmin) ? "" : "none";
    });
    var foot=$(".sidebar-foot"); var ex=$("#adminBtn"); if(ex) ex.remove();
    var btn=el("button",{id:"adminBtn",class:"btn ghost sm",title:isAdmin?"Sair da gestão":"Entrar (admin)"},[
      el("span",{},isAdmin?"🔓":"🔒"), el("span",{id:"adminLbl"}, isAdmin?"Sair da gestão":"Entrar (admin)")
    ]);
    btn.addEventListener("click", isAdmin?logoutAdmin:openLogin);
    foot.appendChild(btn);
  }
  function openLogin(){
    var fPass=el("input",{class:"input",type:"password",placeholder:"senha"});
    fPass.addEventListener("keydown",function(e){ if(e.key==="Enter") tryLogin(); });
    function tryLogin(){
      if (hashStr(fPass.value)===state.settings.admin.pass){ isAdmin=true; try{localStorage.setItem("importa.admin","1");}catch(e){} closeModal(); applyAdminUI(); go("dashboard"); toast("Modo gestão ativado ✓","good"); }
      else toast("Senha incorreta.","err");
    }
    modal("Área do administrador", el("div",{class:"stack"},[
      el("p",{class:"muted small",style:"margin:0"},"Estas funções são só suas. O cliente final vê apenas a Vitrine."),
      el("label",{class:"field"},[el("span",{class:"lbl"},"Senha"),fPass])
    ]), [ {label:"Cancelar",cls:"btn ghost",onClick:closeModal}, {label:"Entrar",cls:"btn primary",onClick:tryLogin} ]);
    setTimeout(function(){ try{fPass.focus();}catch(e){} },60);
  }
  function logoutAdmin(){ isAdmin=false; try{localStorage.removeItem("importa.admin");}catch(e){} applyAdminUI(); go("vitrine"); toast("Você saiu do modo gestão."); }

  /* ---------- dados de exemplo (teste) ---------- */
  function seedSample(){
    var now=Date.now();
    var trip={ id:"trip_ex", nome:"Viagem julho", data:"2026-07-05", destino:"Ciudad del Este",
      custos:[{desc:"Combustível",valor:320},{desc:"Alimentação",valor:180}], createdAt:now };
    function mk(nome,cat,custo,qtd,preco,desc,anun){ return { id:"prod_"+uid(), nome:nome, categoria:cat, custoUnit:custo, custoExtra:0, quantidade:qtd, precoVenda:preco, imagem:"", imagens:[], video:"", entregaGratis:true, descricao:desc||"", viagemId:trip.id, anunciado:!!anun, createdAt:now }; }
    var prods=[
      mk("iPhone 13 128GB Meia-noite","Celular",2920,3,3999,"Lacrado, garantia. Bateria 100%.",true),
      mk("Fone JBL Tune 520BT Bluetooth","Áudio",164,8,249,"Bluetooth 5.3, até 57h de bateria.",true),
      mk("Notebook Lenovo IdeaPad 3 i5 8GB 256GB","Notebook",2445,2,3299,"Intel i5, 8GB RAM, SSD 256GB.",true),
      mk("Smartwatch Amazfit Bip 5 GPS","Acessórios",263,5,399,"GPS integrado, tela 1.91\".",true),
      mk("Caixa de Som JBL Charge 5","Áudio",543,4,799,"À prova d'água IP67, 20h de bateria.",true),
      mk("Drone DJI Mini 2 SE","Drone",1920,2,2799,"Câmera 2.7K, alcance 4km.",false)
    ];
    state.viagens.push(trip);
    prods.forEach(function(p){ state.produtos.push(p); });
    function sale(prodNome,qtd,preco,plat,taxa,data){ var p=state.produtos.filter(function(x){return x.nome===prodNome;})[0]; if(!p) return; state.vendas.push({ id:"ven_"+uid(), produtoId:p.id, data:data, quantidade:qtd, precoUnit:preco, plataforma:plat, taxaPct:taxa, custoUnitSnapshot:custoProduto(p), createdAt:now }); }
    sale("iPhone 13 128GB",1,3999,"Mercado Livre",12,"2026-07-12");
    sale("Fone JBL Tune 520BT",3,249,"Shopee",14,"2026-07-14");
    sale("Caixa de Som JBL Charge 5",1,799,"WhatsApp",0,"2026-07-16");
    sale("Smartwatch Amazfit Bip 5",2,399,"OLX",0,"2026-07-15");
    saveState();
  }

  /* ---------- roteador ---------- */
  var currentRoute = "dashboard";
  var dashMonth = null;
  function go(route){
    if (!isAdmin && ADMIN_ROUTES.indexOf(route)>=0) route="vitrine";
    currentRoute=route;
    document.querySelectorAll(".nav-item").forEach(function(b){ b.classList.toggle("active", b.getAttribute("data-route")===route); });
    render();
  }
  function render(){
    var view=$("#view"); view.innerHTML="";
    var fn=({ dashboard:renderDashboard, estoque:renderEstoque, vendas:renderVendas, viagens:renderViagens, vitrine:renderVitrine, config:renderConfig, ideias:renderIdeias })[currentRoute];
    try { fn(view); }
    catch(err){
      view.appendChild(el("div",{class:"card card-pad",style:"border-left:4px solid var(--danger)"},[
        el("h3",{style:"color:var(--danger)"},"Não consegui montar esta tela"),
        el("p",{class:"small"},"Seus dados estão salvos — nada foi perdido. Detalhe técnico: "+(err&&err.message||err)),
        el("p",{class:"small muted"},"Tente outra aba, ou recarregue a página (F5).")
      ]));
    }
  }

  /* ---------- componentes ---------- */
  function pageHead(title, sub, right){
    var head=el("div",{class:"page-head"},[ el("div",{},[el("h1",{},title), sub?el("div",{class:"sub"},sub):null]) ]);
    if (right) head.appendChild(right);
    return head;
  }
  function card(title, content, actionLabel, actionFn){
    var head=el("div",{class:"card-title"},[el("h3",{},title)]);
    if (actionLabel){ var b=el("button",{class:"btn ghost sm"},actionLabel); b.addEventListener("click",actionFn); head.appendChild(b); }
    return el("div",{class:"card card-pad"},[head,content]);
  }
  function kpi(label, value, color, sub, subCls, onClick){
    var ch=[ el("div",{class:"label"},[el("span",{class:"dot",style:"background:"+color}),label]), el("div",{class:"value"},value) ];
    if (sub) ch.push(el("div",{class:"sub2 "+(subCls||"muted")},sub));
    if (onClick) ch.push(el("div",{class:"sub2",style:"color:var(--brand-2);font-weight:600"},"ver →"));
    var c=el("div",{class:"card kpi"+(onClick?" clickable":"")},ch);
    if (onClick) c.addEventListener("click",onClick);
    return c;
  }
  function emptyState(icon,title,text,btnLabel,btnFn,btn2Label,btn2Fn){
    var ch=[el("div",{class:"big"},icon),el("h3",{},title),el("p",{style:"max-width:440px;margin:0 auto"},text)];
    if (btnLabel){
      var btns=[]; var b=el("button",{class:"btn primary"},btnLabel); b.addEventListener("click",btnFn); btns.push(b);
      if (btn2Label){ var b2=el("button",{class:"btn"},btn2Label); b2.addEventListener("click",btn2Fn); btns.push(b2); }
      ch.push(el("div",{class:"row-flex mt",style:"justify-content:center;gap:10px"},btns));
    }
    return el("div",{class:"empty"},ch);
  }
  function badge(status){
    var map={estoque:"Fora da vitrine",anunciado:"Na vitrine",vendido:"Esgotado"};
    return el("span",{class:"badge "+status}, map[status]||status);
  }
  function thumb(p){
    if (p.imagem) return el("img",{class:"prod-thumb",src:p.imagem,alt:p.nome});
    return el("div",{class:"prod-thumb ph"}, catIcon(p.categoria));
  }
  function catIcon(cat){
    return ({Celular:"📱",Notebook:"💻",Tablet:"📲",TV:"📺","Áudio":"🎧",Games:"🎮","Câmera":"📷",Drone:"🚁","Acessórios":"🔌",Informática:"🖥️"})[cat] || "📦";
  }

  /* ========================================================
     DASHBOARD
     ======================================================== */
  function renderDashboard(view){
    if (!state.produtos.length && !state.vendas.length){
      view.appendChild(pageHead("Dashboard","Visão do seu negócio"));
      view.appendChild(emptyState("📦","Vamos começar!","Cadastre os produtos que você trouxe do Paraguai e registre suas vendas e viagens. Aqui vão aparecer seu lucro, margens e o capital parado em estoque.","+ Cadastrar produto",function(){ openProductEditor(null); },"Registrar viagem",function(){ go("viagens"); }));
      return;
    }
    var months = allSaleMonths();
    if (!months.length) months=[monthKey(todayISO())];
    if (!dashMonth || (dashMonth!=="all" && months.indexOf(dashMonth)<0)) dashMonth = months[months.length-1];

    var sel=el("select",{class:"input",style:"width:auto"});
    sel.appendChild(el("option",{value:"all",selected:dashMonth==="all"?"selected":null},"Tudo (geral)"));
    months.slice().reverse().forEach(function(mk){ sel.appendChild(el("option",{value:mk,selected:mk===dashMonth?"selected":null},monthLabelFull(mk))); });
    sel.addEventListener("change",function(){ dashMonth=sel.value; render(); });
    var addBtn=el("button",{class:"btn primary"},"+ Produto"); addBtn.addEventListener("click",function(){ openProductEditor(null); });
    view.appendChild(pageHead("Dashboard", dashMonth==="all"?"Resultado geral":monthLabelFull(dashMonth), el("div",{class:"row-flex",style:"gap:10px"},[sel,addBtn])));

    var agg=aggregate(dashMonth);
    view.appendChild(el("div",{class:"grid grid-4"},[
      kpi("Lucro líquido", fmtBRL(agg.lucroLiquido), agg.lucroLiquido>=0?"var(--good)":"var(--danger)", "Vendas − taxas − viagens", agg.lucroLiquido>=0?"pos":"neg"),
      kpi("Receita de vendas", fmtBRL(agg.receita), "var(--accent)", agg.nVendas+" venda(s) · "+agg.unidadesVendidas+" un."),
      kpi("Margem média", agg.receita?pct(agg.margem):"—", "var(--brand)", "sobre a receita"),
      kpi("Capital em estoque", fmtBRL(capitalEstoque()), "var(--warn)", unidadesEstoque()+" un. paradas · potencial "+fmtBRLk(potencialEstoque()), "muted", function(){ go("estoque"); })
    ]));

    // lucro por mês
    var last = months.slice(-6).map(function(mk){ return { label: monthLabel(mk), value: aggregate(mk).lucroLiquido }; });
    var lucroCard = card("Lucro líquido por mês", barsChart(last.length?last:[{label:"—",value:0}]));

    // vendas por plataforma (donut)
    var byPlat={};
    state.vendas.filter(function(v){return dashMonth==="all"||monthKey(v.data)===dashMonth;}).forEach(function(v){ var k=v.plataforma||"Outro"; byPlat[k]=(byPlat[k]||0)+vendaReceita(v); });
    var platData=Object.keys(byPlat).map(function(k,i){ return {label:k,value:byPlat[k],color:PALETTE[i%PALETTE.length]}; }).sort(function(a,b){return b.value-a.value;});
    var platTotal=platData.reduce(function(s,d){return s+d.value;},0);
    var platCard=card("Vendas por plataforma", el("div",{class:"grid grid-2",style:"align-items:center;gap:16px"},[
      el("div",{style:"display:grid;place-items:center"}, donutChart(platData, platTotal)),
      platData.length? el("div",{class:"legend"}, platData.slice(0,8).map(function(d){ return el("div",{class:"row"},[el("span",{class:"sw",style:"background:"+d.color}),el("span",{class:"nm"},d.label),el("span",{class:"vl"},fmtBRLk(d.value))]); })) : el("div",{class:"muted small"},"Sem vendas neste período.")
    ]));
    view.appendChild(el("div",{class:"grid grid-2 mt-lg"},[lucroCard, platCard]));

    // top produtos por lucro
    var lucroPorProd={};
    state.vendas.filter(function(v){return dashMonth==="all"||monthKey(v.data)===dashMonth;}).forEach(function(v){ lucroPorProd[v.produtoId]=(lucroPorProd[v.produtoId]||0)+vendaLucro(v); });
    var tops=Object.keys(lucroPorProd).map(function(id){ var p=prodById(id); return {p:p,lucro:lucroPorProd[id]}; }).filter(function(x){return x.p;}).sort(function(a,b){return b.lucro-a.lucro;}).slice(0,6);
    if (tops.length){
      var list=el("div",{});
      tops.forEach(function(x){
        list.appendChild(el("div",{class:"row-flex",style:"justify-content:space-between;padding:9px 2px;border-bottom:1px solid var(--border)"},[
          el("div",{class:"row-flex",style:"gap:10px"},[ thumb(x.p), el("div",{},[el("div",{style:"font-weight:600"},x.p.nome),el("div",{class:"muted small"},x.p.categoria||"—")]) ]),
          el("span",{class:x.lucro>=0?"val-pos":"val-neg",style:"font-variant-numeric:tabular-nums"},fmtBRL(x.lucro))
        ]));
      });
      view.appendChild(el("div",{class:"mt-lg"}, card("Produtos que mais deram lucro", list)));
    }

    // alerta capital parado
    if (capitalEstoque()>0){
      view.appendChild(el("div",{class:"card card-pad mt-lg",style:"border-left:4px solid var(--warn)"},[
        el("h3",{},"💡 Capital em estoque"),
        el("p",{class:"small",style:"margin:6px 0 0"},"Você tem "+fmtBRL(capitalEstoque())+" investidos em "+unidadesEstoque()+" unidades ainda não vendidas. Se vender tudo pelo preço anunciado, a receita seria "+fmtBRL(potencialEstoque())+" (lucro potencial de ~"+fmtBRL(potencialEstoque()-capitalEstoque())+" antes de taxas).")
      ]));
    }
  }

  /* ========================================================
     ESTOQUE (produtos — CRUD)
     ======================================================== */
  var estFilter = { q:"", cat:"all", status:"all" };
  var estSort = { key:"createdAt", dir:"desc" };
  function renderEstoque(view){
    var addBtn=el("button",{class:"btn primary"},"+ Cadastrar produto"); addBtn.addEventListener("click",function(){ openProductEditor(null); });
    var impBtn2=el("button",{class:"btn"},"🪄 Importar anúncio"); impBtn2.addEventListener("click",openImportAnuncio);
    view.appendChild(pageHead("Estoque", state.produtos.length+" produto(s)", el("div",{class:"row-flex",style:"gap:10px"},[impBtn2,addBtn])));

    if (!state.produtos.length){
      view.appendChild(emptyState("📦","Nenhum produto ainda","Cadastre o que você trouxe do Paraguai — com custo, quantidade e preço de venda. O app calcula a margem automaticamente.","+ Cadastrar produto",function(){ openProductEditor(null); }));
      return;
    }

    var q=el("input",{class:"input",placeholder:"🔎 Buscar produto...",value:estFilter.q});
    q.addEventListener("input",function(){ estFilter.q=q.value; drawEstTable(); });
    var cSel=el("select",{class:"input",style:"width:auto"}); cSel.appendChild(el("option",{value:"all"},"Todas categorias"));
    CATEGORIAS.forEach(function(c){ cSel.appendChild(el("option",{value:c,selected:c===estFilter.cat?"selected":null},c)); });
    cSel.addEventListener("change",function(){ estFilter.cat=cSel.value; drawEstTable(); });
    var seg=el("div",{class:"seg"});
    [["all","Todos"],["estoque","Em estoque"],["vendido","Vendidos"]].forEach(function(pr){ var b=el("button",{class:estFilter.status===pr[0]?"active":""},pr[1]); b.addEventListener("click",function(){ estFilter.status=pr[0]; render(); }); seg.appendChild(b); });
    view.appendChild(el("div",{class:"toolbar"},[el("div",{class:"grow"},q),cSel,seg]));

    var host=el("div",{id:"estHost"}); view.appendChild(host); drawEstTable();
  }
  function filteredProds(){
    var qq=(estFilter.q||"").toLowerCase();
    var list=state.produtos.filter(function(p){
      if (estFilter.cat!=="all" && p.categoria!==estFilter.cat) return false;
      var st=statusProduto(p);
      if (estFilter.status==="estoque" && st==="vendido") return false;
      if (estFilter.status==="vendido" && st!=="vendido") return false;
      if (qq && (p.nome+" "+(p.descricao||"")).toLowerCase().indexOf(qq)<0) return false;
      return true;
    });
    var dir=estSort.dir==="asc"?1:-1;
    list.sort(function(a,b){
      var k=estSort.key, va, vb;
      if (k==="margem"){ va=margemBruta(a); vb=margemBruta(b); }
      else if (k==="custo"){ va=custoProduto(a); vb=custoProduto(b); }
      else if (k==="preco"){ va=a.precoVenda||0; vb=b.precoVenda||0; }
      else if (k==="estoque"){ va=estoqueQtd(a); vb=estoqueQtd(b); }
      else if (k==="nome"){ return a.nome.localeCompare(b.nome,"pt-BR")*dir; }
      else { va=a.createdAt||0; vb=b.createdAt||0; }
      return (va-vb)*dir;
    });
    return list;
  }
  function setEstSort(k){ if(estSort.key===k) estSort.dir=estSort.dir==="asc"?"desc":"asc"; else { estSort.key=k; estSort.dir=(k==="nome")?"asc":"desc"; } drawEstTable(); }
  function drawEstTable(){
    var host=$("#estHost"); if(!host) return; host.innerHTML="";
    var list=filteredProds();
    if (!list.length){ host.appendChild(el("div",{class:"empty"},[el("div",{class:"big"},"🔍"),el("p",{},"Nada encontrado.")])); return; }
    function th(label,key,cls){ var a=estSort.key===key?(estSort.dir==="asc"?" ↑":" ↓"):" ⇅"; var t=el("th",{class:(cls?cls+" ":"")+"sortable"+(estSort.key===key?" sorted":""),onclick:function(){setEstSort(key);}},label+a); return t; }
    var tbl=el("table",{class:"tb"});
    tbl.appendChild(el("thead",{},el("tr",{},[
      el("th",{},""), th("Produto","nome"), el("th",{},"Categoria"), th("Custo un.","custo","num"), th("Preço venda","preco","num"), th("Margem","margem","num"), el("th",{class:"num"},"Mercado"), th("Estoque","estoque","num"), el("th",{},"Status"), el("th",{},"")
    ])));
    var tb=el("tbody");
    list.forEach(function(p){
      var m=margemBruta(p), st=statusProduto(p), est=estoqueQtd(p);
      var tr=el("tr");
      tr.appendChild(el("td",{}, thumb(p)));
      tr.appendChild(el("td",{},el("div",{class:"prod-name",title:p.nome},p.nome)));
      tr.appendChild(el("td",{class:"muted small"},p.categoria||"—"));
      tr.appendChild(el("td",{class:"num"},fmtBRL(custoProduto(p))));
      tr.appendChild(el("td",{class:"num"},p.precoVenda?fmtBRL(p.precoVenda):"—"));
      tr.appendChild(el("td",{class:"num "+(m>=0.2?"val-pos":(m>0?"":"val-neg"))}, p.precoVenda?pct(m):"—"));
      tr.appendChild(celulaMercado(p));
      tr.appendChild(el("td",{class:"num",style:est<=0?"color:var(--danger)":""}, est + " / " + (p.quantidade||0)));
      tr.appendChild(el("td",{}, badge(st)));
      var acts=el("td");
      var sell=el("button",{class:"btn ghost sm",title:"Registrar venda"}, "💰"); sell.addEventListener("click",function(){ openSaleEditor(null, p.id); });
      var pesq=el("button",{class:"btn ghost sm",title:"Pesquisar preço no mercado"}, "🔎"); pesq.addEventListener("click",function(){ openPrecoManual(p); });
      var edit=el("button",{class:"btn ghost sm",title:"Editar"}, "✏️"); edit.addEventListener("click",function(){ openProductEditor(p); });
      var del=el("button",{class:"btn ghost sm danger",title:"Excluir"}, "🗑️"); del.addEventListener("click",function(){ deleteProduct(p); });
      acts.appendChild(el("div",{class:"row-flex"},[est>0?sell:null,pesq,edit,del]));
      tr.appendChild(acts);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    host.appendChild(el("div",{class:"card table-wrap"},tbl));
  }

  function openProductEditor(p, prefill){
    var isNew=!p;
    var d = p || { nome:"", categoria:"Celular", custoUnit:0, quantidade:1, precoVenda:0, imagens:[], descricao:"", viagemId:"", anunciado:false, entregaGratis:true };
    if (isNew && prefill) { for (var pk in prefill) if (prefill[pk]!=null && prefill[pk]!=="") d[pk]=prefill[pk]; }

    var fNome=el("input",{class:"input",value:d.nome,placeholder:"ex.: iPhone 15 128GB Preto"});
    var fCat=el("select",{class:"input"}); CATEGORIAS.forEach(function(c){ fCat.appendChild(el("option",{value:c,selected:c===d.categoria?"selected":null},c)); });
    var fCusto=el("input",{class:"input",type:"number",step:"0.01",value:d.custoUnit||0});
    var fQtd=el("input",{class:"input",type:"number",step:"1",min:"1",value:d.quantidade||1});
    var fPreco=el("input",{class:"input",type:"number",step:"0.01",value:d.precoVenda||0});
    var margemOut=el("div",{class:"hint"});
    function recalcMargem(){
      var custo=parseNum(fCusto.value), preco=parseNum(fPreco.value);
      var m = preco? (preco-custo)/preco : 0;
      margemOut.innerHTML = preco? ("Margem: <strong style='color:"+(m>=0.2?"var(--good-ink)":(m>0?"var(--warn)":"var(--danger)"))+"'>"+pct(m)+"</strong> · lucro por unidade "+fmtBRL(preco-custo)) : "Informe o preço de venda para ver a margem.";
    }
    fCusto.addEventListener("input",recalcMargem); fPreco.addEventListener("input",recalcMargem);

    var fViagem=el("select",{class:"input"}); fViagem.appendChild(el("option",{value:""},"— nenhuma —"));
    state.viagens.slice().sort(function(a,b){return (b.data||"").localeCompare(a.data||"");}).forEach(function(t){ fViagem.appendChild(el("option",{value:t.id,selected:t.id===d.viagemId?"selected":null}, (t.nome||"Viagem")+" · "+fmtDateBR(t.data))); });
    var fDesc=el("textarea",{class:"input",style:"min-height:64px",placeholder:"descrição para a vitrine / anúncio"}); fDesc.value=d.descricao||"";
    var fAnunciado=el("input",{type:"checkbox",checked:d.anunciado?"checked":null});

    // galeria de fotos
    var imagens = (d.imagens && d.imagens.length) ? d.imagens.slice() : (d.imagem?[d.imagem]:[]);
    var galeria=el("div",{class:"galeria"});
    function drawGaleria(){
      galeria.innerHTML="";
      imagens.forEach(function(src,i){
        var cell=el("div",{class:"gcell"+(i===0?" main":"")});
        cell.appendChild(el("img",{src:src,alt:"foto "+(i+1)}));
        var rm=el("button",{class:"grm",title:"Remover"},"✕");
        rm.addEventListener("click",function(){ imagens.splice(i,1); drawGaleria(); });
        cell.appendChild(rm);
        if (i>0){ var up=el("button",{class:"gup",title:"Tornar principal"},"★"); up.addEventListener("click",function(){ imagens.unshift(imagens.splice(i,1)[0]); drawGaleria(); }); cell.appendChild(up); }
        else cell.appendChild(el("span",{class:"gmain"},"principal"));
        galeria.appendChild(cell);
      });
      var add=el("div",{class:"gadd",title:"Adicionar fotos"},"＋");
      add.addEventListener("click",function(){ fileInput.click(); });
      galeria.appendChild(add);
    }
    var fileInput=el("input",{type:"file",accept:"image/*",multiple:"multiple",class:"hidden"});
    fileInput.addEventListener("change",function(){
      var fs=[].slice.call(fileInput.files||[]); if(!fs.length) return;
      var pend=fs.length;
      fs.forEach(function(f){ fileToResizedDataURL(f,function(dataURL){ if(dataURL) imagens.push(dataURL); if(--pend===0){ drawGaleria(); toast(fs.length+" foto(s) adicionada(s)","good"); } }); });
      fileInput.value="";
    });
    var urlBtn=el("button",{class:"btn sm"},"🔗 Adicionar por link");
    urlBtn.addEventListener("click",function(){
      var inp=el("input",{class:"input",placeholder:"https://.../foto.jpg"});
      modal("Adicionar foto por link", el("div",{class:"stack"},[el("p",{class:"muted small",style:"margin:0"},"Cole o endereço da imagem (útil para fotos importadas de anúncios)."),inp]),
        [{label:"Cancelar",cls:"btn ghost",onClick:function(){ closeModal(); }},
         {label:"Adicionar",cls:"btn primary",onClick:function(){ var u=inp.value.trim(); if(u){ imagens.push(u); drawGaleria(); } closeModal(); }}]);
    });
    drawGaleria();

    var fVideo=el("input",{class:"input",value:d.video||"",placeholder:"link do YouTube ou .mp4 (opcional)"});
    var fEntrega=el("input",{type:"checkbox",checked:(d.entregaGratis!==false)?"checked":null});

    setTimeout(recalcMargem,0);

    var body=el("div",{class:"stack"},[
      el("div",{class:"grid grid-2",style:"gap:16px"},[
        el("div",{class:"stack"},[
          el("label",{class:"field"},[el("span",{class:"lbl"},"Nome do produto"),fNome]),
          el("div",{class:"grid grid-2"},[ el("label",{class:"field"},[el("span",{class:"lbl"},"Categoria"),fCat]), el("label",{class:"field"},[el("span",{class:"lbl"},"Quantidade"),fQtd]) ]),
          el("div",{class:"grid grid-2"},[
            el("label",{class:"field"},[el("span",{class:"lbl"},"Custo unitário (R$)"),fCusto]),
            el("label",{class:"field"},[el("span",{class:"lbl"},"Preço de venda (R$)"),fPreco])
          ]),
          margemOut
        ]),
        el("div",{class:"field"},[
          el("div",{class:"row-flex",style:"justify-content:space-between"},[el("span",{class:"lbl"},"Fotos (a 1ª é a capa)"),urlBtn]),
          galeria, fileInput,
          el("label",{class:"field mt"},[el("span",{class:"lbl"},"Vídeo (opcional)"),fVideo])
        ])
      ]),
      el("label",{class:"field"},[el("span",{class:"lbl"},"Viagem de origem"),fViagem]),
      el("label",{class:"field"},[el("span",{class:"lbl"},"Descrição (aparece na página do produto)"),fDesc]),
      el("div",{class:"row-flex wrap",style:"gap:18px"},[
        el("label",{class:"row-flex small",style:"cursor:pointer"},[fAnunciado,"Publicar na vitrine (cliente vê este produto)"]),
        el("label",{class:"row-flex small",style:"cursor:pointer"},[fEntrega,"Entrega grátis (Toledo / Cascavel / Marechal)"])
      ])
    ]);

    modal(isNew?"Novo produto":"Editar produto", body, [
      { label:"Cancelar", cls:"btn ghost", onClick:closeModal },
      { label:"Salvar", cls:"btn primary", onClick:function(){
        if (!fNome.value.trim()){ toast("Informe o nome do produto.","err"); return; }
        var obj={ nome:fNome.value.trim(), categoria:fCat.value,
          custoUnit:parseNum(fCusto.value), custoExtra:0,
          quantidade:Math.max(1,parseInt(fQtd.value,10)||1), precoVenda:parseNum(fPreco.value),
          imagens:imagens, imagem:imagens[0]||"", video:fVideo.value.trim(), entregaGratis:fEntrega.checked,
          descricao:fDesc.value.trim(), viagemId:fViagem.value, anunciado:fAnunciado.checked };
        if (isNew){ obj.id="prod_"+uid(); obj.createdAt=Date.now(); state.produtos.push(obj); }
        else { for (var k in obj) p[k]=obj[k]; }
        saveState(); closeModal(); render();
        toast(isNew?"Produto cadastrado ✓":"Produto atualizado ✓","good");
      }}
    ], "wide");
  }

  function deleteProduct(p){
    var nv=state.vendas.filter(function(v){return v.produtoId===p.id;}).length;
    var msg="Excluir \""+p.nome+"\"?";
    if (nv) msg+=" Isto também remove "+nv+" venda(s) registrada(s) deste produto.";
    confirmModal("Excluir produto?", msg, function(){
      state.vendas=state.vendas.filter(function(v){return v.produtoId!==p.id;});
      state.produtos=state.produtos.filter(function(x){return x.id!==p.id;});
      saveState(); render(); toast("Produto excluído");
    });
  }

  /* ========================================================
     VENDAS
     ======================================================== */
  var venSort={key:"data",dir:"desc"};
  function renderVendas(view){
    var addBtn=el("button",{class:"btn primary"},"+ Registrar venda"); addBtn.addEventListener("click",function(){ openSaleEditor(null,null); });
    view.appendChild(pageHead("Vendas", state.vendas.length+" venda(s)", addBtn));
    if (!state.vendas.length){
      view.appendChild(emptyState("💰","Nenhuma venda ainda","Registre suas vendas escolhendo o produto, a quantidade, o preço e a plataforma (com a taxa do marketplace). O lucro real é calculado na hora.","+ Registrar venda",function(){ openSaleEditor(null,null); }));
      return;
    }
    var agg=aggregate("all");
    view.appendChild(el("div",{class:"grid grid-3"},[
      kpi("Receita total", fmtBRL(agg.receita), "var(--accent)"),
      kpi("Lucro das vendas", fmtBRL(agg.lucroVendas), agg.lucroVendas>=0?"var(--good)":"var(--danger)"),
      kpi("Margem média", agg.receita?pct(agg.margem):"—", "var(--brand)")
    ]));

    var list=state.vendas.slice();
    var dir=venSort.dir==="asc"?1:-1;
    list.sort(function(a,b){ var k=venSort.key,va,vb; if(k==="lucro"){va=vendaLucro(a);vb=vendaLucro(b);} else if(k==="valor"){va=vendaReceita(a);vb=vendaReceita(b);} else {va=a.data;vb=b.data;} if(va<vb)return -1*dir; if(va>vb)return 1*dir; return 0; });

    function th(label,key,cls){ var a=venSort.key===key?(venSort.dir==="asc"?" ↑":" ↓"):" ⇅"; return el("th",{class:(cls?cls+" ":"")+"sortable"+(venSort.key===key?" sorted":""),onclick:function(){ if(venSort.key===key)venSort.dir=venSort.dir==="asc"?"desc":"asc"; else{venSort.key=key;venSort.dir="desc";} render(); }},label+a); }
    var tbl=el("table",{class:"tb"});
    tbl.appendChild(el("thead",{},el("tr",{},[ th("Data","data"), el("th",{},"Produto"), el("th",{},"Plataforma"), el("th",{class:"num"},"Qtd"), th("Valor","valor","num"), th("Lucro","lucro","num"), el("th",{},"") ])));
    var tb=el("tbody");
    list.forEach(function(v){
      var p=prodById(v.produtoId); var lu=vendaLucro(v);
      var tr=el("tr");
      tr.appendChild(el("td",{},fmtDateBR(v.data)));
      tr.appendChild(el("td",{},[el("div",{style:"font-weight:600"},p?p.nome:"(produto removido)"), v.taxaPct?el("div",{class:"muted small"},"taxa "+v.taxaPct+"%"):null]));
      tr.appendChild(el("td",{class:"muted small"},v.plataforma||"—"));
      tr.appendChild(el("td",{class:"num"},v.quantidade));
      tr.appendChild(el("td",{class:"num"},fmtBRL(vendaReceita(v))));
      tr.appendChild(el("td",{class:"num "+(lu>=0?"val-pos":"val-neg")},fmtBRL(lu)));
      var acts=el("td");
      var edit=el("button",{class:"btn ghost sm"},"✏️"); edit.addEventListener("click",function(){ openSaleEditor(v,null); });
      var del=el("button",{class:"btn ghost sm danger"},"🗑️"); del.addEventListener("click",function(){ confirmModal("Excluir venda?","O produto volta ao estoque.",function(){ state.vendas=state.vendas.filter(function(x){return x.id!==v.id;}); saveState(); render(); toast("Venda excluída"); }); });
      acts.appendChild(el("div",{class:"row-flex"},[edit,del]));
      tr.appendChild(acts);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    view.appendChild(el("div",{class:"card table-wrap mt-lg"},tbl));
  }

  function openSaleEditor(v, presetProdId){
    var isNew=!v;
    var d = v || { produtoId:presetProdId||"", data:todayISO(), quantidade:1, precoUnit:0, plataforma:"Mercado Livre", taxaPct:0 };
    if (state.produtos.length===0){ toast("Cadastre um produto antes de registrar uma venda.","err"); go("estoque"); return; }

    var fProd=el("select",{class:"input"});
    state.produtos.forEach(function(p){ var est=estoqueQtd(p); fProd.appendChild(el("option",{value:p.id,selected:p.id===d.produtoId?"selected":null}, p.nome+" (estoque: "+est+")")); });
    if (!d.produtoId) d.produtoId=fProd.value;
    var fData=el("input",{class:"input",type:"date",value:d.data});
    var fQtd=el("input",{class:"input",type:"number",min:"1",step:"1",value:d.quantidade||1});
    var fPreco=el("input",{class:"input",type:"number",step:"0.01",value:d.precoUnit||0});
    var fPlat=el("select",{class:"input"}); PLATAFORMAS.forEach(function(pl){ fPlat.appendChild(el("option",{value:pl,selected:pl===d.plataforma?"selected":null},pl)); });
    var fTaxa=el("input",{class:"input",type:"number",step:"0.1",value:d.taxaPct||0});
    var out=el("div",{class:"hint"});
    function recalc(){
      var p=prodById(fProd.value); var custo=p?custoProduto(p):0;
      var qtd=Math.max(1,parseInt(fQtd.value,10)||1), preco=parseNum(fPreco.value), taxa=parseNum(fTaxa.value);
      var receita=preco*qtd, tx=receita*taxa/100, lucro=receita-tx-custo*qtd;
      out.innerHTML = "Custo unitário: "+fmtBRL(custo)+" · Receita: "+fmtBRL(receita)+" · Taxa: "+fmtBRL(tx)+"<br><strong style='color:"+(lucro>=0?"var(--good-ink)":"var(--danger)")+"'>Lucro desta venda: "+fmtBRL(lucro)+"</strong>";
      if (isNew && preco===0 && p && p.precoVenda){ /* sugestão */ }
    }
    fProd.addEventListener("change",function(){ var p=prodById(fProd.value); if(p&&p.precoVenda&&parseNum(fPreco.value)===0) fPreco.value=p.precoVenda; recalc(); });
    [fQtd,fPreco,fTaxa].forEach(function(x){ x.addEventListener("input",recalc); });
    // preenche preço sugerido
    if (isNew){ var p0=prodById(d.produtoId); if(p0&&p0.precoVenda&&!d.precoUnit) fPreco.value=p0.precoVenda; }
    setTimeout(recalc,0);

    var body=el("div",{class:"stack"},[
      el("label",{class:"field"},[el("span",{class:"lbl"},"Produto"),fProd]),
      el("div",{class:"grid grid-2"},[ el("label",{class:"field"},[el("span",{class:"lbl"},"Data"),fData]), el("label",{class:"field"},[el("span",{class:"lbl"},"Quantidade"),fQtd]) ]),
      el("div",{class:"grid grid-2"},[ el("label",{class:"field"},[el("span",{class:"lbl"},"Preço de venda unitário (R$)"),fPreco]), el("label",{class:"field"},[el("span",{class:"lbl"},"Plataforma"),fPlat]) ]),
      el("label",{class:"field"},[el("span",{class:"lbl"},"Taxa da plataforma (%)"),fTaxa]),
      el("div",{class:"card card-pad",style:"background:var(--surface-2)"}, out)
    ]);

    modal(isNew?"Registrar venda":"Editar venda", body, [
      { label:"Cancelar", cls:"btn ghost", onClick:closeModal },
      { label:"Salvar", cls:"btn primary", onClick:function(){
        var p=prodById(fProd.value); if(!p){ toast("Escolha um produto.","err"); return; }
        var qtd=Math.max(1,parseInt(fQtd.value,10)||1);
        var obj={ produtoId:fProd.value, data:fData.value, quantidade:qtd, precoUnit:parseNum(fPreco.value), plataforma:fPlat.value, taxaPct:parseNum(fTaxa.value), custoUnitSnapshot:custoProduto(p) };
        if (isNew){ obj.id="ven_"+uid(); obj.createdAt=Date.now(); state.vendas.push(obj); }
        else { for(var k in obj) v[k]=obj[k]; }
        saveState(); closeModal(); render();
        toast(isNew?"Venda registrada ✓":"Venda atualizada ✓","good");
      }}
    ]);
  }

  /* ========================================================
     VIAGENS
     ======================================================== */
  function renderViagens(view){
    var addBtn=el("button",{class:"btn primary"},"+ Nova viagem"); addBtn.addEventListener("click",function(){ openTripEditor(null); });
    view.appendChild(pageHead("Viagens", state.viagens.length+" viagem(ns)", addBtn));
    if (!state.viagens.length){
      view.appendChild(emptyState("🚗","Nenhuma viagem registrada","Cadastre suas viagens ao Paraguai com os gastos (combustível, pedágio, hospedagem, alimentação, imposto...). Isso entra no cálculo do lucro do negócio.","+ Nova viagem",function(){ openTripEditor(null); }));
      return;
    }
    var totalGeral=state.viagens.reduce(function(s,t){return s+tripTotal(t);},0);
    view.appendChild(el("div",{class:"grid grid-3"},[
      kpi("Total gasto em viagens", fmtBRL(totalGeral), "var(--danger)"),
      kpi("Viagens", String(state.viagens.length), "var(--accent)"),
      kpi("Custo médio por viagem", fmtBRL(totalGeral/state.viagens.length), "var(--warn)")
    ]));
    var listWrap=el("div",{class:"stack mt-lg"});
    state.viagens.slice().sort(function(a,b){return (b.data||"").localeCompare(a.data||"");}).forEach(function(t){
      var prods=state.produtos.filter(function(p){return p.viagemId===t.id;});
      var itens=el("div",{});
      (t.custos||[]).forEach(function(c){ itens.appendChild(el("div",{class:"row-flex",style:"justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"},[el("span",{class:"small"},c.desc),el("span",{class:"small val-neg",style:"font-variant-numeric:tabular-nums"},fmtBRL(c.valor))])); });
      var edit=el("button",{class:"btn ghost sm"},"✏️ Editar"); edit.addEventListener("click",function(){ openTripEditor(t); });
      var del=el("button",{class:"btn ghost sm danger"},"🗑️"); del.addEventListener("click",function(){ confirmModal("Excluir viagem?","Os produtos ligados a ela continuam no estoque (sem viagem).",function(){ state.produtos.forEach(function(p){ if(p.viagemId===t.id) p.viagemId=""; }); state.viagens=state.viagens.filter(function(x){return x.id!==t.id;}); saveState(); render(); toast("Viagem excluída"); }); });
      listWrap.appendChild(el("div",{class:"card card-pad"},[
        el("div",{class:"row-flex",style:"justify-content:space-between;align-items:flex-start"},[
          el("div",{},[ el("div",{style:"font-weight:700;font-size:16px"},(t.nome||"Viagem")), el("div",{class:"muted small"},[fmtDateBR(t.data), t.destino].filter(Boolean).join(" · ")) ]),
          el("div",{style:"text-align:right"},[ el("div",{style:"font-weight:800;font-size:18px;color:var(--danger)"},fmtBRL(tripTotal(t))), el("div",{class:"muted small"},prods.length+" produto(s) ligados") ])
        ]),
        (t.custos&&t.custos.length)?el("div",{class:"mt"},itens):null,
        el("div",{class:"row-flex mt",style:"gap:8px"},[edit,del])
      ]));
    });
    view.appendChild(listWrap);
  }

  function openTripEditor(t){
    var isNew=!t;
    var d = t || { nome:"", data:todayISO(), destino:"Ciudad del Este", custos:[{desc:"Combustível",valor:0},{desc:"Alimentação",valor:0}] };
    var custos = JSON.parse(JSON.stringify(d.custos||[]));

    var fNome=el("input",{class:"input",value:d.nome||"",placeholder:"ex.: Viagem julho"});
    var fData=el("input",{class:"input",type:"date",value:d.data});
    var fDest=el("input",{class:"input",value:d.destino||"",placeholder:"Ciudad del Este, Pedro Juan..."});
    var itensHost=el("div",{});
    var totalOut=el("div",{class:"row-flex",style:"justify-content:space-between;font-weight:700;padding-top:10px;border-top:1px solid var(--border);margin-top:6px"});
    function drawItens(){
      itensHost.innerHTML="";
      custos.forEach(function(c,idx){
        var desc=el("input",{class:"input",value:c.desc,placeholder:"descrição"}); desc.addEventListener("input",function(){ c.desc=desc.value; });
        var val=el("input",{class:"input",type:"number",step:"0.01",value:c.valor,style:"width:130px;text-align:right"}); val.addEventListener("input",function(){ c.valor=parseNum(val.value); updTotal(); });
        var rm=el("button",{class:"btn ghost sm danger"},"✕"); rm.addEventListener("click",function(){ custos.splice(idx,1); drawItens(); updTotal(); });
        itensHost.appendChild(el("div",{class:"row-flex",style:"gap:8px;margin-bottom:8px"},[el("div",{style:"flex:1"},desc),val,rm]));
      });
    }
    function updTotal(){ totalOut.innerHTML=""; totalOut.appendChild(el("span",{},"Total da viagem")); totalOut.appendChild(el("span",{style:"color:var(--danger)"},fmtBRL(custos.reduce(function(s,c){return s+(parseNum(c.valor));},0)))); }
    var addItem=el("button",{class:"btn sm mt"},"+ Adicionar gasto"); addItem.addEventListener("click",function(){ custos.push({desc:"",valor:0}); drawItens(); });
    drawItens(); updTotal();

    var body=el("div",{class:"stack"},[
      el("div",{class:"grid grid-2"},[ el("label",{class:"field"},[el("span",{class:"lbl"},"Nome/rótulo"),fNome]), el("label",{class:"field"},[el("span",{class:"lbl"},"Data"),fData]) ]),
      el("label",{class:"field"},[el("span",{class:"lbl"},"Destino"),fDest]),
      el("div",{class:"field"},[el("span",{class:"lbl"},"Gastos da viagem"), itensHost, addItem, totalOut])
    ]);

    modal(isNew?"Nova viagem":"Editar viagem", body, [
      { label:"Cancelar", cls:"btn ghost", onClick:closeModal },
      { label:"Salvar", cls:"btn primary", onClick:function(){
        var obj={ nome:fNome.value.trim(), data:fData.value, destino:fDest.value.trim(), custos:custos.filter(function(c){return c.desc||c.valor;}).map(function(c){return {desc:c.desc||"Gasto",valor:parseNum(c.valor)};}) };
        if (isNew){ obj.id="trip_"+uid(); obj.createdAt=Date.now(); state.viagens.push(obj); }
        else { for(var k in obj) t[k]=obj[k]; }
        saveState(); closeModal(); render();
        toast(isNew?"Viagem registrada ✓":"Viagem atualizada ✓","good");
      }}
    ]);
  }

  /* ========================================================
     VITRINE
     ======================================================== */
  function renderVitrine(view){
    var pubBtn=null;
    if (isAdmin){ pubBtn=el("button",{class:"btn primary"},"🌐 Atualizar loja online"); pubBtn.addEventListener("click",publicarVitrineDireto); }
    view.appendChild(pageHead(isAdmin?"Vitrine":(state.settings.lojaNome||"Klak Emporium"), isAdmin?"Prévia do que o cliente vê":(state.settings.slogan||"Produtos disponíveis"), pubBtn));
    var anunciados=state.produtos.filter(function(p){ return estoqueQtd(p)>0 && p.anunciado; });

    if (isAdmin){
      var st, cls;
      if (!cloudUser){ st="Você não está conectado à nuvem — entre em Configurações para a loja online funcionar."; cls="var(--danger)"; }
      else if (state.settings.ultimaPublicacao){ st="Loja online atualizada em "+fmtDateTime(state.settings.ultimaPublicacao)+"."; cls="var(--brand)"; }
      else { st="A loja online ainda não foi publicada. Clique em \"Atualizar loja online\"."; cls="var(--warn)"; }
      var linhas=[ el("div",{style:"font-weight:700"},"Loja online"), el("div",{class:"small",style:"margin-top:4px"},st) ];
      if (state.settings.siteUrl){
        linhas.push(el("div",{class:"small",style:"margin-top:6px"},[
          el("span",{class:"muted"},"Link do cliente: "),
          el("a",{href:state.settings.siteUrl,target:"_blank",rel:"noopener"},state.settings.siteUrl)
        ]));
      }
      var shellBtn=el("button",{class:"btn sm"},"⬇️ Baixar vitrine.html (só na 1ª vez)");
      shellBtn.addEventListener("click",exportVitrineShell);
      linhas.push(el("div",{class:"row-flex mt",style:"gap:8px"},[shellBtn]));
      linhas.push(el("div",{class:"small muted",style:"margin-top:6px"},"Depois de enviar esse arquivo ao GitHub uma vez, a loja passa a se atualizar sozinha — não precisa mais mexer nele."));
      view.appendChild(el("div",{class:"card card-pad",style:"border-left:4px solid "+cls+";margin-bottom:18px"},linhas));
    }

    if (!anunciados.length){
      view.appendChild(emptyState("🛍️","Sua vitrine está vazia", isAdmin?"Cadastre produtos com foto e preço no Estoque — os que tiverem estoque aparecem aqui.":"Em breve novos produtos.", isAdmin?"Ir para o Estoque":null, function(){ go("estoque"); }));
      return;
    }
    var grid=el("div",{class:"vitrine-grid mt-lg"});
    anunciados.forEach(function(p){
      var vimg = p.imagem ? el("img",{class:"vimg",src:p.imagem,alt:p.nome}) : el("div",{class:"vimg"},catIcon(p.categoria));
      var foot;
      if (isAdmin){
        foot=[];
      } else if (state.settings.whatsapp){
        foot=[el("a",{class:"btn primary sm",style:"flex:1;justify-content:center;text-decoration:none",target:"_blank",rel:"noopener",href:"https://wa.me/"+state.settings.whatsapp+"?text="+encodeURIComponent("Olá! Tenho interesse no produto: "+p.nome)},"Tenho interesse")];
      } else foot=[];
      grid.appendChild(el("div",{class:"vcard"},[
        vimg,
        el("div",{class:"vbody"},[
          el("div",{class:"vname"},p.nome),
          el("div",{class:"vprice"}, p.precoVenda?fmtBRL(p.precoVenda):"Consulte"),
          el("div",{class:"vdesc"}, p.categoria || ""),
          el("span",{class:"pill",style:"align-self:flex-start"}, estoqueQtd(p)+" em estoque")
        ]),
        foot.length?el("div",{class:"vfoot"},foot):null
      ]));
    });
    view.appendChild(grid);
  }

  /* ---------- publicar vitrine (site pronto, sem código de gestão) ---------- */
  var KLAK_ICON = '<svg viewBox="0 0 72 72" width="42" height="42" aria-hidden="true"><defs><linearGradient id="kg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1baf7a"/><stop offset="1" stop-color="#2a78d6"/></linearGradient></defs><g fill="#8fb4ff" opacity=".45"><rect x="1" y="24" width="7" height="5" rx="2.5"/><rect x="1" y="33.5" width="7" height="5" rx="2.5"/><rect x="1" y="43" width="7" height="5" rx="2.5"/><rect x="64" y="24" width="7" height="5" rx="2.5"/><rect x="64" y="33.5" width="7" height="5" rx="2.5"/><rect x="64" y="43" width="7" height="5" rx="2.5"/></g><rect x="8" y="8" width="56" height="56" rx="16" fill="url(#kg)"/><g stroke="#fff" stroke-width="5.5" stroke-linecap="round" fill="none"><path d="M27 22 V50"/><path d="M27 36 L45 22"/><path d="M27 36 L45 50"/></g><circle cx="45" cy="22" r="3.4" fill="#fff"/><circle cx="45" cy="50" r="3.4" fill="#fff"/></svg>';
  var KLAK_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%231baf7a'/%3E%3Cstop offset='1' stop-color='%232a78d6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='4' y='4' width='64' height='64' rx='18' fill='url(%23g)'/%3E%3Cg stroke='%23fff' stroke-width='6' stroke-linecap='round' fill='none'%3E%3Cpath d='M26 20 V52'/%3E%3Cpath d='M26 36 L46 20'/%3E%3Cpath d='M26 36 L46 52'/%3E%3C/g%3E%3Ccircle cx='46' cy='20' r='4' fill='%23fff'/%3E%3Ccircle cx='46' cy='52' r='4' fill='%23fff'/%3E%3C/svg%3E";

  function publicarVitrineDireto(){
    var prods=produtosPublicaveis(true);
    if (!prods.length){ toast("Marque ao menos um produto como \"Publicar na vitrine\".","err"); return; }
    if (!cloudUser){ toast("Entre na nuvem em Configurações para atualizar a loja.","err"); return; }
    publicarNaNuvem(function(ok,info){
      if(ok) toast("Loja online atualizada ✓ — "+info+" produto(s)","good");
      else toast("Erro ao atualizar a loja: "+info,"err");
      render();
    });
  }
  function produtosPublicaveis(somenteAnunciados){
    return state.produtos.filter(function(p){ return estoqueQtd(p)>0 && (!somenteAnunciados || p.anunciado); });
  }

  /* ---------- catálogo público (o que o cliente pode ver) ---------- */
  // ATENÇÃO: só entram campos seguros. Custo, margem, lucro, vendas e viagens
  // NUNCA saem daqui.
  function catalogoPublico(){
    var prods = produtosPublicaveis(true).map(function(p){
      var imgs=(p.imagens&&p.imagens.length)?p.imagens:(p.imagem?[p.imagem]:[]);
      return { id:p.id, n:p.nome, c:p.categoria||"", pr:p.precoVenda||0, d:p.descricao||"",
               im:imgs, v:p.video||"", e:estoqueQtd(p), fg:(p.entregaGratis!==false), ic:catIcon(p.categoria) };
    });
    return {
      loja: { nome: state.settings.lojaNome||"Klak Emporium",
              slogan: state.settings.slogan||"",
              whatsapp: (state.settings.whatsapp||"").replace(/\D/g,""),
              entrega: state.settings.entregaTexto||"" },
      produtos: prods
    };
  }

  // envia o catálogo para a nuvem — é isso que faz a loja online mudar
  function publicarNaNuvem(cb){
    cb = cb || function(){};
    if(!sb||!cloudUser) return cb(false,"você precisa entrar na nuvem (Configurações)");
    var cat = catalogoPublico();
    sb.from("vitrine_publica").upsert({
      dono: cloudUser.id, loja: cat.loja, produtos: cat.produtos,
      atualizado_em: new Date().toISOString()
    }).then(function(r){
      if(r.error) return cb(false, r.error.message);
      state.settings.ultimaPublicacao = Date.now(); saveLocalOnly();
      cb(true, cat.produtos.length);
    }, function(e){ cb(false,String(e)); });
  }

  // sobe o catálogo junto com a sincronização automática
  function publicarAuto(){
    if(!cloudUser) return;
    if(estadoVazio(state)) return;   // segurança: automático nunca apaga a loja
    publicarNaNuvem(function(ok,err){ if(!ok) console.warn("loja:",err); });
  }

  /* ---------- gera o vitrine.html (só uma vez!) ----------
     A página é uma "casca": ela busca os produtos na nuvem toda vez que abre.
     Por isso você não precisa gerar de novo a cada mudança.               */
  function exportVitrineShell(){
    if(!cloudUser){ toast("Entre na nuvem primeiro (Configurações).","err"); return; }
    var URLB = state.settings.sbUrl, KEYB = state.settings.sbKey, DONO = cloudUser.id;
    var html = [
'<!DOCTYPE html>',
'<html lang="pt-BR"><head><meta charset="UTF-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1">',
'<title>'+escHtml(state.settings.lojaNome||"Klak Emporium")+'</title>',
'<link rel="icon" type="image/svg+xml" href="'+KLAK_FAVICON+'">',
'<style>',
':root{--bg:#1f242e;--surf:#2a313d;--surf2:#333b49;--ink:#f3f5f9;--ink2:#ccd4e0;--muted:#98a3b5;',
'--bd:rgba(255,255,255,.13);--brand:#25d295;--brand2:#1cb27d;--accent:#5aa2ff;--sh:0 2px 6px rgba(0,0,0,.22),0 12px 32px rgba(0,0,0,.26)}',
'*{box-sizing:border-box}',
'body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}',
'a{color:inherit}',
'header{background:var(--surf);border-bottom:1px solid var(--bd);padding:18px 20px;position:sticky;top:0;z-index:9;box-shadow:0 2px 14px rgba(0,0,0,.18)}',
'.hwrap{max-width:1120px;margin:0 auto;display:flex;align-items:center;gap:13px;flex-wrap:wrap}',
'.brand{display:flex;align-items:center;gap:12px;cursor:pointer}',
'.kname{font-size:21px;font-weight:800;background:linear-gradient(90deg,var(--brand),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1}',
'.ktag{font-size:9px;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-top:5px}',
'.slogan{color:var(--muted);font-size:14px;margin-left:auto}',
'.ship{background:linear-gradient(90deg,var(--brand2),var(--accent));color:#fff;text-align:center;font-size:13.5px;font-weight:700;padding:9px 16px}',
'.tools{max-width:1120px;margin:22px auto 0;padding:0 20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}',
'#q{flex:1;min-width:200px;padding:11px 14px;border-radius:11px;border:1px solid var(--bd);background:var(--surf);color:var(--ink);font:inherit}',
'#q::placeholder{color:var(--muted)}',
'.chips{display:flex;gap:7px;flex-wrap:wrap}',
'.chip{padding:8px 14px;border-radius:999px;border:1px solid var(--bd);background:var(--surf);color:var(--ink2);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}',
'.chip:hover{background:var(--surf2)}',
'.chip.active{background:var(--brand);border-color:var(--brand);color:#08231a}',
'main{max-width:1120px;margin:0 auto;padding:22px 20px 60px}',
'.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:20px}',
'.card{background:var(--surf);border:1px solid var(--bd);border-radius:16px;overflow:hidden;box-shadow:var(--sh);display:flex;flex-direction:column;cursor:pointer;transition:transform .13s,box-shadow .13s,border-color .13s}',
'.card:hover{transform:translateY(-4px);border-color:var(--brand);box-shadow:0 16px 44px rgba(0,0,0,.34)}',
'.media{aspect-ratio:4/3;background:var(--surf2);display:grid;place-items:center;overflow:hidden}',
'.media img{width:100%;height:100%;object-fit:cover}.media .ph{font-size:52px;opacity:.45}',
'.body{padding:15px;display:flex;flex-direction:column;gap:7px;flex:1}',
'.cat{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}',
'.card h2{font-size:15.5px;margin:0;font-weight:700;line-height:1.35}',
'.price{font-size:23px;font-weight:800;color:var(--brand);letter-spacing:-.02em}',
'.tagfree{display:inline-block;font-size:11px;font-weight:800;color:var(--brand);background:rgba(37,210,149,.14);border:1px solid rgba(37,210,149,.35);padding:3px 9px;border-radius:999px}',
'.stock{font-size:12px;color:var(--muted)}',
'.cta{display:block;margin:0 15px 15px;padding:11px;border-radius:11px;background:var(--surf2);border:1px solid var(--bd);color:var(--ink);text-align:center;font-weight:700;font-size:14px}',
'.aviso{text-align:center;color:var(--muted);padding:60px 20px}',
'.back{background:none;border:none;color:var(--ink2);font:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:8px 0;margin-bottom:12px;display:flex;align-items:center;gap:7px}',
'.back:hover{color:var(--brand)}',
'.detail{display:grid;grid-template-columns:1.05fr .95fr;gap:34px;align-items:start}',
'@media(max-width:820px){.detail{grid-template-columns:1fr;gap:22px}}',
'.gal .big{background:var(--surf);border:1px solid var(--bd);border-radius:16px;overflow:hidden;aspect-ratio:1;display:grid;place-items:center}',
'.gal .big img{width:100%;height:100%;object-fit:contain}',
'.gal .big .ph{font-size:88px;opacity:.4}',
'.thumbs{display:flex;gap:9px;margin-top:11px;flex-wrap:wrap}',
'.thumbs img{width:66px;height:66px;object-fit:cover;border-radius:10px;border:2px solid transparent;cursor:pointer;background:var(--surf2)}',
'.thumbs img.on{border-color:var(--brand)}',
'.info h1{font-size:25px;margin:0 0 6px;line-height:1.25;letter-spacing:-.01em}',
'.info .pbox{background:var(--surf);border:1px solid var(--bd);border-radius:16px;padding:20px;margin:16px 0}',
'.info .big-price{font-size:36px;font-weight:800;color:var(--brand);letter-spacing:-.02em;line-height:1}',
'.info .desc{color:var(--ink2);white-space:pre-wrap;font-size:15px}',
'.wa{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;margin-top:14px;padding:15px;border-radius:13px;background:var(--brand);color:#08231a;text-decoration:none;font-weight:800;font-size:16px;border:none;cursor:pointer}',
'.wa:hover{background:var(--brand2);color:#fff}',
'.share{width:100%;margin-top:9px;padding:11px;border-radius:11px;background:var(--surf2);border:1px solid var(--bd);color:var(--ink2);font:inherit;font-weight:700;font-size:13.5px;cursor:pointer}',
'.vid{margin-top:18px;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:16/9}',
'.vid iframe,.vid video{width:100%;height:100%;border:0;display:block}',
'.secttl{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:22px 0 8px}',
'footer{text-align:center;color:var(--muted);font-size:12.5px;padding:26px 20px 40px;border-top:1px solid var(--bd);margin-top:26px}',
'.hide{display:none!important}',
'</style></head><body>',
'<header><div class="hwrap"><div class="brand" onclick="location.hash=\'\'">'+KLAK_ICON+'<div><div class="kname" id="lojaNome">…</div><div class="ktag">EMPORIUM · ELETRÔNICOS</div></div></div><div class="slogan" id="slogan"></div></div></header>',
'<div class="ship hide" id="ship"></div>',
'<div class="tools hide" id="tools"><input id="q" type="search" placeholder="Buscar produto..."><div class="chips" id="chips"></div></div>',
'<main><div id="carregando" class="aviso">Carregando produtos…</div>',
'<div id="home" class="hide"><div class="grid" id="grid"></div><div class="aviso hide" id="none">Nenhum produto encontrado.</div></div>',
'<div id="detail" class="hide"></div></main>',
'<footer id="rodape"></footer>',
'<script>',
'var API="'+URLB+'", KEY="'+KEYB+'", DONO="'+DONO+'";',
'var P=[], LOJA={}, filtro="all", CATS=[];',
'function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}',
'function brl(v){return "R$ "+Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});}',
'var q=document.getElementById("q"),grid=document.getElementById("grid"),none=document.getElementById("none"),',
'  home=document.getElementById("home"),detail=document.getElementById("detail"),tools=document.getElementById("tools"),',
'  chips=document.getElementById("chips"),carregando=document.getElementById("carregando");',
'function cardHTML(p){',
'  var media=p.im.length?\'<img src="\'+p.im[0]+\'" alt="\'+esc(p.n)+\'" loading="lazy">\':\'<div class="ph">\'+p.ic+\'</div>\';',
'  return \'<article class="card" data-id="\'+p.id+\'"><div class="media">\'+media+\'</div><div class="body">\'+',
'    \'<span class="cat">\'+esc(p.c)+\'</span><h2>\'+esc(p.n)+\'</h2>\'+',
'    \'<div class="price">\'+(p.pr?brl(p.pr):"Consulte")+\'</div>\'+',
'    (p.fg&&LOJA.entrega?\'<span class="tagfree">🚚 Entrega grátis</span>\':"")+',
'    \'<div class="stock">\'+p.e+\' disponível(is)</div>\'+',
'  \'</div><div class="cta">Ver detalhes</div></article>\';',
'}',
'function renderHome(){',
'  var t=(q.value||"").toLowerCase().trim(), n=0, out="";',
'  P.forEach(function(p){ var ok=(filtro==="all"||p.c===filtro)&&(!t||(p.n+" "+p.d).toLowerCase().indexOf(t)>=0); if(ok){out+=cardHTML(p);n++;} });',
'  grid.innerHTML=out; none.classList.toggle("hide", n>0);',
'}',
'function waLink(p){',
'  var msg="Olá! Tenho interesse no produto: "+p.n+(p.pr?" ("+brl(p.pr)+")":"");',
'  try{ msg+="\\n"+location.href.split("#")[0]+"#p="+p.id; }catch(e){}',
'  return LOJA.whatsapp?("https://wa.me/"+LOJA.whatsapp+"?text="+encodeURIComponent(msg)):"";',
'}',
'function videoHTML(v){',
'  if(!v) return "";',
'  var yt=v.match(/(?:youtu\\.be\\/|youtube\\.com\\/(?:watch\\?v=|embed\\/|shorts\\/))([\\w-]{11})/);',
'  if(yt) return \'<div class="vid"><iframe src="https://www.youtube.com/embed/\'+yt[1]+\'" allowfullscreen loading="lazy"></iframe></div>\';',
'  if(/\\.(mp4|webm|ogg)(\\?|$)/i.test(v)) return \'<div class="vid"><video src="\'+esc(v)+\'" controls></video></div>\';',
'  return \'<p><a href="\'+esc(v)+\'" target="_blank" rel="noopener">▶ Ver vídeo do produto</a></p>\';',
'}',
'function renderDetail(p){',
'  var main=p.im.length?\'<img id="mainimg" src="\'+p.im[0]+\'" alt="\'+esc(p.n)+\'">\':\'<div class="ph">\'+p.ic+\'</div>\';',
'  var th=p.im.length>1?\'<div class="thumbs">\'+p.im.map(function(s,i){return \'<img src="\'+s+\'" data-i="\'+i+\'" class="\'+(i?"":"on")+\'" alt="foto \'+(i+1)+\'">\';}).join("")+\'</div>\':"";',
'  var wl=waLink(p);',
'  detail.innerHTML=\'<button class="back" id="back">← Voltar para a loja</button><div class="detail">\'+',
'    \'<div class="gal"><div class="big">\'+main+\'</div>\'+th+\'</div>\'+',
'    \'<div class="info"><span class="cat">\'+esc(p.c)+\'</span><h1>\'+esc(p.n)+\'</h1>\'+',
'      \'<div class="pbox"><div class="big-price">\'+(p.pr?brl(p.pr):"Consulte o preço")+\'</div>\'+',
'        (p.fg&&LOJA.entrega?\'<div style="margin-top:10px"><span class="tagfree">🚚 \'+esc(LOJA.entrega)+\'</span></div>\':"")+',
'        \'<div class="stock" style="margin-top:8px">\'+p.e+\' unidade(s) disponível(is)</div>\'+',
'        (wl?\'<a class="wa" href="\'+wl+\'" target="_blank" rel="noopener">💬 Falar no WhatsApp</a>\':"")+',
'        \'<button class="share" id="share">🔗 Copiar link deste produto</button>\'+',
'      \'</div>\'+',
'      (p.d?\'<div class="secttl">Descrição</div><div class="desc">\'+esc(p.d)+\'</div>\':"")+',
'      videoHTML(p.v)+',
'    \'</div></div>\';',
'  home.classList.add("hide"); tools.classList.add("hide"); detail.classList.remove("hide");',
'  document.getElementById("back").onclick=function(){ location.hash=""; };',
'  var sh=document.getElementById("share");',
'  if(sh) sh.onclick=function(){ var u=location.href; if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u);} sh.textContent="✓ Link copiado!"; setTimeout(function(){sh.textContent="🔗 Copiar link deste produto";},1800); };',
'  [].forEach.call(detail.querySelectorAll(".thumbs img"),function(im){ im.onclick=function(){ document.getElementById("mainimg").src=im.src; [].forEach.call(detail.querySelectorAll(".thumbs img"),function(x){x.classList.remove("on");}); im.classList.add("on"); }; });',
'  window.scrollTo(0,0);',
'}',
'function route(){',
'  var m=(location.hash||"").match(/p=([\\w-]+)/);',
'  if(m){ var p=P.filter(function(x){return x.id===m[1];})[0]; if(p){ renderDetail(p); return; } }',
'  detail.classList.add("hide"); home.classList.remove("hide"); tools.classList.remove("hide"); renderHome();',
'}',
'grid.addEventListener("click",function(e){ var c=e.target.closest?e.target.closest(".card"):null; if(c) location.hash="p="+c.dataset.id; });',
'q.addEventListener("input",renderHome);',
'chips.addEventListener("click",function(e){ if(e.target.classList.contains("chip")){ [].forEach.call(chips.children,function(x){x.classList.remove("active")}); e.target.classList.add("active"); filtro=e.target.dataset.f; renderHome(); } });',
'window.addEventListener("hashchange",route);',
'function iniciar(){',
'  fetch(API+"/rest/v1/vitrine_publica?select=loja,produtos&dono=eq."+DONO, { headers:{ apikey:KEY, Authorization:"Bearer "+KEY } })',
'   .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })',
'   .then(function(rows){',
'     var row = rows && rows[0];',
'     if(!row){ carregando.textContent="A loja ainda não tem produtos publicados."; return; }',
'     LOJA = row.loja||{}; P = row.produtos||[];',
'     document.getElementById("lojaNome").textContent=(LOJA.nome||"Klak Emporium").toUpperCase();',
'     document.getElementById("slogan").textContent=LOJA.slogan||"";',
'     document.title = LOJA.nome||"Klak Emporium";',
'     if(LOJA.entrega){ var sp=document.getElementById("ship"); sp.textContent="🚚 "+LOJA.entrega; sp.classList.remove("hide"); }',
'     document.getElementById("rodape").textContent=(LOJA.nome||"")+(LOJA.entrega?" · "+LOJA.entrega:"");',
'     CATS=[]; P.forEach(function(p){ if(p.c&&CATS.indexOf(p.c)<0) CATS.push(p.c); });',
'     chips.innerHTML=["all"].concat(CATS).map(function(c){return \'<button class="chip\'+(c==="all"?" active":"")+\'" data-f="\'+esc(c)+\'">\'+(c==="all"?"Todos":esc(c))+\'</button>\';}).join("");',
'     carregando.classList.add("hide");',
'     route();',
'   })',
'   .catch(function(e){ carregando.innerHTML="Não consegui carregar os produtos agora.<br><br><button class=\\"chip\\" onclick=\\"location.reload()\\">Tentar de novo</button>"; });',
'}',
'iniciar();',
'<\/script></body></html>'
].join("\n");

    var blob=new Blob([html],{type:"text/html"});
    var url=URL.createObjectURL(blob);
    var a=el("a",{href:url,download:"vitrine.html"}); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },1500);
    toast("vitrine.html gerado ✓ — envie ao GitHub uma vez só","good");
  }

  /* ---------- importador de anúncio (Amazon / lojas) ---------- */
  function decodeEnt(s){
    return String(s||"")
      .replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&apos;/g,"'")
      .replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">")
      .replace(/&#(\d+);/g,function(_,n){ return String.fromCharCode(+n); })
      .replace(/&amp;/g,"&");
  }
  function parseAnuncio(txt){
    var out={ nome:"", preco:0, descricao:"", imagens:[] };
    txt = String(txt||"");
    var m = txt.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
         || txt.match(/id=["']productTitle["'][^>]*>([^<]+)/i)
         || txt.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) out.nome = decodeEnt(m[1]).replace(/\s+/g," ").replace(/\s*[|\-–]\s*Amazon.*$/i,"").trim().slice(0,140);

    var pm = txt.match(/class=["'][^"']*a-price-whole[^"']*["'][^>]*>\s*([\d.,]+)/i)
          || txt.match(/"priceAmount"\s*:\s*([\d.]+)/i)
          || txt.match(/R\$\s*([\d.]{1,12},\d{2})/);
    if (pm) out.preco = parseNum(pm[1]);

    var fb = txt.match(/id=["']feature-bullets["']([\s\S]{0,4000}?)<\/ul>/i);
    if (fb){
      var lis = fb[1].match(/<span[^>]*a-list-item[^>]*>([\s\S]*?)<\/span>/gi) || [];
      var bullets = lis.map(function(s){ return decodeEnt(s.replace(/<[^>]*>/g,"")).replace(/\s+/g," ").trim(); })
                       .filter(function(s){ return s.length>4; });
      if (bullets.length) out.descricao = bullets.slice(0,8).map(function(b){ return "• "+b; }).join("\n");
    }
    if (!out.descricao){
      var dm = txt.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)
            || txt.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
      if (dm) out.descricao = decodeEnt(dm[1]).replace(/\s+/g," ").trim();
    }

    var raw = [];
    (txt.match(/"(?:hiRes|large|mainUrl)"\s*:\s*"(https?:[^"]+?\.(?:jpg|jpeg|png|webp))"/gi)||[]).forEach(function(s){
      var u=s.match(/"(https?:[^"]+)"/); if(u) raw.push(u[1]);
    });
    (txt.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/gi)||[]).forEach(function(s){
      var u=s.match(/content=["']([^"']+)/i); if(u) raw.push(u[1]);
    });
    (txt.match(/https?:\\?\/\\?\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)/gi)||[]).forEach(function(u){ raw.push(u); });

    var seen={};
    raw.forEach(function(u){
      u = u.replace(/\\\//g,"/").replace(/&amp;/g,"&").trim();
      if (!/^https?:\/\//i.test(u)) return;
      if (/sprite|grey-pixel|transparent-pixel|pixel\.gif|icon|logo|\/G\/01\//i.test(u)) return;
      // Amazon: remove os modificadores de tamanho para pegar a foto original
      u = u.replace(/\._[A-Za-z0-9,_%-]+_\./, ".");
      var id = (u.match(/\/images\/I\/([^./]+)/)||[])[1] || u;
      if (seen[id]) return;
      seen[id]=1;
      out.imagens.push(u);
    });
    out.imagens = out.imagens.slice(0,10);
    return out;
  }

  function openImportAnuncio(){
    var ta=el("textarea",{class:"input",style:"min-height:150px;font-family:ui-monospace,monospace;font-size:12px",placeholder:"Cole aqui o LINK do produto, ou o código-fonte da página (Ctrl+U → Ctrl+A → Ctrl+C)"});
    var status=el("div",{class:"hint"});
    var previewHost=el("div",{});
    var achou=null;

    function mostrar(res){
      achou=res;
      previewHost.innerHTML="";
      if (!res.nome && !res.imagens.length){ status.innerHTML="<span style='color:var(--danger)'>Não consegui achar produto nesse conteúdo. Veja as instruções abaixo.</span>"; return; }
      status.innerHTML="";
      var thumbs=el("div",{class:"galeria"});
      res.imagens.forEach(function(u){ var c=el("div",{class:"gcell"}); c.appendChild(el("img",{src:u})); thumbs.appendChild(c); });
      previewHost.appendChild(el("div",{class:"card card-pad",style:"background:var(--surface-2)"},[
        el("div",{style:"font-weight:700"}, res.nome||"(sem título)"),
        res.preco?el("div",{style:"color:var(--brand-2);font-weight:800;font-size:19px;margin-top:4px"},fmtBRL(res.preco)):null,
        res.descricao?el("div",{class:"small muted",style:"margin-top:6px;white-space:pre-wrap;max-height:110px;overflow:auto"},res.descricao):null,
        el("div",{class:"lbl",style:"margin-top:12px"},res.imagens.length+" foto(s) encontrada(s)"),
        thumbs
      ]));
    }

    function analisar(){
      var v=ta.value.trim();
      if (!v){ toast("Cole o link ou o código da página.","err"); return; }
      var soLink = /^https?:\/\/\S+$/i.test(v);
      if (soLink){
        status.innerHTML="Tentando baixar a página...";
        var done=false;
        var timer=setTimeout(function(){ if(!done){ done=true; falhouFetch(); } },7000);
        fetch(v,{mode:"cors"}).then(function(r){ return r.text(); }).then(function(t){
          if(done) return; done=true; clearTimeout(timer);
          var res=parseAnuncio(t);
          if(!res.nome && !res.imagens.length) falhouFetch(); else mostrar(res);
        }).catch(function(){ if(done) return; done=true; clearTimeout(timer); falhouFetch(); });
      } else {
        mostrar(parseAnuncio(v));
      }
    }
    function falhouFetch(){
      status.innerHTML = "<strong style='color:var(--warn)'>A Amazon bloqueia a leitura direta pelo link.</strong> Faça assim (10 segundos):<br>"+
        "1. Abra a página do produto no navegador<br>2. Aperte <strong>Ctrl+U</strong> (ver código-fonte)<br>"+
        "3. <strong>Ctrl+A</strong> e <strong>Ctrl+C</strong> (copiar tudo)<br>4. Cole aqui em cima e clique em Analisar de novo.";
    }

    var btnAnalisar=el("button",{class:"btn"},"🔎 Analisar");
    btnAnalisar.addEventListener("click",analisar);

    var body=el("div",{class:"stack"},[
      el("p",{class:"muted small",style:"margin:0"},"Traga título, fotos, preço e descrição de um anúncio (Amazon, Mercado Livre e a maioria das lojas) para criar seu produto sem digitar."),
      ta,
      el("div",{class:"row-flex"},[btnAnalisar]),
      status,
      previewHost
    ]);

    modal("Importar anúncio", body, [
      { label:"Fechar", cls:"btn ghost", onClick:closeModal },
      { label:"Criar produto →", cls:"btn primary", onClick:function(){
        if (!achou || (!achou.nome && !achou.imagens.length)){ toast("Analise um anúncio primeiro.","err"); return; }
        closeModal();
        openProductEditor(null, { nome:achou.nome, precoVenda:achou.preco, descricao:achou.descricao, imagens:achou.imagens });
      }}
    ], "wide");
  }

  /* ========================================================
     PESQUISA DE PREÇOS DE MERCADO
     Tenta a API pública do Mercado Livre; se falhar (bloqueio/CORS),
     o usuário cola a página de resultados e o app extrai os preços.
     ======================================================== */

  function termoBusca(p){
    return String(p.nome||"").replace(/\s*[-–]\s*(preto|branco|azul|verde|vermelho|cinza|dourado|prata|rosa|roxo)\s*$/i,"")
      .replace(/\s+/g," ").trim();
  }

  // remove itens fora de faixa (capinhas, acessórios) usando a mediana
  function estatisticaPrecos(precos){
    var v = precos.filter(function(x){ return typeof x==="number" && isFinite(x) && x>0; }).sort(function(a,b){ return a-b; });
    if (!v.length) return null;
    var med = v[Math.floor(v.length/2)];
    var keep = v.filter(function(x){ return x >= med*0.4 && x <= med*2.5; });
    if (!keep.length) keep = v;
    var soma = keep.reduce(function(s,x){ return s+x; },0);
    return { min: keep[0], avg: soma/keep.length, n: keep.length };
  }

  // extrai preços de um texto/HTML colado (página de resultados)
  function parsePrecosTexto(txt){
    txt=String(txt||"");
    var precos=[];
    (txt.match(/"price"\s*:\s*([\d.]+)/gi)||[]).forEach(function(s){ var m=s.match(/([\d.]+)\s*$/); if(m) precos.push(parseFloat(m[1])); });
    (txt.match(/andes-money-amount__fraction[^>]*>\s*([\d.]{1,12})\s*</gi)||[]).forEach(function(s){
      var m=s.match(/>\s*([\d.]{1,12})\s*</); if(m) precos.push(parseNum(m[1].replace(/\./g,"")));
    });
    (txt.match(/R\$\s*[\d.]{1,12},\d{2}/g)||[]).forEach(function(s){ precos.push(parseNum(s.replace(/R\$\s*/,""))); });
    (txt.match(/R\$\s*[\d.]{2,12}(?![\d,])/g)||[]).forEach(function(s){ var n=parseNum(s.replace(/R\$\s*/,"").replace(/\./g,"")); if(n>=10) precos.push(n); });
    return estatisticaPrecos(precos);
  }

  function aplicarMercado(p, st){
    if (!st) return;
    p.mercado = { min:st.min, avg:st.avg, n:st.n, at:st.at||Date.now(), fonte:st.fonte||"colado", amostras:st.amostras||[] };
    saveState();
  }

  function openPrecoManual(p){
    var busca=termoBusca(p);
    var ta=el("textarea",{class:"input",style:"min-height:130px;font-family:ui-monospace,monospace;font-size:12px",placeholder:"Cole aqui a página de resultados (Ctrl+A, Ctrl+C na página de busca)"});
    var status=el("div",{class:"hint"});
    var links=el("div",{class:"row-flex wrap",style:"gap:8px"},[
      el("a",{class:"btn sm",target:"_blank",rel:"noopener",href:"https://lista.mercadolivre.com.br/"+encodeURIComponent(busca)},"🔗 Abrir no Mercado Livre"),
      el("a",{class:"btn sm",target:"_blank",rel:"noopener",href:"https://www.google.com/search?tbm=shop&q="+encodeURIComponent(busca)},"🔗 Abrir no Google Shopping")
    ]);
    var achado=null;
    var btn=el("button",{class:"btn"},"🔎 Extrair preços");
    btn.addEventListener("click",function(){
      var st=parsePrecosTexto(ta.value);
      if(!st){ status.innerHTML="<span style='color:var(--danger)'>Não achei preços nesse conteúdo.</span>"; achado=null; return; }
      achado=st; achado.fonte="colado";
      status.innerHTML="Encontrados <strong>"+st.n+"</strong> preços · menor <strong>"+fmtBRL(st.min)+"</strong> · médio <strong>"+fmtBRL(st.avg)+"</strong>";
    });
    modal("Pesquisar preço — "+p.nome, el("div",{class:"stack"},[
      el("p",{class:"muted small",style:"margin:0"},"Abra a busca, selecione tudo na página (Ctrl+A), copie (Ctrl+C) e cole abaixo. O app calcula o menor preço e o médio, ignorando acessórios fora de faixa."),
      links, ta, el("div",{class:"row-flex"},[btn]), status
    ]), [
      { label:"Cancelar", cls:"btn ghost", onClick:closeModal },
      { label:"Salvar preços", cls:"btn primary", onClick:function(){
        if(!achado){ toast("Extraia os preços primeiro.","err"); return; }
        aplicarMercado(p,achado); closeModal(); render(); toast("Preços de mercado salvos ✓","good");
      }}
    ]);
  }

  function horasDesde(ts){ return ts? (Date.now()-ts)/3600000 : Infinity; }

  function celulaMercado(p){
    var m=p.mercado;
    if(!m){ return el("td",{class:"num"},el("span",{class:"muted small"},"—")); }
    var meu=p.precoVenda||0;
    var diff = m.min? (meu-m.min)/m.min : 0;
    var cls="flag-ok", txt="na média";
    if(!meu){ cls="flag-ok"; txt="sem preço"; }
    else if(meu<=m.min){ cls="flag-bom"; txt="menor preço"; }
    else if(diff<=0.05){ cls="flag-ok"; txt="na média"; }
    else if(diff<=0.20){ cls="flag-alerta"; txt="+"+Math.round(diff*100)+"% acima"; }
    else { cls="flag-caro"; txt="+"+Math.round(diff*100)+"% acima"; }
    var velho=horasDesde(m.at)>72;
    var cell=el("td",{class:"num",style:"cursor:pointer"},[
      el("div",{class:"small"},[el("span",{class:"muted"},"menor "),el("strong",{},fmtBRL(m.min))]),
      el("div",{class:"small muted"},"médio "+fmtBRL(m.avg)),
      el("span",{class:"flag "+cls},txt),
      velho?el("div",{class:"small",style:"color:var(--warn)"},"desatualizado"):null
    ]);
    cell.addEventListener("click",function(){ openPrecoDetalhe(p); });
    return cell;
  }

  function openPrecoDetalhe(p){
    var m=p.mercado||{};
    var amostras=el("div",{});
    (m.amostras||[]).forEach(function(a){
      amostras.appendChild(el("div",{class:"row-flex",style:"justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"},[
        el("span",{class:"small"},a.t), el("span",{class:"small",style:"font-variant-numeric:tabular-nums"},fmtBRL(a.v))
      ]));
    });
    var sugerido = m.min? m.min*0.97 : 0;
    modal("Preços de mercado — "+p.nome, el("div",{class:"stack"},[
      el("div",{class:"grid grid-3"},[
        kpi("Seu preço", p.precoVenda?fmtBRL(p.precoVenda):"—","var(--accent)"),
        kpi("Menor na internet", m.min?fmtBRL(m.min):"—","var(--good)"),
        kpi("Preço médio", m.avg?fmtBRL(m.avg):"—","var(--warn)")
      ]),
      m.at?el("div",{class:"hint"},"Baseado em "+m.n+" anúncios · fonte: "+(m.fonte||"—")+" · atualizado em "+fmtDateTime(m.at)):null,
      (m.min&&p.precoVenda&&p.precoVenda>m.min)?el("div",{class:"card card-pad",style:"background:var(--warn-soft)"},[
        el("div",{style:"font-weight:700"},"💡 Sugestão"),
        el("div",{class:"small",style:"margin-top:4px"},"Você está acima do menor preço. Vender por volta de "+fmtBRL(sugerido)+" te deixaria abaixo do concorrente mais barato — sua margem ficaria em "+(sugerido? Math.round((sugerido-custoProduto(p))/sugerido*100):0)+"%.")
      ]):null,
      (m.amostras&&m.amostras.length)?el("div",{},[el("div",{class:"lbl"},"Anúncios encontrados"),amostras]):null
    ]), [
      { label:"Fechar", cls:"btn ghost", onClick:closeModal },
      { label:"🔎 Pesquisar de novo", cls:"btn", onClick:function(){ closeModal(); openPrecoManual(p); } }
    ]);
  }

  /* ========================================================
     CONFIGURAÇÕES
     ======================================================== */
  function renderConfig(view){
    view.appendChild(pageHead("Configurações","Nuvem, loja, publicação, backup e tema"));
    view.appendChild(renderNuvemCard(view));

    // dados da loja (usados na vitrine publicada)
    var fLoja=el("input",{class:"input",value:state.settings.lojaNome||"Klak Emporium"});
    var fZap=el("input",{class:"input",value:state.settings.whatsapp||"",placeholder:"ex.: 5545999999999 (com DDI e DDD)"});
    var fSlogan=el("input",{class:"input",value:state.settings.slogan||"",placeholder:"ex.: Tecnologia com o melhor preço da região"});
    var fEntregaTxt=el("input",{class:"input",value:state.settings.entregaTexto||"",placeholder:"Entrega grátis para Toledo, Cascavel e Marechal"});
    var saveLoja=el("button",{class:"btn primary"},"Salvar dados da loja");
    saveLoja.addEventListener("click",function(){ state.settings.lojaNome=fLoja.value.trim()||"Klak Emporium"; state.settings.whatsapp=fZap.value.replace(/\D/g,""); state.settings.slogan=fSlogan.value.trim(); state.settings.entregaTexto=fEntregaTxt.value.trim(); saveState(); toast("Dados da loja salvos ✓","good"); });
    view.appendChild(card("Dados da loja", el("div",{},[
      el("p",{class:"muted small",style:"margin-top:0"},"Aparecem na vitrine que você publica. O WhatsApp vira o botão de contato de cada produto."),
      el("div",{class:"grid grid-2"},[ el("label",{class:"field"},[el("span",{class:"lbl"},"Nome da loja"),fLoja]), el("label",{class:"field"},[el("span",{class:"lbl"},"WhatsApp (só números)"),fZap]) ]),
      el("label",{class:"field mt"},[el("span",{class:"lbl"},"Slogan / frase"),fSlogan]),
      el("label",{class:"field mt"},[el("span",{class:"lbl"},"Aviso de entrega (faixa da loja)"),fEntregaTxt]),
      el("div",{class:"mt"},saveLoja)
    ])));

    // importador de anúncio
    var impBtn=el("button",{class:"btn primary"},"🪄 Importar anúncio");
    impBtn.addEventListener("click",openImportAnuncio);
    view.appendChild(el("div",{class:"mt-lg"}, card("Anúncio automático", el("div",{},[
      el("p",{class:"muted small",style:"margin-top:0"},"Cole o link (ou o código-fonte) de um anúncio da Amazon, Mercado Livre ou outra loja e o app traz título, fotos, preço e descrição prontos — você só confere o custo e publica."),
      impBtn
    ]))));

    // dados de exemplo (teste)
    var seedBtn=el("button",{class:"btn"},"✨ Carregar dados de exemplo");
    seedBtn.addEventListener("click",function(){ confirmModal("Carregar dados de exemplo?","Adiciona 6 produtos, 4 vendas e 1 viagem de teste, para você ver a plataforma preenchida. Você pode apagar tudo depois em \"Zona de perigo\".",function(){ seedSample(); toast("Dados de exemplo carregados ✓","good"); go("dashboard"); }); });
    view.appendChild(el("div",{class:"mt-lg"}, card("Testar a plataforma", el("div",{},[
      el("p",{class:"muted small",style:"margin-top:0"},"Ainda sem dados reais? Carregue um conjunto de exemplo (celulares, fones, notebook, drone...) para explorar o dashboard, as margens e a vitrine."),
      seedBtn
    ]))));

    // admin
    var fPass=el("input",{class:"input",type:"password",placeholder:"nova senha"});
    var fPass2=el("input",{class:"input",type:"password",placeholder:"repita a senha"});
    var savePass=el("button",{class:"btn primary"},"Alterar senha");
    savePass.addEventListener("click",function(){ if(fPass.value.length<4){ toast("Senha muito curta (mín. 4).","err"); return; } if(fPass.value!==fPass2.value){ toast("As senhas não conferem.","err"); return; } state.settings.admin.pass=hashStr(fPass.value); saveState(); fPass.value=fPass2.value=""; toast("Senha do admin alterada ✓","good"); });
    view.appendChild(el("div",{class:"mt-lg"}, card("Acesso do administrador", el("div",{},[
      el("p",{class:"muted small",style:"margin-top:0"},"Só você (admin) vê Dashboard, Estoque, Vendas, Viagens e Configurações. O cliente final vê apenas a Vitrine. Senha padrão inicial: "+(state.settings.admin.pass===hashStr("klak2026")?"“klak2026” — troque abaixo.":"já personalizada.")),
      el("div",{class:"grid grid-2"},[ el("label",{class:"field"},[el("span",{class:"lbl"},"Nova senha"),fPass]), el("label",{class:"field"},[el("span",{class:"lbl"},"Confirmar"),fPass2]) ]),
      el("div",{class:"mt"},savePass)
    ]))));

    var exportBtn=el("button",{class:"btn primary"},"⬇️ Exportar backup (JSON)"); exportBtn.addEventListener("click",exportBackup);
    var importInput=el("input",{type:"file",accept:".json",class:"hidden"}); importInput.addEventListener("change",function(){ if(importInput.files[0]) importBackup(importInput.files[0]); importInput.value=""; });
    var importBtn=el("button",{class:"btn"},"⬆️ Restaurar backup"); importBtn.addEventListener("click",function(){ importInput.click(); });
    view.appendChild(el("div",{class:"mt-lg"}, card("Backup", el("div",{},[
      el("p",{class:"muted small",style:"margin-top:0"},"Seus dados (e fotos) ficam só neste navegador. Exporte um backup de vez em quando — especialmente antes de limpar o navegador. As fotos deixam o arquivo maior."),
      el("div",{class:"row-flex"},[exportBtn,importBtn,importInput])
    ]))));

    view.appendChild(el("div",{class:"mt-lg"}, card("Resumo", el("div",{class:"grid grid-3"},[
      el("div",{},[el("div",{style:"font-size:24px;font-weight:700"},String(state.produtos.length)),el("div",{class:"muted small"},"produtos")]),
      el("div",{},[el("div",{style:"font-size:24px;font-weight:700"},String(state.vendas.length)),el("div",{class:"muted small"},"vendas")]),
      el("div",{},[el("div",{style:"font-size:24px;font-weight:700"},String(state.viagens.length)),el("div",{class:"muted small"},"viagens")])
    ]))));

    view.appendChild(el("div",{class:"mt-lg"}, card("Aparência", el("div",{class:"row-flex",style:"gap:10px"},[ themeBtn("light","☀️ Claro"), themeBtn("dark","🌙 Escuro") ]))));

    var reset=el("button",{class:"btn danger"},"♻️ Apagar tudo");
    reset.addEventListener("click",function(){ confirmModal("Apagar tudo?","Remove TODOS os produtos, vendas e viagens. Não dá para desfazer — exporte um backup antes.",function(){ localStorage.removeItem(STORAGE_KEY); state=null; loadState(); setTheme(state.settings.theme); toast("Tudo apagado"); go("dashboard"); }); });
    view.appendChild(el("div",{class:"mt-lg"}, el("div",{class:"card card-pad",style:"border:1px solid var(--danger)"},[ el("h3",{style:"color:var(--danger)"},"Zona de perigo"), el("div",{class:"mt"},reset) ])));
  }
  function themeBtn(theme,label){ var active=(state.settings.theme||"light")===theme; var b=el("button",{class:"btn"+(active?" primary":"")},label); b.addEventListener("click",function(){ setTheme(theme); render(); }); return b; }

  function exportBackup(){
    var blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    var url=URL.createObjectURL(blob);
    var a=el("a",{href:url,download:"importa-backup-"+todayISO()+".json"}); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
    toast("Backup exportado ✓","good");
  }
  function importBackup(file){
    var reader=new FileReader();
    reader.onload=function(e){ try{ var data=JSON.parse(e.target.result); if(!data.produtos&&!data.vendas) throw new Error("fmt"); confirmModal("Restaurar backup?","Substitui todos os dados atuais pelos do arquivo.",function(){ state=data; if(!state.settings) state.settings={theme:"light"}; saveState(); setTheme(state.settings.theme||"light"); toast("Backup restaurado ✓","good"); go("dashboard"); }); }catch(err){ toast("Arquivo inválido.","err"); } };
    reader.readAsText(file);
  }

  /* ========================================================
     IDEIAS — produtos para trazer e ações de fidelização
     ======================================================== */
  var IDEIAS_PRODUTOS = [
    { t:"Fones TWS (JBL Wave / QCY / Redmi Buds)", d:"Campeão de giro. Cabem dezenas na mala, custo baixo por unidade e todo mundo quer. Bom para vender junto com celular.", inv:"R$ 60–250 por unidade", m:"Margem típica 60–100%" },
    { t:"Caixa de som Bluetooth JBL (Go / Clip / Flip / Charge)", d:"Marca que vende sozinha na região. Flip e Charge têm alta procura em churrasco/praia/camping.", inv:"R$ 250–1.400", m:"Margem típica 35–60%" },
    { t:"Smartwatch (Amazfit Bip/GTS, Xiaomi Redmi Watch)", d:"Preço de entrada baixo, percepção de valor alta. Vende muito para quem começa a treinar.", inv:"R$ 180–600", m:"Margem típica 50–80%" },
    { t:"Power bank e carregadores rápidos (Anker, Baseus, Ugreen)", d:"Item de reposição constante e ticket baixo — ótimo para o cliente 'levar mais um' junto com a compra principal.", inv:"R$ 40–200", m:"Margem típica 70–120%" },
    { t:"Câmera de segurança Wi-Fi (TP-Link Tapo, Xiaomi)", d:"Procura crescente em casas e comércio. Cliente costuma comprar 2 a 4 de uma vez.", inv:"R$ 120–400", m:"Margem típica 50–90%" },
    { t:"Roteador / repetidor Wi-Fi 6 e mesh (TP-Link, Xiaomi)", d:"Internet fibra popularizou a troca de roteador. Item técnico: quem instala junto cobra mais caro.", inv:"R$ 150–700", m:"Margem típica 40–70%" },
    { t:"Controles e acessórios de videogame (Xbox, PS5, Nintendo)", d:"Controle original é caro no Brasil e tem procura constante. Baixo risco de encalhe.", inv:"R$ 250–700", m:"Margem típica 40–70%" },
    { t:"Tablet de entrada (Redmi Pad SE, Galaxy Tab A)", d:"Muito pedido para criança/estudo. Ticket médio bom sem passar de R$ 2 mil de investimento.", inv:"R$ 600–1.600", m:"Margem típica 25–45%" },
    { t:"Perfumes importados (masculinos e femininos)", d:"Não é eletrônico, mas é o item que mais 'sai' na fronteira: leve, caro por quilo e ótima margem. Vende muito no fim de ano.", inv:"R$ 150–900", m:"Margem típica 60–120%" },
    { t:"Celular intermediário (Redmi Note, Samsung A / Motorola G)", d:"Mais capital por unidade, mas é o que traz mais lucro por peça. Vá em modelos populares, não em topo de linha.", inv:"R$ 900–2.000", m:"Margem típica 20–35%" }
  ];

  var IDEIAS_FIDELIZA = [
    { t:"Cartãozinho com QR code na entrega", d:"Um cartão simples (couché, 9x5cm) com seu logo, o QR do site e seu WhatsApp. O cliente guarda na carteira e volta — e mostra para quem perguntar 'onde comprou?'. Custo: cerca de R$ 60 por 500 unidades numa gráfica local." },
    { t:"Garantia própria de 90 dias por escrito", d:"É o que mais tira o medo de comprar de vendedor pequeno. Escreva no cartão: 'Garantia Klak 90 dias — se der problema, troco'. Diferencial enorme contra o vendedor informal." },
    { t:"Brinde pequeno que faz sentido com o produto", d:"Película + capinha no celular, cabo extra no fone, pano de microfibra na TV. Custa centavos no Paraguai e vira 'nossa, veio brinde!'." },
    { t:"Configurar/instalar na entrega", d:"Levar o celular já com película colada, o roteador configurado, a câmera no Wi-Fi do cliente. É o que uma loja grande não faz — e faz o cliente te chamar da próxima vez." },
    { t:"Lista de transmissão no WhatsApp", d:"Peça autorização na venda: 'quer receber as novidades?'. Mande 1x por semana, com foto e preço. É seu canal de vendas mais barato — quem já comprou compra de novo." },
    { t:"Cupom indicação: R$ 30 para os dois", d:"Quem indica e quem compra ganham desconto. Transforma cada cliente em vendedor e é o jeito mais barato de crescer numa cidade pequena." },
    { t:"Mensagem 7 dias depois", d:"'Oi! Tudo certo com o fone?' — ninguém faz isso. Gera confiança, resolve problema antes de virar reclamação e abre espaço para a próxima venda." },
    { t:"Sorteio mensal entre quem comprou", d:"Um fone TWS por mês entre os clientes do mês, anunciado no status. Custa pouco e mantém você na cabeça das pessoas." },
    { t:"Embalagem própria", d:"Saquinho ou caixinha com adesivo do logo. Custa quase nada e muda totalmente a percepção de 'comprei de um cara' para 'comprei de uma loja'." },
    { t:"Encomenda sob medida", d:"Divulgue: 'vai viajar mês que vem? me diga o que você quer que eu trago'. Você vende antes de comprar — sem risco de estoque parado." }
  ];

  function renderIdeias(view){
    view.appendChild(pageHead("Ideias","Produtos para trazer e ações para o cliente voltar"));

    // --- produtos
    var lista=el("div",{class:"idea-list"});
    IDEIAS_PRODUTOS.forEach(function(x,i){
      lista.appendChild(el("div",{class:"idea-row"},[
        el("div",{class:"idea-num"},String(i+1)),
        el("div",{},[
          el("div",{class:"t"},x.t),
          el("div",{class:"d"},x.d),
          el("div",{class:"m"},"💵 "+x.inv+"  ·  📈 "+x.m)
        ])
      ]));
    });
    view.appendChild(el("div",{class:"card card-pad idea-card"},[
      el("div",{class:"card-title"},[el("h3",{},"10 produtos com bom custo-benefício (até R$ 2.000 por item)")]),
      el("p",{class:"muted small",style:"margin-top:0"},"Pensado para a sua região (Toledo / Cascavel / Marechal). As margens são faixas de referência do mercado — confirme sempre o preço na hora com a aba Estoque → 🔎 Atualizar preços."),
      lista
    ]));

    // --- fidelização
    var lista2=el("div",{class:"idea-list"});
    IDEIAS_FIDELIZA.forEach(function(x,i){
      lista2.appendChild(el("div",{class:"idea-row"},[
        el("div",{class:"idea-num",style:"background:var(--warn-soft);color:var(--warn)"},String(i+1)),
        el("div",{},[ el("div",{class:"t"},x.t), el("div",{class:"d"},x.d) ])
      ]));
    });
    view.appendChild(el("div",{class:"card card-pad mt-lg",style:"border-left:4px solid var(--warn)"},[
      el("div",{class:"card-title"},[el("h3",{},"10 ideias para o cliente lembrar de você")]),
      lista2
    ]));

    // --- QR code do site
    var fUrl=el("input",{class:"input",value:state.settings.siteUrl||"",placeholder:"https://klakemporium.netlify.app"});
    var qrHost=el("div",{style:"margin-top:14px"});
    function mostrarQR(){
      qrHost.innerHTML="";
      var u=(state.settings.siteUrl||"").trim();
      if(!u){ qrHost.appendChild(el("div",{class:"muted small"},"Salve o endereço do seu site para gerar o QR code.")); return; }
      qrHost.appendChild(el("div",{class:"row-flex",style:"gap:16px;align-items:flex-start;flex-wrap:wrap"},[
        el("img",{src:"https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data="+encodeURIComponent(u),alt:"QR code do site",style:"width:220px;height:220px;border-radius:12px;background:#fff;padding:6px"}),
        el("div",{style:"flex:1;min-width:200px"},[
          el("div",{class:"small"},"Aponte a câmera para testar. Clique com o botão direito na imagem → \"Salvar imagem como...\" e leve o arquivo para a gráfica."),
          el("div",{class:"small muted",style:"margin-top:8px"},"O QR é gerado por um serviço online, então precisa de internet só neste momento."),
          el("div",{class:"small muted",style:"margin-top:8px"},"Sugestão de cartão: logo em cima, QR no meio, embaixo \"Klak Emporium · WhatsApp (45) 9 9830-9108 · Garantia 90 dias · Entrega grátis Toledo/Cascavel/Marechal\".")
        ])
      ]));
    }
    var salvarUrl=el("button",{class:"btn primary"},"Salvar e gerar QR");
    salvarUrl.addEventListener("click",function(){ state.settings.siteUrl=fUrl.value.trim(); saveState(); mostrarQR(); toast("Endereço salvo ✓","good"); });
    mostrarQR();
    view.appendChild(el("div",{class:"mt-lg"}, card("QR code do seu site (para o cartãozinho)", el("div",{},[
      el("p",{class:"muted small",style:"margin-top:0"},"Depois de publicar a vitrine, cole aqui o endereço dela para gerar o QR code que vai no cartão de visita."),
      el("div",{class:"row-flex",style:"gap:10px;align-items:flex-end"},[
        el("label",{class:"field",style:"flex:1"},[el("span",{class:"lbl"},"Endereço da sua vitrine"),fUrl]),
        salvarUrl
      ]),
      qrHost
    ]))));
  }

  /* ========================================================
     NUVEM (Supabase) — acessar o sistema de qualquer lugar
     Banco + login de verdade. Sem configurar, o app segue
     funcionando 100% local (localStorage), como sempre.
     ======================================================== */
  var sb = null;            // cliente supabase
  var cloudUser = null;     // usuário logado na nuvem
  var cloudStatus = "off";  // off | conectando | ok | erro
  var cloudMsg = "";
  var pushTimer = null;

  function cloudConfigurada(){ return !!(state.settings.sbUrl && state.settings.sbKey); }

  function carregarSDK(cb){
    if (window.supabase && window.supabase.createClient) return cb(true);
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = function(){ cb(!!(window.supabase && window.supabase.createClient)); };
    s.onerror = function(){ cb(false); };
    document.head.appendChild(s);
  }

  function initCloud(cb){
    cb = cb || function(){};
    if (!cloudConfigurada()){ cloudStatus="off"; return cb(false,"nuvem não configurada"); }
    cloudStatus="conectando";
    carregarSDK(function(ok){
      if (!ok){ cloudStatus="erro"; cloudMsg="não consegui carregar a biblioteca (sem internet?)"; return cb(false,cloudMsg); }
      try { sb = window.supabase.createClient(state.settings.sbUrl, state.settings.sbKey); }
      catch(e){ cloudStatus="erro"; cloudMsg=e.message; return cb(false,cloudMsg); }
      sb.auth.getSession().then(function(r){
        cloudUser = (r && r.data && r.data.session) ? r.data.session.user : null;
        cloudStatus = cloudUser ? "ok" : "off";
        cb(true);
      }, function(e){ cloudStatus="erro"; cloudMsg=String(e); cb(false,cloudMsg); });
    });
  }

  function cloudEntrar(email, senha, cb){
    if(!sb) return cb(false,"nuvem não iniciada");
    sb.auth.signInWithPassword({ email:email, password:senha }).then(function(r){
      if (r.error) return cb(false, r.error.message);
      cloudUser = r.data.user; cloudStatus="ok"; cb(true);
    }, function(e){ cb(false,String(e)); });
  }
  function cloudCriarConta(email, senha, cb){
    if(!sb) return cb(false,"nuvem não iniciada");
    sb.auth.signUp({ email:email, password:senha }).then(function(r){
      if (r.error) return cb(false, r.error.message);
      cloudUser = r.data.user;
      cb(true, r.data.session ? null : "confirme o e-mail antes de entrar");
    }, function(e){ cb(false,String(e)); });
  }
  function cloudSair(cb){
    clearTimeout(pushTimer);
    if(!sb) return cb&&cb();
    sb.auth.signOut().then(function(){ cloudUser=null; cloudStatus="off"; cb&&cb(); });
  }

  function puxarDaNuvem(cb){
    if(!sb||!cloudUser) return cb(false,"não conectado");
    sb.from("klak_dados").select("estado,atualizado_em").eq("user_id",cloudUser.id).maybeSingle()
      .then(function(r){ if(r.error) return cb(false,r.error.message); cb(true, r.data); },
            function(e){ cb(false,String(e)); });
  }
  function enviarParaNuvem(cb, forcar){
    cb = cb || function(){};
    if(!sb||!cloudUser) return cb(false,"não conectado");
    if(!forcar && estadoVazio(state)) return cb(false,"nada para enviar (este aparelho está vazio)");
    var payload = { user_id:cloudUser.id, estado:state, atualizado_em:new Date(state.atualizadoEm||Date.now()).toISOString() };
    sb.from("klak_dados").upsert(payload).then(function(r){
      if(r.error){ cloudStatus="erro"; cloudMsg=r.error.message; return cb(false,r.error.message); }
      cloudStatus="ok"; cloudMsg=""; state.settings.ultimaSync=Date.now();
      publicarAuto();
      cb(true);
    }, function(e){ cloudStatus="erro"; cloudMsg=String(e); cb(false,String(e)); });
  }

  // envio automático (com atraso) sempre que algo muda
  function agendarEnvio(){
    if(!cloudUser) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function(){ enviarParaNuvem(function(ok,err){ if(!ok) console.warn("nuvem:",err); }); }, 2500);
  }

  // decide entre o que está no aparelho e o que está na nuvem: vence o mais recente
  function estadoVazio(s){
    s = s || state;
    return !(s.produtos && s.produtos.length) && !(s.vendas && s.vendas.length) && !(s.viagens && s.viagens.length);
  }

  function sincronizar(cb){
    cb = cb || function(){};
    puxarDaNuvem(function(ok, remoto){
      if(!ok){ cb(false, remoto); return; }
      var localEm  = state.atualizadoEm || 0;
      var localVazio = estadoVazio(state);
      var temRemoto  = !!(remoto && remoto.estado);
      var remotoVazio = !temRemoto || estadoVazio(remoto.estado);

      function baixar(motivo){
        state = remoto.estado; loadStateFix(); saveLocalOnly();
        ultimaAssinatura = assinaturaDados();
        cb(true, motivo);
      }
      // 1) aparelho novo/vazio e a nuvem tem dados -> SEMPRE baixa
      if (localVazio && !remotoVazio) return baixar("baixei seus dados da nuvem");
      // 2) nuvem vazia e este aparelho tem dados -> envia
      if (remotoVazio && !localVazio){
        return enviarParaNuvem(function(ok2,err){ cb(ok2, ok2 ? "enviei seus dados para a nuvem" : err); }, true);
      }
      // 3) os dois vazios -> nada a fazer
      if (localVazio && remotoVazio) return cb(true, "ainda não há dados em lugar nenhum");
      // 4) os dois têm dados -> vence o mais recente
      var remotoEm = remoto.estado.atualizadoEm || new Date(remoto.atualizado_em||0).getTime() || 0;
      if (remotoEm > localEm) return baixar("baixei a versão da nuvem (mais recente)");
      if (localEm > remotoEm){
        return enviarParaNuvem(function(ok2,err){ cb(ok2, ok2 ? "enviei este aparelho para a nuvem (mais recente)" : err); }, true);
      }
      cb(true, "já estava tudo igual");
    });
  }

  function nuvemResumo(){
    if (!cloudConfigurada()) return { txt:"Não configurada — o sistema roda só neste computador.", cls:"muted" };
    if (cloudStatus==="erro") return { txt:"Erro: "+cloudMsg, cls:"neg" };
    if (!cloudUser) return { txt:"Configurada, mas você não entrou.", cls:"muted" };
    var q = state.settings.ultimaSync ? (" · última sincronização "+fmtDateTime(state.settings.ultimaSync)) : "";
    return { txt:"Conectado como "+(cloudUser.email||"—")+q, cls:"pos" };
  }

  function renderNuvemCard(view){
    var box = el("div",{});
    var r = nuvemResumo();
    box.appendChild(el("p",{class:"small "+(r.cls==="pos"?"pos":(r.cls==="neg"?"neg":"muted")),style:"margin-top:0"}, r.txt));
    box.appendChild(el("p",{class:"hint",style:"margin-top:0"},"Versão do app neste aparelho: "+APP_VERSAO+" — se estiver diferente em outro computador, aperte Ctrl+F5 lá."));

    if (!cloudConfigurada()){
      var fUrl=el("input",{class:"input",value:state.settings.sbUrl||"",placeholder:"https://xxxxx.supabase.co"});
      var fKey=el("input",{class:"input",value:state.settings.sbKey||"",placeholder:"chave anon (public)"});
      var salvar=el("button",{class:"btn primary"},"Salvar e conectar");
      salvar.addEventListener("click",function(){
        state.settings.sbUrl=fUrl.value.trim(); state.settings.sbKey=fKey.value.trim();
        if(!state.settings.sbUrl||!state.settings.sbKey){ toast("Preencha os dois campos.","err"); return; }
        saveState();
        initCloud(function(ok,err){ if(ok) toast("Conectado à nuvem ✓","good"); else toast("Falhou: "+err,"err"); render(); });
      });
      box.appendChild(el("div",{class:"grid grid-2"},[
        el("label",{class:"field"},[el("span",{class:"lbl"},"URL do projeto"),fUrl]),
        el("label",{class:"field"},[el("span",{class:"lbl"},"Chave anon (public)"),fKey])
      ]));
      box.appendChild(el("div",{class:"mt"},salvar));
      box.appendChild(el("p",{class:"hint",style:"margin-top:10px"},"Como conseguir esses dois valores está no arquivo COMO-SUBIR-ONLINE.md, na pasta do sistema."));
      return card("Acesso pela internet (nuvem)", box);
    }

    if (!cloudUser){
      var fMail=el("input",{class:"input",type:"email",placeholder:"seu@email.com"});
      var fSenha=el("input",{class:"input",type:"password",placeholder:"senha (mín. 6)"});
      var entrar=el("button",{class:"btn primary"},"Entrar");
      var criar=el("button",{class:"btn"},"Criar conta");
      entrar.addEventListener("click",function(){
        cloudEntrar(fMail.value.trim(), fSenha.value, function(ok,err){
          if(!ok){ toast("Não entrou: "+err,"err"); return; }
          sincronizar(function(ok2,msg){ toast(ok2?("Conectado ✓ — "+msg):("Erro ao sincronizar: "+msg), ok2?"good":"err"); render(); });
        });
      });
      criar.addEventListener("click",function(){
        cloudCriarConta(fMail.value.trim(), fSenha.value, function(ok,err){
          if(!ok){ toast("Não criou: "+err,"err"); return; }
          toast(err?("Conta criada — "+err):"Conta criada ✓","good"); render();
        });
      });
      box.appendChild(el("div",{class:"grid grid-2"},[
        el("label",{class:"field"},[el("span",{class:"lbl"},"E-mail"),fMail]),
        el("label",{class:"field"},[el("span",{class:"lbl"},"Senha"),fSenha])
      ]));
      box.appendChild(el("div",{class:"row-flex mt"},[entrar,criar]));
      return card("Acesso pela internet (nuvem)", box);
    }

    var sync=el("button",{class:"btn primary"},"🔄 Sincronizar agora");
    sync.addEventListener("click",function(){
      sync.disabled=true; sync.textContent="Sincronizando...";
      sincronizar(function(ok,msg){ toast(ok?("Sincronizado ✓ — "+msg):("Erro: "+msg), ok?"good":"err"); render(); });
    });
    var baixar=el("button",{class:"btn"},"⬇️ Baixar da nuvem");
    baixar.addEventListener("click",function(){
      confirmModal("Baixar da nuvem?","Substitui os dados deste aparelho pelos que estão na nuvem.",function(){
        puxarDaNuvem(function(ok,remoto){
          if(!ok||!remoto||!remoto.estado){ toast("Não achei dados na nuvem.","err"); return; }
          state=remoto.estado; loadStateFix(); saveLocalOnly(); toast("Dados baixados ✓","good"); go("dashboard");
        });
      });
    });
    var enviar=el("button",{class:"btn"},"⬆️ Enviar deste aparelho");
    enviar.addEventListener("click",function(){
      confirmModal("Enviar para a nuvem?","Substitui o que está na nuvem pelos dados deste aparelho.",function(){
        state.atualizadoEm=Date.now();
        enviarParaNuvem(function(ok,err){ toast(ok?"Enviado ✓":"Erro: "+err, ok?"good":"err"); render(); });
      });
    });
    var sair=el("button",{class:"btn danger"},"Sair da nuvem");
    sair.addEventListener("click",function(){ cloudSair(function(){ toast("Você saiu da nuvem."); render(); }); });

    box.appendChild(el("p",{class:"muted small"},"Suas mudanças são enviadas sozinhas alguns segundos depois de cada alteração. Se usar em dois aparelhos, sincronize antes de mexer."));
    box.appendChild(el("div",{class:"row-flex wrap",style:"gap:8px"},[sync,baixar,enviar,sair]));
    return card("Acesso pela internet (nuvem)", box);
  }

  /* ---------- modal / toast ---------- */
  function modal(title, body, buttons, extraCls){
    closeModal();
    var foot=el("div",{class:"modal-foot"});
    (buttons||[]).forEach(function(b){ var btn=el("button",{class:b.cls||"btn"},b.label); btn.addEventListener("click",b.onClick); foot.appendChild(btn); });
    var m=el("div",{class:"modal-back"}, el("div",{class:"modal"+(extraCls?" "+extraCls:"")},[
      el("div",{class:"modal-head"},[el("h2",{},title), (function(){ var x=el("button",{class:"btn ghost sm"},"✕"); x.addEventListener("click",closeModal); return x; })()]),
      el("div",{class:"modal-body"}, body),
      foot
    ]));
    m.addEventListener("click",function(e){ if(e.target===m) closeModal(); });
    $("#modalRoot").appendChild(m);
  }
  function closeModal(){ $("#modalRoot").innerHTML=""; }
  function confirmModal(title,text,onYes){ modal(title, el("p",{style:"margin:0"},text), [ {label:"Cancelar",cls:"btn ghost",onClick:closeModal}, {label:"Confirmar",cls:"btn primary",onClick:function(){ closeModal(); onYes(); }} ]); }
  function toast(msg,type){ var t=el("div",{class:"toast"+(type?" "+type:"")},msg); $("#toasts").appendChild(t); setTimeout(function(){ t.style.opacity="0"; setTimeout(function(){ t.remove(); },250); },3200); }

  /* ---------- tema / boot ---------- */
  function setTheme(theme){ state.settings.theme=theme; document.documentElement.setAttribute("data-theme",theme); $("#themeIco").textContent=theme==="dark"?"☀️":"🌙"; $("#themeLbl").textContent=theme==="dark"?"Modo claro":"Modo escuro"; saveState(); }
  function aplicarSidebar(){
    var col=false;
    try { col = localStorage.getItem("importa.menu")==="off"; } catch(e){}
    var app=$(".app"); if(app) app.classList.toggle("collapsed", col);
    var b=$("#sideToggle");
    if (b){ b.textContent = col ? "»" : "«"; b.setAttribute("title", col ? "Mostrar menu" : "Ocultar menu"); }
  }
  function toggleSidebar(){
    var col=false;
    try { col = localStorage.getItem("importa.menu")==="off"; localStorage.setItem("importa.menu", col?"on":"off"); } catch(e){}
    aplicarSidebar();
  }

  function boot(){
    loadState();
    ultimaAssinatura = assinaturaDados();   // referência inicial: abrir o app não é "alterar"
    loadAdmin();
    setTheme(state.settings.theme||"light");
    document.querySelectorAll(".nav-item").forEach(function(b){ b.addEventListener("click",function(){ go(b.getAttribute("data-route")); }); });
    $("#themeToggle").addEventListener("click",function(){ setTheme(state.settings.theme==="dark"?"light":"dark"); render(); });
    document.addEventListener("keydown",function(e){ if(e.key==="Escape") closeModal(); });
    var sideBtn=$("#sideToggle");
    if (sideBtn) sideBtn.addEventListener("click", toggleSidebar);
    aplicarSidebar();
    applyAdminUI();
    go(isAdmin ? "dashboard" : "vitrine");
    // nuvem: se já estiver configurada, conecta e sincroniza sozinho
    if (cloudConfigurada()){
      initCloud(function(ok){
        if (ok && cloudUser){ sincronizar(function(ok2,msg){ if(ok2 && /baixei/.test(msg||"")) render(); }); }
      });
    }
  }
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();
