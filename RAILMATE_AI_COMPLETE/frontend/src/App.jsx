import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, AudioLines, Bell,
  Bot, Check, ChevronDown, CircleHelp, Clock3, LayoutDashboard, LogOut,
  Megaphone, Menu, MessageCircle, Mic2, Moon, Play, Plus, QrCode, Radio,
  RefreshCw, Search, Settings, ShieldCheck, TrainFront, Volume2, X
} from 'lucide-react'
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const initialTrainFallback = [
  {id:1,train_number:'RB-214',train_name:'Coastal Express',source:'Harbor City',destination:'Central Junction',arrival_time:'08:02',departure_time:'08:10',platform_number:4,status:'On Time',delay_minutes:0,is_demo:true},
  {id:2,train_number:'RB-605',train_name:'Northline Limited',source:'Northgate',destination:'Central Junction',arrival_time:'08:18',departure_time:'08:25',platform_number:2,status:'Delayed',delay_minutes:12,is_demo:true},
  {id:3,train_number:'RB-311',train_name:'Valley Connector',source:'Central Junction',destination:'Green Valley',arrival_time:'08:40',departure_time:'08:45',platform_number:7,status:'Boarding',delay_minutes:0,is_demo:true},
  {id:4,train_number:'RB-902',train_name:'Capital Runner',source:'Eastport',destination:'Central Junction',arrival_time:'09:24',departure_time:'09:30',platform_number:6,status:'On Time',delay_minutes:0,is_demo:true},
  {id:5,train_number:'RB-447',train_name:'Lake District Service',source:'Central Junction',destination:'Lakeside',arrival_time:'09:55',departure_time:'10:00',platform_number:5,status:'On Time',delay_minutes:0,is_demo:true}
]
const nav = [
  ['Overview',LayoutDashboard],['Train board',TrainFront],['Platforms',Radio],
  ['Announcements',Megaphone],['Passenger assistant',Bot],['Analytics',Activity],['Emergency log',ShieldCheck]
]
function App(){
  const [page,setPage]=useState('Overview'), [trains,setTrains]=useState(initialTrainFallback)
  const [platforms,setPlatforms]=useState([]), [announcements,setAnnouncements]=useState([])
  const [notifications,setNotifications]=useState([]), [summary,setSummary]=useState({})
  const [query,setQuery]=useState(''), [token,setToken]=useState(localStorage.getItem('rail_token')||'')
  const [loginOpen,setLoginOpen]=useState(false), [username,setUsername]=useState('admin'), [password,setPassword]=useState('RailMate@123')
  const [toast,setToast]=useState(''), [loading,setLoading]=useState(false), [mobileNav,setMobileNav]=useState(false)
  const [assistantQuestion,setAssistantQuestion]=useState('Where is Coastal Express?'), [chat,setChat]=useState([])
  const [announce,setAnnounce]=useState({train_id:'1',category:'arrival',language:'en',extra_instructions:''})
  const [showTrainForm,setShowTrainForm]=useState(false)
  const [trainForm,setTrainForm]=useState({train_number:'',train_name:'',source:'',destination:'',arrival_time:'10:30',departure_time:'10:35',platform_number:1,status:'On Time',delay_minutes:0})
  const [emergency,setEmergency]=useState({category:'Medical',location:'Platform 1',message:''})
  const [dark,setDark]=useState(true)
  const headers=useMemo(()=>token?{'Content-Type':'application/json','Authorization':`Bearer ${token}`}:{'Content-Type':'application/json'},[token])
  const notify=(s)=>{setToast(s);setTimeout(()=>setToast(''),3200)}
  async function api(path,opts={}){
    const res=await fetch(API+path,{...opts,headers:{...headers,...opts.headers}})
    const data=await res.json().catch(()=>({detail:'Unexpected server response'}))
    if(!res.ok) throw new Error(data.detail||`Request failed (${res.status})`)
    return data
  }
  async function refresh(){
    setLoading(true)
    try{
      const [t,p,a,n,s]=await Promise.all([
        api('/api/trains'),api('/api/platforms'),api('/api/announcements'),api('/api/notifications'),api('/api/analytics/summary')
      ])
      setTrains(t);setPlatforms(p);setAnnouncements(a);setNotifications(n);setSummary(s)
    }catch(e){notify(`Backend connection: ${e.message}. Start FastAPI to load saved data.`)}
    finally{setLoading(false)}
  }
  useEffect(()=>{refresh()},[])
  async function doLogin(e){
    e.preventDefault()
    try{const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});localStorage.setItem('rail_token',d.access_token);setToken(d.access_token);setLoginOpen(false);notify('Admin signed in');}
    catch(e){notify(e.message)}
  }
  async function createAnnouncement(e){
    e.preventDefault()
    try{const d=await api('/api/announcements/generate',{method:'POST',body:JSON.stringify({...announce,train_id:Number(announce.train_id)})});notify(d.ai_enabled?'AI announcement draft created':'Announcement draft created using offline template');await refresh()}
    catch(e){notify(e.message)}
  }
  async function makeAudio(id){
    try{const d=await api(`/api/announcements/${id}/audio`,{method:'POST'});notify('Voice audio generated');await refresh();window.open(API+d.audio_url,'_blank')}
    catch(e){notify(e.message)}
  }
  async function approve(id){try{await api(`/api/announcements/${id}/approve`,{method:'POST'});notify('Draft approved');refresh()}catch(e){notify(e.message)}}
  async function addTrain(e){
    e.preventDefault()
    try{await api('/api/trains',{method:'POST',body:JSON.stringify({...trainForm,platform_number:Number(trainForm.platform_number),delay_minutes:Number(trainForm.delay_minutes)})});setShowTrainForm(false);notify('Train added');refresh()}
    catch(e){notify(e.message)}
  }
  async function askAssistant(e){
    e.preventDefault();const q=assistantQuestion.trim();if(!q)return
    setChat(c=>[...c,{role:'user',text:q}]);setAssistantQuestion('')
    try{const d=await api('/api/assistant/chat',{method:'POST',body:JSON.stringify({question:q,language:'en'})});setChat(c=>[...c,{role:'assistant',text:d.answer}])}
    catch(err){setChat(c=>[...c,{role:'assistant',text:`I can't reach the backend: ${err.message}`}])}
  }
  async function sendEmergency(e){
    e.preventDefault()
    try{const d=await api('/api/emergencies',{method:'POST',body:JSON.stringify(emergency)});notify(d.message);setEmergency({...emergency,message:''});refresh()}
    catch(e){notify(e.message)}
  }
  const filtered=trains.filter(t=>(t.train_name+' '+t.train_number+' '+t.source+' '+t.destination).toLowerCase().includes(query.toLowerCase()))
  const delayed=trains.filter(t=>String(t.status).toLowerCase().includes('delay')).length
  const statusClass=s=>String(s).toLowerCase().includes('delay')?'warning':String(s).toLowerCase().includes('board')?'info':'success'
  const title=page==='Overview'?'Station overview':page
  return <div className={dark?'app dark':'app light'}>
    <aside className={`sidebar ${mobileNav?'show':''}`}>
      <div className="brand"><div className="brand-icon"><TrainFront size={22}/></div><div><b>RAILMATE <i>AI</i></b><small>STATION OPERATIONS</small></div></div>
      <div className="nav-label">CONTROL ROOM</div>
      {nav.map(([name,Icon])=><button key={name} onClick={()=>{setPage(name);setMobileNav(false)}} className={`nav-item ${page===name?'active':''}`}><Icon size={17}/><span>{name}</span>{name==='Announcements'&&<em>VOICE</em>}</button>)}
      <div className="sidebar-bottom"><div className="station-dot"></div><div><b>Central Junction</b><small>Demo station</small></div><span className="live-pill">● DEMO</span></div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="icon-btn mobile-menu" onClick={()=>setMobileNav(!mobileNav)}><Menu/></button>
        <div><div className="eyebrow">RAILWAY INTELLIGENCE PLATFORM</div><h1>{title}</h1></div>
        <div className="top-actions">
          <div className="connection"><span/> API {loading?'SYNCING':'CONNECTED / DEMO'}</div>
          <button className="icon-btn" title="Refresh" onClick={refresh}><RefreshCw size={17}/></button>
          <button className="icon-btn" title="Theme" onClick={()=>setDark(!dark)}><Moon size={17}/></button>
          <button className="icon-btn bell" title="Notifications" onClick={()=>setPage('Overview')}><Bell size={17}/>{notifications.length>0&&<i/>}</button>
          {token?<button className="profile" onClick={()=>{localStorage.removeItem('rail_token');setToken('');notify('Signed out')}}>A <span>Admin</span><LogOut size={14}/></button>:<button className="primary small" onClick={()=>setLoginOpen(true)}>Admin login</button>}
        </div>
      </header>
      <div className="content">
        {page==='Overview'&&<Overview trains={trains} summary={summary} delayed={delayed} setPage={setPage} announcements={announcements} notifications={notifications}/>}
        {page==='Train board'&&<section className="panel"><div className="panel-head"><div><h2>Train board</h2><p>Arrival and departure status from your station database</p></div><button className="primary" onClick={()=>token?setShowTrainForm(true):setLoginOpen(true)}><Plus size={16}/> Add train</button></div><div className="toolbar"><div className="search"><Search size={16}/><input placeholder="Search train, route or number..." value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="secondary" onClick={refresh}><RefreshCw size={15}/> Refresh</button></div><TrainTable trains={filtered} statusClass={statusClass}/>{showTrainForm&&<Modal title="Add train" close={()=>setShowTrainForm(false)}><form className="form-grid" onSubmit={addTrain}>{Object.entries(trainForm).map(([k,v])=><label>{k.replaceAll('_',' ')}<input required value={v} onChange={e=>setTrainForm({...trainForm,[k]:e.target.value})}/></label>)}<button className="primary full">Save train</button></form></Modal>}</section>}
        {page==='Platforms'&&<section className="panel"><div className="panel-head"><div><h2>Platform watch</h2><p>Current platform allocation and occupancy</p></div><span className="live-pill">LIVE DATABASE VIEW</span></div><div className="platform-grid">{platforms.map(p=><div className="platform-card" key={p.id}><div className="platform-number">PF <b>{String(p.number).padStart(2,'0')}</b></div><span className={`pill ${p.status==='Available'?'success':'warning'}`}>{p.status}</span><h3>{p.assigned_train||'No train assigned'}</h3><small>{p.notes||'Platform status from database'}</small></div>)}</div><div className="notice"><AlertTriangle size={16}/> Platform conflict check is a basic demo check, not an operational safety system.</div></section>}
        {page==='Announcements'&&<div className="two-col"><section className="panel"><div className="panel-head"><div><h2>AI announcement studio</h2><p>Generate, review and create multilingual voice drafts</p></div><div className="round-icon"><AudioLines/></div></div><form className="stack-form" onSubmit={createAnnouncement}><label>Select train<select value={announce.train_id} onChange={e=>setAnnounce({...announce,train_id:e.target.value})}>{trains.map(t=><option value={t.id}>{t.train_number} — {t.train_name}</option>)}</select></label><div className="form-grid two"><label>Announcement type<select value={announce.category} onChange={e=>setAnnounce({...announce,category:e.target.value})}><option value="arrival">Arrival</option><option value="departure">Departure</option><option value="delay">Delay</option><option value="cancellation">Cancellation</option></select></label><label>Language<select value={announce.language} onChange={e=>setAnnounce({...announce,language:e.target.value})}><option value="en">English</option><option value="te">Telugu</option><option value="hi">Hindi</option></select></label></div><label>Extra instructions (optional)<textarea rows="3" value={announce.extra_instructions} onChange={e=>setAnnounce({...announce,extra_instructions:e.target.value})} placeholder="Keep it short and polite..."/></label><button className="primary full"><Bot size={16}/> Generate announcement draft</button><p className="muted tiny">AI text uses your configured API key. Without one, built-in templates are used.</p></form></section><section className="panel"><div className="panel-head"><div><h2>Announcement history</h2><p>Drafts and voice files</p></div><Megaphone/></div><div className="announcement-list">{announcements.length===0?<Empty text="No announcements generated yet"/>:announcements.map(a=><div className="announcement" key={a.id}><div className="announcement-top"><span className="pill info">{a.category} · {a.language.toUpperCase()}</span><span className={`pill ${a.approved?'success':'warning'}`}>{a.approved?'Approved':'Needs review'}</span></div><p>{a.message}</p><div className="row-actions">{a.audio_url&&<audio controls src={API+a.audio_url}/>}<button className="secondary mini" onClick={()=>makeAudio(a.id)}><Volume2 size={14}/> Generate voice</button>{!a.approved&&<button className="primary mini" onClick={()=>approve(a.id)}><Check size={14}/> Approve</button>}</div></div>)}</div></section></div>}
        {page==='Passenger assistant'&&<section className="panel assistant-panel"><div className="assistant-intro"><div className="bot-orb"><Bot size={28}/></div><div><h2>RailMate passenger assistant</h2><p>Ask about trains, routes, platforms and recorded delays in the station database.</p></div></div><div className="chat-window">{chat.length===0&&<div className="suggestions"><button onClick={()=>setAssistantQuestion('Where is Coastal Express?')}>Where is Coastal Express?</button><button onClick={()=>setAssistantQuestion('Show delayed trains')}>Show delayed trains</button><button onClick={()=>setAssistantQuestion('Which platform is train RB-311?')}>Find RB-311 platform</button></div>}{chat.map((m,i)=><div className={`bubble ${m.role}`} key={i}>{m.role==='assistant'&&<Bot size={15}/>}<span>{m.text}</span></div>)}</div><form className="chat-input" onSubmit={askAssistant}><input value={assistantQuestion} onChange={e=>setAssistantQuestion(e.target.value)} placeholder="Ask RailMate anything..."/><button className="primary"><MessageCircle size={17}/> Send</button></form><p className="muted tiny">Answers are grounded in this app's database; no live railway feed is connected.</p></section>}
        {page==='Analytics'&&<Analytics trains={trains} summary={summary}/>}
        {page==='Emergency log'&&<div className="two-col"><section className="panel"><div className="panel-head"><div><h2>Emergency alert desk</h2><p>Record a demo incident for station staff</p></div><div className="round-icon red"><AlertTriangle/></div></div><form className="stack-form" onSubmit={sendEmergency}><label>Incident type<select value={emergency.category} onChange={e=>setEmergency({...emergency,category:e.target.value})}><option>Medical</option><option>Security</option><option>Fire</option><option>Passenger assistance</option><option>Other</option></select></label><label>Location<input value={emergency.location} onChange={e=>setEmergency({...emergency,location:e.target.value})}/></label><label>Details<textarea required rows="4" value={emergency.message} onChange={e=>setEmergency({...emergency,message:e.target.value})}/></label><button className="danger full"><AlertTriangle size={16}/> Record emergency alert</button></form><div className="notice red-notice">Demo only: this does not contact emergency services or broadcast over station speakers.</div></section><section className="panel"><h2>Safety workflow</h2><div className="workflow"><div><b>01</b><span><strong>Record incident</strong><small>Save incident details in this demo system.</small></span></div><div><b>02</b><span><strong>Notify dashboard</strong><small>Creates an in-app critical notification.</small></span></div><div><b>03</b><span><strong>Human response</strong><small>Station staff must follow official procedures.</small></span></div></div></section></div>}
      </div>
      <footer>RAILMATE AI <span>·</span> Learning project <span>·</span> Demo station data only</footer>
    </main>
    {loginOpen&&<Modal title="Admin sign in" close={()=>setLoginOpen(false)}><form className="stack-form" onSubmit={doLogin}><label>Username<input value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary full">Sign in</button><p className="muted tiny">Demo credentials are shown in the README. Change them before deployment.</p></form></Modal>}
    {toast&&<div className="toast"><CircleHelp size={16}/>{toast}<button onClick={()=>setToast('')}><X size={14}/></button></div>}
  </div>
}
function Overview({trains,summary,delayed,setPage,announcements,notifications}){
  const data=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day,i)=>({day,ontime:[72,84,78,91,82,95,88][i]}))
  return <><div className="welcome-row"><div><div className="eyebrow">SATURDAY · CONTROL CENTRE</div><h2>Good morning, operator <span>✦</span></h2><p>Here’s what’s happening across Central Junction today.</p></div><button className="secondary" onClick={()=>setPage('Train board')}><TrainFront size={16}/> View train board</button></div>
    <div className="stats-grid"><Stat icon={TrainFront} label="Scheduled trains" value={summary.total_trains??trains.length} trend="Database records" color="cyan"/><Stat icon={Radio} label="Platforms" value={summary.platforms??'—'} trend="Station capacity" color="violet"/><Stat icon={Clock3} label="Delayed services" value={summary.delayed_trains??delayed} trend="Needs attention" color="amber"/><Stat icon={Megaphone} label="Announcements" value={summary.announcements??announcements.length} trend="Saved drafts" color="green"/></div>
    <div className="overview-grid"><section className="panel"><div className="panel-head"><div><h2>Live train board</h2><p>Sample services for Central Junction</p></div><span className="pill info">● DEMO DATA</span></div><TrainTable trains={trains.slice(0,5)} compact/><button className="text-link" onClick={()=>setPage('Train board')}>Open full train board →</button></section><section className="panel"><div className="panel-head"><div><h2>Station updates</h2><p>Recent system activity</p></div><Bell size={18}/></div><div className="activity-list">{notifications.slice(0,4).map(n=><div className="activity"><span className="activity-icon"><Bell size={14}/></span><div><b>{n.title}</b><p>{n.message}</p></div></div>)}<div className="activity"><span className="activity-icon"><ShieldCheck size={14}/></span><div><b>Demo mode enabled</b><p>Train status is sample data; no live railway connection.</p></div></div><div className="activity"><span className="activity-icon"><AudioLines size={14}/></span><div><b>Voice studio ready</b><p>Create announcements in English, Telugu or Hindi.</p></div></div></div><button className="text-link" onClick={()=>setPage('Announcements')}>Open announcement studio →</button></section></div>
    <section className="panel chart-panel"><div className="panel-head"><div><h2>Service performance</h2><p>Illustrative weekly on-time percentage (sample chart)</p></div><span className="pill success">DEMO METRIC</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}}/><YAxis domain={[0,100]} axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}}/><Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--line)',borderRadius:10,color:'var(--text)'}}/><Bar dataKey="ontime" fill="#35c7df" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section>
  </>
}
function Stat({icon:Icon,label,value,trend,color}){return <div className="stat-card"><div className={`stat-icon ${color}`}><Icon size={19}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-trend">{trend}</div></div>}
function TrainTable({trains,statusClass,compact=false}){
 return <div className="table-wrap"><table><thead><tr><th>ARRIVAL</th><th>TRAIN</th><th>ROUTE</th><th>PLATFORM</th><th>STATUS</th></tr></thead><tbody>{trains.map(t=><tr key={t.id}><td className="time">{t.arrival_time}</td><td><b>{t.train_name}</b><small>{t.train_number} · {t.source} → {t.destination}</small></td><td>{t.source} → {t.destination}</td><td><span className="platform-tag">PF {String(t.platform_number).padStart(2,'0')}</span></td><td><span className={`pill ${statusClass?statusClass(t.status):String(t.status).toLowerCase().includes('delay')?'warning':'success'}`}>{t.status}{t.delay_minutes>0?` +${t.delay_minutes}m`:''}</span></td></tr>)}</tbody></table>{trains.length===0&&<Empty text="No matching trains found"/>}</div>
}
function Analytics({trains,summary}){
 const data=[{name:'On time',value:trains.filter(t=>t.status==='On Time').length},{name:'Delayed',value:trains.filter(t=>t.status==='Delayed').length},{name:'Boarding',value:trains.filter(t=>t.status==='Boarding').length}]
 return <div className="two-col"><section className="panel"><h2>Service analytics</h2><p className="muted">Counts calculated from current database records.</p><div className="analytics-list">{data.map(d=><div><span>{d.name}</span><b>{d.value}</b><div className="bar"><i style={{width:`${trains.length?d.value/trains.length*100:0}%`}}/></div></div>)}</div></section><section className="panel"><h2>System summary</h2><div className="summary-list">{Object.entries(summary).filter(([k])=>k!=='data_note').map(([k,v])=><div><span>{k.replaceAll('_',' ')}</span><b>{v}</b></div>)}</div><div className="notice">All figures reflect this project's local database, not official railway performance data.</div></section></div>
}
function Empty({text}){return <div className="empty">{text}</div>}
function Modal({title,close,children}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X size={18}/></button></div>{children}</div></div>}
export default App
