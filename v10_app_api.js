// ================================================================
// APP v10 — API mode (Vercel + Neon backend)
// Replaces localStorage with REST API calls
// ================================================================

const API = window.API_BASE || '';

// ---- API helpers ----
async function apiFetch(path, opts={}) {
  const token = sessionStorage.getItem('cm_token');
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { sessionStorage.removeItem('cm_token'); window.location.reload(); return null; }
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || 'Erro '+res.status); }
  return res.json();
}

const apiGet  = (path) => apiFetch(path);
const apiPost = (path, body) => apiFetch(path, { method: 'POST', body });
const apiPut  = (path, body) => apiFetch(path, { method: 'PUT',  body });

// ---- Main App ----
function App() {
  const { C } = useTheme();
  const [loggedIn, setLI] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [selId, setSel] = useState(null);

  // Data state
  const [users,    setUR] = useState([]);
  const [requests, setRR] = useState([]);
  const [matrix,   setMR] = useState(null);
  const [crits,    setCR] = useState(DEFAULT_CRITS);
  const [phaseDl,  setPH] = useState(JSON.parse(JSON.stringify(DEFAULT_PHASE_DEADLINES)));
  const [deptQ,    setDQ] = useState(null);
  const [sysLog,   setSL] = useState([]);

  // ---- Bootstrap: check existing session ----
  useEffect(() => {
    const token = sessionStorage.getItem('cm_token');
    const userStr = sessionStorage.getItem('cm_user');
    if (token && userStr) {
      try { setLI(JSON.parse(userStr)); } catch {}
    }
    setLoading(false);
  }, []);

  // ---- Load data once logged in ----
  useEffect(() => {
    if (!loggedIn) return;
    loadAll();
  }, [loggedIn]);

  const loadAll = async () => {
    try {
      const [us, rs, mx, cr, ph, dq] = await Promise.all([
        apiGet('/api/users'),
        apiGet('/api/requests'),
        apiGet('/api/config/matrix'),
        apiGet('/api/config/crits'),
        apiGet('/api/config/phasedl'),
        apiGet('/api/config/deptq'),
      ]);
      if (us) setUR(us);
      if (rs) setRR(rs);
      if (mx) setMR(mx);
      if (cr) setCR(cr);
      if (ph) setPH(ph);
      if (dq) setDQ(dq);
    } catch (err) { console.error('loadAll error:', err); }
  };

  // ---- Auth ----
  const login = async (email, password) => {
    const data = await apiPost('/api/auth/login', { email, password });
    if (!data) return 'Erro de conexao';
    sessionStorage.setItem('cm_token', data.token);
    sessionStorage.setItem('cm_user', JSON.stringify(data.user));
    setLI(data.user);
    setView('dashboard');
    return null; // no error
  };

  const logout = () => {
    sessionStorage.removeItem('cm_token');
    sessionStorage.removeItem('cm_user');
    setLI(null); setView('dashboard');
  };

  // ---- Persist helpers ----
  const addSL = async (by, type, event, detail) => {
    const entry = { at: new Date().toISOString(), by, type, event, detail: detail||'' };
    setSL(p => [entry, ...p]);
    try { await apiPut('/api/config/syslog', entry); } catch {}
  };

  const saveReq = async (r) => {
    try {
      const exists = requests.find(x => x.id === r.id);
      if (exists) await apiPut('/api/requests/' + encodeURIComponent(r.id), r);
      else await apiPost('/api/requests', r);
      setRR(p => exists ? p.map(x => x.id === r.id ? r : x) : [r, ...p]);
    } catch (err) { alert('Erro ao salvar SA: ' + err.message); }
  };

const saveUsers = async (list, by, action, detail) => {
    try {
        const existingIds = new Set(users.map(u => String(u.id)));
        const newUsers = list.filter(u => !existingIds.has(String(u.id)) && u.pwd);
        const updatedUsers = list.filter(u => existingIds.has(String(u.id)));
      for (const u of newUsers) {
        await apiPost('/api/users', {
          name: u.name, email: u.email, area: u.area||'',
          role: u.role||'geral', pwd: u.pwd, evalDepts: u.evalDepts||[]
        });
      }
      if (updatedUsers.length > 0) {
        await apiPut('/api/users', { users: updatedUsers });
      }
      const fresh = await apiGet('/api/users');
      if (fresh) setUR(fresh); else setUR(list);
      addSL(by, action||'usuarios', detail||'Usuarios atualizados', '');
    } catch (err) { alert('Erro ao salvar usuarios: ' + err.message); }
  };

  const saveMatrix = async (m, by) => {
    await apiPut('/api/config/matrix', m);
    setMR(m); addSL(by, 'config', 'Matriz atualizada', '');
  };

  const saveCrits = async (cr, by) => {
    await apiPut('/api/config/crits', cr);
    setCR(cr); addSL(by, 'config', 'Criticidades atualizadas', '');
  };

  const savePhaseDl = async (ph, by) => {
    await apiPut('/api/config/phasedl', ph);
    setPH(ph); addSL(by, 'config', 'Prazos de etapa atualizados', '');
  };

  const saveDeptQ = async (q, by) => {
    await apiPut('/api/config/deptq', q);
    setDQ(q); addSL(by, 'config', 'Perguntas de avaliacao atualizadas', '');
  };

  const updateReq = (r) => saveReq(r);

  const createReq = async (r) => {
    await saveReq(r);
    addSL(r.createdByName, 'criacao', 'Nova SA criada', r.id + ' — ' + r.title);
  };

  // ---- Derived ----
  const isAdmin = loggedIn && ['admin','sgq'].includes(loggedIn.role);
  const isSuperAdmin = loggedIn && loggedIn.role === 'admin';
  const selected = requests.find(r => r.id === selId);

  const nav = (v, id) => { setView(v); if (id) setSel(id); };

  // ---- Nav items ----
  const pendAps = isAdmin ? requests.filter(r=>['aberta','revisao'].includes(r.status)).length : 0;
  const pendEv  = loggedIn ? requests.filter(r=>r.status==='avaliacao'&&(r.triage&&r.triage.assignedAreas||[]).some(d=>{const asgn=r.triage&&r.triage.assignments&&r.triage.assignments[d];return asgn===loggedIn.id&&!(r.evaluations&&r.evaluations[d]&&r.evaluations[d].at);})).length : 0;
  const pendAcs = loggedIn ? requests.filter(r=>(r.actions||[]).some(a=>a.responsible===loggedIn.id&&!['concluida','cancelada'].includes(a.status))).length : 0;
  const pendExt = isAdmin ? requests.reduce((s,r)=>s+(r.deadlineExtensions||[]).filter(e=>e.status==='pending').length,0) : 0;

  const navItems=[
    {id:"dashboard", label:"Inicio",       badge:0},
    {id:"changes",   label:"Controles",    badge:0},
    {id:"acoes",     label:"Tarefas",      badge:(pendEv+pendAcs)||0},
    {id:"indicators",label:"Indicadores",  badge:0},
    ...(isAdmin?[
      {id:"matrix",    label:"Matriz",       badge:0,adm:true},
      {id:"crits",     label:"Criticidade",  badge:0,adm:true},
      {id:"perguntas", label:"Perguntas",    badge:0,adm:true},
      {id:"users",     label:"Usuarios",     badge:0,adm:true},
      {id:"settings",  label:"Configuracoes",badge:pendExt||0,adm:true},
      {id:"log",       label:"Auditoria",    badge:0,adm:true},
    ]:[]),
  ];

  // ---- Inline eval modal state ----
  const [inEval, setInEval] = useState(null);

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#888'}}>Carregando...</div>;
  if (!loggedIn) return <LoginScreen onLogin={login} C={C}/>;

  const Sidebar = () => (
    <div style={{width:168,background:'#13162B',borderRight:'1px solid #1E2333',display:'flex',flexDirection:'column',height:'100vh',position:'fixed',left:0,top:0,zIndex:10,overflowY:'auto'}}>
      <div style={{padding:'16px 14px 12px',borderBottom:'1px solid #1E2333'}}>
        <div style={{fontSize:11,fontWeight:800,color:C.accent,letterSpacing:1.5}}>CHANGE</div>
        <div style={{fontSize:9,color:'#3D4A6B',marginTop:1,letterSpacing:.5}}>v10 · {loggedIn.role.toUpperCase()}</div>
      </div>
      <div style={{flex:1,padding:'8px 0'}}>
        {navItems.map(n=>{
          const active=view===n.id;
          return <button key={n.id} onClick={()=>nav(n.id)} style={{width:'100%',padding:'8px 14px',background:active?C.accent+'18':'transparent',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,fontFamily:'inherit',borderLeft:'2px solid '+(active?C.accent:'transparent')}}>
            <span style={{fontSize:12,color:active?C.accent:n.adm?'#6B7A9F':C.dim,fontWeight:active?700:400,textAlign:'left'}}>{n.label}</span>
            {n.badge>0&&<span style={{background:C.danger,color:'#fff',borderRadius:9,fontSize:9,fontWeight:700,padding:'1px 5px',minWidth:16,textAlign:'center'}}>{n.badge}</span>}
          </button>;
        })}
      </div>
      <div style={{padding:'10px 14px',borderTop:'1px solid #1E2333'}}>
        <div style={{fontSize:11,color:'#4A5670',marginBottom:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{loggedIn.name}</div>
        <button onClick={logout} style={{fontSize:11,color:'#4A5670',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:0}}>Sair</button>
      </div>
    </div>
  );

  return <div style={{display:'flex',minHeight:'100vh'}}>
    <Sidebar/>
    <div style={{marginLeft:168,flex:1,minHeight:'100vh',background:C.bg,overflowY:'auto'}}>
      {view==='dashboard' &&<Dashboard requests={requests} currentUser={loggedIn} allUsers={users} crits={crits} isAdmin={isAdmin} onNav={nav} onNewReq={()=>nav('new')}/>}
      {view==='changes'   &&<ChangesTable requests={requests} currentUser={loggedIn} allUsers={users} crits={crits} onNav={nav}/>}
      {view==='acoes'     &&<ActionsPage requests={requests} currentUser={loggedIn} allUsers={users} crits={crits} onNav={nav}/>}
      {view==='indicators'&&<Indicators requests={requests} crits={crits}/>}
      {view==='new'       &&<NewRequestForm currentUser={loggedIn} onSave={(r)=>{createReq(r);nav('detail',r.id);}} onCancel={()=>nav('changes')} C={C}/>}
      {view==='detail'&&selId&&selected&&<RequestDetail request={selected} allUsers={users} matrix={matrix} crits={crits} phaseDl={phaseDl} deptQuestions={deptQ} currentUser={loggedIn} onBack={()=>nav('changes')} onUpdate={updateReq}/>}
      {view==='matrix'    &&isAdmin&&<MatrixEditor matrix={matrix||buildDefaultMatrix()} crits={crits} currentUser={loggedIn} onSave={saveMatrix}/>}
      {view==='crits'     &&isAdmin&&<CritEditor crits={crits} currentUser={loggedIn} onSave={saveCrits}/>}
      {view==='perguntas' &&isAdmin&&<QuestionsEditor deptQuestions={deptQ} currentUser={loggedIn} onSave={saveDeptQ}/>}
      {view==='users'     &&isAdmin&&<UserManager users={users} currentUser={loggedIn} isSuperAdmin={isSuperAdmin} onSave={saveUsers}/>}
      {view==='settings'  &&isAdmin&&<SettingsPage phaseDl={phaseDl} requests={requests} allUsers={users} currentUser={loggedIn} isAdmin={isAdmin} onSavePhaseDl={savePhaseDl} onUpdate={updateReq}/>}
      {view==='log'       &&isAdmin&&<AuditLog requests={requests} sysLog={sysLog}/>}
    </div>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
