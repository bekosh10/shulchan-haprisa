const {contextBridge,ipcRenderer}=require('electron');
const toBytes=async d=>{if(d==null)return new Uint8Array(0);if(typeof d==='string')return new TextEncoder().encode(d);if(d instanceof Uint8Array)return d;if(d instanceof ArrayBuffer)return new Uint8Array(d);if(typeof d.arrayBuffer==='function')return new Uint8Array(await d.arrayBuffer());return new TextEncoder().encode(String(d))};
const desk={
  getCfg:()=>ipcRenderer.invoke('cfg:get'),setCfg:p=>ipcRenderer.invoke('cfg:set',p),pickFolder:s=>ipcRenderer.invoke('dlg:folder',s),
  saveFile:async(filename,data,kind,dir)=>ipcRenderer.invoke('file:save',{filename,bytes:await toBytes(data),kind,dir}),
  saveJob:(name,text)=>ipcRenderer.invoke('job:save',{name,text}),saveJobAs:(name,text,start)=>ipcRenderer.invoke('job:saveAs',{name,text,start}),openJobDialog:()=>ipcRenderer.invoke('job:openDialog'),saveJobTo:(file,text)=>ipcRenderer.invoke('job:saveTo',{file,text}),listJobs:()=>ipcRenderer.invoke('job:list'),readJob:n=>ipcRenderer.invoke('job:read',n),trashJob:n=>ipcRenderer.invoke('job:trash',n),
  reveal:p=>ipcRenderer.invoke('os:reveal',p),
  checkUpdate:()=>ipcRenderer.invoke('upd:check'),applyUpdate:()=>ipcRenderer.invoke('upd:apply'),rollback:()=>ipcRenderer.invoke('upd:rollback'),
  onOpenJob:cb=>ipcRenderer.on('job:open',(e,d)=>cb(d))};
contextBridge.exposeInMainWorld('desk',desk);
/* the page asks window.claude.use('downloads') for saving files: here it writes straight into the fixed folders */
contextBridge.exposeInMainWorld('claude',{use:async cap=>cap==='downloads'?{save:async({filename,data})=>{const r=await desk.saveFile(filename,data);return r}}:null});
