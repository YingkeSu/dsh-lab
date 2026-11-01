/* Remote Pure — browser half.
 * A sidebar entry that opens a main panel. The panel defaults to an iframe of
 * the remote DSH Web UI (reached through an SSH tunnel), so the right-hand side
 * shows the real native interface; the SDK chat and a terminal stay available
 * as secondary tabs. Session history is read from the remote store on demand;
 * nothing is mirrored.
 */
window.__ModuleLoader__.load({
  id: 'dsh-remote-pure',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var react = require('react');

    var PANEL_ID = 'remote-pure';

    var CSS = [
      '.rp-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-text-primary,inherit);font:inherit}',
      '.rp-bar{display:flex;align-items:center;gap:6px;padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.24));flex-wrap:wrap;min-height:0}',
      '.rp-title{font-weight:600;font-size:12px;opacity:.7;letter-spacing:.01em;margin-right:2px}',
      '.rp-input{background:var(--dsw-alias-bg-elevated,transparent);border:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.32));border-radius:6px;color:inherit;font:inherit;padding:5px 8px;min-width:0}',
      '.rp-input.rp-project{flex:1;min-width:220px}',
      '.rp-input.rp-port{width:88px}',
      '.rp-btn{background:var(--dsw-alias-bg-elevated,transparent);border:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.32));border-radius:6px;color:inherit;font:inherit;padding:5px 12px;cursor:pointer}',
      '.rp-btn:hover:not(:disabled){border-color:var(--dsw-alias-accent,rgba(127,127,127,.6))}',
      '.rp-btn:disabled{opacity:.45;cursor:default}',
      '.rp-btn.rp-primary{background:var(--dsw-alias-accent,transparent);border-color:var(--dsw-alias-accent,transparent);color:var(--dsw-alias-text-on-accent,inherit)}',
      '.rp-bar .rp-input,.rp-bar .rp-btn,.rp-subbar .rp-input,.rp-subbar .rp-btn{font-size:12px;padding:3px 8px;border-radius:5px}',
      '.rp-bar select.rp-input{max-width:190px}',
      '.rp-sep{width:1px;height:16px;background:var(--dsw-alias-border-subtle,rgba(127,127,127,.3));margin:0 3px;flex:none}',
      '.rp-status{font-size:12px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}',
      '.rp-note{font-size:12px;opacity:.62;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.rp-check{display:inline-flex;align-items:center;gap:4px;font-size:12px;opacity:.8;user-select:none;cursor:pointer}',
      '.rp-subbar{display:flex;align-items:center;gap:6px;padding:5px 12px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.2));flex-wrap:wrap;font-size:12px}',
      '.rp-subbar .rp-recents{padding:0;gap:4px;font-size:12px}',
      '.rp-content{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}',
      '.rp-webpane{flex:1;min-height:0;display:flex;flex-direction:column}',
      '.rp-chatpane{flex:1;min-height:0;display:flex;flex-direction:column}',
      '.rp-frame{flex:1;min-height:0;width:100%;border:0;background:#fff;display:block}',
      '.rp-webempty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center}',
      '.rp-webempty-title{font-size:14px;font-weight:600}',
      '.rp-webempty-hint{font-size:12px;opacity:.6;max-width:440px;line-height:1.6}',
      '.rp-warning{margin:8px 12px 0;padding:6px 10px;border-radius:6px;font-size:12px;line-height:1.5;background:rgba(230,170,60,.12);border:1px solid rgba(230,170,60,.35);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',

      '.rp-error{margin:8px 16px;padding:8px 10px;border-radius:6px;font-size:12px;background:rgba(220,60,60,.12);border:1px solid rgba(220,60,60,.4);white-space:pre-wrap}',
      '.rp-body{display:flex;flex:1;min-height:0}',
      '.rp-sessions{width:230px;flex:none;display:flex;flex-direction:column;border-right:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.24));min-height:0}',
      '.rp-sessions-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;font-size:12px;opacity:.75}',
      '.rp-sessions-list{flex:1;overflow:auto;padding:0 6px 8px}',
      '.rp-session{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 9px;margin:2px 0;border-radius:6px;cursor:pointer;font-size:13px}',
      '.rp-session:hover{background:var(--dsw-alias-bg-elevated,rgba(127,127,127,.12))}',
      '.rp-session.rp-active{background:var(--dsw-alias-bg-elevated,rgba(127,127,127,.16));box-shadow:inset 2px 0 0 var(--dsw-alias-accent,rgba(127,127,127,.6))}',
      '.rp-session-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.rp-empty{padding:12px;font-size:12px;opacity:.6;line-height:1.6}',
      '.rp-chat{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}',
      '.rp-messages{flex:1;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:12px}',
      '.rp-msg{display:flex;flex-direction:column;gap:4px;max-width:760px}',
      '.rp-msg-user{align-self:flex-end;align-items:flex-end}',
      '.rp-msg-role{font-size:11px;opacity:.55;text-transform:uppercase;letter-spacing:.04em}',
      '.rp-msg-text{white-space:pre-wrap;line-height:1.55;font-size:13.5px;background:var(--dsw-alias-bg-elevated,rgba(127,127,127,.1));border-radius:8px;padding:8px 11px}',
      '.rp-composer{border-top:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.24));padding:10px 14px;display:flex;gap:8px;align-items:flex-end}',
      '.rp-composer textarea{flex:1;resize:none;min-height:44px;max-height:180px;background:var(--dsw-alias-bg-elevated,transparent);border:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.32));border-radius:8px;color:inherit;font:inherit;padding:9px 11px}',
      '.rp-run{display:inline-flex;align-items:center;gap:6px;font-size:12px;opacity:.75}',
      '.rp-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-accent,#5aa0ff);animation:rp-pulse 1.2s ease-in-out infinite}',
      '.rp-recents{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 16px;font-size:12px;opacity:.85}',
      '.rp-chip{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.32));background:transparent;color:inherit;font:inherit;font-size:12px;border-radius:999px;padding:2px 10px;cursor:pointer}',
      '.rp-chip:hover:not(:disabled){border-color:var(--dsw-alias-accent,rgba(127,127,127,.6))}',
      '.rp-chip:disabled{opacity:.45;cursor:default}',
      '.rp-picker{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;gap:8px;padding:14px 16px;background:var(--dsw-alias-bg-base,#141418)}',
      '.rp-picker-head{display:flex;align-items:center;gap:8px}',
      '.rp-picker-path{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.rp-picker-list{flex:1;overflow:auto;display:flex;flex-direction:column;padding:4px 0}',
      '.rp-picker-row{text-align:left;background:transparent;border:0;color:inherit;font:inherit;font-size:13px;padding:7px 8px;border-radius:6px;cursor:pointer}',
      '.rp-picker-row:hover{background:var(--dsw-alias-bg-elevated,rgba(127,127,127,.12))}',
      '.rp-tabs{display:flex;gap:4px;margin-left:auto}',
      '.rp-tab{border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;padding:4px 10px;cursor:pointer;opacity:.65}',
      '.rp-tab:hover{opacity:1}',
      '.rp-tab.rp-tab-active{opacity:1;border-color:var(--dsw-alias-border-subtle,rgba(127,127,127,.4));background:var(--dsw-alias-bg-elevated,rgba(127,127,127,.12))}',
      '.rp-term{flex:1;display:flex;flex-direction:column;min-height:0;padding:10px 14px;gap:8px}',
      '.rp-term-box{flex:1;min-height:0;border:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.32));border-radius:8px;padding:6px;background:var(--dsw-alias-bg-elevated,rgba(0,0,0,.18));overflow:hidden;text-align:left}',
      '.rp-term-box .xterm{height:100%}',
      '.rp-picker-new{display:flex;gap:8px;align-items:center}',
      '@keyframes rp-pulse{0%,100%{opacity:1}50%{opacity:.25}}',
    ].join('\n');

    function api(path, body) {
      return fetch('/remote-pure/api' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      }).then(function (response) {
        return response.text().then(function (text) {
          var value = {};
          if (text !== '') {
            try {
              value = JSON.parse(text);
            } catch (e) {
              throw new Error('接口返回异常（HTTP ' + response.status + '）');
            }
          }
          if (value && value.error) {
            throw new Error(typeof value.error === 'string' ? value.error : (value.error.message || 'remote request failed'));
          }
          if (!response.ok) throw new Error('请求失败（HTTP ' + response.status + '）');
          return value;
        });
      });
    }

    var shortId = function (id) { return String(id).replace(/^session-/, '').slice(0, 8); };

    function findHost(list, id) {
      if (!Array.isArray(list) || !id) return null;
      for (var index = 0; index < list.length; index += 1) {
        if (list[index] && list[index].id === id) return list[index];
      }
      return null;
    }

    function findProfile(list, name) {
      if (!Array.isArray(list) || !name) return null;
      for (var index = 0; index < list.length; index += 1) {
        if (list[index] && list[index].name === name) return list[index];
      }
      return null;
    }

    /** Empty text means "pick a free port automatically"; 0 and junk are invalid. */
    function parsePortText(text) {
      var raw = String(text === undefined || text === null ? '' : text).trim();
      if (raw === '') return { ok: true, value: null };
      if (!/^[0-9]+$/.test(raw)) return { ok: false, value: null };
      var port = Number(raw);
      if (!(port >= 1 && port <= 65535)) return { ok: false, value: null };
      return { ok: true, value: port };
    }

    var RECENT_KEY = 'remote-pure:recents';
    function readRecents() {
      try {
        var raw = window.localStorage.getItem(RECENT_KEY);
        var list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.slice(0, 8) : [];
      } catch (e) {
        return [];
      }
    }
    function writeRecents(list) {
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
      } catch (e) {
        // storage unavailable (private mode): recents stay session-only
      }
    }

    var LAST_KEY = 'remote-pure:last';
    function readLast() {
      try {
        var raw = window.localStorage.getItem(LAST_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
    function writeLast(pair) {
      try {
        window.localStorage.setItem(LAST_KEY, JSON.stringify(pair));
      } catch (e) {
        // storage unavailable
      }
    }

    /* Per-host web-channel choice: { [hostId]: { profile, port } }, port '' = auto. */
    var WEB_KEY = 'remote-pure:web';
    function readWebSettings() {
      try {
        var raw = window.localStorage.getItem(WEB_KEY);
        var value = raw ? JSON.parse(raw) : {};
        return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch (e) {
        return {};
      }
    }
    function writeWebSetting(hostIdValue, setting) {
      if (!hostIdValue) return;
      try {
        var all = readWebSettings();
        var port = setting && setting.port !== undefined && setting.port !== null ? String(setting.port).trim() : '';
        all[hostIdValue] = { profile: setting && setting.profile ? String(setting.profile) : '', port: port };
        window.localStorage.setItem(WEB_KEY, JSON.stringify(all));
      } catch (e) {
        // storage unavailable
      }
    }

    /** Non-empty when embedding the tunnel URL in this page is risky. */
    function embedWarning() {
      try {
        var location = window.location;
        if (!location) return '';
        var hostname = String(location.hostname || '');
        if (location.protocol === 'https:') {
          return '当前页面是 HTTPS，而内嵌的远端界面走 http://127.0.0.1，浏览器可能按混合内容拦截；如果 iframe 空白，请改用「新标签打开」。';
        }
        if (hostname === 'localhost') {
          return '当前页面通过 localhost 打开，而内嵌界面用 127.0.0.1，两者跨站，浏览器可能不发送登录 Cookie；请改用 http://127.0.0.1:<端口> 打开本页，或点「新标签打开」。';
        }
        var local = hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
        if (!local) {
          return '当前页面不是通过 127.0.0.1 打开的，内嵌的 127.0.0.1 指向浏览器所在机器而不是 DSH 主机，通常连不上或受 SameSite Cookie 限制；建议改用「新标签打开」。';
        }
        return '';
      } catch (e) {
        return '';
      }
    }

    var xtermPromise = null;
    function loadXterm() {
      if (xtermPromise) return xtermPromise;
      xtermPromise = new Promise(function (resolve, reject) {
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = '/remote-pure/assets/xterm.css';
        document.head.appendChild(css);
        var core = document.createElement('script');
        core.src = '/remote-pure/assets/xterm.js';
        core.onerror = function () { reject(new Error('xterm 资源加载失败')); };
        core.onload = function () {
          var fit = document.createElement('script');
          fit.src = '/remote-pure/assets/addon-fit.js';
          fit.onerror = function () { reject(new Error('xterm 插件加载失败')); };
          fit.onload = function () { resolve({ Terminal: window.Terminal, FitAddon: window.FitAddon && window.FitAddon.FitAddon }); };
          document.head.appendChild(fit);
        };
        document.head.appendChild(core);
      });
      return xtermPromise;
    }

    function Icon(props) {
      var size = props && props.size ? props.size : 18;
      return react.createElement(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
        react.createElement('rect', { x: 2.5, y: 4.5, width: 19, height: 12, rx: 2 }),
        react.createElement('path', { d: 'M8 20.5h8M12 16.5v4' }),
        react.createElement('path', { d: 'M7.5 9.2h4.2a2.3 2.3 0 0 1 0 4.6H9.4M9.4 13.8 7.6 15.6l1.8 1.8' }),
      );
    }

    function TerminalView(props) {
      var box = react.useRef(null);
      var errPair = react.useState('');
      var error = errPair[0], setError = errPair[1];
      var hostId = props.hostId || '';

      react.useEffect(function () {
        if (hostId === '') return undefined;
        var disposed = false;
        var term = null;
        var fit = null;
        var ws = null;
        var observer = null;
        var sendResize = function () { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })); };
        loadXterm().then(function (lib) {
          if (disposed) return;
          term = new lib.Terminal({
            convertEol: true,
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            theme: { background: 'rgba(0,0,0,0)' },
          });
          fit = new lib.FitAddon();
          term.loadAddon(fit);
          term.open(box.current);
          fit.fit();
          var proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
          ws = new WebSocket(proto + window.location.host + '/remote-pure/terminal?hostId=' + encodeURIComponent(hostId) + '&cols=' + term.cols + '&rows=' + term.rows);
          ws.onopen = function () { term.focus(); sendResize(); };
          ws.onmessage = function (event) {
            var data = event.data;
            if (typeof data === 'string' && data.charAt(0) === '{') {
              try {
                var message = JSON.parse(data);
                if (message.type === 'error') { setError(message.message); return; }
              } catch (e) { /* plain terminal output starting with { */ }
            }
            term.write(data);
          };
          ws.onerror = function () { setError('终端连接失败'); };
          ws.onclose = function () { if (!disposed) setError('终端已断开'); };
          term.onData(function (data) { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input', data: data })); });
          observer = new ResizeObserver(function () { fit.fit(); sendResize(); });
          observer.observe(box.current);
        }).catch(function (e) { setError(e.message); });
        return function () {
          disposed = true;
          if (observer) observer.disconnect();
          if (ws) ws.close();
          if (term) term.dispose();
        };
      }, [hostId]);

      return react.createElement(
        'div',
        { className: 'rp-term' },
        hostId === '' ? react.createElement('div', { className: 'rp-empty' }, '先选择一台 SSH 主机，再打开终端。') : null,
        error === '' ? null : react.createElement('div', { className: 'rp-error' }, error),
        react.createElement('div', { className: 'rp-term-box', ref: box }),
      );
    }

    function RemotePanel() {
      var pairs = react.useState([]);
      var hosts = pairs[0], setHosts = pairs[1];
      var hostPair = react.useState('');
      var hostId = hostPair[0], setHostId = hostPair[1];
      var projectPair = react.useState('');
      var project = projectPair[0], setProject = projectPair[1];
      var connPair = react.useState(null);
      var connection = connPair[0], setConnection = connPair[1];
      var sessionsPair = react.useState([]);
      var sessions = sessionsPair[0], setSessions = sessionsPair[1];
      var sessionPair = react.useState('');
      var sessionId = sessionPair[0], setSessionId = sessionPair[1];
      var msgPair = react.useState([]);
      var messages = msgPair[0], setMessages = msgPair[1];
      var runPair = react.useState(false);
      var running = runPair[0], setRunning = runPair[1];
      var busyPair = react.useState(false);
      var busy = busyPair[0], setBusy = busyPair[1];
      var draftPair = react.useState('');
      var draft = draftPair[0], setDraft = draftPair[1];
      var errPair = react.useState('');
      var error = errPair[0], setError = errPair[1];
      var pickerPair = react.useState(null);
      var picker = pickerPair[0], setPicker = pickerPair[1];
      var recentPair = react.useState(readRecents);
      var recents = recentPair[0], setRecents = recentPair[1];
      var tabPair = react.useState('web');
      var tab = tabPair[0], setTab = tabPair[1];
      var newDirPair = react.useState('');
      var newDir = newDirPair[0], setNewDir = newDirPair[1];
      var browseSeq = react.useRef(0);
      var historySeq = react.useRef(0);
      var updatePair = react.useState(null);
      var updateInfo = updatePair[0], setUpdateInfo = updatePair[1];
      var notePair = react.useState('');
      var updateNote = notePair[0], setUpdateNote = notePair[1];
      var webPair = react.useState(null);
      var webChannel = webPair[0], setWebChannel = webPair[1];
      var webBusyPair = react.useState(false);
      var webBusy = webBusyPair[0], setWebBusy = webBusyPair[1];
      var webErrorPair = react.useState('');
      var webError = webErrorPair[0], setWebError = webErrorPair[1];
      var webReloadPair = react.useState(0);
      var webReload = webReloadPair[0], setWebReload = webReloadPair[1];
      var profilePair = react.useState('web');
      var profile = profilePair[0], setProfile = profilePair[1];
      var profilesPair = react.useState([]);
      var profiles = profilesPair[0], setProfiles = profilesPair[1];
      var profilesStatePair = react.useState('idle');
      var profilesState = profilesStatePair[0], setProfilesState = profilesStatePair[1];
      var profilesErrorPair = react.useState('');
      var profilesError = profilesErrorPair[0], setProfilesError = profilesErrorPair[1];
      var profilesWarningPair = react.useState('');
      var profilesWarning = profilesWarningPair[0], setProfilesWarning = profilesWarningPair[1];
      var portPair = react.useState('');
      var portText = portPair[0], setPortText = portPair[1];
      var tmuxPair = react.useState(function () {
        try { return window.localStorage.getItem('remote-pure:tmux') === '1'; } catch (e) { return false; }
      });
      var tmux = tmuxPair[0], setTmux = tmuxPair[1];
      var webSeq = react.useRef(0);
      var lastHostRef = react.useRef(null);
      var hostIdRef = react.useRef('');
      var hostsRef = react.useRef([]);
      var tmuxRef = react.useRef(false);
      /* Latest values for async callbacks; assigned during render but never used by hooks. */
      hostIdRef.current = hostId;
      hostsRef.current = hosts;
      tmuxRef.current = tmux;

      var target = connection || { hostId: hostId, project: project };
      var call = function (path, extra) {
        return api(path, Object.assign({ hostId: target.hostId, project: target.project }, extra || {}));
      };

      function loadHistory(nextSessionId) {
        var seq = ++historySeq.current;
        return call('/history', { sessionId: nextSessionId }).then(function (value) {
          if (seq !== historySeq.current) return;
          setMessages(value.messages || []);
        });
      }

      function selectSession(nextSessionId) {
        setSessionId(nextSessionId);
        setRunning(false);
        loadHistory(nextSessionId).catch(function (e) { setError(e.message); });
      }

      function connect(overrides) {
        var nextHost = (overrides && overrides.hostId) || hostId;
        var nextProject = (overrides && overrides.project) || project;
        if (busy || nextHost === '' || nextProject.trim() === '') return;
        setBusy(true);
        setError('');
        api('/connect', { hostId: nextHost, project: nextProject })
          .then(function (info) {
            setHostId(info.hostId);
            setProject(info.project);
            setConnection(info);
            var nextRecents = [{ hostId: info.hostId, path: info.project }]
              .concat(recents.filter(function (row) { return !(row.hostId === info.hostId && row.path === info.project); }))
              .slice(0, 8);
            setRecents(nextRecents);
            writeRecents(nextRecents);
            writeLast({ hostId: info.hostId, path: info.project });
            return api('/sessions', { hostId: info.hostId, project: info.project }).then(function (value) {
              var list = value.sessions || [];
              setSessions(list);
              if (list.length > 0) {
                setSessionId(list[0].id);
                return api('/history', { hostId: info.hostId, project: info.project, sessionId: list[0].id }).then(function (history) {
                  setMessages(history.messages || []);
                });
              }
              return api('/new-session', { hostId: info.hostId, project: info.project }).then(function (created) {
                setSessionId(created.sessionId);
                setSessions([{ id: created.sessionId }]);
                setMessages([]);
              });
            });
          })
          .catch(function (e) { setError(e.message); })
          .finally(function () { setBusy(false); });
      }

      function newSession() {
        if (!connection) return;
        historySeq.current += 1;
        setError('');
        call('/new-session').then(function (created) {
          setSessionId(created.sessionId);
          setSessions(function (previous) { return [{ id: created.sessionId }].concat(previous); });
          setMessages([]);
        }).catch(function (e) { setError(e.message); });
      }

      function refreshSessions() {
        if (!connection) return;
        call('/sessions').then(function (value) { setSessions(value.sessions || []); }).catch(function (e) { setError(e.message); });
      }

      function disconnect() {
        historySeq.current += 1;
        call('/disconnect').catch(function () {});
        setConnection(null);
        setSessionId('');
        setSessions([]);
        setMessages([]);
        setRunning(false);
      }

      function browse(path) {
        var seq = ++browseSeq.current;
        setPicker({ path: path, dirs: [], parent: '', loading: true, error: '' });
        api('/browse', { hostId: hostId, path: path }).then(function (value) {
          if (seq !== browseSeq.current) return;
          setPicker({ path: value.path, dirs: value.dirs || [], parent: value.parent || '', loading: false, error: '' });
        }).catch(function (e) {
          if (seq !== browseSeq.current) return;
          setPicker({ path: path, dirs: [], parent: '', loading: false, error: e.message });
        });
      }

      function openPicker() {
        if (hostId === '' || connection !== null) return;
        browse(project.trim() === '' ? '~' : project);
      }

      function createDir() {
        var name = newDir.trim();
        if (name === '' || picker === null) return;
        if (name === '.' || name === '..' || name.indexOf('/') >= 0) {
          setPicker({ path: picker.path, dirs: picker.dirs, parent: picker.parent, loading: false, error: '新目录名只能是单个路径段' });
          return;
        }
        var path = (picker.path === '/' ? '' : picker.path) + '/' + name;
        api('/mkdir', { hostId: hostId, path: path }).then(function (value) {
          setNewDir('');
          browse(value.path);
        }).catch(function (e) {
          setPicker({ path: picker.path, dirs: picker.dirs, parent: picker.parent, loading: false, error: e.message });
        });
      }

      function copyCommand(command) {
        try { window.navigator.clipboard.writeText(command); } catch (e) { /* clipboard unavailable */ }
      }

      function handleUpdate() {
        if (updateInfo === null) return;
        if (updateInfo.mode === 'auto') {
          api('/update', {}).then(function (result) {
            if (result.application === 'manual') copyCommand(result.command || updateInfo.command || '');
            setUpdateNote(result.application === 'applied' ? '已更新' : (result.application === 'restart-required' ? '已安装，重启后生效' : '已复制更新命令'));
            setUpdateInfo(null);
          }).catch(function (e) { setUpdateNote('更新失败：' + e.message); });
          return;
        }
        copyCommand(updateInfo.command || '');
        setUpdateNote('已复制更新命令');
        setUpdateInfo(null);
      }

      function toggleTmux(value) {
        setTmux(value);
        try { window.localStorage.setItem('remote-pure:tmux', value ? '1' : '0'); } catch (e) { /* storage unavailable */ }
        if (webChannel && hostId !== '') reopenWith({ profile: profile, port: portText, useTmux: value });
      }

      /** Open (or reuse) the tunnelled remote DSH web UI for one host. */
      function openChannel(overrides) {
        var opts = overrides || {};
        var targetHost = opts.hostId || hostId;
        if (targetHost === '') return;
        var targetProfile = opts.profile !== undefined ? opts.profile : profile;
        var targetPortText = opts.port !== undefined ? opts.port : portText;
        var targetTmux = opts.useTmux !== undefined ? opts.useTmux : tmux;
        var portCheck = parsePortText(targetPortText);
        if (!portCheck.ok) {
          setError('本地端口需为 1–65535 的整数；留空表示自动分配');
          return;
        }
        var seq = ++webSeq.current;
        setWebBusy(true);
        setWebError('');
        var request = { hostId: targetHost, useTmux: targetTmux === true, localPort: portCheck.value === null ? 0 : portCheck.value };
        if (targetProfile) request.profile = targetProfile;
        api('/web-open', request).then(function (value) {
          if (seq !== webSeq.current) return;
          if (hostIdRef.current !== targetHost) return;
          setWebBusy(false);
          if (!value || typeof value.url !== 'string' || value.url === '') {
            setWebChannel(null);
            setWebError('宿主没有返回网页通道地址（/web-open 响应缺少 url）');
            return;
          }
          setWebChannel(value);
          writeWebSetting(targetHost, { profile: targetProfile, port: targetPortText });
        }).catch(function (e) {
          if (seq !== webSeq.current) return;
          setWebBusy(false);
          setWebError(e && e.message ? e.message : String(e));
        });
      }

      function closeHostChannel(hostValue) {
        if (!hostValue) return Promise.resolve(null);
        return api('/web-close', { hostId: hostValue }).catch(function () { return null; });
      }

      /** Close the current channel (if any), then open it again with new options. */
      function reopenWith(overrides) {
        var opts = overrides || {};
        var previous = webChannel ? webChannel.hostId : null;
        webSeq.current += 1;
        setWebChannel(null);
        setWebBusy(false);
        setWebError('');
        if (!previous) {
          openChannel(opts);
          return;
        }
        closeHostChannel(previous).then(function () { openChannel(opts); });
      }

      function closeRemoteWeb() {
        var previous = webChannel ? webChannel.hostId : hostId;
        webSeq.current += 1;
        setWebChannel(null);
        setWebBusy(false);
        setWebError('');
        if (previous) {
          api('/web-close', { hostId: previous }).catch(function (e) { setWebError(e.message); });
        }
      }

      function openInNewTab() {
        if (!webChannel || typeof webChannel.url !== 'string' || webChannel.url === '') return;
        try {
          window.open(webChannel.url, '_blank');
        } catch (e) {
          setWebError(e && e.message ? e.message : String(e));
        }
      }

      function reloadFrame() {
        setWebReload(function (previous) { return previous + 1; });
      }

      function changeProfile(nextProfile) {
        setProfile(nextProfile);
        if (hostId === '') return;
        if (webChannel) {
          reopenWith({ profile: nextProfile, port: portText });
          return;
        }
        writeWebSetting(hostId, { profile: nextProfile, port: portText });
      }

      function commitPort() {
        var portCheck = parsePortText(portText);
        if (!portCheck.ok) {
          setError('本地端口需为 1–65535 的整数；留空表示自动分配');
          return;
        }
        setError('');
        if (hostId === '') return;
        if (webChannel) {
          reopenWith({ profile: profile, port: portText });
          return;
        }
        writeWebSetting(hostId, { profile: profile, port: portText });
      }

      function send() {
        var text = draft.trim();
        if (text === '' || running) return;
        if (!connection) { setError('请先连接远端项目'); return; }
        if (sessionId === '') { setError('远端会话尚未就绪，请稍后再试'); return; }
        var current = sessionId;
        setError('');
        setDraft('');
        setRunning(true);
        setMessages(function (previous) { return previous.concat([{ role: 'user', text: text, time: Date.now() }]); });
        call('/prompt', { sessionId: current, text: text })
          .catch(function (e) {
            setRunning(false);
            setDraft(function (previous) { return previous === '' ? text : previous; });
            setError(e.message);
          });
      }

      react.useEffect(function () {
        api('/hosts', {}).then(function (value) {
          var list = value.hosts || [];
          setHosts(list);
          var last = readLast();
          if (last && list.some(function (host) { return host.id === last.hostId; })) {
            setHostId(last.hostId);
            setProject(last.path || '');
          } else if (list.length > 0) {
            setHostId(list[0].id);
          }
        }).catch(function (e) { setError(e.message); });
        api('/update-check', {}).then(function (value) { if (value && value.updateAvailable) setUpdateInfo(value); }).catch(function () {});
      }, []);

      /* Per-host web channel: saved profile/port, /profiles probe, then /web-open.
       * Unmount never closes the channel (the host keeps it warm for the next mount). */
      react.useEffect(function () {
        if (hostId === '') return undefined;
        var currentHost = hostId;
        var previousHost = lastHostRef.current;
        lastHostRef.current = hostId;
        var disposed = false;
        if (previousHost !== null && previousHost !== hostId) {
          webSeq.current += 1;
          setWebChannel(null);
          setWebBusy(false);
          setWebError('');
          closeHostChannel(previousHost);
        }
        var host = findHost(hostsRef.current, hostId) || { id: hostId };
        var saved = readWebSettings()[hostId] || {};
        var savedProfile = typeof saved.profile === 'string' ? saved.profile : '';
        var hostProfile = typeof host.webProfile === 'string' ? host.webProfile : '';
        var savedPort = saved.port !== undefined && saved.port !== null ? String(saved.port) : '';
        var hostPort = host.webPort ? String(host.webPort) : '';
        var initialProfile = savedProfile || hostProfile || 'web';
        var initialPort = savedPort || hostPort;
        setProfile(initialProfile);
        setPortText(initialPort);
        setProfiles([]);
        setProfilesState('loading');
        setProfilesError('');
        setProfilesWarning('');
        setWebError('');
        setWebBusy(true);
        api('/profiles', { hostId: hostId }).then(function (value) {
          if (disposed) return;
          var list = value && Array.isArray(value.profiles) ? value.profiles : [];
          var defaultProfile = value && typeof value.defaultProfile === 'string' ? value.defaultProfile : '';
          var warning = value && typeof value.warning === 'string' ? value.warning : '';
          setProfiles(list);
          setProfilesState('ready');
          setProfilesWarning(warning);
          var chosen = initialProfile;
          if (!savedProfile && !hostProfile && defaultProfile !== '') chosen = defaultProfile;
          var entry = findProfile(list, chosen);
          if (entry && entry.web === false) {
            var capable = null;
            for (var index = 0; index < list.length; index += 1) {
              if (list[index] && list[index].web !== false) { capable = list[index]; break; }
            }
            if (capable) {
              setProfilesWarning(function (previous) { return previous || ('profile ' + chosen + ' 没有 web，已改用 ' + capable.name); });
              chosen = capable.name;
            } else {
              setProfilesWarning(function (previous) { return previous || ('profile ' + chosen + ' 没有 web，远端界面可能无法启动'); });
            }
          }
          setProfile(chosen);
          openChannel({ hostId: currentHost, profile: chosen, port: initialPort });
        }).catch(function (e) {
          if (disposed) return;
          setProfilesState('error');
          setProfilesError(e && e.message ? e.message : String(e));
          openChannel({ hostId: currentHost, profile: initialProfile, port: initialPort });
        });
        return function () { disposed = true; };
      }, [hostId]);

      react.useEffect(function () {
        if (!running || !connection) return undefined;
        var timer = setInterval(function () {
          call('/state', { sessionId: sessionId }).then(function (state) {
            if (state.running) return;
            setRunning(false);
            loadHistory(sessionId).catch(function () {});
          }).catch(function (e) { setRunning(false); setError(e.message); });
        }, 700);
        return function () { clearInterval(timer); };
      }, [running, connection, sessionId]);

      var hostOptions = hosts.map(function (host) {
        return react.createElement('option', { key: host.id, value: host.id, title: host.discovered ? '来自本机 ~/.ssh/config' : undefined }, host.label || host.id);
      });
      var selectedHost = findHost(hosts, connection ? connection.hostId : hostId);
      var hostHint = hosts.length === 0
        ? '没有可用主机：在 profile 配置 hosts，或本机 ~/.ssh/config 里配置 SSH 别名'
        : (hosts.some(function (host) { return host.discovered; }) ? '主机来自 profile 配置 + 本机 ~/.ssh/config' : '主机来自 profile 配置');

      var profileRows = Array.isArray(profiles) ? profiles : [];
      var profileOptions = profileRows.map(function (row) {
        var webCapable = !(row && row.web === false);
        var name = row && row.name ? row.name : '';
        return react.createElement('option', {
          key: 'profile-' + name,
          value: name,
          disabled: !webCapable,
          title: webCapable ? undefined : '该 profile 没有安装 dsh web',
        }, name + (webCapable ? '' : '（无 web）'));
      });
      var profileKnown = profileRows.some(function (row) { return row && row.name === profile; });
      if (!profileKnown) {
        var pendingLabel = profilesState === 'loading'
          ? '（检测中…）'
          : (profilesState === 'error' ? '（检测失败，仍将尝试）' : '（未创建，将自动创建）');
        profileOptions.push(react.createElement('option', {
          key: 'profile-pending',
          value: profile,
          title: '该 profile 尚未在远端创建，宿主会自动创建一个',
        }, (profile === '' ? '默认' : profile) + pendingLabel));
      }

      var channelUrl = webChannel && typeof webChannel.url === 'string' ? webChannel.url : '';
      var channelStatus = '';
      if (webChannel) {
        var statusHost = webChannel.hostId || hostId;
        channelStatus = statusHost + ':' + (webChannel.localPort ? String(webChannel.localPort) : '…');
        if (webChannel.remotePort) channelStatus += '→' + webChannel.remotePort;
        if (webChannel.note) channelStatus = webChannel.note + ' · ' + channelStatus;
        if (webChannel.external) channelStatus += '（复用远端实例）';
      } else if (webBusy) {
        channelStatus = '正在启动远端界面…';
      }
      var warning = embedWarning();
      var profileHint = profilesState === 'error' ? ('profile 检测失败：' + profilesError) : profilesWarning;

      var recentsRow = recents.length === 0 ? null : react.createElement(
        'span',
        { className: 'rp-recents' },
        '最近：',
        recents.map(function (row, index) {
          return react.createElement(
            'button',
            {
              key: row.hostId + ':' + row.path + ':' + index,
              className: 'rp-chip',
              disabled: !!connection,
              title: row.hostId + ':' + row.path,
              onClick: function () { setHostId(row.hostId); setProject(row.path); connect({ hostId: row.hostId, project: row.path }); },
            },
            row.hostId + ' · ' + row.path,
          );
        }),
      );

      var webPane = react.createElement(
        'div',
        { className: 'rp-webpane', style: { display: tab === 'web' ? 'flex' : 'none' } },
        warning === '' ? null : react.createElement(
          'div',
          { className: 'rp-warning' },
          react.createElement('span', null, warning),
          channelUrl === '' ? null : react.createElement('button', { className: 'rp-btn', onClick: openInNewTab }, '新标签打开'),
        ),
        webError === '' ? null : react.createElement('div', { className: 'rp-error' }, webError),
        channelUrl !== ''
          ? react.createElement('iframe', {
            key: 'rp-frame-' + webReload,
            className: 'rp-frame',
            src: channelUrl,
            title: '远端 DSH 界面',
          })
          : react.createElement(
            'div',
            { className: 'rp-webempty' },
            react.createElement('div', { className: 'rp-webempty-title' }, webBusy ? '正在启动远端界面…' : '远端 DSH 界面'),
            react.createElement(
              'div',
              { className: 'rp-webempty-hint' },
              hosts.length === 0
                ? hostHint
                : (webBusy
                  ? '正在通过 SSH 建立隧道并在远端启动 dsh web，首次启动可能需要几十秒。'
                  : '通过 SSH 隧道把远端的 dsh web 映射到本机，然后在这里直接操作远端界面。'),
            ),
            webBusy
              ? react.createElement('span', { className: 'rp-run' }, react.createElement('span', { className: 'rp-dot' }), '启动中')
              : react.createElement('button', { className: 'rp-btn rp-primary', disabled: hostId === '', onClick: function () { openChannel({}); } }, '打开远端界面'),
          ),
      );

      var chatPane = react.createElement(
        'div',
        { className: 'rp-chatpane', style: { display: tab === 'chat' ? 'flex' : 'none' } },
        react.createElement(
          'div',
          { className: 'rp-body' },
          react.createElement(
            'aside',
            { className: 'rp-sessions' },
            react.createElement(
              'div',
              { className: 'rp-sessions-head' },
              react.createElement('span', null, '会话历史'),
              react.createElement(
                'span',
                null,
                react.createElement('button', { className: 'rp-btn', disabled: !connection, onClick: newSession }, '新建'),
                ' ',
                react.createElement('button', { className: 'rp-btn', disabled: !connection, onClick: refreshSessions }, '刷新'),
              ),
            ),
            react.createElement(
              'div',
              { className: 'rp-sessions-list' },
              sessions.length === 0
                ? react.createElement('div', { className: 'rp-empty' }, connection === null ? (hosts.length === 0 ? hostHint : '连接远端项目后显示远端会话。') : '远端该项目还没有会话，发送第一条消息即可创建。')
                : sessions.map(function (session) {
                  return react.createElement(
                    'div',
                    {
                      key: session.id,
                      className: 'rp-session' + (session.id === sessionId ? ' rp-active' : ''),
                      onClick: function () { selectSession(session.id); },
                    },
                    react.createElement('span', { className: 'rp-session-id' }, shortId(session.id)),
                  );
                }),
            ),
          ),
          react.createElement(
            'main',
            { className: 'rp-chat' },
            react.createElement(
              'div',
              { className: 'rp-messages' },
              messages.length === 0
                ? react.createElement('div', { className: 'rp-empty' }, '选一个远端会话，或新建会话后发消息。')
                : messages.map(function (message, index) {
                  return react.createElement(
                    'div',
                    { key: index, className: 'rp-msg' + (message.role === 'user' ? ' rp-msg-user' : '') },
                    react.createElement('span', { className: 'rp-msg-role' }, message.role === 'user' ? '你' : '远端 agent'),
                    react.createElement('div', { className: 'rp-msg-text' }, message.text),
                  );
                }),
            ),
            react.createElement(
              'div',
              { className: 'rp-composer' },
              react.createElement('textarea', {
                value: draft,
                placeholder: connection === null ? '先连接远端项目' : '发给远端 agent… (Cmd/Ctrl+Enter 发送)',
                disabled: connection === null,
                onChange: function (event) { setDraft(event.target.value); },
                onKeyDown: function (event) {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    send();
                  }
                },
              }),
              react.createElement('button', { className: 'rp-btn rp-primary', disabled: connection === null || running || draft.trim() === '', onClick: send }, running ? '运行中' : '发送'),
            ),
          ),
        ),
      );

      var terminalPane = tab === 'terminal'
        ? react.createElement('div', { className: 'rp-term' }, react.createElement(TerminalView, { hostId: connection ? connection.hostId : hostId }))
        : null;

      return react.createElement(
        'div',
        { className: 'rp-root' },
        react.createElement('style', null, CSS),
        react.createElement(
          'div',
          { className: 'rp-bar' },
          react.createElement('span', { className: 'rp-title' }, 'Remote'),
          react.createElement('select', {
            className: 'rp-input',
            value: hostId,
            disabled: !!connection,
            title: hostHint,
            onChange: function (event) { browseSeq.current += 1; setHostId(event.target.value); setPicker(null); setError(''); },
          }, hostOptions),
          react.createElement('span', { className: 'rp-sep' }),
          react.createElement('select', {
            className: 'rp-input',
            value: profile,
            disabled: hostId === '' || profilesState === 'loading',
            title: '用于远端 dsh web 的 profile',
            onChange: function (event) { changeProfile(event.target.value); },
          }, profileOptions),
          react.createElement('input', {
            className: 'rp-input rp-port',
            type: 'number',
            min: 1,
            max: 65535,
            inputMode: 'numeric',
            placeholder: '自动',
            title: '本地隧道端口；留空自动分配，被占用时宿主会自动换端口',
            value: portText,
            disabled: hostId === '' || webBusy,
            onChange: function (event) { setPortText(event.target.value); },
            onBlur: commitPort,
            onKeyDown: function (event) { if (event.key === 'Enter') { event.preventDefault(); commitPort(); } },
          }),
          react.createElement('label', { className: 'rp-check', title: '远端用 tmux 启动 dsh web：SSH 断开后远端进程仍存活' },
            react.createElement('input', { type: 'checkbox', checked: tmux, disabled: webBusy, onChange: function (event) { toggleTmux(event.target.checked); } }),
            'tmux',
          ),
          webChannel === null
            ? react.createElement('button', { className: 'rp-btn', disabled: hostId === '' || webBusy, onClick: function () { openChannel({}); } }, webBusy ? '启动中…' : '打开网页通道')
            : react.createElement('button', { className: 'rp-btn', onClick: closeRemoteWeb }, '关闭网页通道'),
          channelUrl === '' ? null : react.createElement('button', { className: 'rp-btn', onClick: openInNewTab }, '新标签打开'),
          channelUrl === '' ? null : react.createElement('button', { className: 'rp-btn', title: '重新加载 iframe', onClick: reloadFrame }, '刷新'),
          react.createElement('span', { className: 'rp-status', title: channelStatus }, channelStatus),
          profileHint === '' ? null : react.createElement('span', { className: 'rp-note', title: profileHint }, profileHint),
          updateInfo === null ? null : react.createElement('button', { className: 'rp-btn', title: updateInfo.command || '', onClick: handleUpdate }, '新版本 ' + updateInfo.latest),
          updateNote === '' ? null : react.createElement('span', { className: 'rp-status' }, updateNote),
          react.createElement(
            'div',
            { className: 'rp-tabs' },
            react.createElement('button', { className: 'rp-tab' + (tab === 'web' ? ' rp-tab-active' : ''), onClick: function () { setTab('web'); } }, '界面'),
            react.createElement('button', { className: 'rp-tab' + (tab === 'chat' ? ' rp-tab-active' : ''), onClick: function () { setTab('chat'); } }, '会话'),
            react.createElement('button', { className: 'rp-tab' + (tab === 'terminal' ? ' rp-tab-active' : ''), onClick: function () { setTab('terminal'); } }, '终端'),
          ),
        ),
        tab !== 'chat' ? null : react.createElement(
          'div',
          { className: 'rp-subbar' },
          react.createElement('input', {
            className: 'rp-input rp-project',
            placeholder: '/absolute/path/on/remote',
            value: project,
            disabled: !!connection,
            onChange: function (event) { setProject(event.target.value); },
            onKeyDown: function (event) { if (event.key === 'Enter') connect(); },
          }),
          react.createElement('button', { className: 'rp-btn', disabled: !!connection || hostId === '', onClick: openPicker }, '浏览'),
          connection === null
            ? react.createElement('button', { className: 'rp-btn rp-primary', disabled: busy || hosts.length === 0, onClick: connect }, busy ? '连接中…' : '连接')
            : react.createElement('button', { className: 'rp-btn', onClick: disconnect }, '断开'),
          react.createElement('span', { className: 'rp-status', title: hostHint }, connection === null ? (hosts.length === 0 ? '未配置主机' : '未连接') : (selectedHost ? (selectedHost.label || selectedHost.id) : connection.hostId) + ':' + connection.project),
          running ? react.createElement('span', { className: 'rp-run' }, react.createElement('span', { className: 'rp-dot' }), '远端运行中') : null,
          recentsRow,
        ),
        error === '' ? null : react.createElement('div', { className: 'rp-error' }, error),
        react.createElement(
          'div',
          { className: 'rp-content' },
          webPane,
          chatPane,
          terminalPane,
        ),
        picker === null ? null : react.createElement(
          'div',
          { className: 'rp-picker' },
          react.createElement(
            'div',
            { className: 'rp-picker-head' },
            react.createElement('button', { className: 'rp-btn', onClick: function () { browse('~'); } }, '~'),
            react.createElement('button', { className: 'rp-btn', disabled: picker.path === '/', onClick: function () { browse(picker.parent); } }, '..'),
            react.createElement('span', { className: 'rp-picker-path', title: picker.path }, picker.path),
            react.createElement('button', { className: 'rp-btn', onClick: function () { browseSeq.current += 1; setPicker(null); } }, '取消'),
            react.createElement('button', { className: 'rp-btn rp-primary', onClick: function () { browseSeq.current += 1; setProject(picker.path); setPicker(null); } }, '选择此目录'),
          ),
          react.createElement(
            'div',
            { className: 'rp-picker-new' },
            react.createElement('input', {
              className: 'rp-input',
              placeholder: '新目录名',
              value: newDir,
              onChange: function (event) { setNewDir(event.target.value); },
              onKeyDown: function (event) { if (event.key === 'Enter') createDir(); },
            }),
            react.createElement('button', { className: 'rp-btn', disabled: newDir.trim() === '', onClick: createDir }, '新建并进入'),
          ),
          picker.error === '' ? null : react.createElement('div', { className: 'rp-error' }, picker.error),
          react.createElement(
            'div',
            { className: 'rp-picker-list' },
            picker.loading
              ? react.createElement('div', { className: 'rp-empty' }, '读取中…')
              : picker.dirs.map(function (dir) {
                return react.createElement(
                  'button',
                  {
                    key: dir,
                    className: 'rp-picker-row',
                    onClick: function () { browse((picker.path === '/' ? '' : picker.path) + '/' + dir); },
                  },
                  '› ' + dir,
                );
              }),
          ),
        ),
      );
    }

    function apply(ctx) {
      ctx.slots.inject('sidebar.panellist', function () {
        return ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: 'Remote' }, Icon);
      });
      ctx.slots.inject('main', function () {
        return ctx.slots.register({ name: 'main', key: PANEL_ID }, RemotePanel);
      });
    }

    exports.name = 'dsh-remote-pure';
    exports.inject = ['slots'];
    exports.apply = apply;
    return module.exports;
  },
});
