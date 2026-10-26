const assert=require('node:assert/strict');
const {aggregate,todayStart,trafficSum,rateSum,normalizeRegion,pingSummary}=require('./dist/assets/analytics.js');
assert.equal(normalizeRegion('🇨🇳'),'CN');assert.equal(normalizeRegion('🇺🇸'),'US');assert.equal(normalizeRegion('hk'),'HK');assert.equal(normalizeRegion('not-a-region'),'');

// Two differently sized CPUs must use core-weighted utilization, not sum percentages.
const nodes=[{uuid:'a',cpu_cores:2,mem_total:8,disk_total:100},{uuid:'b',cpu_cores:8,mem_total:16,disk_total:200},{uuid:'offline',cpu_cores:32}];
const reports={a:{cpu:{usage:100},ram:{used:4,total:8},disk:{used:25,total:100},network:{up:10,down:20,totalUp:100,totalDown:200}},b:{cpu:{usage:0},ram:{used:8,total:16},disk:{used:50,total:200},network:{up:30,down:40,totalUp:300,totalDown:400}},offline:{cpu:{usage:100},network:{up:1000,totalUp:500,totalDown:600}}};
const a=aggregate(nodes,reports,new Set(['a','b']));
assert.equal(a.cores,10);assert.equal(a.cpu,20);assert.equal(a.ram,12);assert.equal(a.ramTotal,24);assert.equal(a.disk,75);assert.equal(a.diskTotal,300);assert.equal(a.up,40);assert.equal(a.down,60);assert.equal(a.totalUp,900);assert.equal(a.totalDown,1200);

// Midnight is based on the configured calendar day, independent of host timezone.
assert.equal(new Date(todayStart(Date.parse('2026-10-24T15:59:59Z'))).toISOString(),'2026-10-23T16:00:00.000Z');
assert.equal(new Date(todayStart(Date.parse('2026-10-24T16:00:00Z'))).toISOString(),'2026-10-24T16:00:00.000Z');
assert.equal(new Date(todayStart(Date.parse('2026-10-24T16:00:00Z'),'UTC')).toISOString(),'2026-10-24T00:00:00.000Z');

// Sum recorded traffic deltas, never lifetime counters or hidden/unrequested nodes.
assert.deepEqual(trafficSum([{metric_key:'traffic.up',entity_id:'a',points:[{value:25},{value:75}]},{metric_key:'traffic.down',entity_id:'a',points:[{value:200}]},{metric_key:'net.total.up',entity_id:'a',points:[{value:9999999}]},{metric_key:'traffic.up',entity_id:'hidden',points:[{value:5000}]}],new Set(['a'])),{up:100,down:200,points:3});
const rates=rateSum([{metric_key:'net.out.rate',entity_id:'a',points:[{time:'2026-10-24T00:00:00Z',value:10}]},{metric_key:'net.out.rate',entity_id:'b',points:[{time:'2026-10-24T00:00:00Z',value:20}]},{metric_key:'net.in.rate',entity_id:'b',points:[{time:'2026-10-24T00:00:00Z',value:50}]}],new Set(['a','b']));
assert.equal(rates.length,1);assert.equal(rates[0].up,30);assert.equal(rates[0].down,50);
const ping=pingSummary([{entity_id:'a',task_id:'1',total:10,valid:8,avg:100},{entity_id:'b',task_id:'1',total:90,valid:90,avg:10},{entity_id:'hidden',task_id:'1',total:500,valid:0,avg:null}],new Set(['a','b']));
assert.equal(ping.total,100);assert.equal(ping.loss,2);assert.equal(ping.latency,1700/98);
assert.equal(pingSummary([],new Set()).loss,null);assert.equal(pingSummary([],new Set()).latency,null);
assert.equal(pingSummary([{entity_id:'a',task_id:'2',total:10,valid:0,avg:null}],new Set(['a']),'2').loss,100);
assert.equal(pingSummary([{entity_id:'a',task_id:'2',total:10,valid:0,avg:null}],new Set(['a']),'1').total,0);
console.log('PASS: weighted CPU, resource totals, region codes, offline counters, timezone rollover, daily traffic deltas, aggregate chart, weighted Ping latency/loss, missing Ping');
