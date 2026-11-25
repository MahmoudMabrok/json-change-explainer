/* JSON Kit core.
 * Pure functions shared by the static web app and the MCP server.
 *
 * Loaded two ways, with no build step:
 * - Browser: <script src="core/json-kit.js"></script> sets globalThis.JsonKit.
 *   A classic script (not type="module") so the page still works from file://
 *   and from GitHub Pages at /json-kit/.
 * - Node: require("./json-kit.js") returns the same API. This file stays
 *   CommonJS on purpose; do not mark the repository root as "type": "module".
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else if (root) {
    root.JsonKit = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v; // object, string, number, boolean
  }
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function renderPath(segs) {
    if (!segs || segs.length === 0) return 'root';
    let s = '';
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.t === 'i') {
        s += '[' + seg.v + ']';
      } else {
        const k = seg.v;
        const simple = /^[A-Za-z_$][\w$]*$/.test(k);
        if (simple) {
          if (i === 0) s += k;
          else s += '.' + k;
        } else {
          s += '[' + JSON.stringify(k) + ']';
        }
      }
    }
    return s;
  }

  function parsePathString(str) {
    const segs = [];
    if (!str) return segs;
    const s = str.trim();
    if (s === 'root' || s === '') return segs;
    let pos = 0;
    while (pos < s.length) {
      if (s[pos] === '.') { pos++; continue; }
      if (s[pos] === '[') {
        const close = s.indexOf(']', pos);
        if (close === -1) { segs.push({t:'k', v: s.slice(pos)}); pos = s.length; break; }
        const inside = s.slice(pos+1, close);
        if (inside === '*') segs.push({t:'i', v: '*'});
        else if (/^\d+$/.test(inside)) segs.push({t:'i', v: Number(inside)});
        else {
          let key = inside;
          if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
            try { key = JSON.parse(key.replace(/^'/, '"').replace(/'$/, '"')); }
            catch (e) { key = key.slice(1, -1); }
          }
          segs.push({t:'k', v: key});
        }
        pos = close + 1;
      } else {
        let end = pos;
        while (end < s.length && s[end] !== '.' && s[end] !== '[') end++;
        const key = s.slice(pos, end);
        if (key) segs.push({t:'k', v: key});
        pos = end;
      }
    }
    return segs;
  }

  function isIgnoredSegs(segs, patterns) {
    for (const pat of patterns) {
      if (pat.length === 0) continue;
      if (pat.length > segs.length) continue;
      let ok = true;
      for (let i = 0; i < pat.length; i++) {
        const p = pat[i], s = segs[i];
        if (p.v === '*') continue;
        if (p.t !== s.t || p.v !== s.v) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  function fmtValue(v) {
    if (v === null) return 'null';
    if (v === undefined) return '';
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'number') return String(v);
    try { return JSON.stringify(v); } catch (e) { return '[unserializable]'; }
  }

  function makeEvent(op, segs, property, index, oldValue, newValue, oldType, newType, isArrayItem, arrayName, identityKey, identityValue) {
    const ev = {
      operation: op,
      path: renderPath(segs),
      property: (property === undefined ? null : property),
      index: (index === undefined ? null : index),
      oldValue: oldValue,
      newValue: newValue,
      oldType: (oldType === undefined ? null : oldType),
      newType: (newType === undefined ? null : newType),
      isArrayItem: !!isArrayItem,
      arrayName: arrayName || null,
      identityKey: identityKey || null,
      identityValue: (identityValue === undefined ? null : identityValue),
    };
    ev.description = describe(ev);
    return ev;
  }

  function describe(ev) {
    const path = ev.path;
    const q = (s) => "'" + String(s).replace(/'/g, "\\'") + "'";
    if (ev.property != null) {
      const p = ev.property;
      if (ev.operation === 'ADD') return 'Added property ' + q(p) + ' with value ' + fmtValue(ev.newValue) + ' at path ' + path + '.';
      if (ev.operation === 'REMOVE') return 'Removed property ' + q(p) + ' from path ' + path + '.';
      if (ev.operation === 'UPDATE') return 'Updated property ' + q(p) + ' from ' + fmtValue(ev.oldValue) + ' to ' + fmtValue(ev.newValue) + ' at path ' + path + '.';
      var _oldPart = (ev.oldType === 'null') ? 'null' : (ev.oldType + ' ' + fmtValue(ev.oldValue));
      var _newPart = (ev.newType === 'null') ? 'null' : (ev.newType + ' ' + fmtValue(ev.newValue));
      if (ev.operation === 'TYPE_CHANGE') return 'Changed property ' + q(p) + ' from ' + _oldPart + ' to ' + _newPart + ' at path ' + path + '.';
    }
    if (ev.isArrayItem) {
      const idx = ev.index;
      const arr = ev.arrayName || 'array';
      const singular = (arr.endsWith('s') && arr.length > 1) ? arr.slice(0, -1) : 'item';
      if (ev.operation === 'ADD') {
        if (ev.identityValue != null) {
          return 'Added ' + singular + ' with ' + ev.identityKey + ' ' + fmtValue(ev.identityValue) + ' at index ' + idx + '.';
        }
        if (ev.newType === 'object' || ev.newType === 'array') {
          return 'Added a new object at path ' + path + '.';
        }
        return 'Added a new item at index ' + idx + ' in array ' + arr + '.';
      }
      if (ev.operation === 'REMOVE') {
        if (ev.identityValue != null) {
          return 'Removed ' + singular + ' with ' + ev.identityKey + ' ' + fmtValue(ev.identityValue) + ' at index ' + idx + '.';
        }
        if (ev.oldType === 'object' || ev.oldType === 'array') {
          return 'Removed the object at path ' + path + '.';
        }
        return 'Removed value ' + fmtValue(ev.oldValue) + ' at index ' + idx + ' from array ' + arr + '.';
      }
      if (ev.operation === 'UPDATE') {
        return 'Updated item at index ' + idx + ' in array ' + arr + ' from ' + fmtValue(ev.oldValue) + ' to ' + fmtValue(ev.newValue) + '.';
      }
      if (ev.operation === 'TYPE_CHANGE') {
        var _o = (ev.oldType === 'null') ? 'null' : (ev.oldType + ' ' + fmtValue(ev.oldValue));
        var _n = (ev.newType === 'null') ? 'null' : (ev.newType + ' ' + fmtValue(ev.newValue));
        return 'Changed item at index ' + idx + ' in array ' + arr + ' from ' + _o + ' to ' + _n + '.';
      }
    }
    if (ev.operation === 'ADD') return 'Added value ' + fmtValue(ev.newValue) + ' at path ' + path + '.';
    if (ev.operation === 'REMOVE') return 'Removed value from path ' + path + '.';
    if (ev.operation === 'UPDATE') return 'Updated value from ' + fmtValue(ev.oldValue) + ' to ' + fmtValue(ev.newValue) + ' at path ' + path + '.';
    var _o = (ev.oldType === 'null') ? 'null' : (ev.oldType + ' ' + fmtValue(ev.oldValue));
    var _n = (ev.newType === 'null') ? 'null' : (ev.newType + ' ' + fmtValue(ev.newValue));
    if (ev.operation === 'TYPE_CHANGE') return 'Changed value from ' + _o + ' to ' + _n + ' at path ' + path + '.';
    return '';
  }

  function stableSig(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') return 's:' + JSON.stringify(v);
    if (typeof v === 'number' || typeof v === 'boolean') return typeof v + ':' + String(v);
    if (Array.isArray(v)) return '[' + v.map(stableSig).join(',') + ']';
    if (typeof v === 'object') {
      const keys = Object.keys(v).sort();
      return '{' + keys.map(k => JSON.stringify(k) + ':' + stableSig(v[k])).join(',') + '}';
    }
    return 'u:' + String(v);
  }

  function alignArrays(beforeArr, afterArr, identityKey, strategy) {
    const b = beforeArr, a = afterArr;
    const ops = [];
    let useIdentity = false;
    if (strategy === 'identity') useIdentity = true;
    else if (strategy === 'auto') {
      const hasId = (arr) => arr.some(el => isObject(el) && hasOwn(el, identityKey));
      useIdentity = hasId(b) || hasId(a);
    }
    if (!b.some(isObject) && !a.some(isObject)) useIdentity = false;

    if (useIdentity) {
      const matchedBefore = new Set();
      const idToBefore = new Map();
      const pendingA = [];
      for (let i = 0; i < b.length; i++) {
        const bv = b[i];
        if (isObject(bv) && hasOwn(bv, identityKey)) {
          const key = JSON.stringify(bv[identityKey]);
          if (!idToBefore.has(key)) idToBefore.set(key, []);
          idToBefore.get(key).push(i);
        }
      }
      for (let j = 0; j < a.length; j++) {
        const av = a[j];
        let found = -1;
        if (isObject(av) && hasOwn(av, identityKey)) {
          const key = JSON.stringify(av[identityKey]);
          const candidates = idToBefore.get(key);
          if (candidates) {
            for (const i of candidates) {
              if (matchedBefore.has(i)) continue;
              found = i;
              break;
            }
          }
        }
        if (found !== -1) {
          matchedBefore.add(found);
          ops.push({kind:'pair', bIdx:found, aIdx:j});
        } else {
          pendingA.push(j);
        }
      }
      const pendingB = [];
      for (let i = 0; i < b.length; i++) {
        if (!matchedBefore.has(i)) pendingB.push(i);
      }
      if (pendingB.length || pendingA.length) {
        ops.push.apply(ops, alignSubsetByLcs(b, a, pendingB, pendingA));
      }
      return {ops, useIdentity};
    }

    if (strategy === 'index') {
      const max = Math.max(b.length, a.length);
      for (let i = 0; i < max; i++) {
        if (i < b.length && i < a.length) ops.push({kind:'pair', bIdx:i, aIdx:i});
        else if (i < b.length) ops.push({kind:'remove', bIdx:i});
        else ops.push({kind:'add', aIdx:i});
      }
      return {ops, useIdentity};
    }

    const allB = [], allA = [];
    for (let i = 0; i < b.length; i++) allB.push(i);
    for (let j = 0; j < a.length; j++) allA.push(j);
    return {ops: alignSubsetByLcs(b, a, allB, allA), useIdentity};
  }

  function alignSubsetByLcs(b, a, bIdx, aIdx) {
    const ops = [];
    const n = bIdx.length, m = aIdx.length;
    if (n === 0 || m === 0 || n * m > 1000000) {
      const max = Math.max(n, m);
      for (let i = 0; i < max; i++) {
        if (i < n && i < m) ops.push({kind:'pair', bIdx:bIdx[i], aIdx:aIdx[i]});
        else if (i < n) ops.push({kind:'remove', bIdx:bIdx[i]});
        else ops.push({kind:'add', aIdx:aIdx[i]});
      }
      return ops;
    }

    const sigB = bIdx.map(i => stableSig(b[i]));
    const sigA = aIdx.map(j => stableSig(a[j]));
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = (sigB[i] === sigA[j]) ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
      }
    }
    const pendingB = [], pendingA = [];
    function flush() {
      const len = Math.min(pendingB.length, pendingA.length);
      for (let k = 0; k < len; k++) ops.push({kind:'pair', bIdx:bIdx[pendingB[k]], aIdx:aIdx[pendingA[k]]});
      for (let k = len; k < pendingB.length; k++) ops.push({kind:'remove', bIdx:bIdx[pendingB[k]]});
      for (let k = len; k < pendingA.length; k++) ops.push({kind:'add', aIdx:aIdx[pendingA[k]]});
      pendingB.length = 0;
      pendingA.length = 0;
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (sigB[i] === sigA[j]) {
        flush();
        ops.push({kind:'pair', bIdx:bIdx[i], aIdx:aIdx[j]});
        i++; j++;
      } else if (dp[i+1][j] >= dp[i][j+1]) {
        pendingB.push(i++);
      } else {
        pendingA.push(j++);
      }
    }
    while (i < n) pendingB.push(i++);
    while (j < m) pendingA.push(j++);
    flush();
    return ops;
  }

  function compareAll(before, after, opts) {
    opts = opts || {};
    const events = [];
    let ignoredList = opts.ignoredPaths || [];
    if (typeof ignoredList === 'string') ignoredList = ignoredList.split(/\r?\n/);
    const ignoredPatterns = ignoredList.map(function (p) { return parsePathString(String(p)); });
    const opt = {
      ignored: ignoredPatterns,
      arrayStrategy: opts.arrayStrategy || 'auto',
      identityKey: opts.identityKey || 'id',
    };

    const tb = typeOf(before), ta = typeOf(after);
    const stack = [];
    if (tb !== ta) {
      events.push(makeEvent('TYPE_CHANGE', [], null, null, before, after, tb, ta, false, null, null, null));
    } else if (tb === 'object') {
      stack.push({kind:'object', b: before, a: after, segs: []});
    } else if (tb === 'array') {
      stack.push({kind:'array', b: before, a: after, segs: []});
    } else {
      if (before !== after) events.push(makeEvent('UPDATE', [], null, null, before, after, tb, ta, false, null, null, null));
    }

    while (stack.length) {
      const task = stack.pop();
      if (task.kind === 'object') {
        const b = task.b || {};
        const a = task.a || {};
        const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
        for (const key of keys) {
          const childSegs = task.segs.concat([{t:'k', v: key}]);
          if (isIgnoredSegs(childSegs, opt.ignored)) continue;
          const hasB = hasOwn(b, key);
          const hasA = hasOwn(a, key);
          if (hasB && !hasA) {
            events.push(makeEvent('REMOVE', task.segs, key, null, b[key], undefined, typeOf(b[key]), undefined, false, null, null, null));
          } else if (!hasB && hasA) {
            events.push(makeEvent('ADD', task.segs, key, null, undefined, a[key], undefined, typeOf(a[key]), false, null, null, null));
          } else {
            const bv = b[key], av = a[key];
            const tbv = typeOf(bv), tav = typeOf(av);
            if (tbv !== tav) {
              events.push(makeEvent('TYPE_CHANGE', task.segs, key, null, bv, av, tbv, tav, false, null, null, null));
            } else if (tbv === 'object') {
              stack.push({kind:'object', b: bv, a: av, segs: childSegs});
            } else if (tbv === 'array') {
              stack.push({kind:'array', b: bv, a: av, segs: childSegs});
            } else {
              if (bv !== av) events.push(makeEvent('UPDATE', task.segs, key, null, bv, av, tbv, tav, false, null, null, null));
            }
          }
        }
      } else if (task.kind === 'array') {
        const beforeArr = Array.isArray(task.b) ? task.b : [];
        const afterArr = Array.isArray(task.a) ? task.a : [];
        const segs = task.segs;
        const arrayName = (segs.length && segs[segs.length-1].t === 'k') ? segs[segs.length-1].v : (segs.length === 0 ? 'root' : 'array');
        const identityKey = opt.identityKey;
        const alignment = alignArrays(beforeArr, afterArr, identityKey, opt.arrayStrategy);
        const useIdentity = alignment.useIdentity;
        const eventIdentityKey = useIdentity ? identityKey : null;

        for (const op of alignment.ops) {
          if (op.kind === 'remove') {
            const i = op.bIdx;
            const bv = beforeArr[i];
            const idv = (useIdentity && isObject(bv) && hasOwn(bv, identityKey)) ? bv[identityKey] : null;
            const itemSegs = segs.concat([{t:'i', v: i}]);
            if (isIgnoredSegs(itemSegs, opt.ignored)) continue;
            events.push(makeEvent('REMOVE', itemSegs, null, i, bv, undefined, typeOf(bv), undefined, true, arrayName, eventIdentityKey, idv));
          } else if (op.kind === 'add') {
            const j = op.aIdx;
            const av = afterArr[j];
            const idv = (useIdentity && isObject(av) && hasOwn(av, identityKey)) ? av[identityKey] : null;
            const itemSegs = segs.concat([{t:'i', v: j}]);
            if (isIgnoredSegs(itemSegs, opt.ignored)) continue;
            events.push(makeEvent('ADD', itemSegs, null, j, undefined, av, undefined, typeOf(av), true, arrayName, eventIdentityKey, idv));
          } else {
            const bv = beforeArr[op.bIdx];
            const av = afterArr[op.aIdx];
            const itemSegs = segs.concat([{t:'i', v: op.aIdx}]);
            if (isIgnoredSegs(itemSegs, opt.ignored)) continue;
            const tbv = typeOf(bv), tav = typeOf(av);
            const idv = (useIdentity && isObject(av) && hasOwn(av, identityKey)) ? av[identityKey] : null;
            if (tbv !== tav) {
              events.push(makeEvent('TYPE_CHANGE', itemSegs, null, op.aIdx, bv, av, tbv, tav, true, arrayName, eventIdentityKey, idv));
            } else if (tbv === 'object') {
              stack.push({kind:'object', b: bv, a: av, segs: itemSegs});
            } else if (tbv === 'array') {
              stack.push({kind:'array', b: bv, a: av, segs: itemSegs});
            } else {
              if (bv !== av) events.push(makeEvent('UPDATE', itemSegs, null, op.aIdx, bv, av, tbv, tav, true, arrayName, eventIdentityKey, idv));
            }
          }
        }
      }
    }

    return events;
  }

    function lineColFromPos(text, pos) {
      let line = 1, col = 1;
      for (let i = 0; i < pos && i < text.length; i++) {
        if (text[i] === '\n') { line++; col = 1; } else { col++; }
      }
      return {line, col};
    }

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function stringify(v) {
      if (v === undefined) return '';
      try { return typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return ''; }
    }

    function findPathAtOffset(text, offset) {
      let i = 0;
      const regions = [];
      function isSimpleKey(k) { return /^[A-Za-z_$][\w$]*$/.test(k); }
      function joinKey(path, k) {
        const safe = isSimpleKey(k);
        if (!path) return safe ? k : '[' + JSON.stringify(k) + ']';
        return safe ? path + '.' + k : path + '[' + JSON.stringify(k) + ']';
      }
      function joinIndex(path, idx) { return path ? path + '[' + idx + ']' : '[' + idx + ']'; }
      function skipWs() { while (i < text.length && /\s/.test(text[i])) i++; }
      function parseString() {
        const start = i;
        i++;
        while (i < text.length) {
          if (text[i] === '\\') { i += 2; continue; }
          if (text[i] === '"') { i++; break; }
          i++;
        }
        let value;
        try { value = JSON.parse(text.slice(start, i)); }
        catch (e) { value = text.slice(start + 1, i - 1); }
        return { start, end: i, value };
      }
      function parseValue(path) {
        skipWs();
        if (i >= text.length) return;
        const start = i;
        const c = text[i];
        if (c === '{') {
          i++;
          skipWs();
          if (text[i] === '}') { i++; regions.push({ start, end: i, path, kind: 'value' }); return; }
          while (i < text.length) {
            skipWs();
            if (text[i] !== '"') break;
            const key = parseString();
            skipWs();
            if (text[i] !== ':') break;
            i++;
            const childPath = joinKey(path, key.value);
            regions.push({ start: key.start, end: key.end, path: childPath, kind: 'key' });
            parseValue(childPath);
            skipWs();
            if (text[i] === ',') { i++; continue; }
            if (text[i] === '}') { i++; break; }
            break;
          }
          regions.push({ start, end: i, path, kind: 'value' });
          return;
        }
        if (c === '[') {
          i++;
          skipWs();
          if (text[i] === ']') { i++; regions.push({ start, end: i, path, kind: 'value' }); return; }
          let idx = 0;
          while (i < text.length) {
            parseValue(joinIndex(path, idx));
            idx++;
            skipWs();
            if (text[i] === ',') { i++; continue; }
            if (text[i] === ']') { i++; break; }
            break;
          }
          regions.push({ start, end: i, path, kind: 'value' });
          return;
        }
        if (c === '"') {
          const tok = parseString();
          regions.push({ start: tok.start, end: tok.end, path, kind: 'value' });
          return;
        }
        while (i < text.length && !/[,\]}\s]/.test(text[i])) i++;
        if (i > start) regions.push({ start, end: i, path, kind: 'value' });
      }
      parseValue('');
      let best = null;
      for (const r of regions) {
        if (offset < r.start || offset > r.end) continue;
        if (!best || (r.end - r.start) < (best.end - best.start)) best = r;
      }
      if (!best) return null;
      if (best.kind === 'key') return best.path || null;
      return best.path || null;
    }

    function tokenizeJson(src) {
      const out = [];
      let i = 0;
      while (i < src.length) {
        const c = src[i];
        if (c === '"') {
          let j = i + 1;
          while (j < src.length) {
            if (src[j] === '\\') { j += 2; continue; }
            if (src[j] === '"') { j++; break; }
            j++;
          }
          out.push({ kind: 'str', text: src.slice(i, j) });
          i = j;
        } else if (c === '{' || c === '}' || c === '[' || c === ']' || c === ',' || c === ':') {
          out.push({ kind: 'punct', text: c });
          i++;
        } else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
          let j = i;
          while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
          out.push({ kind: 'ws', text: src.slice(i, j) });
          i = j;
        } else {
          let j = i;
          while (j < src.length && !'{}[],: "\n\r\t'.includes(src[j])) j++;
          if (j === i) j++;
          const word = src.slice(i, j);
          if (word === 'true' || word === 'false' || word === 'null') out.push({ kind: 'kw', text: word });
          else if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(word)) out.push({ kind: 'num', text: word });
          else out.push({ kind: 'err', text: word });
          i = j;
        }
      }
      // strings followed by a colon are object keys
      for (let k = 0; k < out.length; k++) {
        if (out[k].kind !== 'str') continue;
        let m = k + 1;
        while (m < out.length && out[m].kind === 'ws') m++;
        if (m < out.length && out[m].text === ':') out[k].kind = 'key';
      }
      return out;
    }

    function fixJson(text) {
      const notes = [];
      let s = text;
      if (!s.trim()) return { fixed: s, fixes: [] };

      const SMART = [[/[\u201C\u201D\u201E\u201F]/g, 'smart double quotes'], [/[\u2018\u2019\u201A\u2032]/g, 'smart single quotes'], [/[\u00AB\u00BB]/g, 'guillemets'], [/[\u2033\u2036]/g, 'double-prime quotes']];
      for (const [re, label] of SMART) if (re.test(s)) { s = s.replace(re, '"'); notes.push('Replaced ' + label + ' with "'); }

      const toks = [];
      let i = 0;
      while (i < s.length) {
        const c = s[i];
        if (c === '"') { let j = i + 1; while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === '"') { j++; break; } j++; } toks.push({ kind: 'str', text: s.slice(i, j) }); i = j; }
        else if (c === "'") { let j = i + 1; while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === "'") { j++; break; } j++; } toks.push({ kind: 'sqr', text: s.slice(i, j) }); i = j; }
        else if (c === '/' && s[i + 1] === '/') { let j = s.indexOf('\n', i + 2); if (j === -1) j = s.length; toks.push({ kind: 'comment', text: s.slice(i, j) }); i = j; }
        else if (c === '/' && s[i + 1] === '*') { let j = s.indexOf('*/', i + 2); j = (j === -1 ? s.length : j + 2); toks.push({ kind: 'comment', text: s.slice(i, j) }); i = j; }
        else if ('{}[],:'.includes(c)) { toks.push({ kind: 'punct', text: c }); i++; }
        else if (/\s/.test(c)) { let j = i; while (j < s.length && /\s/.test(s[j])) j++; toks.push({ kind: 'ws', text: s.slice(i, j) }); i = j; }
        else { let j = i; while (j < s.length && !/\s/.test(s[j]) && !'{}[],:"\''.includes(s[j])) j++; if (j === i) j++; toks.push({ kind: 'bare', text: s.slice(i, j) }); i = j; }
      }
      const sig = toks.map((t, k) => (t.kind !== 'ws' && t.kind !== 'comment') ? k : -1).filter(k => k >= 0);
      const pos = new Map(sig.map((k, idx) => [k, idx]));
      const nextOf = k => { const p = pos.get(k); return (p !== undefined && p + 1 < sig.length) ? toks[sig[p + 1]] : null; };
      const prevOf = k => { const p = pos.get(k); return (p !== undefined && p > 0) ? toks[sig[p - 1]] : null; };
      const note = m => { if (!notes.includes(m)) notes.push(m); };

      let out = '';
      for (let k = 0; k < toks.length; k++) {
        const t = toks[k];
        if (t.kind === 'ws') { out += t.text; continue; }
        if (t.kind === 'comment') { note('Removed comments'); out += t.text.startsWith('/*') ? ' ' : ''; continue; }
        const next = nextOf(k), prev = prevOf(k);
        if (t.kind === 'sqr') {
          const inner = (t.text.length >= 2 && t.text.endsWith("'")) ? t.text.slice(1, -1) : t.text.slice(1);
          out += '"' + inner.replace(/\\'/g, "'").replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
          note('Converted single-quoted strings to double quotes'); continue;
        }
        if (t.kind === 'str') { out += t.text; continue; }
        if (t.kind === 'bare') {
          const w = t.text;
          if (w === 'true' || w === 'false' || w === 'null' || /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(w)) { out += w; continue; }
          if (/^(NaN|Infinity|-Infinity)$/.test(w)) { out += 'null'; note('Replaced NaN/Infinity with null'); continue; }
          if (next && next.text === ':') { out += JSON.stringify(w); note('Quoted unquoted keys'); continue; }
          out += JSON.stringify(w); note('Quoted unquoted string values'); continue;
        }
        if (t.text === ',' && next && (next.text === '}' || next.text === ']')) { note('Removed trailing commas'); continue; }
        out += t.text;
      }

      // Insert missing commas: value-end followed directly by a value/key start
      const re = tokenizeJson(out);
      let rebuilt = '', prevSig = null;
      for (const t of re) {
        if (t.kind === 'ws') { rebuilt += t.text; continue; }
        const isValEnd = prevSig && (prevSig.kind === 'str' || prevSig.kind === 'key' || prevSig.kind === 'num' || prevSig.kind === 'kw' || prevSig.text === '}' || prevSig.text === ']');
        const startsVal = (t.kind === 'str' || t.kind === 'key' || t.kind === 'num' || t.kind === 'kw' || t.text === '{' || t.text === '[');
        if (isValEnd && startsVal) { rebuilt = rebuilt.replace(/\s*$/, '') + ', '; note('Inserted missing commas'); }
        rebuilt += t.text; prevSig = t;
      }
      rebuilt = rebuilt.replace(/,\s*,/g, ',').replace(/,\s*([}\]])/g, '$1');

      // Close unclosed braces/brackets (ignore strings)
      const stack = [];
      for (let p = 0; p < rebuilt.length; p++) {
        const c = rebuilt[p];
        if (c === '"') { p++; while (p < rebuilt.length) { if (rebuilt[p] === '\\') { p += 2; continue; } if (rebuilt[p] === '"') break; p++; } continue; }
        if (c === '{') stack.push('}'); else if (c === '[') stack.push(']');
        else if ((c === '}' || c === ']') && stack[stack.length - 1] === c) stack.pop();
      }
      if (stack.length) { rebuilt += stack.reverse().join(''); note('Closed unclosed braces/brackets'); }

      // Escape literal control chars inside strings
      let fixed = '', inStr = false;
      for (let p = 0; p < rebuilt.length; p++) {
        const c = rebuilt[p];
        if (c === '"') {
          let slashes = 0;
          for (let k = p - 1; k >= 0 && rebuilt[k] === '\\'; k--) slashes++;
          if (slashes % 2 === 0) inStr = !inStr;
        }
        // Raw control characters are illegal inside JSON strings. Newlines used
        // to be left as-is, so a broken multiline string stayed invalid.
        if (inStr && c < ' ') {
          fixed += '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
          note('Escaped control characters in strings');
        } else fixed += c;
      }
      return { fixed, fixes: notes };
    }

    function toCompactText(evList) {
      const groups = {};
      const order = [];
      evList.forEach(ev => {
        const k = (ev.path || '(root)').replace(/\[\d+\]$/, '');
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(ev);
      });
      const lines = [];
      order.forEach(path => {
        lines.push(path);
        groups[path].forEach(ev => {
          const op = ev.operation.toLowerCase().replace('type_change', 'change');
          const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
          if (ev.isArrayItem && ev.property == null) {
            if (ev.operation === 'ADD') {
              if (isObj(ev.newValue)) { lines.push('add'); lines.push(JSON.stringify(ev.newValue, null, 2)); }
              else lines.push('add ' + fmt(ev.newValue));
            } else if (ev.operation === 'REMOVE') {
              if (isObj(ev.oldValue)) { lines.push('remove'); lines.push(JSON.stringify(ev.oldValue, null, 2)); }
              else lines.push('remove ' + fmt(ev.oldValue));
            } else if (ev.operation === 'UPDATE') {
              lines.push('update ' + fmt(ev.oldValue) + ' -> ' + fmt(ev.newValue));
            } else {
              lines.push(op + ' ' + fmt(ev.oldValue) + ' -> ' + fmt(ev.newValue));
            }
          } else {
            if (ev.operation === 'ADD') lines.push('add "' + ev.property + '": ' + fmt(ev.newValue));
            else if (ev.operation === 'REMOVE') lines.push('remove "' + ev.property + '"');
            else if (ev.operation === 'UPDATE') lines.push('update "' + ev.property + '": ' + fmt(ev.newValue));
            else if (ev.operation === 'TYPE_CHANGE') lines.push('change "' + ev.property + '": ' + fmt(ev.newValue));
          }
        });
        lines.push('');
      });
      return lines.join('\n').trimEnd();
    }
    function toChangesJson(evList) {
      const out = {};
      function setValue(root, segs, val) {
        if (!segs || segs.length === 0) { root['root'] = val; return; }
        let cur = root;
        for (let i = 0; i < segs.length - 1; i++) {
          const seg = segs[i];
          const next = segs[i + 1];
          const container = (next.t === 'i') ? [] : {};
          if (seg.t === 'i') {
            if (!Array.isArray(cur)) return;
            if (cur[seg.v] === undefined) cur[seg.v] = container;
            cur = cur[seg.v];
          } else {
            if (cur[seg.v] === undefined) cur[seg.v] = container;
            cur = cur[seg.v];
          }
        }
        const last = segs[segs.length - 1];
        if (last.t === 'i') {
          if (!Array.isArray(cur)) return;
          cur[last.v] = val;
        } else {
          cur[last.v] = val;
        }
      }
      evList.forEach(e => {
        let segs = parsePathString(e.path === 'root' ? '' : (e.path || ''));
        if (e.property != null) segs = segs.concat([{t: 'k', v: e.property}]);
        const val = (e.operation === 'REMOVE')
          ? {'__removed__': true, 'value': (e.oldValue === undefined ? null : e.oldValue)}
          : (e.newValue === undefined ? null : e.newValue);
        setValue(out, segs, val);
      });
      return out;
    }
    function buildMarkdown(list) {
      let md = '# JSON Kit Report\n\nTotal changes: ' + list.length + '\n\n';
      const labels = {ADD: 'Added', REMOVE: 'Removed', UPDATE: 'Updated', TYPE_CHANGE: 'Type Changes'};
      ['ADD','REMOVE','UPDATE','TYPE_CHANGE'].forEach(op => {
        const items = list.filter(e => e.operation === op);
        if (!items.length) return;
        md += '## ' + labels[op] + '\n';
        items.forEach((e, i) => { md += (i+1) + '. ' + e.description + '\n'; });
        md += '\n';
      });
      return md;
    }
    function buildCsv(list) {
      const header = ['Operation','Path','Property','Old Value','New Value','Old Type','New Type','Description'];
      function csvField(v) {
        const s = v === undefined || v === null ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
        return '"' + s.replace(/"/g, '""') + '"';
      }
      const rows = [header.join(',')];
      list.forEach(e => {
        rows.push([
          csvField(e.operation), csvField(e.path), csvField(e.property),
          csvField(e.oldValue), csvField(e.newValue), csvField(e.oldType),
          csvField(e.newType), csvField(e.description)
        ].join(','));
      });
      return rows.join('\n');
    }

  const fmt = fmtValue;

  function isSimpleKey(k) {
    return /^[A-Za-z_$][\w$]*$/.test(k);
  }
  function joinKey(path, k) {
    const key = String(k);
    const safe = isSimpleKey(key);
    if (!path) return safe ? key : '[' + JSON.stringify(key) + ']';
    return safe ? path + '.' + key : path + '[' + JSON.stringify(key) + ']';
  }
  function joinIndex(path, idx) {
    return path ? path + '[' + idx + ']' : '[' + idx + ']';
  }

  function parseJson(text) {
    if (text == null) text = '';
    text = String(text);
    if (!text.trim()) return { ok: false, error: 'Input is empty.' };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      const m = String(e.message).match(/position (\d+)/);
      let info = '';
      let line = null;
      let column = null;
      if (m) {
        const pos = lineColFromPos(text, +m[1]);
        line = pos.line;
        column = pos.col;
        info = ' at line ' + line + ', column ' + column;
      }
      return {
        ok: false,
        error: 'Invalid JSON' + info + ': ' + e.message,
        message: e.message,
        line: line,
        column: column,
      };
    }
  }

  function formatJson(text, space) {
    const parsed = parseJson(text);
    if (!parsed.ok) return parsed;
    let indent = space === undefined ? 2 : space;
    if (typeof indent !== 'number' || !Number.isInteger(indent) || indent < 0 || indent > 10) {
      return { ok: false, error: 'Indent must be an integer from 0 to 10.' };
    }
    return { ok: true, json: JSON.stringify(parsed.value, null, indent), value: parsed.value };
  }

  function compactJson(text) {
    const parsed = parseJson(text);
    if (!parsed.ok) return parsed;
    return { ok: true, json: JSON.stringify(parsed.value), value: parsed.value };
  }

  function findPathInJson(obj, needle) {
    needle = String(needle == null ? '' : needle).trim().replace(/^["']|["']$/g, '');
    let result = null;
    function rec(o, path) {
      if (result) return;
      if (o === null || typeof o !== 'object') {
        if (needle && String(o) === needle) { result = path || 'root'; }
        return;
      }
      if (Array.isArray(o)) {
        for (let i = 0; i < o.length; i++) {
          rec(o[i], joinIndex(path, i));
          if (result) return;
        }
      } else {
        const keys = Object.keys(o);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const childPath = joinKey(path, k);
          if (needle && k === needle) { result = childPath; return; }
          rec(o[k], childPath);
          if (result) return;
        }
      }
    }
    rec(obj, '');
    if (!result && !needle && obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const ks = Object.keys(obj);
      if (ks.length) result = joinKey('', ks[0]);
    }
    return result;
  }

  function eventFullPath(ev) {
    if (!ev) return '';
    if (ev.property != null) {
      const parent = (!ev.path || ev.path === 'root') ? '' : ev.path;
      return joinKey(parent, ev.property);
    }
    return ev.path || 'root';
  }

  function filterEvents(events, opts) {
    opts = opts || {};
    let list = events.slice();
    const ops = opts.operations;
    if (ops && ops.length) {
      const set = {};
      for (let i = 0; i < ops.length; i++) set[ops[i]] = true;
      list = list.filter(function (ev) { return set[ev.operation]; });
    }
    const q = String(opts.query || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(function (ev) {
      return String(ev.property || '').toLowerCase().includes(q) ||
        String(ev.path || '').toLowerCase().includes(q) ||
        String(ev.description || '').toLowerCase().includes(q) ||
        stringify(ev.oldValue).toLowerCase().includes(q) ||
        stringify(ev.newValue).toLowerCase().includes(q);
    });
  }

  function summarizeEvents(events) {
    const counts = { ADD: 0, REMOVE: 0, UPDATE: 0, TYPE_CHANGE: 0 };
    for (let i = 0; i < events.length; i++) {
      const op = events[i].operation;
      if (counts[op] !== undefined) counts[op]++;
    }
    return {
      total: events.length,
      added: counts.ADD,
      removed: counts.REMOVE,
      updated: counts.UPDATE,
      typeChanges: counts.TYPE_CHANGE,
    };
  }

  function groupEvents(events, by) {
    if (!by || by === 'none') return [{ key: null, events: events.slice() }];
    const groups = [];
    const map = new Map();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const key = by === 'operation' ? ev.operation : (ev.path || '(root)');
      let group = map.get(key);
      if (!group) {
        group = { key: key, events: [] };
        map.set(key, group);
        groups.push(group);
      }
      group.events.push(ev);
    }
    return groups;
  }

  function describeEvents(events) {
    return events.map(function (e) { return e.description; }).join('\n');
  }

  function exportEvents(events, format) {
    if (format === 'descriptions') return describeEvents(events);
    if (format === 'compact') return toCompactText(events);
    if (format === 'markdown') return buildMarkdown(events);
    if (format === 'csv') return buildCsv(events);
    if (format === 'json') return JSON.stringify(toChangesJson(events), null, 2);
    return null;
  }

  function outlineJson(value, opts) {
    opts = opts || {};
    const maxDepth = opts.maxDepth == null ? 8 : opts.maxDepth;
    const maxNodes = opts.maxNodes == null ? 500 : opts.maxNodes;
    const nodes = [];
    let truncated = false;
    function walk(v, path, depth) {
      if (nodes.length >= maxNodes) { truncated = true; return; }
      const t = typeOf(v);
      const node = { path: path || 'root', type: t, depth: depth };
      if (t === 'array') node.length = v.length;
      else if (t === 'object') node.keyCount = Object.keys(v).length;
      else node.value = v;
      const hasKids = (t === 'array' && v.length) || (t === 'object' && Object.keys(v).length);
      if (depth >= maxDepth && hasKids) node.collapsed = true;
      nodes.push(node);
      if (depth >= maxDepth) return;
      if (t === 'array') {
        for (let i = 0; i < v.length; i++) {
          if (nodes.length >= maxNodes) { truncated = true; return; }
          walk(v[i], joinIndex(path, i), depth + 1);
        }
      } else if (t === 'object') {
        const keys = Object.keys(v);
        for (let i = 0; i < keys.length; i++) {
          if (nodes.length >= maxNodes) { truncated = true; return; }
          walk(v[keys[i]], joinKey(path, keys[i]), depth + 1);
        }
      }
    }
    walk(value, '', 0);
    return { nodes: nodes, truncated: truncated };
  }

  function statusOf(before, after) {
    const tb = (before === null ? 'null' : Array.isArray(before) ? 'array' : typeof before);
    const ta = (after === null ? 'null' : Array.isArray(after) ? 'array' : typeof after);
    if (before === undefined) return 'added';
    if (after === undefined) return 'removed';
    if (tb !== ta) return 'typechanged';
    if (tb === 'object' || tb === 'array') return 'container';
    if (before !== after) return 'modified';
    return 'same';
  }

  function renderVisualTree(before, after, opts) {
    opts = opts || {};
    const strategy = opts.arrayStrategy || 'auto';
    const identityKey = opts.identityKey || 'id';
    function mergedKeys(b, a) {
      const s = new Set();
      if (b && typeof b === 'object' && !Array.isArray(b)) Object.keys(b).forEach(k => s.add(k));
      if (a && typeof a === 'object' && !Array.isArray(a)) Object.keys(a).forEach(k => s.add(k));
      return [...s];
    }
    function build(b, a, depth) {
      if (depth > 60) return '<div>...depth limit...</div>';
      const st = statusOf(b, a);
      if (st === 'added') {
        return '<div class="tree-added">+ ' + esc(fmt(a)) + '</div>';
      }
      if (st === 'removed') {
        return '<div class="tree-removed">- ' + esc(fmt(b)) + '</div>';
      }
      if (st === 'typechanged') {
        return '<div class="tree-modified">~ ' + esc(fmt(b)) + ' → ' + esc(fmt(a)) + '</div>';
      }
      if (Array.isArray(b) || Array.isArray(a)) {
        const ba = Array.isArray(b) ? b : [];
        const aa = Array.isArray(a) ? a : [];
        const ops = alignArrays(ba, aa, identityKey, strategy).ops;
        let html = '[\n';
        ops.forEach(op => {
          let child;
          if (op.kind === 'remove') child = '<span class="tree-removed">- ' + esc(fmt(ba[op.bIdx])) + '</span>';
          else if (op.kind === 'add') child = '<span class="tree-added">+ ' + esc(fmt(aa[op.aIdx])) + '</span>';
          else child = build(ba[op.bIdx], aa[op.aIdx], depth + 1);
          const label = op.kind === 'remove' ? op.bIdx : op.aIdx;
          html += '<div class="tree-node">[' + label + ']: ' + child + '</div>';
        });
        html += ']';
        return html;
      }
      if (b && typeof b === 'object') {
        const keys = mergedKeys(b, a);
        if (keys.length === 0) return '{}';
        let html = '{\n';
        keys.forEach(k => {
          const vb = (b && hasOwn(b, k)) ? b[k] : undefined;
          const va = (a && hasOwn(a, k)) ? a[k] : undefined;
          const c = build(vb, va, depth + 1);
          html += '<div class="tree-node"><span class="tree-key">' + esc(JSON.stringify(k)) + '</span>: ' + c + '</div>';
        });
        html += '}';
        return html;
      }
      if (b !== a) return '<span class="tree-modified">' + esc(fmt(a)) + '</span>';
      return '<span class="tree-val">' + esc(fmt(a)) + '</span>';
    }
    return build(before, after, 0);
  }

  function renderVisualTreeText(before, after, opts) {
    opts = opts || {};
    const strategy = opts.arrayStrategy || 'auto';
    const identityKey = opts.identityKey || 'id';
    function mergedKeys(b, a) {
      const s = [];
      const seen = new Set();
      function add(o) {
        if (o && typeof o === 'object' && !Array.isArray(o)) {
          Object.keys(o).forEach(k => {
            if (!seen.has(k)) { seen.add(k); s.push(k); }
          });
        }
      }
      add(b);
      add(a);
      return s;
    }
    function indentBlock(text, pad) {
      const parts = String(text).split('\n');
      if (parts.length === 1) return parts[0];
      return parts[0] + '\n' + parts.slice(1).map(function (line) { return pad + line; }).join('\n');
    }
    function build(b, a, depth) {
      if (depth > 60) return '...depth limit...';
      const st = statusOf(b, a);
      if (st === 'added') return '+ ' + fmt(a);
      if (st === 'removed') return '- ' + fmt(b);
      if (st === 'typechanged') return '~ ' + fmt(b) + ' → ' + fmt(a);
      if (Array.isArray(b) || Array.isArray(a)) {
        const ba = Array.isArray(b) ? b : [];
        const aa = Array.isArray(a) ? a : [];
        const ops = alignArrays(ba, aa, identityKey, strategy).ops;
        if (!ops.length) return '[]';
        const lines = ['['];
        ops.forEach(op => {
          const label = op.kind === 'remove' ? op.bIdx : op.aIdx;
          let child;
          if (op.kind === 'remove') child = '- ' + fmt(ba[op.bIdx]);
          else if (op.kind === 'add') child = '+ ' + fmt(aa[op.aIdx]);
          else child = build(ba[op.bIdx], aa[op.aIdx], depth + 1);
          lines.push('  [' + label + ']: ' + indentBlock(child, '  '));
        });
        lines.push(']');
        return lines.join('\n');
      }
      if (b && typeof b === 'object') {
        const keys = mergedKeys(b, a);
        if (!keys.length) return '{}';
        const lines = ['{'];
        keys.forEach(k => {
          const vb = (b && hasOwn(b, k)) ? b[k] : undefined;
          const va = (a && hasOwn(a, k)) ? a[k] : undefined;
          const child = build(vb, va, depth + 1);
          lines.push('  ' + JSON.stringify(k) + ': ' + indentBlock(child, '  '));
        });
        lines.push('}');
        return lines.join('\n');
      }
      if (b !== a) return '~ ' + fmt(a);
      return fmt(a);
    }
    return build(before, after, 0);
  }

  return {
    typeOf: typeOf,
    parsePathString: parsePathString,
    renderPath: renderPath,
    alignArrays: alignArrays,
    compareAll: compareAll,
    fmtValue: fmtValue,
    escapeHtml: esc,
    stringifyValue: stringify,
    tokenizeJson: tokenizeJson,
    fixJson: fixJson,
    parseJson: parseJson,
    formatJson: formatJson,
    compactJson: compactJson,
    findPathAtOffset: findPathAtOffset,
    findPathInJson: findPathInJson,
    eventFullPath: eventFullPath,
    filterEvents: filterEvents,
    summarizeEvents: summarizeEvents,
    groupEvents: groupEvents,
    toCompactText: toCompactText,
    toChangesJson: toChangesJson,
    buildMarkdown: buildMarkdown,
    buildCsv: buildCsv,
    describeEvents: describeEvents,
    exportEvents: exportEvents,
    renderVisualTree: renderVisualTree,
    renderVisualTreeText: renderVisualTreeText,
    outlineJson: outlineJson,
    joinKey: joinKey,
    joinIndex: joinIndex,
  };
});
