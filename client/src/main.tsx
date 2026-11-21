import React from 'react';
import {MeetingErrorBoundary} from './components/MeetingErrorBoundary';
import ReactDOM from 'react-dom/client';
import {BrowserRouter,Navigate,Route,Routes} from 'react-router-dom';
import {Toaster} from 'sonner';
import {AuthProvider,useAuth} from './lib/auth';
import {AuthPage,Dashboard,MeetingPage} from './pages';
import './styles.css';
import './midnight-aurora.css';
function Guard({children}:{children:React.ReactNode}){const {user,loading}=useAuth();if(loading)return <div className="loading-screen"><span className="brand-mark">✳</span><p>Preparing your workspace...</p></div>;return user?<>{children}</>:<Navigate to="/login" replace/>;}
function RedirectLogin(){const {user}=useAuth();return user?<Navigate to="/dashboard" replace/>:<AuthPage/>;}
ReactDOM.createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><Routes><Route path="/login" element={<RedirectLogin/>}/><Route path="/dashboard" element={<Guard><Dashboard/></Guard>}/><Route path="/room/:id" element={<Guard><MeetingErrorBoundary><MeetingPage/></MeetingErrorBoundary></Guard>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes><Toaster position="top-right" richColors theme="dark"/></AuthProvider></BrowserRouter>);
