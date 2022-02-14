const { BrowserWindow } = require("electron-acrylic-window");
const { app, ipcMain,globalShortcut,Menu,Tray, dialog ,nativeImage,shell} = require('electron');
const path = require("path");
const fs = require("fs");
const fetch = require('node-fetch').default;
const config = require('./config.json');
const versionRange = require('version-range').default;
const asar = require('asar');
let win,taskTraycontextWin,taskTrayIcon;
const isWindows = process.platform == "win32";
const isMac = process.platform === 'darwin';

function MainWindow() {
    win = new BrowserWindow({
        height: 400,
        width: 300,
        resizable:false,
        frame:false,
        skipTaskbar:true,
        show:false,
        alwaysOnTop:true,
        vibrancy: isWindows ? {
            theme: 'dark',
            effect: 'acrylic',
            useCustomWindowRefreshMethod: true,
            maximumRefreshRate: 60,
            disableOnBlur: true
        }:isMac?"dark":null,
        backgroundColor:isWindows||isMac?null:"#232323",
        webPreferences: {
            //devTools:false,
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    win.loadFile(path.join(__dirname,'Application','views','index.html'));

    globalShortcut.register('Alt+V', () => {
        win.show();
    })
    globalShortcut.register('Alt+C', () => {
        win.webContents.send('copy');
    })
    //win.on('blur',()=>win.hide());

    ctrlTaskTray();

//    win.webContents.on('will-navigate',e=>e.preventDefault());

}

function taskTrayWindow(position) {
    if (taskTraycontextWin && !taskTraycontextWin.isDestroyed()) {
        taskTraycontextWin.show();
        taskTraycontextWin.focus();
        return;
    }
    
    taskTraycontextWin = new BrowserWindow({
        height: 48,
        width: 150,
        resizable: false,
        frame: false,
        skipTaskbar: true,
        x:position.x,
        y:position.y,
        alwaysOnTop:true,
        thickFrame:false,
        vibrancy: isWindows ? {
            theme: 'dark',
            effect: 'acrylic',
            useCustomWindowRefreshMethod: true,
            maximumRefreshRate: 60,
            disableOnBlur: true
        } : isMac ? "dark" : null,
        backgroundColor: isWindows||isMac?null:"#232323",
        webPreferences: {
            devTools:false,
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    taskTraycontextWin.loadFile(path.join(__dirname, 'Application',"tasktray","index.html"));
    taskTraycontextWin.on('blur', () => taskTraycontextWin.hide());
    taskTraycontextWin.webContents.on('will-navigate', e => e.preventDefault());
}


function ctrlTaskTray() {
    taskTrayIcon = new Tray(path.join(__dirname, "appIcon.png"))
    taskTrayIcon.on('click', () => win.show());
    taskTrayIcon.on('right-click', (e, bounds) => taskTrayWindow(bounds))
}

async function getUpdate(){

    console.log(`version ${config.version}`)

    /* if(config.autoUpdate){
        const newVersion = await fetch(config.updateUrl).then(res=>res.json());
        if (versionRange(config.version, `< ${newVersion.version}`)){
            console.log(newVersion.version+" is available");
            if(newVersion.newInstaller){
                dialog.showMessageBox({
                    type: 'Clipboard Plus Update',
                    title: 'Update Available',
                    message: `A new version ${newVersion.version} is available.`,
                    buttons: ['Download', 'Later']
                }, (buttonIndex) => {
                    if (buttonIndex === 0) {
                        shell.openExternal(newVersion.newInstaller);
                    }
                });
            }else if (newVersion.updateUrl) {
                    const bufferData = await fetch(newVersion.updateUrl).then(res=>res.arrayBuffer());
                    fs.writeFileSync(path.join(__dirname,"update.pack"),bufferData);
                    asar.extractAll(path.join(__dirname,"update.pack"),path.join(__dirname,"/Application"));
                    fs.unlinkSync(path.join(__dirname,"update.pack"));
                    config.version = newVersion.version;
                    fs.writeFileSync(path.join(__dirname,"config.json"),JSON.stringify(config,null,4));
            }
        }
    } */

    MainWindow();
}

app.whenReady().then(getUpdate);

app.on('will-quit',()=>{
    globalShortcut.unregisterAll()
})


ipcMain.on('quit',()=>{
    app.quit();
    process.exit(0);
})
ipcMain.on('show',()=>{
    win.show()
})
app.on('window-all-closed',()=>{
    return;
})
ipcMain.on('hide',()=>{
    win.hide();
})

const doubleboot = app.requestSingleInstanceLock();
if (!doubleboot) {
    app.quit();
}
ipcMain.on("save-image",(e,data)=>{
    const savepath = dialog.showSaveDialogSync(win,{defaultPath:"image.png"});
    if(savepath){
        fs.writeFileSync(savepath,data.toPNG(),"binary");
    }
})

ipcMain.on("open-file-img-dialog",(e,data)=>{
    const savepath = dialog.showOpenDialogSync(win,{
        properties:["openFile"],
        filters:[
            {name:"Images",extensions:["png","jpg","jpeg","jpe","jfif","gif","bmp","webp","ico","tiff","tif",]},
            {name:"All Files",extensions:["*"]}
        ]
    });
    if(savepath)e.returnValue = savepath[0]; 
    else e.returnValue = false;
})

ipcMain.on("export-json",(e,data)=>{
    const savepath = dialog.showSaveDialogSync(win,{defaultPath:"clipboardplus.json"});
    if(savepath){
        fs.writeFileSync(savepath,JSON.stringify(data),"utf8");
    }
})

ipcMain.on("import-json",(e,data)=>{
    const savepath = dialog.showOpenDialogSync(win,{
        properties:["openFile"],
        filters:[
            {name:"JSON",extensions:["json"]},
            {name:"All Files",extensions:["*"]}
        ]
    });
    if(savepath)e.returnValue = savepath[0]; 
    else e.returnValue = false;
});