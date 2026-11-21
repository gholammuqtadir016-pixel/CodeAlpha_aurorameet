import {useEffect,useRef,useState} from 'react';
import {MicOff,MonitorUp,VideoOff} from 'lucide-react';
import {initials,type User} from '../lib/api';

export function VideoTile({stream,user,muted=false,camera=true,mic=true,screen=false,self=false}:{stream:MediaStream|null;user:User;muted?:boolean;camera?:boolean;mic?:boolean;screen?:boolean;self?:boolean}){
 const ref=useRef<HTMLVideoElement>(null);
 const [playbackError,setPlaybackError]=useState(false);
 const video=!!stream?.getVideoTracks().some(track=>track.readyState==='live') && (camera||screen);
 useEffect(()=>{
   const element=ref.current;
   if(!element)return;
   element.srcObject=stream;
   setPlaybackError(false);
   if(!stream)return;
   const play=()=>{void element.play().then(()=>setPlaybackError(false)).catch(error=>{
     console.warn('Video playback blocked',error);
     setPlaybackError(true);
   });};
   element.addEventListener('loadedmetadata',play);
   play();
   return()=>{element.removeEventListener('loadedmetadata',play);element.pause();element.srcObject=null;};
 },[stream]);
 return <div className="video-tile">
   <video ref={ref} autoPlay playsInline muted={muted} className={`${video?'':'video-invisible'} ${self&&!screen?'mirror':''}`}/>
   {!video&&<div className="video-placeholder"><div className="avatar huge" style={{background:user.avatarColor}}>{initials(user.name)}</div><span>{camera?'Waiting for video…':'Camera off'}</span></div>}
   {video&&playbackError&&<button type="button" className="video-playback-retry" onClick={()=>void ref.current?.play().then(()=>setPlaybackError(false)).catch(()=>setPlaybackError(true))}>Click to start video</button>}
   <div className="video-label"><span>{user.name}{self?' (You)':''}</span>{screen&&<MonitorUp size={14}/>} {!mic&&<MicOff size={14}/>} {!camera&&!screen&&<VideoOff size={14}/>}</div><span className="video-corner"/>
 </div>;
}
