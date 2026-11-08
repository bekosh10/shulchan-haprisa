/* שולחן הפריסה – desktop shell.
   The app itself is one HTML file. A bundled copy ships inside the .app; updates are downloaded
   into the user's data folder and loaded from there, so updating never touches the signed bundle. */
const {app,BrowserWindow,ipcMain,dialog,shell,Menu,net}=require('electron');
const path=require('path'),fs=require('fs'),os=require('os');

const DEFAULT_UPDATE='https://raw.githubusercontent.com/bekosh10/shulchan-haprisa/main/';
const USER=()=>app.getPath('userData');
const CFG_FILE=()=>path.join(USER(),'config.json');
const APP_DIR=()=>path.join(USER(),'app');
const BUNDLED=path.join(__dirname,'app','index.html');

function readJSON(f,d){try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){return d}}
function defaults(){const base=path.join(app.getPath('documents'),'שולחן הפריסה');
  return{jobsDir:path.join(base,'עבודות'),printDir:path.join(base,'print'),cutDir:path.join(base,'cut'),dxfDir:path.join(base,'dxf'),otherDir:path.join(base,'קבצים'),updateUrl:DEFAULT_UPDATE,autoCheck:true}}
function cfg(){return Object.assign(defaults(),readJSON(CFG_FILE(),{}))}
function saveCfg(c){fs.mkdirSync(USER(),{recursive:true});fs.writeFileSync(CFG_FILE(),JSON.stringify(c,null,2))}
function ensureDirs(c){for(const k of['jobsDir','printDir','cutDir','dxfDir','otherDir'])try{fs.mkdirSync(c[k],{recursive:true})}catch(e){}}

/* version of an app html: <meta name="app-version" content="..."> */
function versionOf(file){try{const s=fs.readFileSync(file,'utf8').slice(0,6000);const m=s.match(/name="app-version"\s+content="([^"]+)"/);return m?m[1]:'0'}catch(e){return'0'}}
const vnum=v=>String(v).split(/[^0-9]+/).filter(Boolean).map(Number);
function newer(a,b){const x=vnum(a),y=vnum(b);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d>0}return false}
function ensureLib(){try{const src=path.join(__dirname,'app','lib'),dst=path.join(APP_DIR(),'lib');fs.mkdirSync(dst,{recursive:true});for(const f of fs.readdirSync(src)){const d=path.join(dst,f);if(!fs.existsSync(d)||fs.statSync(d).size!==fs.statSync(path.join(src,f)).size)fs.copyFileSync(path.join(src,f),d)}}catch(e){}}
function appFile(){const up=path.join(APP_DIR(),'index.html');if(fs.existsSync(up)&&!newer(versionOf(BUNDLED),versionOf(up)))return up;return BUNDLED}

let win=null,pendingOpen=null;
function create(){
  const c=cfg();ensureDirs(c);ensureLib();
  win=new BrowserWindow({width:1500,height:950,minWidth:1000,minHeight:650,title:'שולחן הפריסה',icon:process.platform==='darwin'?undefined:path.join(__dirname,'icon.png'),backgroundColor:'#f6f6f8',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,spellcheck:false}});
  win.loadFile(appFile());
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))shell.openExternal(url);return{action:'deny'}});
  win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('file:')){e.preventDefault();shell.openExternal(url)}});
  win.webContents.on('did-finish-load',()=>{if(pendingOpen){sendOpen(pendingOpen);pendingOpen=null}});
}
function sendOpen(file){try{const text=fs.readFileSync(file,'utf8');win.webContents.send('job:open',{name:path.basename(file),text,path:file})}catch(e){}}

/* double-click a job file in Finder */
app.on('open-file',(e,file)=>{e.preventDefault();if(win&&!win.webContents.isLoading())sendOpen(file);else pendingOpen=file});

const safeName=n=>String(n||'').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'-').replace(/^\.+/,'').trim().slice(0,120)||'ללא שם';
function uniq(dir,name){return path.join(dir,name)}
function routeDir(c,filename,kind){if(kind==='job')return c.jobsDir;const n=filename.toLowerCase();
  if(/\.dxf$/.test(n))return c.dxfDir||c.cutDir;if(/_cut\b|_cut\./.test(n))return c.cutDir;if(/_print\b|_print\.|_back\b/.test(n))return c.printDir;
  if(n.endsWith('.json'))return c.jobsDir;if(n.endsWith('.pdf'))return c.printDir;return c.otherDir}

