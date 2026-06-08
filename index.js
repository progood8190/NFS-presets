// ===== NFS Presets (CoderTJP / DPU plugin) =====
// Adds an "NFS Presets" box in Settings, right under "Colorblind mode".
//   - Set your Network frame shift Min/Max, click "Save current", give it a name.
//   - Click any saved preset to instantly apply its Min/Max via utils.setNFS().
//   - ❌ removes a preset.
//
// Presets are saved with the extension's local store:
//   - utils.Config.Local.get(key)              -> read the saved list (returns the stored string)
//   - utils.Config.Local.set(key, value)       -> write the saved list (value must be a string)
//   All presets live together as ONE JSON value under a single key, because the
//   Config store is a flat key->value store (no "list keys" function).
//   Applying a preset uses utils.setNFS(min, max).

(function () {
    'use strict';

    if (typeof utils === 'undefined') {
        console.error('[NFSPresets] CoderTJP "utils" not found — load this as a DPU plugin on defly.io.');
        return;
    }

    const KEY = 'nfsPresets';   // unique key inside utils.Config.Local

    // Re-run cleanup (e.g. hot reload during development)
    document.getElementById('nfs-presets-box')?.remove();
    document.getElementById('nfs-presets-style')?.remove();

    // ---------- styling (injected inline; theme-aware) ----------
    const style = document.createElement('style');
    style.id = 'nfs-presets-style';
    style.textContent = `
        #nfs-presets-box { margin-top: 8px; }
        #nfs-presets-box .nfs-row-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        #nfs-presets-box .nfs-save {
            background: #28a745; color: #fff; border: none; border-radius: 5px;
            padding: 5px 12px; cursor: pointer; font-weight: bold;
            transition: background 0.2s ease;
        }
        #nfs-presets-box .nfs-save:hover { background: #218838; }
        #nfs-presets-box .nfs-status { font-size: 12px; margin-left: auto; opacity: 0; transition: opacity 0.2s ease; }
        #nfs-presets-box .nfs-status.show { opacity: 0.85; }
        #nfs-presets-box .nfs-list { display: flex; flex-direction: column; gap: 4px; }
        #nfs-presets-box .nfs-item { display: flex; align-items: center; gap: 6px; }
        #nfs-presets-box .nfs-apply {
            flex: 1; text-align: left; cursor: pointer;
            background: rgba(128,128,128,0.18); color: inherit;
            border: 1px solid rgba(128,128,128,0.35); border-radius: 6px;
            padding: 6px 10px; font-size: 14px;
            transition: background 0.15s ease;
        }
        #nfs-presets-box .nfs-apply:hover { background: rgba(128,128,128,0.32); }
        #nfs-presets-box .nfs-apply b { font-weight: 700; opacity: 0.7; font-size: 12px; }
        #nfs-presets-box .nfs-del { background: transparent; border: none; cursor: pointer; font-size: 14px; line-height: 1; }
        #nfs-presets-box .nfs-empty { opacity: 0.55; font-size: 13px; }
    `;
    document.head.appendChild(style);

    // ---------- storage (utils.Config.Local only) ----------
    // Normalises whatever the store hands back into an array of presets.
    const coerceStored = (raw) => {
        if (raw == null) return [];
        let v = raw;
        // Some get() variants wrap the result in an object like { value: "..." }
        if (typeof v === 'object' && !Array.isArray(v) && 'value' in v) v = v.value;
        if (typeof v === 'string') {
            try { v = JSON.parse(v); } catch { return []; }
        }
        return Array.isArray(v) ? v : [];
    };

    const Store = {
        // Reads the saved list. Works whether get() returns a value OR a Promise.
        read(cb) {
            let raw;
            try { raw = utils.Config.Local.get(KEY); }   // get(key) -> stored string
            catch (e) { console.warn('[NFSPresets] read failed', e); return cb([]); }

            if (raw && typeof raw.then === 'function') {
                raw.then((v) => cb(coerceStored(v)))
                   .catch((e) => { console.warn('[NFSPresets] read failed', e); cb([]); });
            } else {
                cb(coerceStored(raw));
            }
        },
        // Writes the whole list back. The docs type `value` as a string, so we
        // serialize here; coerceStored() parses it again on read.
        write(presets) {
            try {
                const r = utils.Config.Local.set(KEY, JSON.stringify(presets));
                if (r && typeof r.catch === 'function') {
                    r.catch((e) => console.warn('[NFSPresets] write failed', e));
                }
            } catch (e) { console.warn('[NFSPresets] write failed', e); }
        },
    };

    // In-memory working copy; saved on every change.
    let presets = [];

    // ---------- the two NFS number inputs (used to capture "current") ----------
    const getInputs = () => ({
        min: document.querySelector('#controls-nfs-min'),
        max: document.querySelector('#controls-nfs-max'),
    });

    // ---------- apply a preset via utils.setNFS ----------
    const applyNFS = (min, max) => {
        const mn = parseInt(min, 10);
        const mx = parseInt(max, 10);
        if (Number.isNaN(mn)) return;

        // Reflect values in the Settings inputs so the UI shows what's applied
        const { min: minEl, max: maxEl } = getInputs();
        if (minEl) minEl.value = mn;
        if (maxEl && !Number.isNaN(mx)) maxEl.value = mx;

        // Actually set the frame-shift range (max is optional)
        if (Number.isNaN(mx)) utils.setNFS(mn);
        else utils.setNFS(mn, mx);
    };

    // ---------- build the box ----------
    const box = document.createElement('div');
    box.id = 'nfs-presets-box';
    box.innerHTML = `
        <div class="nfs-row-top">
            <span>NFS Presets:</span>
            <button type="button" class="nfs-save">Save current</button>
            <span class="nfs-status"></span>
        </div>
        <div class="nfs-list"></div>
    `;
    const listEl   = box.querySelector('.nfs-list');
    const statusEl = box.querySelector('.nfs-status');

    let statusTimer = null;
    const setStatus = (text) => {
        statusEl.textContent = text;
        statusEl.classList.add('show');
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2500);
    };

    const render = () => {
        listEl.innerHTML = '';

        if (!presets.length) {
            const empty = document.createElement('div');
            empty.className = 'nfs-empty';
            empty.textContent = 'No presets yet — set your Min/Max above and hit "Save current".';
            listEl.appendChild(empty);
            return;
        }

        presets.forEach((p, i) => {
            const item = document.createElement('div');
            item.className = 'nfs-item';

            const apply = document.createElement('button');
            apply.type = 'button';
            apply.className = 'nfs-apply';
            apply.title = 'Click to apply this preset';
            apply.textContent = p.name + '  ';
            const meta = document.createElement('b');
            meta.textContent = `Min ${p.min} / Max ${p.max}`;
            apply.appendChild(meta);
            apply.addEventListener('click', () => applyNFS(p.min, p.max));

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'nfs-del';
            del.title = 'Delete preset';
            del.textContent = '❌';
            del.addEventListener('click', () => {
                presets.splice(i, 1);
                Store.write(presets);   // persist the trimmed list
                render();
                setStatus('Removed \u2713');
            });

            item.appendChild(apply);
            item.appendChild(del);
            listEl.appendChild(item);
        });
    };

    box.querySelector('.nfs-save').addEventListener('click', () => {
        const { min: minEl, max: maxEl } = getInputs();
        if (!minEl || !maxEl) {
            alert('Could not find the Network frame shift inputs.');
            return;
        }
        const min = minEl.value;
        const max = maxEl.value;

        const name = prompt(`Saving NFS preset — Min ${min} / Max ${max}\n\nName this preset:`);
        if (name === null) return;            // pressed Cancel
        const trimmed = name.trim();
        if (!trimmed) { alert('Please enter a name.'); return; }

        presets.push({ name: trimmed, min, max });
        Store.write(presets);   // persist the new preset
        render();
        setStatus('Saved \u2713');
    });

    // ---------- place the box under "Colorblind mode", then load saved presets ----------
    // Settings inputs may not exist the moment the plugin loads, so wait for them.
    const waitFor = (selector, cb, tries = 100) => {
        const el = document.querySelector(selector);
        if (el) return cb(el);
        if (tries <= 0) return cb(null);
        setTimeout(() => waitFor(selector, cb, tries - 1), 150);
    };

    waitFor('#controls-colorblind', (colorblind) => {
        const row = colorblind?.parentElement;
        if (row) row.insertAdjacentElement('afterend', box);
        else (document.querySelector('#settings-popup .graphics') || document.body).appendChild(box);

        // load whatever was saved last time
        Store.read((stored) => { presets = stored; render(); });
    });

    console.log('%cNFS Presets loaded \u2713', 'color:#28a745;font-weight:bold');
    console.log('Open Settings \u2192 look right under "Colorblind mode".');
})();
