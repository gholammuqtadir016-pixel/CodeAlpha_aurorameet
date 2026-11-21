export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export type User = {id:string;name:string;email:string;avatarColor:string};
export type RoomSummary = {id:string;name:string;code:string;creatorId:string;createdAt:string;_count?:{memberships:number}};
export type Room = {id:string;name:string;code:string;creatorId:string;members:User[]};
export type Message = {id:string;roomId:string;text:string;senderId:string;sender?:User;createdAt:string};
export type SharedFile = {id:string;roomId:string;name:string;mimeType:string;size:number;uploaderId:string;uploader?:User;createdAt:string};
export type Stroke = {id:string;tool:'pen'|'eraser';color:string;width:number;points:[number,number][];authorId?:string};
export type Presence = {socketId:string;user:User;mic:boolean;camera:boolean;screen:boolean};
export type RoomDetail = {room:Room;messages:Message[];files:SharedFile[];strokes:Stroke[]};
export const readToken = () => sessionStorage.getItem('aurora-token');
export const storeToken = (value:string|null) => value?sessionStorage.setItem('aurora-token',value):sessionStorage.removeItem('aurora-token');
export async function request<T>(pathname:string,options:RequestInit={}):Promise<T>{
 const res=await fetch(`${API}/api${pathname}`,{...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(readToken()?{Authorization:`Bearer ${readToken()}`}:{}) ,...options.headers}});
 if(!res.ok){const data=await res.json().catch(()=>({error:'Network error'}));throw new Error(data.error||`Request failed: ${res.status}`);}
 return res.json() as Promise<T>;
}
export function initials(name:string){return name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();}
export function displayDate(value:string){return new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
