"use strict";
const {ipcRenderer,clipboard, nativeImage} = require('electron');
const path = require('path');
const fs = require('fs');
const autoLaunch  = require('auto-launch');
const isUrl = require('is-url');
const isSvg = require('is-svg');
const byteSize = require('byte-size');

var appLauncher = new autoLaunch({
    name: 'Clipboard Plus',
    path: process.execPath
});

let clips = [];

let openEditorFlag = false;

window.addEventListener('load',init)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function readJson(file) {
    let json = fs.readFileSync(file, 'utf8');
    return JSON.parse(json);
}

function writeJson(file,data) {
    let json = JSON.stringify(data,null,4);
    fs.writeFileSync(file, json);
}
function arrayChunk([...array], size = 1){
    return array.reduce((acc, value, index) => index % size ? acc : [...acc, array.slice(index, index + size)], []);
}

function getSize(size){
    return byteSize(size, { units: 'iec' });
}

ipcRenderer.on('copy', () => {
    let data;
    if (clipboard.availableFormats().includes("image/png")) data = { type: "image", data: clipboard.readImage().toDataURL() };
    else {
        data = clipboard.readText();
        if (isUrl(data)) data = { type: "url", data: data };
        else if (isSvg(data)) data = { type: "svg", data: data };
        else data = { type: "string", data: data };
    }
    clips.unshift(data);
    writeJson(path.join(__dirname, "../../data.json"), { contents: clips });
    loadClipboard();
})

function init() {
    loadClipboard();
    document.querySelectorAll('img').forEach(img=>img.draggable=false);
    appLauncher.isEnabled().then(e=>document.querySelector('#toggle-autolaunch').checked=e);
}

function hideWindow(){
    ipcRenderer.send('hide')
}

async function loadClipboard() {
    document.querySelector('#clipboard').innerHTML = '';
    clips = readJson(path.join(__dirname,"../../data.json")).contents;
    for (const clip in clips) {
        const div = document.createElement("div");
        div.classList.add("clip");
        div.setAttribute('content-id', clip);

        const content = document.createElement("div");
        content.classList.add("content");
        switch(clips[clip].type) {
            case "string":
                content.innerText = clips[clip].data;
                break;
            case "image":
                const image = document.createElement("img");
                image.src = clips[clip].data;
                content.append(image);
                break;
            case "url":
                const span = document.createElement("span");
                span.classList.add("url");
                span.innerText = clips[clip].data;
                content.append(span);
                break;
            case "svg":
                content.innerHTML = clips[clip].data
            break;
        }
        div.append(content);
        
        div.setAttribute('content-data', clips[clip].data);
        div.setAttribute('content-type', clips[clip].type);

        div.addEventListener('click', e => {
            e.stopPropagation();
            if (clips[clip].type == "image") clipboard.writeImage(nativeImage.createFromDataURL(clips[clip].data));
            else clipboard.writeText(clips[clip].data);
        })

        const editBtn = document.createElement('img');
        editBtn.src = path.join(__dirname,"../src/img/edit.svg");
        editBtn.addEventListener('click',e=>{
            e.stopPropagation();
            if(div.getAttribute("content-type")=="image") openImageEditor(clip);
            else openTextEditor(clip);
        });
        div.append(editBtn);
       
        const deleteBtn = document.createElement('img');
        deleteBtn.src = path.join(__dirname,"../src/img/x.svg");
        deleteBtn.addEventListener('click',e=>{
            e.stopPropagation();
            deleteClip(clip)
        });
        div.append(deleteBtn);

        document.querySelector("#clipboard").append(div);
        div.style.animation = "slideIn 0.2s ease forwards";
        await sleep(10)
    }
}


function deleteClip(id) {
    clips.splice(id,1);
    writeJson(path.join(__dirname, "../../data.json"), { contents: clips });
    document.querySelector(`.clip[content-id="${id}"]`).style.animation = "slideOut 0.2s ease forwards";
    setTimeout(()=>{
        document.querySelector(`.clip[content-id="${id}"]`).style.height = "0px";
        setTimeout(()=>document.querySelector(`.clip[content-id="${id}"]`).remove(),200)
    }
    ,200);
}

