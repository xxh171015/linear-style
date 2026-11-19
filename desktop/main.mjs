import { app, BrowserWindow, dialog, ipcMain, Menu, net, Notification, protocol, screen, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { APP_ORIGIN, trustedRenderer, localAsset, externalLink, deepLinkRoute } from './policy.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(directory, '../dist');
const developmentURL = process.env.REPLICA_DEV_URL;
const smoke = process.argv.includes('--smoke-test');
const smokeDirectory = smoke ? fs.mkdtempSync(path.join(tmpdir(),'linear-replica-smoke-')) : undefined;
if (developmentURL && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(developmentURL)) throw Error('Development must use an explicit local preview.');
app.setName('Linear Replica');
app.setPath('userData', smokeDirectory ?? path.join(app.getPath('appData'), 'Linear Replica'));
if(smokeDirectory)process.once('exit',()=>fs.rmSync(smokeDirectory,{recursive:true,force:true}));
protocol.registerSchemesAsPrivileged([{ scheme: 'replica', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const windows = new Map();
let quitting = false;
let pendingRoute;
const smokeWindows = process.argv.includes('--smoke-two-windows') ? 2 : 1;
let smokeClosing = false;
const sessionPath = path.join(app.getPath('userData'), 'window-session.json');
let sessionTimer;
function readWindowSessions() {
  if (smoke) return [];
  try {
    const saved=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
    return Array.isArray(saved) ? saved.slice(0,10) : [];
  } catch { return []; }
}
function persistWindows() {
  clearTimeout(sessionTimer);
  if (smoke || !windows.size) return;
  const saved=[...windows].map(([window,state])=>({bounds:window.getNormalBounds(),maximized:window.isMaximized(),session:state.session}));
  fs.mkdirSync(path.dirname(sessionPath),{recursive:true});
  fs.writeFileSync(`${sessionPath}.tmp`,JSON.stringify(saved),{mode:0o600});
  fs.renameSync(`${sessionPath}.tmp`,sessionPath);
}
function scheduleWindowSave() {
  clearTimeout(sessionTimer);
  if (!smoke && !quitting) sessionTimer=setTimeout(()=>{try {persistWindows();} catch(error) {console.error('Window layout save failed',error.message);}},350);
}
function restoredBounds(value) {
  if (!value || !['x','y','width','height'].every(key=>Number.isFinite(value[key]))) return {};
  const bounds={x:Math.round(value.x),y:Math.round(value.y),width:Math.min(7680,Math.max(480,Math.round(value.width))),height:Math.min(4320,Math.max(500,Math.round(value.height)))};
  const visible=screen.getAllDisplays().some(({workArea:r})=>bounds.x<r.x+r.width-100 && bounds.x+bounds.width>r.x+100 && bounds.y<r.y+r.height-100 && bounds.y+bounds.height>r.y+100);
  return visible?bounds:{width:bounds.width,height:bounds.height};
}
if (smoke) {
  console.log('replica-desktop-starting');
  setTimeout(() => { console.error('replica-desktop-smoke-timeout'); app.exit(1); }, 20000).unref();
}
const focusedWindow = () => BrowserWindow.getFocusedWindow() ?? [...windows.keys()].at(-1);
function send(command, window = focusedWindow()) { if (window && !window.isDestroyed()) window.webContents.send('replica:command', command); }
function senderWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window && windows.has(window) && event.senderFrame === window.webContents.mainFrame && trustedRenderer(event.senderFrame.url, developmentURL) ? window : undefined;
}
function assertSender(event) { const window = senderWindow(event); if (!window) throw Error('Unrecognized desktop request.'); return window; }
function requestSave(window) {
  const state = windows.get(window);
  if (!state || !state.ready || window.isDestroyed()) return Promise.resolve(true);
  if (state.pending) return state.pending.promise;
  let finish;
  const promise = new Promise(resolve => { finish = resolve; });
  const token = randomUUID();
  const timeout = setTimeout(() => { state.pending = undefined; finish(false); }, 10000);
  state.pending = { token, promise, finish: saved => { clearTimeout(timeout); state.pending = undefined; finish(saved); } };
  window.webContents.send('replica:before-close', token);
  return promise;
}
async function approveUnsaved(window) {
  if (smoke) return false;
  const result = await dialog.showMessageBox(window, { type: 'warning', title: 'Workspace not saved', message: 'Your latest changes could not be saved.', buttons: ['Keep open', 'Close without saving'], defaultId: 0, cancelId: 0 });
  return result.response === 1;
}
async function requestClose(window = focusedWindow()) {
  if (!window || window.isDestroyed() || quitting) return;
  const state = windows.get(window);
  if (state.closing) return;
  state.closing = true;
  const saved = await requestSave(window);
  if (saved || await approveUnsaved(window)) {
    try {persistWindows();} catch(error) {console.error('Window layout save failed',error.message);}
    window.destroy();
  }
  else state.closing = false;
}
async function requestQuit() {
  if (quitting) return;
  quitting = true;
  const targets = [...windows.keys()];
  const outcomes = await Promise.all(targets.map(requestSave));
  const failed = outcomes.findIndex(saved => !saved);
  if (failed >= 0 && !await approveUnsaved(targets[failed])) { quitting = false; if (smoke) app.exit(1); return; }
  if (smoke) console.log('replica-desktop-quit-saved', outcomes.filter(Boolean).length);
  try {persistWindows();} catch(error) {console.error('Window layout save failed',error.message);}
  for (const window of targets) if (!window.isDestroyed()) window.destroy();
  app.quit();
}
function showRoute(route) {
  if (quitting) return;
  let window = focusedWindow();
  if (!window) window = createWindow(route);
  else if (windows.get(window).ready) send({ type: 'navigate', route }, window);
  else windows.get(window).route = route;
  if (window.isMinimized()) window.restore();
  window.show(); window.focus();
}
async function requestPrint() {
  const window=focusedWindow();
  if(!window || !await requestSave(window)) return;
  window.webContents.print({printBackground:true},(success,reason)=>{
    if(!success && reason!=='cancelled') console.error('Print did not finish',reason);
  });
}
function createWindow(route, restored) {
  if (quitting) return focusedWindow();
  const window = new BrowserWindow({ width: 1440, height: 900, minWidth: 480, minHeight: 500,
    ...restoredBounds(restored?.bounds),
    title: 'Linear Replica', backgroundColor: '#09090a', show: false,
    titleBarStyle: 'hidden', trafficLightPosition: { x: 16, y: 15 },
    webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  });
  windows.set(window, { ready: false, route, closing: false, pending: undefined, session:restored?.session });
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback) => callback(permission === 'clipboard-sanitized-write' && trustedRenderer(contents.getURL(), developmentURL)));
  window.webContents.session.setPermissionCheckHandler((contents, permission) => permission === 'clipboard-sanitized-write' && !!contents && trustedRenderer(contents.getURL(), developmentURL));
  window.webContents.setWindowOpenHandler(({ url }) => { const target = externalLink(url); if (target) void shell.openExternal(target); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => {
    if (!trustedRenderer(url, developmentURL)) { event.preventDefault(); const target = externalLink(url); if (target) void shell.openExternal(target); }
  });
  window.on('close', event => { event.preventDefault(); void requestClose(window); });
  window.on('move',scheduleWindowSave);window.on('resize',scheduleWindowSave);
  window.on('closed', () => {
    windows.get(window)?.pending?.finish(true); windows.delete(window);
    if(!quitting) scheduleWindowSave();
  });
  window.webContents.on('preload-error', (_event, _path, error) => console.error('Desktop preload failed', error));
  if (smoke) window.webContents.on('console-message', event => console.log('replica-renderer', event.message));
  window.webContents.on('did-fail-load', (_event, code, description) => { console.error(`Desktop load failed: ${code} ${description}`); if (smoke) app.exit(1); });
  window.once('ready-to-show', () => { if (!smoke) {if(restored?.maximized)window.maximize();window.show();} });
  window.webContents.on('did-finish-load', () => console.log('replica-desktop-loaded', window.id, window.webContents.getURL()));
  void window.loadURL(developmentURL || `${APP_ORIGIN}/index.html`);
  scheduleWindowSave();
  return window;
}
const commandItem = (label, accelerator, type) => ({ label, accelerator, click: () => send({ type }) });
function installMenu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: 'Linear Replica', submenu: [{ role: 'about' }, { type: 'separator' }, commandItem('Settings…', 'CmdOrCtrl+,', 'settings'), { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [
      {label:'New',submenu:[
        commandItem('Issue…','CmdOrCtrl+N','new-issue'),
        commandItem('Project…',undefined,'new-project'),
        commandItem('Initiative…',undefined,'new-initiative'),
        commandItem('Agent chat…',undefined,'new-chat'),
        commandItem('Document…',undefined,'new-document'),
      ]},
      {label:'New Window',accelerator:'CmdOrCtrl+Shift+N',click:()=>createWindow('#/projects')},
      {...commandItem('New tab','CmdOrCtrl+T','new-tab'),visible:false},
      commandItem('Reopen Closed Tab','CmdOrCtrl+Shift+T','reopen-tab'),
      commandItem('Close Tab','CmdOrCtrl+W','close-tab'),
      {label:'Close Window',accelerator:'CmdOrCtrl+Shift+W',click:()=>void requestClose()},
      {type:'separator'},
      {label:'Print…',accelerator:'CmdOrCtrl+P',click:()=>void requestPrint()},
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }, commandItem('Search', 'CmdOrCtrl+F', 'search')] },
    { label: 'View', submenu: [commandItem('Command menu', 'CmdOrCtrl+K', 'command'), commandItem('Reload', 'CmdOrCtrl+R', 'reload'), { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'History', submenu: [commandItem('Back', 'CmdOrCtrl+[', 'back'), commandItem('Forward', 'CmdOrCtrl+]', 'forward')] },
    { role: 'windowMenu' },
  ]));
}
ipcMain.handle('replica:ready', event => {
  const window = assertSender(event), state = windows.get(window); state.ready = true;
  if (state.route) { send({ type: 'navigate', route: state.route }, window); state.route = undefined; }
  if (smoke) {
    console.log('replica-desktop-window-ready', window.id);
    if (!smokeClosing && windows.size === smokeWindows && [...windows.values()].every(state => state.ready)) {
      smokeClosing = true; console.log('replica-desktop-smoke-pass', windows.size); setTimeout(() => void requestQuit(), 250);
    }
  }
});
ipcMain.handle('replica:load-session', event=>windows.get(assertSender(event)).session);
ipcMain.handle('replica:save-session', (event,value)=>{
  const state=windows.get(assertSender(event));
  const encoded=JSON.stringify(value);
  if(!encoded || encoded.length>250000 || !Array.isArray(value.items) || value.items.length>50 || !Array.isArray(value.closed) || value.closed.length>20)throw Error('Invalid window session.');
  state.session=JSON.parse(encoded);persistWindows();
});
const notificationIds=new Set();
ipcMain.handle('replica:notify',(event,value)=>{
  assertSender(event);
  if(!value || typeof value.id!=='string' || value.id.length>200 || typeof value.title!=='string' || value.title.length>500 || typeof value.body!=='string' || value.body.length>10000 || !/^#\/issue\/[A-Za-z][A-Za-z0-9_]*-\d+$/.test(value.route))throw Error('Invalid notification.');
  if(smoke || notificationIds.has(value.id) || !Notification.isSupported())return false;
  notificationIds.add(value.id);if(notificationIds.size>1000)notificationIds.delete(notificationIds.values().next().value);
  const notice=new Notification({title:value.title,body:value.body,silent:false});
  notice.on('click',()=>showRoute(value.route));notice.show();return true;
});
ipcMain.handle('replica:badge', (event, count) => { assertSender(event); if (!Number.isSafeInteger(count) || count < 0 || count > 99999) throw Error('Invalid badge count.'); if (process.platform === 'darwin') app.dock.setBadge(count ? String(count) : ''); else app.setBadgeCount(count); });
ipcMain.handle('replica:window', (event, action) => {
  const window = assertSender(event);
  if (action === 'new-window') createWindow('#/projects');
  else if (action === 'minimize') window.minimize();
  else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
  else if (action === 'close') void requestClose(window);
  else throw Error('Unknown window action.');
});
ipcMain.on('replica:close-result', (event, token, saved) => { const state = windows.get(senderWindow(event)); if (state?.pending?.token === token && typeof saved === 'boolean') state.pending.finish(saved); });
app.on('open-url', (event, value) => { event.preventDefault(); const route = deepLinkRoute(value); if (route) { if (app.isReady()) showRoute(route); else pendingRoute = route; } });
app.on('before-quit', event => { if (windows.size) { event.preventDefault(); void requestQuit(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || quitting) app.quit(); });
app.on('activate', () => { const window = focusedWindow(); if (!window) createWindow(); else window.show(); });
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', (_event, argv) => { const route = argv.map(deepLinkRoute).find(Boolean); if (route) showRoute(route); else { const window = focusedWindow(); if (window) { window.restore(); window.show(); window.focus(); } } });
  app.whenReady().then(() => {
    if (!developmentURL) protocol.handle('replica', async request => {
      const target = localAsset(root, request.url);
      if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) return new Response('Not found', {status:404});
      const result = await net.fetch(pathToFileURL(target).href), headers = new Headers(result.headers);
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'");
      return new Response(await result.arrayBuffer(), {status:result.status,headers});
    });
    installMenu();
    const saved=readWindowSessions();
    if(saved.length) saved.forEach((state,index)=>createWindow(index===0?pendingRoute:undefined,state));
    else createWindow(pendingRoute);
    pendingRoute = undefined;
    if (smoke && smokeWindows === 2) createWindow();
  }).catch(error => { console.error(error); app.exit(1); });
}
