import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Plus,
  Search,
  Scissors,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';

const MEASUREMENT_FIELDS = [
  ['bust', 'Bust'],
  ['waist', 'Waist'],
  ['hips', 'Hips'],
  ['shoulder', 'Shoulder'],
  ['sleeve', 'Sleeve'],
  ['dressLength', 'Dress length'],
];

const today = new Date();
const formattedToday = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(today);

function initials(name = '') {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function formatDate(date) {
  if (!date) return 'Not scheduled';
  const parsedDate = date.includes('T') ? new Date(date) : new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(parsedDate);
}

async function readApiResponse(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The API is unavailable. Start the app with npm run dev and check your MongoDB connection.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function Avatar({ client, size = 'normal' }) {
  return client.image
    ? <img className={`avatar avatar-${size}`} src={client.image} alt={client.name} />
    : <span className={`avatar avatar-fallback avatar-${size}`} aria-label={client.name}>{initials(client.name)}</span>;
}

function App() {
  const [clients, setClients] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [activeView, setActiveView] = useState('Overview');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [draft, setDraft] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [apiError, setApiError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/clients')
      .then(readApiResponse)
      .then((result) => result.clients)
      .then((records) => {
        if (cancelled) return;
        setClients(records);
        setActiveId(records[0]?.id ?? '');
        setApiError('');
      })
      .catch((error) => {
        if (cancelled) return;
        setApiError(error.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const activeClient = clients.find((client) => client.id === activeId) ?? clients[0];
  const visibleClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = clients.filter((client) => `${client.name} ${client.service} ${client.email}`.toLowerCase().includes(query));
    if (activeView === 'Measurements') return matches;
    if (activeView === 'Fittings') return matches.filter((client) => client.nextFitting).sort((a, b) => a.nextFitting.localeCompare(b.nextFitting));
    return matches;
  }, [activeView, clients, search]);

  function openNewClient() {
    setEditingClient(null);
    setDraft({ name: '', email: '', phone: '', service: 'Evening wear', nextFitting: '', image: '', notes: '', measurements: Object.fromEntries(MEASUREMENT_FIELDS.map(([key]) => [key, ''])) });
    setPhotoError('');
    setSaveError('');
    setModalOpen(true);
  }

  function openEditClient(client) {
    setEditingClient(client);
    setDraft({ ...client, measurements: { ...client.measurements } });
    setPhotoError('');
    setSaveError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setDraft(null);
    setEditingClient(null);
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateMeasurement(field, value) {
    setDraft((current) => ({ ...current, measurements: { ...current.measurements, [field]: value } }));
  }

  function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose an image file to add a client photo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 720 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        updateDraft('image', canvas.toDataURL('image/jpeg', 0.78));
        setPhotoError('');
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async function saveClient(event) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const response = await fetch(editingClient ? `/api/clients/${editingClient.id}` : '/api/clients', {
        method: editingClient ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const result = await readApiResponse(response);
      const savedClient = result.client;
      setClients((current) => editingClient
        ? current.map((client) => client.id === editingClient.id ? savedClient : client)
        : [savedClient, ...current]);
      setActiveId(savedClient.id);
      setApiError('');
      setNotice(result.email?.status === 'sent'
        ? 'Record saved and measurements emailed to the atelier.'
        : result.email?.status === 'failed'
          ? 'Record saved, but the measurement email could not be sent.'
          : 'Record saved. Configure email settings to enable measurement notifications.');
      closeModal();
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteClient() {
    if (!editingClient || !window.confirm(`Remove ${editingClient.name} from the client book?`)) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const response = await fetch(`/api/clients/${editingClient.id}`, { method: 'DELETE' });
      if (!response.ok) await readApiResponse(response);
      const remaining = clients.filter((client) => client.id !== editingClient.id);
      setClients(remaining);
      setActiveId(remaining[0]?.id ?? '');
      setApiError('');
      setNotice('Client record removed.');
      closeModal();
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  const isFittings = activeView === 'Fittings';
  const isMeasurements = activeView === 'Measurements';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => setActiveView('Overview')} aria-label="Senenity Atelier home">
          <span className="brand-mark"><Scissors size={19} strokeWidth={1.5} /></span>
          <span className="brand-copy"><strong>senenity</strong><small>ATELIER</small></span>
        </a>
        <div className="studio-label">STUDIO DESK</div>
        <nav className="navigation" aria-label="Main navigation">
          {[
            { label: 'Overview', icon: Sparkles },
            { label: 'Clients', icon: UsersRound },
            { label: 'Measurements', icon: Shirt },
            { label: 'Fittings', icon: CalendarDays },
          ].map(({ label, icon: Icon }) => (
            <button className={`nav-item ${activeView === label ? 'nav-item-active' : ''}`} key={label} onClick={() => setActiveView(label)}>
              <Icon size={18} strokeWidth={1.7} /><span>{label}</span>
              {label === 'Clients' && <span className="nav-count">{clients.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="atelier-note"><span className="note-rule" /><p>Made for the<br /><em>details that matter.</em></p><span className="note-flower">✳</span></div>
          <button className="help-link" type="button" title="About this client book"><CircleHelp size={17} /><span>About this client book</span></button>
          <div className="profile-mini"><span className="profile-initial">SA</span><span><strong>Senenity Atelier</strong><small>Fashion studio</small></span><ChevronDown size={15} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Studio <ChevronRight size={14} /> <span>{activeView}</span></div>
          <div className="topbar-right"><span className={`database-status ${apiError ? 'database-status-error' : isLoading ? 'database-status-loading' : ''}`}><span />{apiError ? 'Database offline' : isLoading ? 'Connecting...' : 'MongoDB connected'}</span><span className="today-label"><span className="live-dot" />{formattedToday}</span><span className="topbar-divider" /><span className="studio-avatar">SA</span></div>
        </header>
        {notice && <div className="save-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button></div>}

        <div className="page-content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">YOUR ATELIER, IN ORDER</p>
              <h1>{activeView === 'Overview' ? <>A good day to <em>create.</em></> : activeView}</h1>
              <p className="heading-subtitle">A little more room for the work you love.</p>
            </div>
            <button className="primary-button" onClick={openNewClient}><Plus size={17} />New client</button>
          </section>

          {!isFittings && !isMeasurements && <section className="metrics" aria-label="Studio summary">
            <article className="metric metric-dark"><div className="metric-top"><span>CLIENT BOOK</span><UsersRound size={17} /></div><div className="metric-value">{String(clients.length).padStart(2, '0')}<span>clients</span></div><div className="metric-foot"><span className="metric-mark">↗</span> Growing one fitting at a time</div></article>
            <article className="metric"><div className="metric-top"><span>UP NEXT</span><CalendarDays size={17} /></div><div className="metric-value">{clients.filter((client) => client.nextFitting).length.toString().padStart(2, '0')}<span>fittings</span></div><div className="metric-foot"><span className="metric-accent">This week</span><span> on the calendar</span></div></article>
            <article className="metric metric-spotlight"><div className="spotlight-copy"><span className="metric-top">A NOTE TO SELF</span><p>Thoughtful work<br />is always <em>in fashion.</em></p></div><span className="spotlight-stitch">✳</span></article>
          </section>}

          <section className={`workspace ${isFittings || isMeasurements ? 'workspace-single' : ''}`}>
            <div className="client-list-panel">
              <div className="list-heading">
                <div><p className="eyebrow">{isFittings ? 'ON THE CALENDAR' : isMeasurements ? 'CLIENT RECORDS' : 'THE CLIENT BOOK'}</p><h2>{isFittings ? 'Upcoming fittings' : isMeasurements ? 'Measurements' : 'Recent clients'} <span className="heading-count">{visibleClients.length}</span></h2></div>
                <button className="icon-button filter-button" type="button" title="Filter clients" onClick={() => setSearch('')}><SlidersHorizontal size={17} /></button>
              </div>
              <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a client..." /><kbd>⌘ K</kbd></label>
              {apiError && <p className="api-error" role="alert">{apiError}</p>}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>CLIENT</th><th>COMMISSION</th><th>{isFittings ? 'FITTING DATE' : isMeasurements ? 'LAST UPDATED' : 'NEXT FITTING'}</th><th aria-label="Open client" /></tr></thead>
                  <tbody>
                    {visibleClients.map((client) => <tr className={activeId === client.id ? 'selected-row' : ''} key={client.id} onClick={() => setActiveId(client.id)}>
                      <td><div className="client-cell"><Avatar client={client} /><span><strong>{client.name}</strong><small>{client.email}</small></span></div></td>
                      <td><span className="service-tag">{client.service}</span></td>
                      <td><span className="date-cell"><span className="date-dot" />{isMeasurements ? formatDate(client.updatedAt || client.updated) : formatDate(client.nextFitting)}</span></td>
                      <td><button className="row-arrow" title={`View ${client.name}`} onClick={(event) => { event.stopPropagation(); setActiveId(client.id); }}><ArrowUpRight size={16} /></button></td>
                    </tr>)}
                    {visibleClients.length === 0 && <tr><td colSpan="4" className="empty-state">{isLoading ? 'Loading client records...' : apiError ? 'Connect MongoDB to load and save client records.' : 'No clients found. Try another search or add a client.'}</td></tr>}
                  </tbody>
                </table>
              </div>
              <button className="view-all" onClick={() => setActiveView(activeView === 'Clients' ? 'Overview' : 'Clients')}>{activeView === 'Clients' ? 'Back to overview' : 'View all clients'}<ArrowDownRight size={16} /></button>
            </div>

            {!isFittings && !isMeasurements && <aside className="detail-panel">
              {activeClient ? <>
                <div className="detail-header"><span className="eyebrow">CLIENT SPOTLIGHT</span><button className="text-action" onClick={() => openEditClient(activeClient)}>Edit profile <ArrowUpRight size={14} /></button></div>
                <div className="client-portrait"><Avatar client={activeClient} size="portrait" /><span className="portrait-spark">✳</span></div>
                <h3>{activeClient.name}</h3><p className="client-service">{activeClient.service} <span>·</span> Client since {formatDate(activeClient.updatedAt || activeClient.updated)}</p>
                <div className="detail-separator" />
                <div className="measurement-heading"><div><span className="eyebrow">LATEST RECORD</span><h4>Measurements <small>(inches)</small></h4></div><button className="edit-measurements" title="Edit measurements" onClick={() => openEditClient(activeClient)}><ArrowUpRight size={16} /></button></div>
                <div className="measurement-grid">{MEASUREMENT_FIELDS.map(([key, label]) => <div className="measurement-item" key={key}><span>{label}</span><strong>{activeClient.measurements?.[key] || '—'}<small>{activeClient.measurements?.[key] ? '″' : ''}</small></strong></div>)}</div>
                <div className="next-fitting"><span className="fitting-icon"><Clock3 size={16} /></span><span><small>NEXT FITTING</small><strong>{formatDate(activeClient.nextFitting)}</strong></span><ChevronRight size={16} /></div>
                <div className="client-note"><span>✳</span><p>{activeClient.notes || 'No notes added yet.'}</p></div>
              </> : <div className="empty-detail">Add a client to start a record.</div>}
            </aside>}
          </section>

          <footer className="page-footer"><span> SENENITY ATELIER <span className="footer-dot">·</span> CLIENT BOOK</span><span>Made with care, kept with care.</span></footer>
        </div>
      </main>

      {modalOpen && draft && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <section className="client-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-header"><div><p className="eyebrow">SENENITY ATELIER</p><h2 id="modal-title">{editingClient ? 'Edit client record' : 'A new fitting begins'}</h2></div><button className="icon-button close-button" onClick={closeModal} aria-label="Close"><X size={19} /></button></div>
          <form onSubmit={saveClient}>
            <div className="modal-body">
              <div className="form-section-title"><span>01</span><h3>Client details</h3></div>
              <div className="form-grid">
                <label className="field field-wide">Full name<input autoFocus required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="e.g. Amara Okafor" /></label>
                <label className="field">Email address<input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} placeholder="name@email.com" /></label>
                <label className="field">Phone number<input type="tel" value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} placeholder="+234 ..." /></label>
                <label className="field">Commission<select value={draft.service} onChange={(event) => updateDraft('service', event.target.value)}>{['Evening wear', 'Bridal', 'Traditional', 'Ready-to-wear', 'Alterations', 'Other'].map((service) => <option key={service}>{service}</option>)}</select></label>
                <label className="field">Next fitting<input type="date" value={draft.nextFitting} onChange={(event) => updateDraft('nextFitting', event.target.value)} /></label>
              </div>
              <div className="form-divider" />
              <div className="form-section-title"><span>02</span><h3>Measurements <small>inches</small></h3></div>
              <div className="measurement-input-grid">{MEASUREMENT_FIELDS.map(([key, label]) => <label className="field" key={key}>{label}<div className="input-unit"><input type="number" step="0.25" min="0" value={draft.measurements?.[key] ?? ''} onChange={(event) => updateMeasurement(key, event.target.value)} placeholder="—" /><span>in</span></div></label>)}</div>
              <div className="form-divider" />
              <div className="form-section-title"><span>03</span><h3>Photo & notes</h3></div>
              <div className="photo-notes-row"><label className="photo-upload">{draft.image ? <img src={draft.image} alt="Client preview" /> : <span className="upload-placeholder"><Plus size={19} /><small>Add portrait</small></span>}<input type="file" accept="image/*" onChange={handlePhoto} aria-label="Upload client photo" /></label><label className="field notes-field">Fitting notes<textarea rows="3" value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="Fabric, preferences, details to remember..." /></label></div>
              {photoError && <p className="form-error">{photoError}</p>}
            </div>
            {saveError && <p className="form-error modal-error" role="alert">{saveError}</p>}
            <div className="modal-footer">{editingClient && <button className="delete-button" type="button" onClick={deleteClient} disabled={isSaving}>Remove client</button>}<button className="secondary-button" type="button" onClick={closeModal} disabled={isSaving}>Cancel</button><button className="primary-button" type="submit" disabled={isSaving}><Check size={17} />{isSaving ? 'Saving...' : 'Save record'}</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}

export default App;