ipcMain.handle('cfg:get',()=>Object.assign(cfg(),{appVersion:versionOf(appFile()),shellVersion:app.getVersion(),bundledVersion:versionOf(BUNDLED),platform:process.platform}));
ipcMain.handle('cfg:set',(e,patch)=>{const c=Object.assign(cfg(),patch||{});saveCfg(c);ensureDirs(c);return c});
ipcMain.handle('dlg:folder',async(e,start)=>{const r=await dialog.showOpenDialog(win,{defaultPath:start||undefined,properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0]});
ipcMain.handle('file:save',(e,{filename,bytes,kind,dir:want})=>{const c=cfg();ensureDirs(c);let dir=routeDir(c,filename,kind);if(want&&typeof want==='string'){try{fs.mkdirSync(want,{recursive:true});dir=want}catch(err){}}const f=uniq(dir,safeName(filename));
  fs.writeFileSync(f,Buffer.from(bytes));return{path:f,dir}});
ipcMain.handle('job:save',(e,{name,text})=>{const c=cfg();ensureDirs(c);const f=path.join(c.jobsDir,safeName(name)+'.prs');fs.writeFileSync(f,text,'utf8');return{path:f}});
ipcMain.handle('job:saveAs',async(e,{name,text,start})=>{const c=cfg();ensureDirs(c);const def=start&&fs.existsSync(path.dirname(start))?start:path.join(c.jobsDir,safeName(name)+'.prs');
  const r=await dialog.showSaveDialog(win,{title:'שמירה בשם',defaultPath:def,filters:[{name:'עבודת שולחן הפריסה',extensions:['prs']}],properties:['createDirectory','showOverwriteConfirmation']});
  if(r.canceled||!r.filePath)return null;let f=r.filePath;if(!/\.(prs|shulchan)$/i.test(f))f+='.prs';fs.writeFileSync(f,text,'utf8');return{path:f,name:path.basename(f).replace(/\.(prs|shulchan)$/i,'')}});
ipcMain.handle('job:saveTo',(e,{file,text})=>{if(!file||!/\.(prs|shulchan|json)$/i.test(file))throw new Error('bad path');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text,'utf8');return{path:file}});
ipcMain.handle('job:openDialog',async()=>{const c=cfg();const r=await dialog.showOpenDialog(win,{title:'פתיחת עבודה',defaultPath:c.jobsDir,filters:[{name:'עבודות',extensions:['prs','shulchan','json']}],properties:['openFile']});
  if(r.canceled||!r.filePaths[0])return null;const f=r.filePaths[0];return{path:f,name:path.basename(f),text:fs.readFileSync(f,'utf8')}});
ipcMain.handle('job:list',()=>{const c=cfg();try{return fs.readdirSync(c.jobsDir).filter(n=>/\.(prs|shulchan|json)$/i.test(n)).map(n=>{const st=fs.statSync(path.join(c.jobsDir,n));return{name:n,mtime:st.mtimeMs,size:st.size}}).sort((a,b)=>b.mtime-a.mtime)}catch(e){return[]}});
ipcMain.handle('job:read',(e,name)=>{const c=cfg();return fs.readFileSync(path.join(c.jobsDir,path.basename(name)),'utf8')});
ipcMain.handle('job:trash',async(e,name)=>{const c=cfg();await shell.trashItem(path.join(c.jobsDir,path.basename(name)));return true});
ipcMain.handle('os:reveal',(e,p)=>{if(p&&fs.existsSync(p)){if(fs.statSync(p).isDirectory())shell.openPath(p);else shell.showItemInFolder(p)}return true});

/* ---- updates: version.json + index.html from the update address ---- */
async function fetchText(url){const r=await net.fetch(url+(url.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return await r.text()}
ipcMain.handle('upd:check',async()=>{const c=cfg();const base=c.updateUrl.replace(/\/?$/,'/');const j=JSON.parse(await fetchText(base+'version.json'));
  const cur=versionOf(appFile());return{latest:j.version,notes:j.notes||'',current:cur,available:newer(j.version,cur),minShell:j.minShell||null,shellOk:!j.minShell||!newer(j.minShell,app.getVersion())}});
ipcMain.handle('upd:apply',async()=>{const c=cfg();const base=c.updateUrl.replace(/\/?$/,'/');const html=await fetchText(base+'index.html');
  if(!/name="app-version"/.test(html)||html.length<100000)throw new Error('הקובץ שהתקבל לא תקין');
  fs.mkdirSync(APP_DIR(),{recursive:true});ensureLib();const cur=path.join(APP_DIR(),'index.html');
  if(fs.existsSync(cur))fs.copyFileSync(cur,path.join(APP_DIR(),'previous.html'));
  fs.writeFileSync(cur+'.tmp',html,'utf8');fs.renameSync(cur+'.tmp',cur);
  setTimeout(()=>win.loadFile(appFile()),300);return{version:versionOf(cur)}});
ipcMain.handle('upd:rollback',()=>{const p=path.join(APP_DIR(),'previous.html'),cur=path.join(APP_DIR(),'index.html');if(!fs.existsSync(p))return false;fs.copyFileSync(p,cur);setTimeout(()=>win.loadFile(appFile()),300);return true});

function menu(){const isMac=process.platform==='darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac?[{label:app.name,submenu:[{role:'about',label:'אודות שולחן הפריסה'},{type:'separator'},{role:'hide',label:'הסתר'},{role:'hideOthers'},{type:'separator'},{role:'quit',label:'יציאה'}]}]:[]),
    {label:'עריכה',submenu:[{role:'undo',label:'בטל'},{role:'redo',label:'בצע שוב'},{type:'separator'},{role:'cut',label:'גזור'},{role:'copy',label:'העתק'},{role:'paste',label:'הדבק'},{role:'selectAll',label:'בחר הכל'}]},
    {label:'תצוגה',submenu:[{role:'reload',label:'טען מחדש'},{role:'toggleDevTools',label:'כלי מפתחים'},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen',label:'מסך מלא'}]},
    {label:'תיקיות',submenu:[{label:'פתח תיקיית עבודות',click:()=>shell.openPath(cfg().jobsDir)},{label:'פתח תיקיית print',click:()=>shell.openPath(cfg().printDir)},{label:'פתח תיקיית cut',click:()=>shell.openPath(cfg().cutDir)}]},
    {role:'windowMenu',label:'חלון'}]))}

/* Windows: a job file passed on the command line (double-click), and a second launch hands its file to the open window */
const argFile=argv=>(argv||[]).slice(1).find(a=>/\.(prs|shulchan)$/i.test(a)&&fs.existsSync(a));
if(process.platform!=='darwin'){if(!app.requestSingleInstanceLock())app.quit();else{pendingOpen=argFile(process.argv)||null;
  app.on('second-instance',(e,argv)=>{const f=argFile(argv);if(win){if(win.isMinimized())win.restore();win.focus();if(f)sendOpen(f)}})}}
app.whenReady().then(()=>{menu();create();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)create()})});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
