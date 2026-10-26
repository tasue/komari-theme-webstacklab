(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ObservatoryAnalytics=factory();})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const n=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
  function normalizeRegion(region){
    const text=String(region||'').trim();
    if(/^[a-z]{2}$/i.test(text))return text.toUpperCase();
    const points=Array.from(text).filter(c=>c.codePointAt(0)>=0x1f1e6&&c.codePointAt(0)<=0x1f1ff);
    if(points.length===2)return points.map(c=>String.fromCharCode(c.codePointAt(0)-0x1f1e6+65)).join('');
    return '';
  }
  function aggregate(nodes,reports,online){
    const all={cores:0,busyCores:0,ram:0,ramTotal:0,disk:0,diskTotal:0,up:0,down:0,totalUp:0,totalDown:0,tcp:0,udp:0,load:0,count:0};
    for(const node of nodes){
      const r=reports[node.uuid]||{};
      // Cumulative counters remain meaningful for offline nodes with a prior report.
      all.totalUp+=n(r.network?.totalUp);all.totalDown+=n(r.network?.totalDown);
      if(!online.has(node.uuid))continue;
      const cores=n(node.cpu_cores),usage=Math.min(100,n(r.cpu?.usage));
      all.count++;all.cores+=cores;all.busyCores+=cores*usage/100;
      all.ram+=n(r.ram?.used);all.ramTotal+=n(r.ram?.total||node.mem_total);
      all.disk+=n(r.disk?.used);all.diskTotal+=n(r.disk?.total||node.disk_total);
      all.up+=n(r.network?.up);all.down+=n(r.network?.down);
      all.tcp+=n(r.connections?.tcp);all.udp+=n(r.connections?.udp);all.load+=n(r.load?.load1);
    }
    all.cpu=all.cores?all.busyCores/all.cores*100:0;
    return all;
  }
  function todayStart(now=Date.now(),zone='Asia/Shanghai'){
    const date=new Date(now);
    if(zone==='local'){date.setHours(0,0,0,0);return date.getTime();}
    const offset=zone==='UTC'?0:8*3600000;
    const shifted=new Date(now+offset);
    return Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())-offset;
  }
  function trafficSum(series,allowedIds){
    let up=0,down=0,points=0;
    for(const s of series||[]){
      if(allowedIds&&!allowedIds.has(s.entity_id))continue;
      if(!['traffic.up','traffic.down'].includes(s.metric_key))continue;
      for(const p of s.points||[]){if(!Number.isFinite(Number(p.value)))continue;if(s.metric_key==='traffic.up')up+=n(p.value);else down+=n(p.value);points++;}
    }
    return {up,down,points};
  }
  function rateSum(series,allowedIds){
    const buckets=new Map();
    for(const s of series||[]){
      if(allowedIds&&!allowedIds.has(s.entity_id))continue;
      if(!['net.in.rate','net.out.rate'].includes(s.metric_key))continue;
      for(const p of s.points||[]){const time=Date.parse(p.time);if(!Number.isFinite(time)||!Number.isFinite(Number(p.value)))continue;const b=buckets.get(time)||{time,up:0,down:0};b[s.metric_key==='net.out.rate'?'up':'down']+=n(p.value);buckets.set(time,b);}
    }
    return [...buckets.values()].sort((a,b)=>a.time-b.time);
  }
  function pingSummary(rows,allowedIds,task='all',uuid=null){
    let total=0,valid=0,weightedLatency=0;
    for(const row of rows||[]){
      if(allowedIds&&!allowedIds.has(row.entity_id)||uuid&&row.entity_id!==uuid||task!=='all'&&String(row.task_id)!==String(task))continue;
      const attempts=n(row.total),success=Math.min(attempts,n(row.valid));
      total+=attempts;valid+=success;
      if(success&&Number.isFinite(Number(row.avg)))weightedLatency+=success*Number(row.avg);
    }
    return {total,valid,latency:valid?weightedLatency/valid:null,loss:total?(total-valid)/total*100:null};
  }
  return {aggregate,todayStart,trafficSum,rateSum,normalizeRegion,pingSummary};
});

