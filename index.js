/* Lorebook Organizer for SillyTavern
 * v0.1.0 — folder organizer for World Info books and entries.
 * Folder metadata is stored separately in extension settings for books,
 * and in entry.extensions.lorebook_folder for portable entry folders.
 */
(() => {
    'use strict';

    const EXT = 'LorebookOrganizer';
    const ROOT_ID = 'lbo-root';
    const STYLE_ID = 'lbo-style-loaded';
    const DEFAULTS = { books: {}, entryFolders: {}, lastTab: 'books' };
    let ctx;
    let currentTab = 'books';
    let currentBook = '';
    let currentBookFolder = '';
    let currentEntryFolder = '';
    let cachedBooks = [];

    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => [...root.querySelectorAll(s)];
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
    const normPath = (p) => String(p || '').split('/').map(x => x.trim()).filter(Boolean).join('/');
    const parentPath = (p) => normPath(p).split('/').slice(0, -1).join('/');
    const leafName = (p) => normPath(p).split('/').pop() || '';
    const pathDepth = (p) => normPath(p) ? normPath(p).split('/').length : 0;

    function settings() {
        ctx.extensionSettings[EXT] ??= structuredClone(DEFAULTS);
        const s = ctx.extensionSettings[EXT];
        for (const [k, v] of Object.entries(DEFAULTS)) {
            if (s[k] === undefined) s[k] = structuredClone(v);
        }
        s.books ??= {};
        s.entryFolders ??= {};
        return s;
    }
    function saveSettings() {
        ctx.saveSettingsDebounced();
    }
    function toast(type, message) {
        if (window.toastr?.[type]) window.toastr[type](message, 'Lorebook Organizer');
        else console[type === 'error' ? 'error' : 'log'](`[Lorebook Organizer] ${message}`);
    }
    function promptName(label, initial = '') {
        const value = window.prompt(label, initial);
        if (value === null) return null;
        const clean = value.trim();
        return clean || null;
    }
    function allFolderPaths(paths) {
        const out = new Set();
        for (const raw of paths || []) {
            const p = normPath(raw);
            if (!p) continue;
            const bits = p.split('/');
            for (let i = 1; i <= bits.length; i++) out.add(bits.slice(0, i).join('/'));
        }
        return [...out].sort((a, b) => a.localeCompare(b));
    }
    function addFolderPath(paths, path) {
        const p = normPath(path);
        if (!p) return paths;
        return allFolderPaths([...paths, p]);
    }
    function getBookFolder(name) {
        return normPath(settings().books[name] || '');
    }
    function setBookFolder(name, folder) {
        const p = normPath(folder);
        if (p) settings().books[name] = p;
        else delete settings().books[name];
        saveSettings();
    }
    function getEntryFolder(book, entry) {
        return normPath(entry?.extensions?.lorebook_folder || '');
    }
    function setEntryFolder(entry, folder) {
        const p = normPath(folder);
        if (p) {
            entry.extensions = (entry.extensions && typeof entry.extensions === 'object') ? entry.extensions : {};
            entry.extensions.lorebook_folder = p;
        } else if (entry.extensions) {
            delete entry.extensions.lorebook_folder;
            if (!Object.keys(entry.extensions).length) delete entry.extensions;
        }
    }
    function entryFolderList(book, data) {
        const paths = [...(settings().entryFolders[book] || [])];
        for (const entry of Object.values(data?.entries || {})) {
            const p = getEntryFolder(book, entry);
            if (p) paths.push(p);
        }
        return allFolderPaths(paths);
    }
    async function getBooks() {
        const names = await ctx.getWorldInfoNames();
        cachedBooks = Array.isArray(names) ? names.slice().sort((a, b) => a.localeCompare(b)) : [];
        return cachedBooks;
    }
    async function loadBook(name) {
        const data = await ctx.loadWorldInfo(name);
        if (!data || typeof data !== 'object' || !data.entries) throw new Error(`Cannot load Lorebook: ${name}`);
        if (Array.isArray(data.entries)) {
            const normalized = {};
            data.entries.forEach((entry, i) => {
                const uid = entry.uid ?? i;
                normalized[uid] = entry;
            });
            data.entries = normalized;
        }
        return data;
    }
    async function saveBook(name, data) {
        const payload = { ...data, name };
        const response = await fetch('/api/worldinfo/edit', {
            method: 'POST',
            headers: ctx.getRequestHeaders(),
            body: JSON.stringify({ name, data: payload }),
        });
        if (!response.ok) throw new Error(`Saving Lorebook failed (HTTP ${response.status})`);
        try {
            await ctx.eventSource?.emit?.('WORLDINFO_UPDATED');
        } catch (_) {}
    }
    function entryLabel(entry, uid) {
        return String(entry.comment || entry.name || entry.key || entry.keys?.join(', ') || `Entry ${uid}`);
    }
    function ensureFolders(book, data) {
        const list = entryFolderList(book, data);
        settings().entryFolders[book] = list;
        saveSettings();
        return list;
    }

    function mountSettingsButton() {
        if ($('#lbo-open-settings')) return;
        const host = $('#extensions_settings2') || $('#extensions_settings');
        if (!host) return;
        const wrap = document.createElement('div');
        wrap.className = 'lbo-settings-row';
        wrap.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-header">
                    <b>Lorebook Organizer</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                </div>
                <div class="inline-drawer-content">
                    <p class="notes">Organize Lorebooks and their Entries into nested folders.</p>
                    <div class="lbo-settings-actions">
                        <button id="lbo-open-settings" class="menu_button">Open Organizer</button>
                    </div>
                </div>
            </div>`;
        host.appendChild(wrap);
        $('#lbo-open-settings', wrap)?.addEventListener('click', openManager);
    }

    function ensureModal() {
        if ($('#' + ROOT_ID)) return;
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'lbo-overlay';
        root.innerHTML = `
          <section class="lbo-window" role="dialog" aria-modal="true" aria-label="Lorebook Organizer">
            <header class="lbo-topbar">
              <div class="lbo-brand"><span class="lbo-brand-icon">▤</span><div><strong>Lorebook Organizer</strong><small>World Info Library</small></div></div>
              <div class="lbo-top-actions">
                <button class="lbo-icon-btn" data-action="refresh" title="Refresh">↻</button>
                <button class="lbo-icon-btn" data-action="close" title="Close">✕</button>
              </div>
            </header>
            <nav class="lbo-tabs">
              <button data-tab="books" class="lbo-tab active">▣ Lorebooks</button>
              <button data-tab="entries" class="lbo-tab">☷ Entries</button>
            </nav>
            <div class="lbo-toolbar">
              <div class="lbo-breadcrumb" id="lbo-breadcrumb">All Lorebooks</div>
              <div class="lbo-toolbar-actions">
                <input id="lbo-search" type="search" placeholder="Search..." autocomplete="off">
                <button class="lbo-primary" data-action="new-folder">＋ New folder</button>
              </div>
            </div>
            <div class="lbo-body">
              <aside class="lbo-sidebar">
                <div class="lbo-sidebar-head">FOLDERS</div>
                <div id="lbo-folder-tree" class="lbo-folder-tree"></div>
              </aside>
              <main class="lbo-main">
                <div class="lbo-content-head">
                  <div><h2 id="lbo-heading">All Lorebooks</h2><p id="lbo-subheading">Organize your World Info library</p></div>
                  <div id="lbo-count" class="lbo-count"></div>
                </div>
                <div id="lbo-content" class="lbo-content"></div>
              </main>
            </div>
            <footer class="lbo-footer"><span>Folders organize your library; they do not change activation behavior.</span><span>v0.1.0</span></footer>
          </section>`;
        document.body.appendChild(root);
        root.addEventListener('click', onRootClick);
        root.addEventListener('change', onRootChange);
        root.addEventListener('input', onRootInput);
        root.addEventListener('dragstart', onDragStart);
        root.addEventListener('dragover', onDragOver);
        root.addEventListener('drop', onDrop);
        root.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeManager();
        });
        root.addEventListener('click', (event) => {
            if (event.target === root) closeManager();
        });
    }

    async function openManager() {
        ensureModal();
        $('#' + ROOT_ID).classList.add('is-open');
        document.body.classList.add('lbo-modal-open');
        await getBooks();
        render();
    }
    function closeManager() {
        $('#' + ROOT_ID)?.classList.remove('is-open');
        document.body.classList.remove('lbo-modal-open');
    }
    function setTab(tab) {
        currentTab = tab;
        settings().lastTab = tab;
        saveSettings();
        if (tab === 'entries' && !currentBook) {
            currentBook = cachedBooks[0] || '';
        }
        render();
    }
    function currentFolder() {
        return currentTab === 'books' ? currentBookFolder : currentEntryFolder;
    }
    function setCurrentFolder(path) {
        if (currentTab === 'books') currentBookFolder = normPath(path);
        else currentEntryFolder = normPath(path);
        render();
    }
    function render() {
        const root = $('#' + ROOT_ID);
        if (!root) return;
        $$('.lbo-tab', root).forEach(btn => btn.classList.toggle('active', btn.dataset.tab === currentTab));
        $('#lbo-search', root).value = '';
        if (currentTab === 'books') renderBooks();
        else renderEntries();
        addFolderControls();
    }
    function folderTreeMarkup(paths, selected) {
        const list = allFolderPaths(paths);
        const roots = list.filter(p => !parentPath(p));
        const childrenOf = (parent) => list.filter(p => parentPath(p) === parent);
        const draw = (items) => items.map(path => {
            const children = childrenOf(path);
            const active = selected === path ? ' is-active' : '';
            return `<div class="lbo-tree-node">
              <button class="lbo-folder-node${active}" data-action="select-folder" data-folder="${esc(path)}" title="${esc(path)}">
                <span class="lbo-folder-glyph">▰</span><span class="lbo-folder-name">${esc(leafName(path))}</span>
              </button>
              ${children.length ? `<div class="lbo-tree-children">${draw(children)}</div>` : ''}
            </div>`;
        }).join('');
        return `<button class="lbo-folder-node${selected === '' ? ' is-active' : ''}" data-action="select-folder" data-folder=""><span class="lbo-folder-glyph">▦</span><span class="lbo-folder-name">All items</span></button>
          ${draw(roots)}
          <button class="lbo-folder-node lbo-unfiled${selected === '__unfiled__' ? ' is-active' : ''}" data-action="select-folder" data-folder="__unfiled__"><span class="lbo-folder-glyph">▱</span><span class="lbo-folder-name">Unfiled</span></button>`;
    }
    function renderFolderTree(paths) {
        $('#lbo-folder-tree').innerHTML = folderTreeMarkup(paths, currentFolder());
    }
    function renderBooks() {
        const root = $('#' + ROOT_ID);
        const search = ($('#lbo-search', root)?.value || '').toLowerCase();
        const folders = allFolderPaths([...(settings().bookFolders || []), ...Object.values(settings().books)]);
        renderFolderTree(folders);
        const selected = currentBookFolder;
        const books = cachedBooks.filter(name => {
            const folder = getBookFolder(name);
            const inFolder = selected === '__unfiled__' ? !folder : (!selected || folder === selected || folder.startsWith(selected + '/'));
            return inFolder && (!search || name.toLowerCase().includes(search));
        });
        $('#lbo-breadcrumb').textContent = selected === '__unfiled__' ? 'Unfiled' : (selected || 'All Lorebooks');
        $('#lbo-heading').textContent = selected === '__unfiled__' ? 'Unfiled Lorebooks' : (selected || 'All Lorebooks');
        $('#lbo-subheading').textContent = 'Select a Lorebook to organize its Entries';
        $('#lbo-count').textContent = `${books.length} books`;
        const cards = books.map(name => {
            const folder = getBookFolder(name);
            const active = name === currentBook ? ' is-selected' : '';
            return `<article class="lbo-book-card${active}" draggable="true" data-drag-type="book" data-book="${esc(name)}">
              <div class="lbo-card-icon">▤</div>
              <div class="lbo-card-info"><strong>${esc(name)}</strong><small>${esc(folder || 'Unfiled')}</small></div>
              <div class="lbo-card-actions">
                <button data-action="choose-book" data-book="${esc(name)}" title="Organize entries">Open</button>
                <button class="lbo-more" data-action="book-menu" data-book="${esc(name)}" title="More">⋯</button>
              </div>
            </article>`;
        }).join('');
        $('#lbo-content').innerHTML = books.length ? `<div class="lbo-book-grid">${cards}</div>` : `<div class="lbo-empty"><div>▤</div><strong>No Lorebooks here</strong><span>Create a folder or choose another location.</span></div>`;
    }
    async function renderEntries() {
        const root = $('#' + ROOT_ID);
        const search = ($('#lbo-search', root)?.value || '').toLowerCase();
        if (!currentBook || !cachedBooks.includes(currentBook)) {
            currentBook = cachedBooks[0] || '';
        }
        if (!currentBook) {
            $('#lbo-folder-tree').innerHTML = '';
            $('#lbo-breadcrumb').textContent = 'Entries';
            $('#lbo-heading').textContent = 'No Lorebooks found';
            $('#lbo-subheading').textContent = 'Create a Lorebook in SillyTavern first.';
            $('#lbo-count').textContent = '0 entries';
            $('#lbo-content').innerHTML = `<div class="lbo-empty"><div>☷</div><strong>No Lorebooks available</strong></div>`;
            return;
        }
        let data;
        try { data = await loadBook(currentBook); }
        catch (error) {
            console.error('[Lorebook Organizer]', error);
            $('#lbo-content').innerHTML = `<div class="lbo-empty"><strong>Could not load this Lorebook</strong><span>${esc(error.message)}</span></div>`;
            return;
        }
        const paths = ensureFolders(currentBook, data);
        renderFolderTree(paths);
        const selected = currentEntryFolder;
        const entries = Object.entries(data.entries || {}).filter(([uid, entry]) => {
            const folder = getEntryFolder(currentBook, entry);
            const inFolder = selected === '__unfiled__' ? !folder : (!selected || folder === selected || folder.startsWith(selected + '/'));
            const text = `${entryLabel(entry, uid)} ${entry.key || ''} ${entry.content || ''}`.toLowerCase();
            return inFolder && (!search || text.includes(search));
        });
        $('#lbo-breadcrumb').textContent = `${currentBook} / ${selected === '__unfiled__' ? 'Unfiled' : (selected || 'All Entries')}`;
        $('#lbo-heading').textContent = currentBook;
        $('#lbo-subheading').textContent = 'Entry folders are saved in the Lorebook file';
        $('#lbo-count').textContent = `${entries.length} entries`;
        const bookSelect = `<select id="lbo-book-select" aria-label="Choose Lorebook">${cachedBooks.map(n => `<option value="${esc(n)}" ${n === currentBook ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
        const rows = entries.map(([uid, entry]) => {
            const title = entryLabel(entry, uid);
            const key = Array.isArray(entry.key) ? entry.key.join(', ') : (entry.key || entry.keys?.join(', ') || '');
            const snippet = String(entry.content || '').replace(/\s+/g, ' ').slice(0, 150);
            const folder = getEntryFolder(currentBook, entry);
            return `<article class="lbo-entry-row" draggable="true" data-drag-type="entry" data-uid="${esc(uid)}" data-book="${esc(currentBook)}">
              <div class="lbo-entry-icon">≡</div>
              <div class="lbo-entry-info"><strong>${esc(title)}</strong><small>${esc(key || 'No keys')} · ${esc(folder || 'Unfiled')}</small><p>${esc(snippet)}</p></div>
              <div class="lbo-entry-actions">
                <select data-action="move-entry" data-uid="${esc(uid)}" aria-label="Move entry">
                  ${folderOptions(paths, folder)}
                </select>
              </div>
            </article>`;
        }).join('');
        $('#lbo-content').innerHTML = `<div class="lbo-entry-toolbar">${bookSelect}<button class="lbo-secondary" data-action="open-native">Open native editor ↗</button></div>
          ${rows ? `<div class="lbo-entry-list">${rows}</div>` : `<div class="lbo-empty"><div>☷</div><strong>No Entries here</strong><span>Try another folder or search term.</span></div>`}`;
    }
    function folderOptions(paths, current) {
        return `<option value="">Unfiled</option>` + allFolderPaths(paths).map(p => `<option value="${esc(p)}" ${p === current ? 'selected' : ''}>${'　'.repeat(pathDepth(p))}${esc(leafName(p))}</option>`).join('');
    }

    async function createFolder() {
        const selected = currentFolder() === '__unfiled__' ? '' : currentFolder();
        const name = promptName('Folder name:');
        if (!name) return;
        const path = normPath(selected ? `${selected}/${name}` : name);
        if (currentTab === 'books') {
            const paths = allFolderPaths(Object.values(settings().books));
            if (paths.includes(path)) return toast('warning', 'That folder already exists.');
            // Keep empty folders in a separate list.
            settings().bookFolders ??= [];
            settings().bookFolders = allFolderPaths([...settings().bookFolders, path]);
            saveSettings();
            currentBookFolder = path;
            renderBooks();
        } else {
            if (!currentBook) return;
            const data = await loadBook(currentBook);
            const paths = entryFolderList(currentBook, data);
            if (paths.includes(path)) return toast('warning', 'That folder already exists.');
            settings().entryFolders[currentBook] = allFolderPaths([...paths, path]);
            saveSettings();
            currentEntryFolder = path;
            renderEntries();
        }
    }
    function renameFolder() {
        const oldPath = currentFolder();
        if (!oldPath || oldPath === '__unfiled__') return toast('info', 'Select a folder first.');
        const newName = promptName('Rename folder:', leafName(oldPath));
        if (!newName || newName === leafName(oldPath)) return;
        const newPath = normPath(parentPath(oldPath) ? `${parentPath(oldPath)}/${newName}` : newName);
        if (currentTab === 'books') {
            const s = settings();
            const known = allFolderPaths([...(s.bookFolders || []), ...Object.values(s.books)]);
            if (known.includes(newPath)) return toast('warning', 'A folder with that name already exists.');
            s.bookFolders = allFolderPaths((s.bookFolders || []).map(p => p === oldPath || p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p));
            for (const [book, folder] of Object.entries(s.books)) {
                if (folder === oldPath || folder.startsWith(oldPath + '/')) s.books[book] = newPath + folder.slice(oldPath.length);
            }
            saveSettings();
            currentBookFolder = newPath;
            renderBooks();
        } else {
            renameEntryFolder(oldPath, newPath);
        }
    }
    async function renameEntryFolder(oldPath, newPath) {
        const data = await loadBook(currentBook);
        const known = entryFolderList(currentBook, data);
        if (known.includes(newPath)) return toast('warning', 'A folder with that name already exists.');
        for (const entry of Object.values(data.entries || {})) {
            const p = getEntryFolder(currentBook, entry);
            if (p === oldPath || p.startsWith(oldPath + '/')) setEntryFolder(entry, newPath + p.slice(oldPath.length));
        }
        const s = settings();
        s.entryFolders[currentBook] = allFolderPaths((s.entryFolders[currentBook] || []).map(p => p === oldPath || p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p));
        try {
            await saveBook(currentBook, data);
            saveSettings();
            currentEntryFolder = newPath;
            toast('success', 'Folder renamed.');
            renderEntries();
        } catch (error) { toast('error', error.message); }
    }
    async function deleteFolder() {
        const oldPath = currentFolder();
        if (!oldPath || oldPath === '__unfiled__') return toast('info', 'Select a folder first.');
        if (!confirm(`Delete folder "${oldPath}"?\nItems inside it will move to its parent folder.`)) return;
        const parent = parentPath(oldPath);
        if (currentTab === 'books') {
            const s = settings();
            for (const [book, folder] of Object.entries(s.books)) {
                if (folder === oldPath || folder.startsWith(oldPath + '/')) {
                    const next = folder === oldPath ? parent : parent + folder.slice(oldPath.length);
                    if (next) s.books[book] = next; else delete s.books[book];
                }
            }
            s.bookFolders = (s.bookFolders || []).filter(p => p !== oldPath && !p.startsWith(oldPath + '/'));
            saveSettings();
            currentBookFolder = parent;
            renderBooks();
        } else {
            const data = await loadBook(currentBook);
            for (const entry of Object.values(data.entries || {})) {
                const p = getEntryFolder(currentBook, entry);
                if (p === oldPath || p.startsWith(oldPath + '/')) {
                    const next = p === oldPath ? parent : parent + p.slice(oldPath.length);
                    setEntryFolder(entry, next);
                }
            }
            settings().entryFolders[currentBook] = (settings().entryFolders[currentBook] || []).filter(p => p !== oldPath && !p.startsWith(oldPath + '/'));
            try {
                await saveBook(currentBook, data);
                saveSettings();
                currentEntryFolder = parent;
                renderEntries();
                toast('success', 'Folder deleted.');
            } catch (error) { toast('error', error.message); }
        }
    }
    function moveBook(name, folder) {
        setBookFolder(name, folder);
        renderBooks();
        toast('success', `Moved "${name}".`);
    }
    async function moveEntry(uid, folder) {
        const data = await loadBook(currentBook);
        const entry = data.entries?.[uid];
        if (!entry) return toast('error', 'Entry not found. Refresh and try again.');
        setEntryFolder(entry, folder);
        try {
            await saveBook(currentBook, data);
            ensureFolders(currentBook, data);
            toast('success', 'Entry moved.');
            renderEntries();
        } catch (error) {
            console.error('[Lorebook Organizer] entry save failed', error);
            toast('error', `Could not save Entry: ${error.message}`);
        }
    }
    function bookMenu(name) {
        const choice = prompt(`Manage "${name}"\n\nEnter:\n1 = Rename folder assignment\n2 = Move to Unfiled`, '1');
        if (choice === '1') {
            const target = promptName('Move to folder path (use / for nested folders):', getBookFolder(name));
            if (target !== null) {
                settings().bookFolders = allFolderPaths([...(settings().bookFolders || []), target]);
                moveBook(name, target);
            }
        } else if (choice === '2') moveBook(name, '');
    }
    function openNativeEditor() {
        const select = $('#world_editor_select');
        if (!select) return toast('warning', 'Could not find the native World Info editor.');
        const idx = cachedBooks.indexOf(currentBook);
        if (idx < 0) return;
        // The native select uses the current World Info name list ordering.
        ctx.getWorldInfoNames().then(names => {
            const realIndex = names.indexOf(currentBook);
            if (realIndex < 0) return toast('warning', 'Lorebook no longer exists.');
            select.value = String(realIndex);
            select.dispatchEvent(new Event('change', { bubbles: true }));
            closeManager();
        });
    }
    function onRootClick(event) {
        const tab = event.target.closest('[data-tab]');
        if (tab) return setTab(tab.dataset.tab);
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'close') closeManager();
        else if (action === 'refresh') getBooks().then(render);
        else if (action === 'new-folder') createFolder().catch(e => toast('error', e.message));
        else if (action === 'select-folder') setCurrentFolder(btn.dataset.folder);
        else if (action === 'choose-book') {
            currentBook = btn.dataset.book;
            currentEntryFolder = '';
            setTab('entries');
        }
        else if (action === 'book-menu') bookMenu(btn.dataset.book);
        else if (action === 'open-native') openNativeEditor();
        else if (action === 'rename-folder') renameFolder();
        else if (action === 'delete-folder') deleteFolder().catch(e => toast('error', e.message));
    }
    function onRootChange(event) {
        if (event.target.id === 'lbo-book-select') {
            currentBook = event.target.value;
            currentEntryFolder = '';
            renderEntries();
        } else if (event.target.matches('[data-action="move-entry"]')) {
            moveEntry(event.target.dataset.uid, event.target.value);
        }
    }
    function onRootInput(event) {
        if (event.target.id === 'lbo-search') {
            if (currentTab === 'books') renderBooks();
            else renderEntries();
        }
    }
    let dragData = null;
    function onDragStart(event) {
        const item = event.target.closest('[data-drag-type]');
        if (!item) return;
        dragData = { type: item.dataset.dragType, book: item.dataset.book, uid: item.dataset.uid };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    }
    function onDragOver(event) {
        if (event.target.closest('[data-action="select-folder"]')) event.preventDefault();
    }
    async function onDrop(event) {
        const target = event.target.closest('[data-action="select-folder"]');
        if (!target) return;
        event.preventDefault();
        let data = dragData;
        try { data = data || JSON.parse(event.dataTransfer.getData('text/plain')); } catch (_) {}
        dragData = null;
        const folder = target.dataset.folder === '__unfiled__' ? '' : target.dataset.folder;
        if (!data) return;
        if (data.type === 'book' && currentTab === 'books') moveBook(data.book, folder);
        if (data.type === 'entry' && currentTab === 'entries' && data.book === currentBook) await moveEntry(data.uid, folder);
    }

    function addFolderControls() {
        const toolbar = $('.lbo-toolbar-actions', $('#' + ROOT_ID));
        if (!toolbar || $('#lbo-folder-manage')) return;
        const manage = document.createElement('div');
        manage.id = 'lbo-folder-manage';
        manage.className = 'lbo-folder-manage';
        manage.innerHTML = `<button data-action="rename-folder" title="Rename selected folder">Rename</button><button data-action="delete-folder" title="Delete selected folder">Delete</button>`;
        toolbar.appendChild(manage);
    }

    async function init() {
        if (!window.SillyTavern?.getContext) {
            console.warn('[Lorebook Organizer] SillyTavern context unavailable.');
            return;
        }
        ctx = window.SillyTavern.getContext();
        settings();
        mountSettingsButton();
        // Extensions settings can be rendered after this script on some builds.
        const observer = new MutationObserver(() => mountSettingsButton());
        const host = $('#extensions_settings2') || $('#extensions_settings');
        if (host) observer.observe(host, { childList: true, subtree: true });
        if (ctx.eventSource?.on) {
            ctx.eventSource.on('WORLDINFO_UPDATED', () => {
                if ($('#' + ROOT_ID)?.classList.contains('is-open')) getBooks().then(render);
            });
        }
        console.info('[Lorebook Organizer] Loaded v0.1.0');
    }

    if (window.jQuery) window.jQuery(init);
    else document.addEventListener('DOMContentLoaded', init, { once: true });
})();