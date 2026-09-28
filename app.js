let periods = [];
let rooms = [];
let schedule = [];
let overrides = [];
let generatedRooms = [];
let state = {
    day: 'Monday',
    time: '09:00',
    isLive: true,
    view: 'grid' // or 'map'
};

async function loadData() {
    try {
        const [p, r, s, o] = await Promise.all([
            fetch('data/periods.json').then(res => res.json()),
            fetch('data/rooms.json').then(res => res.json()),
            fetch('data/room_schedule.json').then(res => res.json()),
            fetch('data/room_overrides.json').then(res => res.ok ? res.json() : [])
        ]);
        periods = p;
        rooms = r;
        schedule = s;
        overrides = o;

        // Generate rooms
        generateRooms();
        
        document.getElementById('data-badge').innerText = `Data built: ${new Date().toISOString().split('T')[0]} | Scheduled: ${rooms.length} | Generated: ${generatedRooms.length}`;
        
        initUI();
        updateTime();
        setInterval(updateTime, 60000); // 1 min update
        render();
    } catch (e) {
        console.error("Error loading data:", e);
    }
}

function generateRooms() {
    const existing = new Set(rooms.map(r => r.id));
    CONFIG.floors.forEach(f => {
        for(let i=f.range[0]; i<=f.range[1]; i++) {
            const num = (i < 10 ? '0' : '') + i;
            const rid = `${CONFIG.defaultBuilding}${f.prefix === '0' ? '' : f.prefix}${num}`;
            if (!existing.has(rid)) {
                generatedRooms.push({ id: rid, floor: f.name, capacity: null, ac: null, type: 'Classroom', generated: true });
            }
        }
    });
}

function initUI() {
    const btnLive = document.getElementById('btn-live');
    const daySel = document.getElementById('day-select');
    const timeInp = document.getElementById('time-input');
    const btnToggle = document.getElementById('toggle-view');

    btnLive.onclick = () => { state.isLive = true; updateTime(); render(); };
    daySel.onchange = (e) => { state.day = e.target.value; state.isLive = false; render(); };
    timeInp.onchange = (e) => { state.time = e.target.value; state.isLive = false; render(); };
    btnToggle.onclick = () => {
        state.view = state.view === 'grid' ? 'map' : 'grid';
        btnToggle.innerText = state.view === 'grid' ? '3D Map' : 'Grid';
        document.getElementById('view-grid').style.display = state.view === 'grid' ? 'block' : 'none';
        document.getElementById('view-map').style.display = state.view === 'map' ? 'block' : 'none';
        if(state.view === 'map' && !mapInitialized) init3DMap();
    };

    document.getElementById('ai-search').addEventListener('keypress', async (e) => {
        if(e.key === 'Enter') {
            const query = e.target.value;
            document.getElementById('ai-results').innerHTML = "Searching...";
            try {
                const res = await fetch('/api/find-room', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ query, currentTime: `${state.day} ${state.time}` })
                });
                const data = await res.json();
                document.getElementById('ai-results').innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
            } catch(e) {
                document.getElementById('ai-results').innerHTML = "Error parsing AI request (Offline fallback could run here).";
            }
        }
    });
}

function updateTime() {
    if(!state.isLive) return;
    const now = new Date();
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    state.day = days[now.getDay()];
    state.time = now.toTimeString().substring(0,5);
    document.getElementById('day-select').value = state.day;
    document.getElementById('time-input').value = state.time;
}

// THE SHARED AVAILABILITY FUNCTION
function getAvailability(roomId, targetDay, targetTime) {
    // Determine period
    let currentPeriod = null;
    let nextPeriod = null;
    let periodInfo = periods.find(p => p.start <= targetTime && p.end >= targetTime);
    
    if (periodInfo) {
        currentPeriod = periodInfo;
    } else {
        // Gap or before/after
        nextPeriod = periods.find(p => p.start > targetTime);
    }

    const roomSched = schedule.filter(s => s.room === roomId && s.day === targetDay);
    
    if (currentPeriod) {
        const cls = roomSched.find(s => s.period === currentPeriod.id);
        if (cls) {
            return { status: 'occupied', class: cls, until: currentPeriod.end };
        } else {
            return { status: 'free', until: currentPeriod.end };
        }
    } else {
        if (nextPeriod) {
            const cls = roomSched.find(s => s.period === nextPeriod.id);
            if (cls) {
                return { status: 'soon', class: cls, start: nextPeriod.start };
            }
        }
        return { status: 'free', until: 'EOD' };
    }
}

