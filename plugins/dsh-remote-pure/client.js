/* Remote Pure — browser half.
 * A sidebar entry that opens a main panel: pick a configured SSH host, type a
 * remote project path, connect, then chat with the remote Harness runtime.
 * Session history is read from the remote store on demand; nothing is mirrored.
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
      '.rp-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.24));flex-wrap:wrap}',
      '.rp-title{font-weight:600;margin-right:4px}',
      '.rp-input{background:var(--dsw-alias-bg-elevated,transparent);border:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.32));border-radius:6px;color:inherit;font:inherit;padding:5px 8px;min-width:0}',
      '.rp-input.rp-project{flex:1;min-width:220px}',
      '.rp-btn{background:var(--dsw-alias-bg-elevated,transparent);border:1px solid var(--dsw-alias-border-subtle,rgba(127,127,127,.32));border-radius:6px;color:inherit;font:inherit;padding:5px 12px;cursor:pointer}',
      '.rp-btn:hover:not(:disabled){border-color:var(--dsw-alias-accent,rgba(127,127,127,.6))}',
      '.rp-btn:disabled{opacity:.45;cursor:default}',
      '.rp-btn.rp-primary{background:var(--dsw-alias-accent,transparent);border-color:var(--dsw-alias-accent,transparent);color:var(--dsw-alias-text-on-accent,inherit)}',
      '.rp-status{font-size:12px;opacity:.7;white-space:nowrap}',
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
      '.rp-tabs{display:flex;gap:4px;margin-left:8px}',
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
        return response.json().then(function (value) {
          if (value && value.error) throw new Error(value.error.message || 'remote request failed');
          return value;
        });
      });
    }

    var shortId = function (id) { return String(id).replace(/^session-/, '').slice(0, 8); };

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
      var tabPair = react.useState('chat');
      var tab = tabPair[0], setTab = tabPair[1];
      var newDirPair = react.useState('');
      var newDir = newDirPair[0], setNewDir = newDirPair[1];
      var browseSeq = react.useRef(0);
      var historySeq = react.useRef(0);

      var target = connection || { hostId: hostId, project: project };
      var call = function (path, extra) {
        return api(path, Object.assign({ hostId: target.hostId, project: target.project }, extra || {}));
      };

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
      }, []);

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
      var selectedHost = hosts.filter(function (host) { return host.id === (connection ? connection.hostId : hostId); })[0];
      var hostHint = hosts.length === 0
        ? '没有可用主机：在 profile 配置 hosts，或本机 ~/.ssh/config 里配置 SSH 别名'
        : (hosts.some(function (host) { return host.discovered; }) ? '主机来自 profile 配置 + 本机 ~/.ssh/config' : '主机来自 profile 配置');

      return react.createElement(
        'div',
        { className: 'rp-root' },
        react.createElement('style', null, CSS),
        react.createElement(
          'div',
          { className: 'rp-bar' },
          react.createElement('span', { className: 'rp-title' }, 'Remote Pure'),
          react.createElement('select', {
            className: 'rp-input',
            value: hostId,
            disabled: !!connection,
            onChange: function (event) { browseSeq.current += 1; setHostId(event.target.value); setPicker(null); },
          }, hostOptions),
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
          react.createElement(
            'div',
            { className: 'rp-tabs' },
            react.createElement('button', { className: 'rp-tab' + (tab === 'chat' ? ' rp-tab-active' : ''), onClick: function () { setTab('chat'); } }, '会话'),
            react.createElement('button', { className: 'rp-tab' + (tab === 'terminal' ? ' rp-tab-active' : ''), onClick: function () { setTab('terminal'); } }, '终端'),
          ),
        ),
        recents.length === 0 ? null : react.createElement(
          'div',
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
        ),
        error === '' ? null : react.createElement('div', { className: 'rp-error' }, error),
        tab === 'terminal'
          ? react.createElement('div', { className: 'rp-term' }, react.createElement(TerminalView, { hostId: connection ? connection.hostId : hostId }))
          : react.createElement(
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
