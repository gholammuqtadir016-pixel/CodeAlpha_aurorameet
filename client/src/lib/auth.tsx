import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import {request,readToken,storeToken,type User} from './api';
type Context={user:User|null;loading:boolean;login:(email:string,password:string)=>Promise<void>;register:(name:string,email:string,password:string)=>Promise<void>;logout:()=>void};
const AuthContext=createContext<Context|null>(null);
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);
useEffect(()=>{if(!readToken()){setLoading(false);return;}request<{user:User}>('/me').then(d=>setUser(d.user)).catch(()=>storeToken(null)).finally(()=>setLoading(false));},[]);
const submit=useCallback(async(path:string,body:object)=>{const data=await request<{token:string;user:User}>(path,{method:'POST',body:JSON.stringify(body)});storeToken(data.token);setUser(data.user);},[]);
const logout=useCallback(()=>{storeToken(null);setUser(null);},[]);
return <AuthContext.Provider value={{user,loading,login:(email,password)=>submit('/auth/login',{email,password}),register:(name,email,password)=>submit('/auth/register',{name,email,password}),logout}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider missing');return value;}
