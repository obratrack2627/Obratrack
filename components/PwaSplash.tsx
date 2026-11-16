'use client';
import {useEffect,useState} from 'react';
import {ObraTrackIcon} from './Logo';

export default function PwaSplash(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  if(!matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & {standalone?:boolean}).standalone)return;
  // Only the app's initial boot, never every client-side navigation.
  const timer=setTimeout(()=>setReady(true),700);
  return ()=>clearTimeout(timer);
 },[]);
 if(ready)return null;
 return <div className="pwa-splash" role="status" aria-label="Cargando ObraTrack">
  <svg className="pwa-splash-blueprint" viewBox="0 0 400 240" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth=".7"><path d="M12 163 213 48 392 157M12 175 213 61 392 170M30 165v70l182-4 161 9v-78M212 61v170M83 137v96M151 98v134M270 97v138M328 132v105M0 235h400M0 181 212 67l188 116M12 163v12l200-103 180 98"/><path opacity=".4" d="M0 205h400M18 150v90M225 40v200M70 120v120M340 120v120"/></g></svg>
  <div className="pwa-splash-brand">
   <ObraTrackIcon theme="dark" className="pwa-splash-icon"/>
   <div className="pwa-splash-name"><span>Obra</span>Track</div>
   <p>Tus obras bajo control</p>
   <div className="pwa-splash-dots" aria-hidden="true"><i/><i/><i/></div>
  </div>
 </div>;
}