function openTextEditor(id) {
    const editor = document.querySelector("#editor");
    const clip = document.querySelector(`.clip[content-id="${id}"]`);
    const content = clip.getAttribute('content-data');
    const type = clip.getAttribute('content-type');
    const x = clip.offsetLeft;
    const y = clip.offsetTop;
    editor.style.left = x + "px";
    editor.style.top = y + "px";
    editor.style.display = "grid";
    editor.style.animation = "showEditor 0.2s ease-out forwards";


    document.querySelector("#clipboard").classList.add("blur");
    document.querySelector("#editor-input").focus();
    document.querySelector("#editor-input").contentEditable = true;
    openEditorFlag = true;

    (async () => {
        document.querySelector("#editor-input").innerText = "";
        if (content.length <10240) {
            document.querySelector("#editor-input").innerText = content;
            getEditorContentSize();
        }
        else if(content.length>204800){
            document.querySelector("#editor-input").innerText = "Sorry, the file is too big to be edited.\nOnly data of 200kib or less can be edited.";
            document.querySelector("#editor-input").contentEditable = false;
            document.querySelector("#editor-footer-size").innerText = getSize(content).toString();
            editor.setAttribute('toobig',true);
        }
        else {
            const chunks = arrayChunk(content,1000);
            console.log(chunks);
            for (const i of chunks) {
                if(!openEditorFlag) break;
                console.log(document.querySelector("#editor-input").innerText.length);
                document.querySelector("#editor-input").innerText += i.join('');
                getEditorContentSize();
                await sleep(10);

            }
        }
    })();

    editor.setAttribute('content-id', id);
    document.querySelector("#editor-footer-type").innerText = type.toUpperCase();
    
    document.querySelector("#editor-input").addEventListener('input',getEditorContentSize);

}

function closeEditor() {
    openEditorFlag = false;
    const editor = document.querySelector("#editor");
    editor.style.animation = "hideEditor 0.2s ease-out forwards";
    document.querySelector("#editor-input").classList.remove("image-editor");
    document.querySelector("#editor-input").removeEventListener('input', getEditorContentSize);
    setTimeout(()=>{
        editor.style.display = "none";
        document.querySelector("#clipboard").classList.remove("blur");
    },200);
}
function saveEditor() {
    const editor = document.querySelector("#editor");
    const id = editor.getAttribute('content-id');
    let content,data;
    if (document.querySelector("#editor-input").classList.contains("image-editor")) content = document.querySelector("#editor-input>img").src;
    else content = document.querySelector("#editor-input").innerText;
    if (!nativeImage.createFromDataURL(content).isEmpty()) data = { type: "image", data: content };
    else if (isUrl(content)) data = { type: "url", data: content };
    else if (isSvg(content)) data = { type: "svg", data: content };
    else data = { type: "string", data: content };
    clips[id] = data;
    writeJson(path.join(__dirname, "../../data.json"), { contents: clips });
    document.querySelector(`.clip[content-id="${id}"]`).setAttribute('content-data', content);
    document.querySelector(`.clip[content-id="${id}"]>.content`)
    loadClipboard();
    closeEditor();
}
function getEditorContentSize() {
    const content = document.querySelector("#editor-input").innerText;
    document.querySelector("#editor-footer-size").innerText = getSize(content.length).toString();
}
function openEditorContext(e){
    document.querySelector("#editor-context").style.display = "block";
    document.body.addEventListener('mouseup', hideFunc);
}

function hideFunc() {
    document.querySelectorAll('.contextmenu').forEach(menu => menu.style.display = "none");
    document.body.removeEventListener('mouseup', hideFunc);
}
function clearEditor(){
    if(document.querySelector("#editor-input").classList.contains("image-editor")) return;
    document.querySelector("#editor-input").innerText = "";
    getEditorContentSize();
}
function saveAsNewClipFromEditor(){
    const editor = document.querySelector("#editor");
    const id = editor.getAttribute('content-id');
    let content;
    if (document.querySelector("#editor-input").classList.contains("image-editor")) content = document.querySelector("#editor-input>img").src;
    else content = document.querySelector("#editor-input").innerText;
    let data;
    if(editor.getAttribute('toobig')) {
        data = {
            type: clips[id].type,
            data: clips[id].data
        }
    }else{
        if (!nativeImage.createFromDataURL(content).isEmpty()) data = { type: "image", data: content };
        else if (isUrl(content)) data = { type: "url", data: content };
        else if (isSvg(content)) data = { type: "svg", data: content };
        else data = { type: "string", data: content };
    }
    
    const newClip = clips.unshift(data);
    writeJson(path.join(__dirname, "../../data.json"), { contents: clips });
    loadClipboard();
    closeEditor();
}