function render() {
    renderGrid();
    if (state.view === 'map' && mapInitialized) updateMapColors();
    updateSummary();
}

function renderGrid() {
    const cont = document.getElementById('floors-container');
    cont.innerHTML = '';
    
    if(state.day === 'Sunday' || state.day === 'Saturday') {
        cont.innerHTML = '<h3>Weekend! No scheduled classes.</h3>';
        return;
    }

    const allRooms = [...rooms, ...generatedRooms];
    const grouped = {};
    CONFIG.floors.forEach(f => grouped[f.name] = []);
    
    allRooms.forEach(r => {
        if(!grouped[r.floor]) grouped[r.floor] = [];
        grouped[r.floor].push(r);
    });

    for(const floor of CONFIG.floors) {
        const rList = grouped[floor.name].sort((a,b) => a.id.localeCompare(b.id));
        if(!rList.length) continue;

        let floorHtml = `<h3>Floor ${floor.name}</h3><div class="grid">`;
        rList.forEach(r => {
            const avail = getAvailability(r.id, state.day, state.time);
            let statClass = 'status-free';
            let label = avail.status === 'free' ? `Free until ${avail.until}` : (avail.status === 'soon' ? `Class starts ${avail.start}` : `Occupied until ${avail.until}`);
            if(avail.status === 'occupied') statClass = 'status-occupied';
            if(avail.status === 'soon') statClass = 'status-soon';
            if(r.generated) label = "No known class";

            floorHtml += `<div class="room-tile" onclick="openPanel('${r.id}')">
                <div style="font-weight:bold;">${r.id}</div>
                <div style="font-size:0.8rem; margin-top:5px; color:#aaa;">
                    <span class="status-dot ${statClass}"></span>${label}
                </div>
            </div>`;
        });
        floorHtml += `</div>`;
        cont.innerHTML += floorHtml;
    }
}

function updateSummary() {
    const avail = rooms.map(r => getAvailability(r.id, state.day, state.time));
    const free = avail.filter(a => a.status === 'free').length;
    document.getElementById('summary-text').innerText = `${rooms.length + generatedRooms.length} Total Rooms | ${free} Confirmed free | ${generatedRooms.length} No known class`;
}

// 3D MAP LOGIC (Stub)
let mapInitialized = false;
let scene, camera, renderer, controls;
function init3DMap() {
    const el = document.getElementById('map3d');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 1, 1000);
    camera.position.set(0, 50, 100);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    
    // Add simple boxes for floors
    const geom = new THREE.BoxGeometry(20, 2, 20);
    const mat = new THREE.MeshBasicMaterial({ color: 0x444444, wireframe: true });
    for(let i=0; i<CONFIG.floors.length; i++) {
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = i * 10;
        scene.add(mesh);
    }
    
    const animate = function () {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    };
    animate();
    mapInitialized = true;
}
function updateMapColors() {
    // Update materials based on getAvailability()
}

// PANEL
let currentRoom = null;
function openPanel(roomId) {
    currentRoom = roomId;
    const r = [...rooms, ...generatedRooms].find(x => x.id === roomId);
    const avail = getAvailability(roomId, state.day, state.time);
    
    document.getElementById('panel-title').innerText = `${r.id} (Floor ${r.floor})`;
    document.getElementById('panel-status').innerText = avail.status.toUpperCase();
    document.getElementById('panel-countdown').innerText = avail.status === 'free' ? `Free until ${avail.until}` : `Occupied until ${avail.until}`;
    document.getElementById('room-panel').classList.add('open');
}

function closePanel() {
    document.getElementById('room-panel').classList.remove('open');
    currentRoom = null;
}

function callSquad() {
    if(!currentRoom) return;
    const text = `📍 Heading to ${currentRoom}. Come fast!\n${window.location.origin}/?room=${currentRoom}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
}

function reportRoom() {
    if(!currentRoom) return;
    fetch('/api/reports', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room: currentRoom, type: 'occupied', note: 'Reported via web' })
    }).then(r => r.json()).then(d => {
        alert("Report submitted: " + JSON.stringify(d));
    });
}

window.onload = loadData;