;
/* WebStackLab Observatory — Komari public read-only API client. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const clamp = (value, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, num(value)));
  const fmt = (value, digits = 1) => num(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });
  const percent = (used, total) => num(total) > 0 ? clamp(num(used) / num(total) * 100) : 0;
  const unit = (bytes, speed = false) => {
    let v = Math.max(0, num(bytes)), i = 0;
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return { value: fmt(v, v >= 100 ? 0 : v >= 10 ? 1 : 2), label: units[i] + (speed ? '/s' : '') };
  };
  const bytes = (v, speed = false) => { const b = unit(v, speed); return `${b.value} ${b.label}`; };
  const richBytes = (v, speed = false) => { const b = unit(v, speed); return `${b.value}<small>${b.label}</small>`; };
  const clockText = ms => new Date(ms).toLocaleTimeString('zh-CN', {hour12:false, hour:'2-digit', minute:'2-digit'});
  const regionNames = new Intl.DisplayNames(['zh-CN'],{type:'region'});
  const regionName = code => {try{return code&&/^[A-Z]{2}$/.test(code)?regionNames.of(code):code||'—';}catch{return code||'—';}};
  const bundledFlags=new Set(['CN','US','HK','JP','DE','NL','GB','AU','SG']);
  const flagFor = code => /^[A-Z]{2}$/.test(code||'')?`<img class="region-flag" src="${bundledFlags.has(code)?'/themes/webstack-observatory/dist/assets/flags/':'/assets/flags/'}${code}.svg" alt="${esc(regionName(code))}" title="${esc(regionName(code))}" width="22" height="15" decoding="async" loading="lazy">`:'<span class="region-unknown" title="地区未知">◎</span>';
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const analytics = window.ObservatoryAnalytics;
  const state = {
    nodes: [], reports: {}, online: new Set(), selected: '', history: new Map(), ws: null,
    mode: 'connecting', lastSuccess: 0, lastWs: 0, rotate: true, initialized: false,
    query: '', filter: 'all', view:'aggregate', polling: false, reconnectDelay: 1500, reconnectTimer: null,
    settings: {rotate_seconds:15, refresh_seconds:5, traffic_timezone:'Asia/Shanghai', warn_percent:80, critical_percent:95, ping_warn_loss:5,ping_critical_loss:30,show_map_routes:true, show_admin_link:true},
    locations: {}, mapKey:'', chartRequest:0, chartLoading:false, spark:[], settingsError:'', lastHistoryFetch:new Map(),
    today:null,dailyPending:false,globalHistoryPending:false,
    pingRows:[],pingTasks:[],pingTask:'all',pingPending:false,pingUpdated:0,pingFailed:false
  };
  const colors = {healthy:'#36dfba', warning:'#eeb85d', critical:'#f17585', offline:'#607488', unknown:'#607488'};
  const labels = {healthy:'正常', warning:'关注', critical:'危险', offline:'离线', unknown:'待更新'};
  const countryLocations = {
    CN:[35.8,104.2,'中国'], HK:[22.3,114.2,'香港'], TW:[23.7,121,'台湾'], US:[39,-98,'美国'],
    JP:[36.2,138.3,'日本'], SG:[1.35,103.8,'新加坡'], KR:[36.2,127.8,'韩国'], DE:[51,10,'德国'],
    GB:[54,-2,'英国'], FR:[46.6,2.3,'法国'], NL:[52.1,5.3,'荷兰'], RU:[58,90,'俄罗斯'],
    AU:[-25,134,'澳大利亚'], CA:[56,-106,'加拿大'], IN:[22,79,'印度'], BR:[-12,-52,'巴西'],
    ID:[-2,118,'印度尼西亚'], MY:[4,102,'马来西亚'], VN:[16,106,'越南'], TH:[15,101,'泰国'],
    PH:[12.9,122,'菲律宾'], IT:[42.8,12.8,'意大利'], ES:[40,-4,'西班牙'], CH:[47,8,'瑞士'],
    SE:[62,15,'瑞典'], FI:[64,26,'芬兰'], NO:[62,9,'挪威'], PL:[52,19,'波兰'],
    TR:[39,35,'土耳其'], AE:[24,54,'阿联酋'], ZA:[-29,25,'南非'], NZ:[-41,174,'新西兰'],
    MX:[24,-102,'墨西哥'], AR:[-35,-64,'阿根廷'], CL:[-33,-71,'智利'], IS:[65,-19,'冰岛'],
    IL:[31,35,'以色列'], SA:[24,45,'沙特'], PT:[40,-8,'葡萄牙'], AT:[47.5,14.5,'奥地利'],
    IE:[53,-8,'爱尔兰'], RO:[46,25,'罗马尼亚'], UA:[49,32,'乌克兰'], PK:[30,70,'巴基斯坦']
  };
  const cities = [
    [/洛杉矶|los.?angeles/i,34.05,-118.24,'洛杉矶'],[/圣何塞|san.?jose/i,37.34,-121.89,'圣何塞'],
    [/西雅图|seattle/i,47.6,-122.33,'西雅图'],[/纽约|new.?york/i,40.71,-74,'纽约'],
    [/达拉斯|dallas/i,32.78,-96.8,'达拉斯'],[/芝加哥|chicago/i,41.88,-87.63,'芝加哥'],
    [/上海|shanghai/i,31.23,121.47,'上海'],[/杭州|hangzhou/i,30.27,120.15,'杭州'],
    [/北京|beijing/i,39.9,116.4,'北京'],[/广州|guangzhou/i,23.13,113.26,'广州'],
    [/深圳|shenzhen/i,22.54,114.06,'深圳'],[/香港|hong.?kong/i,22.32,114.17,'香港'],
    [/东京|tokyo/i,35.68,139.69,'东京'],[/大阪|osaka/i,34.69,135.5,'大阪'],
    [/新加坡|singapore/i,1.35,103.82,'新加坡'],[/首尔|seoul/i,37.57,126.98,'首尔'],
    [/法兰克福|frankfurt/i,50.11,8.68,'法兰克福'],[/伦敦|london/i,51.51,-.13,'伦敦'],
    [/阿姆斯特丹|amsterdam/i,52.37,4.9,'阿姆斯特丹'],[/悉尼|sydney/i,-33.87,151.21,'悉尼']
  ];
  function locationFor(node) {
    const own = state.locations[node.uuid];
    if (own && Number.isFinite(Number(own.lat)) && Number.isFinite(Number(own.lon)) && Math.abs(Number(own.lat)) <= 90 && Math.abs(Number(own.lon)) <= 180) {
      return {lat:Number(own.lat),lon:Number(own.lon),label:String(own.label || node.name),custom:true};
    }
    const city = cities.find(c => c[0].test(node.name));
    if (city) return {lat:city[1],lon:city[2],label:city[3]};
    const country = countryLocations[String(node.region).toUpperCase()];
    return country ? {lat:country[0],lon:country[1],label:country[2]} : null;
  }
  const project = point => [(point.lon + 180) * 1000 / 360, (82 - clamp(point.lat,-60,82)) * 500 / 142];
  const currentNode = () => state.nodes.find(n => n.uuid === state.selected);
  let pingCache={};
  const pingFor = uuid => {
    if(pingCache.rows!==state.pingRows||pingCache.nodes!==state.nodes||pingCache.task!==state.pingTask)pingCache={rows:state.pingRows,nodes:state.nodes,task:state.pingTask,allowed:new Set(state.nodes.map(n=>n.uuid)),values:new Map()};
    const key=uuid||'all';
    if(!pingCache.values.has(key))pingCache.values.set(key,analytics.pingSummary(state.pingRows,pingCache.allowed,state.pingTask,uuid||null));
    return pingCache.values.get(key);
  };
  const latencyLabel = summary => summary.latency===null?'—':`${fmt(summary.latency,0)} ms`;
  const lossLabel = summary => summary.loss===null?'—':`${fmt(summary.loss,1)}%`;
  const lossColor = loss => loss===null?colors.offline:loss>=state.settings.ping_critical_loss?colors.critical:loss>=state.settings.ping_warn_loss?colors.warning:colors.healthy;
  async function loadPing(){
    if(demo||state.pingPending||document.hidden)return;
    state.pingPending=true;
    try{
      if(!state.pingTasks.length){const tasks=await api('/api/task/ping');state.pingTasks=Array.isArray(tasks)?tasks:[];renderPingTasks();}
      const response=await rpc('public:getPingMetricStats',{hours:1,entity_ids:state.nodes.map(n=>n.uuid)});
      state.pingRows=Array.isArray(response.stats)?response.stats:[];state.pingUpdated=Date.now();state.pingFailed=false;
      renderHealth();renderFleet();renderDetail();renderPingPanel();renderMap();
    }catch{state.pingFailed=true;renderPingPanel();}
    finally{state.pingPending=false;}
  }
  function renderPingTasks(){
    $('pingTask').innerHTML='<option value="all">全部探测任务</option>'+state.pingTasks.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    $('pingTask').value=state.pingTask;
  }
  function renderPingPanel(){
    const summary=pingFor();
    $('globalPing').textContent=latencyLabel(summary);$('globalLoss').textContent=lossLabel(summary);
    $('globalLoss').style.color=lossColor(summary.loss);
    const rows=state.nodes.map(n=>({n,ping:pingFor(n.uuid)})).sort((a,b)=>num(b.ping.loss)-num(a.ping.loss)||num(b.ping.latency)-num(a.ping.latency));
    $('pingList').innerHTML=state.pingRows.length?rows.map(({n,ping})=>`<button class="ping-node ${n.uuid===state.selected&&state.view==='node'?'selected':''}" data-node="${esc(n.uuid)}" title="${esc(n.name)} · 最近一小时 ${ping.total} 次探测"><span>${esc(n.name)}</span><b>${latencyLabel(ping)}</b><strong style="color:${lossColor(ping.loss)}">${lossLabel(ping)}</strong></button>`).join(''):`<div class="empty-state">${state.pingFailed?'探测数据暂不可用':state.pingTasks.length?'暂无最近一小时探测记录':'尚未配置公开探测任务'}</div>`;
    $('pingUpdated').textContent=state.pingFailed?'读取失败，稍后重试':state.pingUpdated?`更新 ${new Date(state.pingUpdated).toLocaleTimeString('zh-CN',{hour12:false})}`:'等待探测记录';
  }
  function reportValues(node) {
    const r = state.reports[node.uuid] || {};
    const online = state.online.has(node.uuid);
    return {r,online,cpu:clamp(r.cpu?.usage),ram:percent(r.ram?.used,r.ram?.total || node.mem_total),disk:percent(r.disk?.used,r.disk?.total || node.disk_total),load:Math.max(0,num(r.load?.load1)),loadPercent:clamp(num(r.load?.load1)/Math.max(1,num(node.cpu_cores))*100)};
  }
  function statusFor(node) {
    if (state.mode === 'connecting' || state.mode === 'error' || !state.lastSuccess) return 'unknown';
    const v = reportValues(node);
    if (!v.online) return 'offline';
    const maximum = Math.max(v.cpu,v.ram,v.disk,v.loadPercent);
    const loss=pingFor(node.uuid).loss;
    return maximum >= state.settings.critical_percent || loss!==null&&loss>=state.settings.ping_critical_loss ? 'critical' : maximum >= state.settings.warn_percent || loss!==null&&loss>=state.settings.ping_warn_loss ? 'warning' : 'healthy';
  }
  function reasonFor(node) {
    const v = reportValues(node);
    if (!v.online) return '未连接到监控面板';
    return [['CPU',v.cpu],['内存',v.ram],['磁盘',v.disk],['负载/核心',v.loadPercent]]
      .filter(([,n]) => n >= state.settings.warn_percent).map(([name,n]) => `${name} ${fmt(n)}%`).join(' · ');
  }
  async function api(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if (response.status === 401 || response.status === 403) throw new Error('站点需要登录，请先进入后台登录后刷新');
      if (!response.ok) throw new Error(`接口暂不可用 (${response.status})`);
      const body = await response.json();
      if (body.status === 'error') throw new Error(body.message || '读取数据失败');
      return body.data ?? body;
    } finally { clearTimeout(timeout); }
  }
  async function rpc(method,params){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch('/api/rpc2',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method,params,id:1}),signal:controller.signal});
      if(!response.ok)throw new Error(`统计接口不可用 (${response.status})`);
      const body=await response.json();if(body.error)throw new Error(body.error.message || '统计接口读取失败');return body.result;
    }finally{clearTimeout(timeout);}
  }
  function renderToday(){
    const dayStart=analytics.todayStart(Date.now(),state.settings.traffic_timezone);
    const data=state.today?.start===dayStart?state.today:null;
    if(data){
      $('kpiTraffic').innerHTML=richBytes(data.up+data.down);
      $('todayDetail').textContent=`↑ ${bytes(data.up)}　↓ ${bytes(data.down)}`;
      $('todayDetail').title=`今日 00:00 起 · ${state.settings.traffic_timezone} · 根据已保存的流量增量统计，每分钟刷新`;
    }else{
      $('kpiTraffic').textContent='—';
      $('todayDetail').textContent=state.dailyPending?'正在统计今日流量…':'今日流量记录不可用';
    }
  }
  async function loadToday(){
    if(demo||state.dailyPending||!state.nodes.length)return;
    state.dailyPending=true;renderToday();
    const start=analytics.todayStart(Date.now(),state.settings.traffic_timezone);
    try{
      const data=await rpc('public:queryMetrics',{metric_keys:['traffic.up','traffic.down'],entity_ids:state.nodes.map(n=>n.uuid),start:new Date(start).toISOString(),end:new Date().toISOString(),aggregation:'sum',max_points:1});
      const summed=analytics.trafficSum(data.series,new Set(state.nodes.map(n=>n.uuid)));
      if(!summed.points)throw new Error('暂无今日流量记录');
      state.today={...summed,start};
    }catch{if(state.today?.start!==start)state.today=null;}
    finally{state.dailyPending=false;renderToday();}
  }
  async function loadGlobalHistory(force=false){
    if(demo||state.globalHistoryPending||!state.nodes.length||!force&&Date.now()-num(state.lastHistoryFetch.get('__all__'))<60000)return;
    state.globalHistoryPending=true;
    try{
      const data=await rpc('public:queryMetrics',{metric_keys:['net.in.rate','net.out.rate'],entity_ids:state.nodes.map(n=>n.uuid),hours:1,aggregation:'avg',max_points:60});
      const parsed=analytics.rateSum(data.series,new Set(state.nodes.map(n=>n.uuid)));
      const recent=(state.history.get('__all__')||[]).filter(p=>p.time>(parsed.at(-1)?.time||0));
      state.history.set('__all__',[...parsed,...recent]);state.lastHistoryFetch.set('__all__',Date.now());
    }catch{ /* Keep real live samples when history is not available. */ }
    finally{state.globalHistoryPending=false;if(state.view==='aggregate')renderChart();}
  }
  function setConnection(mode) {
    state.mode = mode;
    const names = {connecting:'正在连接监控数据',websocket:'实时数据连接正常',http:'监控数据连接正常',error:'数据连接中断 · 正在重试',demo:'演示模式 · 非真实监控数据'};
    $('connectionText').textContent = names[mode] || names.connecting;
    $('connectionDot').classList.toggle('error',mode === 'error');
    $('footerState').textContent = ({websocket:'实时数据连接正常',http:'监控数据定时更新',error:'连接中断 · 正在重试',demo:'演示数据 · 仅供预览'})[mode] || '正在初始化';
    if (state.lastSuccess) $('lastUpdate').textContent = `最近更新 ${new Date(state.lastSuccess).toLocaleTimeString('zh-CN',{hour12:false})}`;
  }
  function renderKpis() {
    const online = state.nodes.filter(n => state.online.has(n.uuid));
    const reports = online.map(n => state.reports[n.uuid] || {});
    const cores = online.reduce((s,n) => s + num(n.cpu_cores),0);
    const up = reports.reduce((s,r) => s+num(r.network?.up),0), down = reports.reduce((s,r) => s+num(r.network?.down),0);
    const traffic = reports.reduce((s,r) => s+num(r.network?.totalUp)+num(r.network?.totalDown),0);
    const busy = online.reduce((s,n) => s + num(n.cpu_cores)*reportValues(n).cpu,0)/Math.max(1,cores);
    $('kpiNodes').innerHTML = `${state.nodes.length}<small>台</small>`;
    $('kpiOnline').textContent = `${online.length} 在线 / ${state.nodes.length-online.length} 离线`;
    $('kpiCores').innerHTML = `${cores}<small>核</small>`;
    $('kpiCpu').textContent = `CPU 等效占用 ${fmt(busy)}%`;
    $('kpiSpeed').innerHTML = richBytes(up+down,true);
    $('kpiDirection').textContent = `↑ ${bytes(up,true)}　↓ ${bytes(down,true)}`;
    renderToday();
    $('mapNodeCount').textContent = state.nodes.length;
    $('mapRegionCount').textContent = `${new Set(state.nodes.map(n=>n.region).filter(Boolean)).size} 个地区`;
    state.spark.push({cpu:busy,net:up+down,nodes:online.length,traffic:state.today?state.today.up+state.today.down:0});
    if (state.spark.length > 24) state.spark.shift();
    for (const [id,key,color] of [['sparkCpu','cpu','#4b9dff'],['sparkNet','net','#36dfba'],['sparkNodes','nodes','#46d8f2'],['sparkTraffic','traffic','#8599ef']]) {
      const values = state.spark.map(v => v[key]);
      if (values.length < 2) continue;
      const lo = Math.min(...values)*.9, hi = Math.max(...values)*1.05;
      const points = values.map((v,i) => `${i/(values.length-1)*60},${25-(v-lo)/Math.max(1,hi-lo)*22}`).join(' ');
      $(id).innerHTML = `<svg viewBox="0 0 60 28"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
    }
  }
  function renderHealth() {
    const total = state.nodes.length;
    const counts = {healthy:0,warning:0,critical:0,offline:0,unknown:0};
    state.nodes.forEach(n => counts[statusFor(n)]++);
    const onlinePercent = total ? state.online.size/total*100 : 0;
    $('healthPercent').textContent = total ? `${fmt(onlinePercent,0)}%` : '—';
    $('healthArc').style.strokeDashoffset = 314.16*(1-onlinePercent/100);
    $('healthMessage').textContent = !total ? '暂无监控节点' : counts.unknown ? '等待数据恢复' : counts.offline ? `${counts.offline} 个节点处于离线` : '所有节点保持在线';
    $('healthCaption').textContent = !total ? '添加 Agent 后自动显示' : `${counts.healthy} 个正常 · ${counts.warning+counts.critical+counts.offline} 个需要关注`;
    const rows = [['healthy','健康节点'],['warning','关注节点'],['critical','危险节点'],['offline','离线节点']];
    if (counts.unknown) rows.push(['unknown','等待更新']);
    $('statusBars').innerHTML = rows.map(([key,label]) => `<div class="status-bar" style="--bar-color:${colors[key]}"><div><span><i></i>${label}</span><b>${counts[key]}<small>${total ? fmt(counts[key]/total*100,0):0}%</small></b></div><span><span style="width:${total ? counts[key]/total*100:0}%"></span></span></div>`).join('');
    const ready=total>0&&!counts.unknown;
    $('healthyRatio').textContent=ready?`${fmt(counts.healthy/total*100,0)}%`:'—';
    $('attentionCount').textContent=ready?`${counts.warning+counts.critical+counts.offline}`:'—';
    $('attentionCount').style.color=counts.critical||counts.offline?colors.critical:counts.warning?colors.warning:colors.healthy;
    $('attentionCount').parentElement.title='关注、危险及离线节点之和';
    const losses=state.nodes.map(n=>pingFor(n.uuid).loss).filter(v=>v!==null);
    const maxLoss=losses.length?Math.max(...losses):null;
    $('maxPingLoss').textContent=lossLabel({loss:maxLoss});
    $('maxPingLoss').style.color=lossColor(maxLoss);
    $('maxPingLoss').parentElement.title='所选探测任务最近一小时，各节点丢包率的最高值';
    renderPingPanel();
  }
  function renderFleet() {
    const filtered = state.nodes.filter(n => {
      const status = statusFor(n), online = state.online.has(n.uuid);
      return `${n.name} ${n.region} ${n.group}`.toLowerCase().includes(state.query) &&
        (state.filter === 'all' || state.filter === 'online' && online || state.filter === 'offline' && status === 'offline' || state.filter === 'attention' && ['warning','critical','offline'].includes(status));
    });
    const meter = (value,online) => `<div class="mini-meter"><span><i style="width:${online?clamp(value):0}%;background:${value >= state.settings.critical_percent?colors.critical:value>=state.settings.warn_percent?colors.warning:colors.healthy}"></i></span><b>${online?`${fmt(value)}%`:'—'}</b></div>`;
    $('fleetBody').innerHTML = filtered.map(n => {
      const v = reportValues(n), status = statusFor(n), ping=pingFor(n.uuid);
      return `<tr class="${n.uuid === state.selected?'selected':''}" data-node="${esc(n.uuid)}" tabindex="0" aria-label="查看 ${esc(n.name)} 指标"><td title="${esc(n.name)}">${flagFor(n.region)}${esc(n.name)}</td><td>${meter(v.cpu,v.online)}</td><td>${meter(v.ram,v.online)}</td><td><span class="net-up">${v.online?bytes(v.r.network?.up,true):'—'}</span> <span style="color:#305169">/</span> <span class="net-down">${v.online?bytes(v.r.network?.down,true):'—'}</span></td><td class="latency-cell">${latencyLabel(ping)}</td><td style="color:${lossColor(ping.loss)}">${lossLabel(ping)}</td><td><span class="table-status" style="--status-color:${colors[status]}"><i></i>${labels[status]}</span></td></tr>`;
    }).join('');
    $('fleetEmpty').hidden = filtered.length > 0;
    $('fleetCount').textContent = `显示 ${filtered.length} / ${state.nodes.length} 个节点`;
  }
  function renderMap() {
    const groups = new Map();
    state.nodes.forEach(n => {
      const loc = locationFor(n); if (!loc) return;
      const key = `${loc.lat.toFixed(1)},${loc.lon.toFixed(1)}`;
      if (!groups.has(key)) groups.set(key,{...loc,nodes:[]});
      groups.get(key).nodes.push(n);
    });
    const mapped = [...groups.values()];
    const focus = mapped.find(g => g.nodes.some(n => n.uuid === state.selected));
    const key = JSON.stringify(mapped.map(g => [g.lat,g.lon,g.nodes.map(n => [n.uuid,statusFor(n)]),g.nodes.some(n => n.uuid===state.selected)])) + state.settings.show_map_routes;
    if (key === state.mapKey) return;
    state.mapKey = key;
    const regionSet = new Set(state.nodes.map(n => n.region));
    const selectedRegion = currentNode()?.region;
    document.querySelectorAll('.country').forEach(el => { el.classList.toggle('active',regionSet.has(el.dataset.country)); el.classList.toggle('selected',el.dataset.country===selectedRegion); });
    let routes = '';
    const center = focus ? project(focus) : [810,200];
    mapped.forEach((g,index) => {
      const [x,y] = project(g);
      if (Math.hypot(x-center[0],y-center[1]) < 3 || !state.settings.show_map_routes) return;
      const curve = Math.max(22,Math.abs(x-center[0])*.22);
      const d = `M${center[0].toFixed(1)},${center[1].toFixed(1)}Q${((center[0]+x)/2).toFixed(1)},${(Math.min(y,center[1])-curve).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
      routes += `<path class="route" d="${d}"/><path class="route-flow" d="${d}" style="animation-delay:-${index*1.7}s"/>`;
    });
    $('mapRoutes').innerHTML = routes;
    const markers = [];
    const usedLabels = [];
    mapped.forEach((g,index) => {
      const [x,y] = project(g);
      const focused = g.nodes.some(n => n.uuid===state.selected);
      const statuses = g.nodes.map(statusFor);
      const status = ['critical','warning','healthy','offline','unknown'].find(s => statuses.includes(s));
      const color = colors[status];
      let labelY = y + (index%2 ? 18:-13), labelX = x+9;
      while (usedLabels.some(p => Math.abs(p[0]-labelX)<50 && Math.abs(p[1]-labelY)<12)) labelY += 14;
      usedLabels.push([labelX,labelY]);
      const r = g.nodes.length > 1 ? 6:3.5;
      markers.push(`<g class="map-marker ${focused?'selected':''}" data-node="${esc(focused?state.selected:g.nodes[0].uuid)}" role="button" tabindex="0" aria-label="${esc(g.label)}：${esc(g.nodes.map(n=>n.name).join('、'))}" style="--node-color:${color}"><title>${esc(g.label)} · ${esc(g.nodes.map(n=>n.name).join(' / '))}</title><circle class="node-halo" cx="${x}" cy="${y}" r="14"/>${status!=='offline'&&status!=='unknown'?`<circle class="pulse-ring" cx="${x}" cy="${y}" r="9" style="animation-delay:-${index*.4}s"/>`:''}<circle class="node-core" cx="${x}" cy="${y}" r="${r}"/>${g.nodes.length>1?`<text class="marker-count" x="${x}" y="${y}">${g.nodes.length}</text>`:''}<text class="marker-label" x="${labelX}" y="${labelY}">${esc(g.label)}</text></g>`);
    });
    $('mapMarkers').innerHTML = markers.join('');
  }
  function gauge(label,value,detail,color,display,online) {
    const actual = clamp(value);
    return `<div class="gauge"><svg viewBox="0 0 140 90" aria-hidden="true"><path class="track" d="M35.36,75A40,40 0 1 1 104.64,75"/><path class="arc" pathLength="100" d="M35.36,75A40,40 0 1 1 104.64,75" stroke="${online?color:'#2e4356'}" stroke-dasharray="${online?actual:0} 100"/></svg><strong class="gauge-value ${online?'':'offline-value'}">${online?display:'—'}</strong><span class="gauge-label">${label}</span><small class="gauge-detail">${online?detail:'暂无实时数据'}</small></div>`;
  }
  function renderDetail() {
    const aggregate=state.view==='aggregate';
    $('gauges').classList.toggle('aggregate-grid',aggregate);
    $('aggregateView').setAttribute('aria-pressed',String(aggregate));$('nodeView').setAttribute('aria-pressed',String(!aggregate));
    $('nodePagination').hidden=aggregate;$('aggregateNote').hidden=!aggregate;
    if(aggregate){
      const a=analytics.aggregate(state.nodes,state.reports,state.online),hasData=!!state.lastSuccess && a.count>0 && state.mode!=='error';
      const ram=percent(a.ram,a.ramTotal),disk=percent(a.disk,a.diskTotal),traffic=a.totalUp+a.totalDown;
      const color=v=>v>=state.settings.critical_percent?colors.critical:v>=state.settings.warn_percent?colors.warning:colors.healthy;
      $('selectedName').textContent='全部节点资源总览';
      $('selectedMeta').textContent=`在线资源汇总 · ${a.count} 在线 / ${state.nodes.length} 节点`;
      $('selectedStatus').textContent=state.mode==='error'?'待更新':'全局';$('selectedStatus').style.color=colors.healthy;
      const tile=(label,value,detail,usage,tint)=>`<div class="total-tile" style="--tile-color:${tint}"><span class="total-label">${label}</span><strong class="total-number">${hasData?value:'—'}</strong><span class="total-detail">${hasData?detail:'等待实时数据'}</span>${usage!==null?`<div class="total-progress"><i style="width:${hasData?clamp(usage):0}%"></i></div>`:'<div class="total-transfer">累计上传 + 累计下载</div>'}</div>`;
      $('gauges').innerHTML=tile('CPU 总核心',`${a.cores}<small>核</small>`,`综合占用 ${fmt(a.cpu)}% · 忙碌 ${fmt(a.busyCores)} 核`,a.cpu,'#4b9dff')+
        tile('内存总容量',richBytes(a.ramTotal),`已用 ${bytes(a.ram)} · ${fmt(ram)}%`,ram,color(ram))+
        tile('硬盘总容量',richBytes(a.diskTotal),`已用 ${bytes(a.disk)} · ${fmt(disk)}%`,disk,color(disk))+
        tile('累计流量总和',richBytes(traffic),`↑ ${bytes(a.totalUp)} / ↓ ${bytes(a.totalDown)}`,null,'#9eaff3');
      $('detailLabelOne').textContent='探测延迟均值';$('detailLabelTwo').textContent='探测丢包率';
      const ping=pingFor();$('selectedCores').textContent=latencyLabel(ping);$('selectedUptime').textContent=lossLabel(ping);$('selectedConnections').textContent=`${a.tcp} / ${a.udp}`;
      $('nodeUp').innerHTML=richBytes(a.up,true);$('nodeDown').innerHTML=richBytes(a.down,true);
      renderChart();return;
    }
    $('detailLabelOne').textContent='探测延迟均值';$('detailLabelTwo').textContent='探测丢包率';
    const n = currentNode();
    $('selectedIndex').textContent = n ? state.nodes.indexOf(n)+1:0;
    $('totalIndex').textContent = state.nodes.length;
    if (!n) {
      $('selectedName').textContent = '暂无节点'; $('selectedMeta').textContent = '请先在后台添加服务器';
      $('gauges').innerHTML = ['CPU 使用率','内存使用率','磁盘使用率','系统负载'].map(l => gauge(l,0,'',colors.offline,'—',false)).join('');
      ['selectedCores','selectedUptime','selectedConnections','nodeUp','nodeDown'].forEach(id => $(id).textContent='—');
      renderChart(); return;
    }
    const v = reportValues(n), status = statusFor(n);
    $('selectedName').textContent = n.name;
    $('selectedMeta').textContent = `${n.region || '未知地区'} / ${n.os || '未知系统'}${n.group ? ' / '+n.group:''}`;
    $('selectedStatus').textContent = labels[status];
    $('selectedStatus').style.color = colors[status];
    const gaugeColor = (v,normal) => v>=state.settings.critical_percent?colors.critical:v>=state.settings.warn_percent?colors.warning:normal;
    $('gauges').innerHTML = gauge('CPU 使用率',v.cpu,`${num(n.cpu_cores)} 个逻辑核心`,gaugeColor(v.cpu,'#4b9dff'),`${fmt(v.cpu)}<small>%</small>`,v.online) +
      gauge('内存使用率',v.ram,`${bytes(v.r.ram?.used)} / ${bytes(v.r.ram?.total || n.mem_total)}`,gaugeColor(v.ram,'#36dfba'),`${fmt(v.ram)}<small>%</small>`,v.online) +
      gauge('磁盘使用率',v.disk,`${bytes(v.r.disk?.used)} / ${bytes(v.r.disk?.total || n.disk_total)}`,gaugeColor(v.disk,'#eeb85d'),`${fmt(v.disk)}<small>%</small>`,v.online) +
      gauge('系统负载',v.loadPercent,'1 分钟负载 / 核心数',gaugeColor(v.loadPercent,'#849deb'),fmt(v.load,2),v.online);
    const ping=pingFor(n.uuid);
    $('selectedCores').textContent = latencyLabel(ping);
    $('selectedUptime').textContent = lossLabel(ping);
    $('selectedConnections').textContent = v.online ? `${num(v.r.connections?.tcp)} / ${num(v.r.connections?.udp)}`:'—';
    $('nodeUp').innerHTML = v.online?richBytes(v.r.network?.up,true):'—';
    $('nodeDown').innerHTML = v.online?richBytes(v.r.network?.down,true):'—';
    renderChart();
  }
  function renderChart() {
    const historyKey=state.view==='aggregate'?'__all__':state.selected;
    const data = (state.history.get(historyKey) || []).filter(p=>p.time>=Date.now()-3600000 && Number.isFinite(p.time)).sort((a,b)=>a.time-b.time);
    const sampled = data.filter((_,i) => i%Math.max(1,Math.ceil(data.length/140))===0 || i===data.length-1);
    const chartElement=$('trafficChart'),viewWidth=Math.max(260,chartElement.clientWidth||400),viewHeight=Math.max(48,chartElement.clientHeight||180);
    chartElement.setAttribute('viewBox',`0 0 ${viewWidth} ${viewHeight}`);
    const left = 43, top = 17, width = viewWidth-56, height = viewHeight-46;
    let max = Math.max(1,...sampled.flatMap(p=>[p.up,p.down]))*1.18;
    const hiUnit = unit(max,true);
    let svg = '<defs><linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#46d8f2" stop-opacity=".17"/><stop offset="1" stop-color="#46d8f2" stop-opacity="0"/></linearGradient><linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#36dfba" stop-opacity=".15"/><stop offset="1" stop-color="#36dfba" stop-opacity="0"/></linearGradient></defs>';
    const power = Math.max(0,Math.min(5,Math.floor(Math.log(Math.max(1,max))/Math.log(1024))));
    for(let i=0;i<4;i++) {
      const y = top+i*height/3;
      svg += `<line class="chart-grid" x1="${left}" y1="${y}" x2="${left+width}" y2="${y}"/><text class="chart-axis" x="${left-7}" y="${y+3}" text-anchor="end">${fmt(max*(1-i/3)/1024**power,1)}</text>`;
    }
    svg += `<text class="chart-axis" x="${left}" y="7">${hiUnit.label}</text>`;
    if (sampled.length) {
      const start = sampled.length>1?sampled[0].time:sampled[0].time-60000;
      const end = Math.max(start+60000,sampled[sampled.length-1].time);
      for (const [key,color,fill] of [['up','#46d8f2','upFill'],['down','#36dfba','downFill']]) {
        const points = sampled.map(p=>[left+(p.time-start)/(end-start)*width,top+height-clamp(p[key]/max*100)/100*height]);
        const path = points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
        svg += `<path d="${path}L${points.at(-1)[0]},${top+height}L${points[0][0]},${top+height}Z" fill="url(#${fill})"/><path class="chart-line" d="${path}" stroke="${color}"/>`;
      }
      for(let i=0;i<4;i++) svg += `<text class="chart-axis" x="${left+i*width/3}" y="${top+height+20}" text-anchor="${i===0?'start':i===3?'end':'middle'}">${clockText(start+(end-start)*i/3)}</text>`;
      sampled.forEach((p,i) => { if(i%3) return; const x=left+(p.time-start)/(end-start)*width;svg+=`<rect x="${x-3}" y="${top}" width="6" height="${height}" fill="transparent"><title>${clockText(p.time)} 上行 ${bytes(p.up,true)} / 下行 ${bytes(p.down,true)}</title></rect>`; });
      $('chartWindow').textContent = `${clockText(start)} — ${clockText(end)} · ${data.length} 个样本`;
    } else $('chartWindow').textContent = state.chartLoading ? '正在读取历史记录…':'暂无最近一小时记录';
    $('trafficChart').innerHTML = svg;
    $('chartEmpty').hidden = sampled.length>0;
    $('chartEmpty').textContent = state.chartLoading?'正在读取历史记录…':'暂无历史流量数据';
  }
  async function loadHistory(uuid,force=false) {
    if (!uuid || demo || !force && Date.now()-num(state.lastHistoryFetch.get(uuid))<60000) return;
    const request = ++state.chartRequest;
    state.chartLoading = true; renderChart();
    try {
      const response = await api(`/api/records/load?uuid=${encodeURIComponent(uuid)}&load_type=network&hours=1`);
      const records = Array.isArray(response)?response:response.records || [];
      const parsed = records.map(r=>({time:Date.parse(r.time || r.updated_at),up:num(r.net_out ?? r.network?.up),down:num(r.net_in ?? r.network?.down)})).filter(p=>Number.isFinite(p.time));
      const live = state.history.get(uuid) || [];
      const merged = new Map([...parsed,...live].map(p=>[Math.floor(p.time/1000),p]));
      state.history.set(uuid,[...merged.values()].filter(p=>p.time>Date.now()-3600000).sort((a,b)=>a.time-b.time));
      state.lastHistoryFetch.set(uuid,Date.now());
    } catch(error) {
      if(uuid === state.selected && !state.history.get(uuid)?.length) $('chartWindow').textContent = '历史记录不可用，连接后累积实时数据';
    } finally {
      if(request === state.chartRequest) { state.chartLoading=false; renderChart(); }
    }
  }
  function appendLive() {
    state.nodes.forEach(n => {
      const r = state.reports[n.uuid]; if(!r || !state.online.has(n.uuid)) return;
      const point = {time:Date.parse(r.updated_at) || Date.now(),up:num(r.network?.up),down:num(r.network?.down)};
      const list = state.history.get(n.uuid) || [];
      if(!list.length || point.time>list.at(-1).time) list.push(point);
      state.history.set(n.uuid,list.filter(p=>p.time>Date.now()-3600000).slice(-2000));
    });
    const a=analytics.aggregate(state.nodes,state.reports,state.online);
    const list=state.history.get('__all__')||[];
    list.push({time:Date.now(),up:a.up,down:a.down});state.history.set('__all__',list.filter(p=>p.time>Date.now()-3600000).slice(-2000));
  }
  function render() { renderKpis(); renderHealth(); renderFleet(); renderMap(); renderDetail(); }
  function selectNode(uuid,manual=true) {
    if(!state.nodes.some(n=>n.uuid===uuid)) return;
    if(manual) {state.view='node';state.rotate=false;updateRotateButton();}
    state.selected=uuid; state.mapKey='';state.chartLoading=false;
    renderFleet();renderMap();renderDetail();renderPingPanel();loadHistory(uuid);
  }
  function cycleNode(delta) {
    if(!state.nodes.length) return;
    const index = state.nodes.findIndex(n=>n.uuid===state.selected);
    selectNode(state.nodes[(index+delta+state.nodes.length)%state.nodes.length].uuid,false);
  }
  function updateRotateButton() {
    $('autoRotate').textContent=state.rotate?'Ⅱ 暂停轮播':'▷ 自动轮播';
    $('autoRotate').setAttribute('aria-pressed',String(state.rotate));
  }
  function applyFrame(frame) {
    const body = frame.data ?? frame;
    if(!body || !Array.isArray(body.online) || typeof body.data !== 'object' || body.data===null) return false;
    state.online = new Set(body.online.filter(id=>state.nodes.some(n=>n.uuid===id)));
    state.reports = body.data; state.lastSuccess=Date.now();state.lastWs=Date.now();
    state.reconnectDelay=1500;setConnection('websocket');appendLive();render();return true;
  }
  function connectWebSocket() {
    if(demo || !state.nodes.length || state.ws && [0,1].includes(state.ws.readyState)) return;
    clearTimeout(state.reconnectTimer);
    const ws = new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/clients`);
    state.ws=ws;
    const openTimeout=setTimeout(()=>{if(ws.readyState===0)ws.close();},12000);
    ws.onopen=()=>{clearTimeout(openTimeout);ws.send('get');};
    ws.onmessage=event=>{try{applyFrame(JSON.parse(event.data));}catch{ /* Ignore malformed frames, keep last valid data. */ }};
    ws.onerror=()=>{if(ws.readyState<2)ws.close();};
    ws.onclose=()=>{
      clearTimeout(openTimeout);
      if(state.ws===ws)state.ws=null;
      if(state.mode==='websocket')setConnection('http');
      state.reconnectTimer=setTimeout(connectWebSocket,state.reconnectDelay);
      state.reconnectDelay=Math.min(60000,state.reconnectDelay*1.8);
    };
  }
  async function poll() {
    if(demo || state.polling || document.hidden) return;
    if(state.ws?.readyState===1 && Date.now()-state.lastWs<Math.max(20000,state.settings.refresh_seconds*3000)) {
      state.ws.send('get');return;
    }
    if(!state.nodes.length) return;
    state.polling=true;
    const results=await Promise.allSettled(state.nodes.map(async n=>{
      const records=await api(`/api/recent/${encodeURIComponent(n.uuid)}`);
      const array=Array.isArray(records)?records:Array.isArray(records.records)?records.records:[];
      const last=array.reduce((latest,r)=>Date.parse(r.updated_at || r.time)>Date.parse(latest?.updated_at || latest?.time || 0)?r:latest,null);
      if(last && Date.now()-state.lastWs>Math.max(20000,state.settings.refresh_seconds*3000)){
        state.reports[n.uuid]=last;
        if(Date.now()-Date.parse(last.updated_at||last.time)<90000)state.online.add(n.uuid);else state.online.delete(n.uuid);
        state.lastSuccess=Date.now();setConnection('http');scheduleRender();
      }
      return {id:n.uuid,last};
    }));
    if(state.mode==='websocket'&&Date.now()-state.lastWs<20000){state.polling=false;return;}
    const successful=results.filter(r=>r.status==='fulfilled');
    if(successful.length) {
      const freshOnline=new Set();
      successful.forEach(({value})=>{
        if(value.last)state.reports[value.id]=value.last;
        if(value.last && Date.now()-Date.parse(value.last.updated_at || value.last.time)<90000)freshOnline.add(value.id);
      });
      results.forEach((result,i)=>{if(result.status==='rejected' && state.online.has(state.nodes[i].uuid) && Date.now()-Date.parse(state.reports[state.nodes[i].uuid]?.updated_at || 0)<90000)freshOnline.add(state.nodes[i].uuid);});
      state.online=freshOnline;state.lastSuccess=Date.now();setConnection('http');appendLive();render();
    } else {
      setConnection('error');renderHealth();renderFleet();
      $('lastUpdate').textContent = `读取失败 · ${results[0]?.reason?.message || '检查面板连接'}`;
    }
    state.polling=false;
  }
  async function refreshNodes() {
    const nodes=await api('/api/nodes');
    if(!Array.isArray(nodes))throw new Error('节点接口返回格式不正确');
    state.nodes=nodes.filter(n=>n && typeof n.uuid==='string').map(n=>({...n,region:analytics.normalizeRegion(n.region)})).sort((a,b)=>num(a.weight)-num(b.weight));
    if(!state.nodes.some(n=>n.uuid===state.selected))state.selected=state.nodes[0]?.uuid || '';
    if(!state.nodes.length){state.lastSuccess=Date.now();setConnection('http');}
  }
  let paintQueued=false;
  function scheduleRender(){if(paintQueued)return;paintQueued=true;requestAnimationFrame(()=>{paintQueued=false;render();});}
  let mapRequested=false;
  function setupMap() {
    if(!window.WORLD_SHAPES&&!mapRequested){
      mapRequested=true;
      const script=document.createElement('script');script.src='/themes/webstack-observatory/dist/assets/world.js?v=1.2.2';script.async=true;script.fetchPriority='low';
      script.onload=()=>{setupMap();state.mapKey='';renderMap();};
      script.onerror=()=>{$('worldMap').setAttribute('aria-label','地图底图暂不可用，节点与资源数据仍可查看');};
      document.head.appendChild(script);
    }
    $('countries').innerHTML=(window.WORLD_SHAPES || []).map(c=>`<path class="country" data-country="${esc(c.code)}" d="${esc(c.d)}"><title>${esc(regionName(c.code))}</title></path>`).join('');
    let grid='';
    for(let lon=-180;lon<=180;lon+=30){const x=(lon+180)*1000/360;grid+=`<path class="map-grid" d="M${x},0V500"/>`;}
    for(let lat=-60;lat<=80;lat+=20){const y=(82-lat)*500/142;grid+=`<path class="map-grid" d="M0,${y}H1000"/>`;}
    $('mapGrid').innerHTML=grid;
  }
  function startDemo() {
    const specs=[['上海 · 主控节点','CN',8,31.23,121.47],['香港 · 边缘计算','HK',4,22.32,114.17],['东京 · 数据节点','JP',4,35.68,139.69],['洛杉矶 · 中继节点','US',4,34.05,-118.24],['西雅图 · 备份节点','US',4,47.6,-122.33],['法兰克福 · 生产节点','DE',8,50.11,8.68],['新加坡 · 出口节点','SG',4,1.35,103.82],['伦敦 · 边缘节点','GB',4,51.51,-.13],['悉尼 · 存储节点','AU',4,-33.87,151.21],['纽约 · 转发节点','US',4,40.71,-74],['阿姆斯特丹 · 备份','NL',4,52.37,4.9]];
    state.nodes=specs.map((s,i)=>({uuid:`demo-${i}`,name:s[0],region:s[1],cpu_cores:s[2],os:i===3?'Windows 11':'Debian 12',arch:'amd64',mem_total:8*1024**3,disk_total:100*1024**3,weight:i}));
    specs.forEach((s,i)=>state.locations[`demo-${i}`]={lat:s[3],lon:s[4],label:s[0].split(' · ')[0]});
    state.selected='demo-0';
    state.pingTasks=[{id:1,name:'骨干网探测'}];renderPingTasks();
    const step=()=>{
      const t=Date.now()/1000;
      state.online=new Set(state.nodes.filter((_,i)=>i!==8).map(n=>n.uuid));
      state.nodes.forEach((n,i)=>{
        const cpu=i===5?96.5:18+i*3+Math.sin(t/8+i)*8;
        state.reports[n.uuid]={cpu:{usage:cpu},ram:{used:n.mem_total*(i===2?.86:.25+i*.025),total:n.mem_total},disk:{used:n.disk_total*(.28+i*.032),total:n.disk_total},load:{load1:cpu/100*n.cpu_cores},network:{up:(2+Math.sin(t/12+i))*1024**2*(1+i*.15),down:(1.5+Math.cos(t/9+i))*1024**2,totalUp:(i+1)*64*1024**3,totalDown:(i+1)*36*1024**3},connections:{tcp:160+i*43,udp:10+i*3},uptime:(3+i)*86400,updated_at:new Date().toISOString()};
        if(!state.history.has(n.uuid))state.history.set(n.uuid,Array.from({length:120},(_,k)=>({time:Date.now()-(119-k)*30000,up:Math.max(0,(1.4+Math.sin(k/8+i)+Math.sin(k*3.4)*.12))*1024**2,down:Math.max(0,(1.2+Math.sin(k/6+i+1)+Math.cos(k*2.1)*.15))*1024**2})));
      });
      state.today={up:38*1024**3,down:24*1024**3,start:analytics.todayStart(Date.now(),state.settings.traffic_timezone)};
      state.pingRows=state.nodes.map((n,i)=>({entity_id:n.uuid,task_id:'1',total:60,valid:i===8?0:i===5?54:60,avg:i===8?null:18+i*22}));state.pingUpdated=Date.now();
      if(!state.history.has('__all__')){
        state.history.set('__all__',Array.from({length:120},(_,k)=>({time:Date.now()-(119-k)*30000,up:state.nodes.filter(n=>state.online.has(n.uuid)).reduce((s,n)=>s+(state.history.get(n.uuid)?.[k]?.up||0),0),down:state.nodes.filter(n=>state.online.has(n.uuid)).reduce((s,n)=>s+(state.history.get(n.uuid)?.[k]?.down||0),0)})));
      }
      state.lastSuccess=Date.now();setConnection('demo');appendLive();render();
    };
    $('demoBadge').hidden=false;step();setInterval(step,5000);
  }
  function bindEvents() {
    $('nodeSearch').addEventListener('input',event=>{state.query=event.target.value.trim().toLowerCase();renderFleet();});
    $('statusFilter').addEventListener('change',event=>{state.filter=event.target.value;renderFleet();});
    document.addEventListener('click',event=>{const node=event.target.closest('[data-node]');if(node)selectNode(node.dataset.node);});
    document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const node=event.target.closest('[data-node]');if(node){event.preventDefault();selectNode(node.dataset.node);}}});
    $('autoRotate').addEventListener('click',()=>{state.rotate=!state.rotate;updateRotateButton();});
    $('aggregateView').addEventListener('click',()=>{state.view='aggregate';renderDetail();loadGlobalHistory();});
    $('nodeView').addEventListener('click',()=>{state.view='node';renderDetail();loadHistory(state.selected);});
    $('pingTask').addEventListener('change',event=>{state.pingTask=event.target.value;renderPingPanel();renderFleet();renderDetail();});
    $('previousNode').addEventListener('click',()=>{state.rotate=false;updateRotateButton();cycleNode(-1);});
    $('nextNode').addEventListener('click',()=>{state.rotate=false;updateRotateButton();cycleNode(1);});
    $('fullscreen').addEventListener('click',async()=>{
      try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
      catch{$('notice').textContent='当前浏览器未允许全屏，请使用 F11';$('notice').hidden=false;setTimeout(()=>$('notice').hidden=true,4000);}
    });
    document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'进入全屏');});
    window.addEventListener('online',()=>{if(!demo){connectWebSocket();poll();}});
    document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('is-background',document.hidden);if(!document.hidden&&!demo){poll();if(state.view==='node')loadHistory(state.selected);}});
  }
  async function initialize() {
    setupMap();bindEvents();
    const tick=()=>{const now=new Date();$('clock').textContent=now.toLocaleTimeString('zh-CN',{hour12:false});$('date').textContent=now.toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'})+' '+now.toLocaleDateString('zh-CN',{weekday:'short'});if(state.today&&state.today.start!==analytics.todayStart(Date.now(),state.settings.traffic_timezone)){renderToday();loadToday();}};
    tick();setInterval(tick,1000);
    if(demo){startDemo();}else{
      try{
        let nodeError=null;
        const nodesReady=refreshNodes().then(()=>{render();connectWebSocket();setTimeout(poll,800);}).catch(error=>{nodeError=error;});
        const settings=await api('/api/public').catch(()=>({}));
        // Only use this theme's own settings; previews may be served beside another theme.
        if(settings.theme==='webstack-observatory' && settings.theme_settings && typeof settings.theme_settings==='object')Object.assign(state.settings,settings.theme_settings);
        state.settings.refresh_seconds=clamp(state.settings.refresh_seconds,3,60);
        state.settings.rotate_seconds=clamp(state.settings.rotate_seconds,5,300);
        state.settings.warn_percent=clamp(state.settings.warn_percent,1,99);
        state.settings.critical_percent=clamp(state.settings.critical_percent,state.settings.warn_percent,100);
        state.settings.ping_warn_loss=clamp(state.settings.ping_warn_loss,0.1,99);
        state.settings.ping_critical_loss=clamp(state.settings.ping_critical_loss,state.settings.ping_warn_loss,100);
        const locations=state.settings.node_locations;
        try{state.locations=typeof locations==='string'?JSON.parse(locations||'{}'):locations||{};if(!state.locations||Array.isArray(state.locations)||typeof state.locations!=='object')state.locations={};}
        catch{state.locations={};state.settingsError='自定义节点位置格式无效，已使用地区示意';}
        for(const [id,key,fallback] of [['brandName','brand_name','WEBSTACK'],['brandSubtitle','brand_subtitle','运维中心'],['brandMark','brand_mark','W']]){
          const value=String(state.settings[key]??fallback).trim();
          $(id).textContent=value;$(id).title=value;
        }
        $('dashboardTitle').textContent=state.settings.dashboard_title || 'WebStackLab 全球监控中心';
        $('subtitle').textContent=(!state.settings.subtitle||state.settings.subtitle==='GLOBAL INFRASTRUCTURE OBSERVATORY')?'全球节点 · 资源总览 · 网络质量':state.settings.subtitle;
        $('adminLink').hidden=state.settings.show_admin_link===false;
        await nodesReady;if(nodeError)throw nodeError;
        state.mapKey='';render();
        loadToday();loadPing();
        setTimeout(()=>{loadGlobalHistory();if(state.view==='node')loadHistory(state.selected);},350);
      }catch(error){setConnection('error');$('lastUpdate').textContent=error.message;render();}
      setInterval(async()=>{
        if(!state.nodes.length){try{await refreshNodes();connectWebSocket();}catch{ /* Retry automatically. */ }}
        if(state.lastSuccess && Date.now()-state.lastSuccess>30000){setConnection('error');renderHealth();renderFleet();}
        poll();
      },state.settings.refresh_seconds*1000);
      setInterval(async()=>{try{await refreshNodes();render();connectWebSocket();loadHistory(state.selected);loadToday();loadGlobalHistory();}catch{ /* Keep valid prior snapshot. */ }},60000);
      setInterval(loadPing,30000);
    }
    setInterval(()=>{if(state.view==='node'&&state.rotate&&state.nodes.length>1)cycleNode(1);},state.settings.rotate_seconds*1000);
    if(state.settingsError){$('notice').textContent=state.settingsError;$('notice').hidden=false;setTimeout(()=>$('notice').hidden=true,6000);}
    state.initialized=true;
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(state.initialized)renderChart();}).observe($('trafficChart').parentElement);
  }
  initialize();
})();