function openImageEditor(id){
    const editor = document.querySelector("#editor");
    const clip = document.querySelector(`.clip[content-id="${id}"]`);
    const content = clip.getAttribute('content-data');
    const type = clip.getAttribute('content-type');
    const x = clip.offsetLeft;
    const y = clip.offsetTop;
    editor.style.left = x + "px";
    editor.style.top = y + "px";
    editor.style.display = "grid";
    editor.style.animation = "showEditor 0.2s ease-out forwards";    
    document.querySelector("#editor-input").classList.add("image-editor");

    document.querySelector("#clipboard").classList.add("blur");
    document.querySelector("#editor-input").focus();
    document.querySelector("#editor-input").contentEditable = false;
    openEditorFlag = true;
    document.querySelector("#editor-input").innerHTML = "";

    const img = document.createElement('img');
    img.src = content;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "calc(100% - 48px)";
    editor.setAttribute('image-data', content);

    const interaction = document.createElement('div');
    interaction.id = "editor-image-interaction";

    const downloadbtn = document.createElement('button');
    downloadbtn.innerText = "Save as...";
    downloadbtn.addEventListener('click', () => {
        const data = nativeImage.createFromDataURL(content);
        ipcRenderer.send('save-image', data);
    });

    const replacebtn = document.createElement('button');
    replacebtn.innerText = "Upload image and replace";
    replacebtn.addEventListener('click', () => {
        const data = ipcRenderer.sendSync('open-file-img-dialog',"image");
        if(!data)  return;
        const image  = fs.readFileSync(data,"binary");
        const base64 = Buffer.from(image, 'binary').toString('base64');
        document.querySelector("#editor-input>img").src = `data:image/png;base64,${base64}`;

        document.querySelector("#editor-footer-size").innerText = getSize(base64.length).toString();
    })

    interaction.append(downloadbtn,replacebtn);

    document.querySelector("#editor-input").append(img,interaction);
    document.querySelector("#editor-footer-type").innerText = type.toUpperCase();
    document.querySelector("#editor-footer-size").innerText = getSize(content.length).toString();

    editor.setAttribute('content-id', id);



}

function showMenu() {
    document.querySelector("#menu").style.display = "block";
    document.querySelector("#menu").style.animation = "fadeIn 0.2s ease-out forwards";
    document.querySelector("#clipboard").classList.add("blur");
}

function hideOverlay(elem){
    
    if(typeof elem == "string"){
        document.querySelector(elem).style.animation = "fadeOut 0.2s ease-out forwards";
        document.querySelector("#clipboard").classList.remove("blur");
        setTimeout(() => {
            document.querySelector(elem).style.display = "none";
        }, 200);
    }else if(elem){
        elem.parentElement.parentElement.style.animation = "fadeOut 0.2s ease-out forwards";
        document.querySelector("#clipboard").classList.remove("blur");
        setTimeout(() => {
            elem.parentElement.parentElement.style.display = "none";
        }, 200);

    }else{
        document.querySelectorAll(".overlay-page").forEach(overlay => {
            overlay.style.animation = "fadeOut 0.2s ease-out forwards";
            setTimeout(() => {
                overlay.style.display = "none";
            }, 200);
        });
        document.querySelector("#clipboard").classList.remove("blur");
    }
}

function newBlankClip(){
    clips.unshift({ type: "string", data: "" });
    writeJson(path.join(__dirname, "../../data.json"), { contents: clips });
    loadClipboard();
    hideOverlay();
}

function exportJson(){
    ipcRenderer.send('export-json', clips);
}

function importJson(type){
    const data = ipcRenderer.sendSync('import-json');
    if(!data) return;
    const jsonData = JSON.parse(fs.readFileSync(data, "utf8"));
    console.log(jsonData);
    if(type) clips = jsonData;
    else {
        for (const i of jsonData) {
            clips.unshift(i);
        }
    }
    writeJson(path.join(__dirname, "../../data.json"), { contents: clips });
    loadClipboard();
    hideOverlay();
}

document.querySelector("#toggle-autolaunch").addEventListener('change', e => {
    if(e.target.checked){
        appLauncher.enable();
    }else{
        appLauncher.disable();
    }
})