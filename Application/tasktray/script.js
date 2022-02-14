const ipcRenderer = require('electron').ipcRenderer;
function show(){
    ipcRenderer.send('show');
}
function quit(){
    ipcRenderer.send('quit');
}