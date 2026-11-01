const {chromium}=require('playwright'); const fs=require('fs');
const mode=process.argv[2]; // 'times' t1,t2,.. outdir | 'range' start end outdir
(async()=>{
 const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--js-flags=--max-old-space-size=4096']});
 const p=await b.newPage({viewport:{width:1080,height:1920}});
 p.on('console',m=>{const t=m.text(); if(!/GPU stall|Automatic fallback/.test(t)) console.log('C:',t.slice(0,400))}); p.on('pageerror',e=>console.log('PAGEERR',e.message));
 const t0=Date.now();
 await p.goto('http://localhost:8765/'+(process.env.PAGE||'film.html')+(process.env.QS||''));
 await p.waitForFunction('window.ready||window.initError',null,{timeout:600000});
 const err=await p.evaluate('window.initError'); if(err){console.log(err);process.exit(1)}
 console.log('init',(Date.now()-t0)/1000,'s');
 const save=async(t,f)=>{const d=await p.evaluate(t=>window.renderFrame(t),t); fs.writeFileSync(f,Buffer.from(d.split(',')[1],'base64'));};
 if(mode==='times'){ const ts=process.argv[3].split(',').map(Number); const od=process.argv[4]; fs.mkdirSync(od,{recursive:true});
   for(const t of ts){const s=Date.now(); await save(t,`${od}/t_${t.toFixed(2)}.jpg`); console.log(t,(Date.now()-s),'ms');}}
 else { const a=+process.argv[3], e=+process.argv[4], od=process.argv[5]; fs.mkdirSync(od,{recursive:true});
   for(let f=a; f<e; f++){ const fn=`${od}/f_${String(f).padStart(5,'0')}.jpg`; if(fs.existsSync(fn)) continue; const s=Date.now(); await save(f/(+(process.env.FPS||24)),fn); if(f%24==0) console.log('frame',f,(Date.now()-s),'ms', new Date().toISOString()); } }
 await b.close();
})();
