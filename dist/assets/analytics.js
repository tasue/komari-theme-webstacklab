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
