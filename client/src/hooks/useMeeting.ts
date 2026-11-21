import {useCallback,useEffect,useRef,useState} from 'react';
import {io,type Socket} from 'socket.io-client';
import {API,readToken,type Presence,type Message,type SharedFile,type Stroke} from '../lib/api';
import {toast} from 'sonner';
const iceServers:RTCIceServer[]=[{urls:'stun:stun.l.google.com:19302'}];
if(import.meta.env.VITE_TURN_URL)iceServers.push({urls:import.meta.env.VITE_TURN_URL,username:import.meta.env.VITE_TURN_USERNAME||'',credential:import.meta.env.VITE_TURN_CREDENTIAL||''});
export type RemoteStream={socketId:string;stream:MediaStream};
type Signal={from:string;data:{type:'offer'|'answer'|'candidate';sdp?:RTCSessionDescriptionInit;candidate?:RTCIceCandidateInit}};
export function useMeeting(roomId:string,enabled=true){
 const [connected,setConnected]=useState(false);const [presence,setPresence]=useState<Presence[]>([]);const [remoteStreams,setRemoteStreams]=useState<RemoteStream[]>([]);const [localStream,setLocalStream]=useState<MediaStream|null>(null);const [screenStream,setScreenStream]=useState<MediaStream|null>(null);const [mic,setMic]=useState(true);const [camera,setCamera]=useState(true);const [screen,setScreen]=useState(false);const [events,setEvents]=useState<{message?:Message;file?:SharedFile;stroke?:Stroke;clear?:true}|null>(null);const [mediaWarning,setMediaWarning]=useState<string|null>(null);
 const socketRef=useRef<Socket|null>(null);const peersRef=useRef(new Map<string,RTCPeerConnection>());const localRef=useRef<MediaStream|null>(null);const screenRef=useRef<MediaStream|null>(null);const queuedCandidates=useRef(new Map<string,RTCIceCandidateInit[]>());const micRef=useRef(true);const cameraRef=useRef(true);
 const closePeer=useCallback((id:string)=>{peersRef.current.get(id)?.close();peersRef.current.delete(id);queuedCandidates.current.delete(id);setRemoteStreams(v=>v.filter(p=>p.socketId!==id));},[]);
 const createPeer=useCallback((id:string)=>{const existing=peersRef.current.get(id);if(existing)return existing;const pc=new RTCPeerConnection({iceServers});peersRef.current.set(id,pc);for(const track of localRef.current?.getTracks()||[]){const activeTrack=track.kind==='video'?(screenRef.current?.getVideoTracks()[0]||track):track;pc.addTrack(activeTrack,activeTrack===track?localRef.current!:screenRef.current!);}pc.onicecandidate=e=>{if(e.candidate)socketRef.current?.emit('peer:signal',{to:id,data:{type:'candidate',candidate:e.candidate.toJSON()}});};pc.ontrack=e=>{const stream=e.streams[0]||new MediaStream([e.track]);setRemoteStreams(v=>[...v.filter(p=>p.socketId!==id),{socketId:id,stream}]);};pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'||pc.connectionState==='closed')closePeer(id);};return pc;},[closePeer]);
 const offer=useCallback(async(id:string)=>{try{const pc=createPeer(id);const desc=await pc.createOffer();await pc.setLocalDescription(desc);socketRef.current?.emit('peer:signal',{to:id,data:{type:'offer',sdp:pc.localDescription}});}catch(e){console.error('Offer failed',e);}},[createPeer]);
 useEffect(()=>{if(!enabled)return;let cancelled=false;const socket=io(API,{auth:{token:readToken()},autoConnect:false,reconnectionAttempts:8});socketRef.current=socket;
 const processSignal=async({from,data}:Signal)=>{try{const pc=createPeer(from);if(data.type==='candidate'&&data.candidate){if(pc.remoteDescription)await pc.addIceCandidate(data.candidate);else queuedCandidates.current.set(from,[...(queuedCandidates.current.get(from)||[]),data.candidate]);return;}if(!data.sdp)return;await pc.setRemoteDescription(data.sdp);const queued=queuedCandidates.current.get(from)||[];queuedCandidates.current.delete(from);for(const candidate of queued)await pc.addIceCandidate(candidate);if(data.type==='offer'){const answer=await pc.createAnswer();await pc.setLocalDescription(answer);socket.emit('peer:signal',{to:from,data:{type:'answer',sdp:pc.localDescription}});}}catch(e){console.error('Signal handling failed',e);}};
 socket.on('connect',()=>{socket.emit('room:join',{roomId},(response:{peers?:Presence[];error?:string})=>{if(response.error){toast.error(response.error);return;}setConnected(true);for(const peer of response.peers||[])void offer(peer.socketId);});});
 socket.on('connect_error',e=>toast.error(`Connection failed: ${e.message}`));socket.on('disconnect',()=>{setConnected(false);setPresence([]);for(const peer of peersRef.current.values())peer.close();peersRef.current.clear();setRemoteStreams([]);});
 socket.on('room:presence',(items:Presence[])=>setPresence(items));socket.on('peer:joined',()=>{});socket.on('peer:left',({socketId}:{socketId:string})=>closePeer(socketId));socket.on('peer:signal',(signal:Signal)=>void processSignal(signal));
 socket.on('chat:new',(message:Message)=>setEvents({message}));socket.on('file:new',(file:SharedFile)=>setEvents({file}));socket.on('whiteboard:stroke',(stroke:Stroke)=>setEvents({stroke}));socket.on('whiteboard:clear',()=>setEvents({clear:true}));
 // Request camera and microphone separately: denying one must not disable the other.
 // This also avoids an all-or-nothing black tile when only one device is available.
 (async()=>{
   const tracks:MediaStreamTrack[]=[];
   const failures:string[]=[];
   if(!navigator.mediaDevices?.getUserMedia){
     failures.push('Media devices are unavailable. Open the app using localhost or HTTPS.');
   }else{
     try{
       const video=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false});
       tracks.push(...video.getVideoTracks());
     }catch(e){console.warn('Camera permission/device error',e);failures.push('Camera unavailable or permission denied');}
     if(cancelled){tracks.forEach(t=>t.stop());return;}
     try{
       const audio=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
       tracks.push(...audio.getAudioTracks());
     }catch(e){console.warn('Microphone permission/device error',e);failures.push('Microphone unavailable or permission denied');}
   }
   if(cancelled){tracks.forEach(t=>t.stop());return;}
   const stream=new MediaStream(tracks);
   localRef.current=stream;
   setLocalStream(stream);
   const hasVideo=stream.getVideoTracks().length>0;
   const hasAudio=stream.getAudioTracks().length>0;
   cameraRef.current=hasVideo;micRef.current=hasAudio;
   setCamera(hasVideo);setMic(hasAudio);
   if(failures.length){
     const warning=failures.join('. ')+'. Check site permissions and Windows privacy settings, then reload.';
     setMediaWarning(warning);
     toast.warning(warning,{duration:9000});
   }else setMediaWarning(null);
   socket.connect();
 })().catch(e=>{
   console.error('Media initialization failed',e);
   if(!cancelled){setMediaWarning('Media initialization failed. Check browser permissions and reload.');socket.connect();}
 });
 return()=>{cancelled=true;socket.emit('room:leave');socket.disconnect();for(const pc of peersRef.current.values())pc.close();peersRef.current.clear();queuedCandidates.current.clear();localRef.current?.getTracks().forEach(t=>t.stop());localRef.current=null;screenRef.current?.getTracks().forEach(t=>t.stop());screenRef.current=null;socketRef.current=null;};
 },[roomId,enabled,offer,createPeer,closePeer]);
 const toggleMic=()=>{const next=!micRef.current;micRef.current=next;localRef.current?.getAudioTracks().forEach(t=>t.enabled=next);setMic(next);socketRef.current?.emit('peer:media',{mic:next});};
 const toggleCamera=()=>{if(!localRef.current?.getVideoTracks().length){toast.info('No camera was detected. Check your browser permissions and rejoin.');return;}const next=!cameraRef.current;cameraRef.current=next;localRef.current?.getVideoTracks().forEach(t=>t.enabled=next);setCamera(next);socketRef.current?.emit('peer:media',{camera:next});};
 const stopScreen=useCallback(async()=>{screenRef.current?.getTracks().forEach(t=>t.stop());screenRef.current=null;setScreenStream(null);setScreen(false);const cameraTrack=localRef.current?.getVideoTracks()[0];for(const pc of peersRef.current.values()){const sender=pc.getSenders().find(s=>s.track?.kind==='video');if(sender)await sender.replaceTrack(cameraTrack||null);}socketRef.current?.emit('peer:media',{screen:false});},[]);
 const toggleScreen=async()=>{if(screenRef.current){await stopScreen();return;}try{const capture=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});const track=capture.getVideoTracks()[0];for(const pc of peersRef.current.values()){const sender=pc.getSenders().find(s=>s.track?.kind==='video');if(sender)await sender.replaceTrack(track);else{pc.addTrack(track,capture);const desc=await pc.createOffer();await pc.setLocalDescription(desc);const id=[...peersRef.current].find(([,p])=>p===pc)?.[0];if(id)socketRef.current?.emit('peer:signal',{to:id,data:{type:'offer',sdp:pc.localDescription}});}}screenRef.current=capture;setScreenStream(capture);setScreen(true);track.onended=()=>void stopScreen();socketRef.current?.emit('peer:media',{screen:true});}catch{toast.error('Screen sharing was cancelled or unavailable');}};
 const sendMessage=(text:string)=>new Promise<void>((resolve,reject)=>{if(!socketRef.current?.connected)return reject(new Error('You are not connected'));socketRef.current.emit('chat:send',{text},(response:{ok?:boolean;error?:string})=>response?.error?reject(new Error(response.error)):resolve());});
 const sendStroke=(stroke:Stroke)=>socketRef.current?.emit('whiteboard:stroke',stroke,(res:{error?:string})=>{if(res?.error)toast.error(res.error);});
 const clearBoard=()=>socketRef.current?.emit('whiteboard:clear',{},(res:{error?:string})=>{if(res?.error)toast.error(res.error);});
 return {connected,presence,remoteStreams,localStream,screenStream,mic,camera,screen,events,mediaWarning,toggleMic,toggleCamera,toggleScreen,sendMessage,sendStroke,clearBoard};
}
