// Owner's character inspection menu: Ctrl + backtick. No title-screen button.
const style = document.createElement('style');
style.textContent = `#characterPreviewMenu{position:fixed;inset:0;width:min(94vw,1400px);height:min(92vh,960px);padding:0;border:1px solid #455372;border-radius:12px;background:#10151d;color:#eef2fb;z-index:10000}#characterPreviewMenu::backdrop{background:#000b}#characterPreviewMenu header{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;background:#182231;font:15px system-ui}#characterPreviewMenu select{border:1px solid #596981;background:#243249;color:#fff;border-radius:6px;padding:5px 10px;margin-left:12px}#characterPreviewMenu button{border:1px solid #596981;background:#243249;color:#fff;border-radius:6px;padding:5px 12px;cursor:pointer}#characterPreviewMenu iframe{width:100%;height:calc(100% - 48px);border:0;display:block}`;
document.head.append(style);
let dialog;
function toggle() {
  if (!dialog) {
    dialog = document.createElement('dialog');dialog.id = 'characterPreviewMenu';
    dialog.setAttribute('aria-label', 'Character preview menu');
    dialog.innerHTML = '<header><label>Character preview <select aria-label="Preview character"><option value="blue">Tomas Voss / Blue</option><option value="violet">Leonie Vesper / Violet</option><option value="white">Dr. Elian Frost / White</option><option value="green">Sera Moss / Green</option><option value="red">Mara Vale / Red</option><option value="yellow">Ivo Quill / Yellow</option><option value="copper">Nessa Calder / Copper</option><option value="teal">Basil Reed / Teal</option><option value="butler">Mr. Grimsby / Butler</option></select></label><button type="button" aria-label="Close character preview">Close</button></header><iframe title="Tomas Voss character preview"></iframe>';
    function showCharacter(id) {
      const fallback=['red','yellow','copper','teal','butler'].includes(id);
      const url = new URL(fallback ? './hair-preview.html' : id === 'green' ? './green-preview.html' : id === 'white' ? './white-preview.html' : id === 'violet' ? './violet-preview.html' : './blue-preview.html', document.baseURI);
      if(fallback)url.searchParams.set('character',id);
      const version = new URL(location.href).searchParams.get('v');
      if (version) url.searchParams.set('v', version);
      const frame = dialog.querySelector('iframe');
      frame.title = fallback ? 'Guest hair character preview' : id === 'green' ? 'Sera Moss character preview' : id === 'white' ? 'Dr. Elian Frost character preview' : id === 'violet' ? 'Leonie Vesper character preview' : 'Tomas Voss character preview';
      frame.dataset.url=url.href;frame.src = url.href;
    }
    dialog.querySelector('select').onchange = event => showCharacter(event.target.value);
    showCharacter('blue');
    dialog.addEventListener('close',()=>{dialog.querySelector('iframe').src='about:blank';});
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  if (dialog.open) dialog.close(); else {const frame=dialog.querySelector('iframe');if(frame.src==='about:blank')frame.src=frame.dataset.url;dialog.showModal();}
}
function shortcut(event) {
  if (event.ctrlKey && !event.altKey && !event.metaKey && (event.code === 'Backquote' || event.key === '`') && !event.repeat) {
    event.preventDefault(); event.stopPropagation(); toggle();
  }
}
document.addEventListener('keydown', shortcut, true);
// Key events in the preview iframe are delivered here by its own script.
addEventListener('message', event => {
  if (dialog && event.source === dialog.querySelector('iframe').contentWindow && event.origin === location.origin && event.data?.type === 'character-preview-close') dialog.close();
});
