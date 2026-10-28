import {catalog,initialInventory,settle} from './core.js?v=2';
// Demo state is intentionally client-owned. Never use this adapter for real items.
export class DemoAdapter{
 constructor(){this.key='uebki-upgrader-demo-v2';this.memory={inventory:initialInventory(),history:[]};}
 async load(){try{return JSON.parse(localStorage.getItem(this.key))||this.memory;}catch{return this.memory;}}
 async bootstrap(){return{...await this.load(),catalog,mode:'demo'};}
 async upgrade(request){const run=async()=>{const state=await this.load();const previous=state.history.find(r=>r.id===request.requestId);if(previous)return{...state,result:previous};const roll=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;const next=settle(state,request,roll);this.memory={inventory:next.inventory,history:next.history};try{localStorage.setItem(this.key,JSON.stringify(this.memory));}catch{}return next;};return navigator.locks? navigator.locks.request(this.key,run):run();}
 async reset(){this.memory={inventory:initialInventory(),history:[]};try{localStorage.setItem(this.key,JSON.stringify(this.memory));}catch{}return this.bootstrap();}
}
export class HttpAdapter{
 constructor(base='/api/upgrader'){this.base=base;}
 async call(path,body){const response=await fetch(this.base+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});if(!response.ok)throw Error('Сервер не подтвердил операцию. Обновите инвентарь перед повторной попыткой.');return response.json();}
 bootstrap(){return this.call('/state');} upgrade(request){return this.call('/upgrade',request);}
}
