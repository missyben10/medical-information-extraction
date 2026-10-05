document.addEventListener('DOMContentLoaded', () => {
  calculateStatsFromDOM();
  initAnalyticsCharts();
  initPatientTimeline();
  
  // Auto-run initial NLP extraction if text present
  const nlpText = document.getElementById('nlpText');
  if (nlpText && nlpText.value.trim()) {
    runNlpExtract();
  }
});

function showSection(sectionId, btn) {
  document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const target = document.getElementById('section-' + sectionId);
  if (target) {
    target.classList.add('active');
  }

  if (btn) {
    btn.classList.add('active');
  }

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.remove('open');
  }

  if (sectionId === 'timeline') {
    initPatientTimeline();
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function initPatientTimeline() {
  const select = document.getElementById('timelinePatientSelect');
  if (!select || !window.APP_RECORDS || window.APP_RECORDS.length === 0) return;

  // Build unique patient map
  const patientMap = new Map();
  window.APP_RECORDS.forEach(r => {
    const pId = r.Patient_ID;
    if (pId && !patientMap.has(pId)) {
      patientMap.set(pId, {
        id: pId,
        name: r.Patient_Name || 'Not Available',
        age: r.Age || 'Not Available',
        gender: r.Gender || 'Not Available'
      });
    }
  });

  // Preserve selected value if already set
  const currentVal = select.value;
  select.innerHTML = '';
  
  patientMap.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.id} — ${p.name}`;
    select.appendChild(opt);
  });

  if (currentVal && patientMap.has(currentVal)) {
    select.value = currentVal;
    renderPatientTimeline(currentVal);
  } else if (select.options.length > 0) {
    select.selectedIndex = 0;
    renderPatientTimeline(select.options[0].value);
  }
}

function onTimelinePatientChange(select) {
  if (select && select.value) {
    renderPatientTimeline(select.value);
  }
}

function renderPatientTimeline(patientId) {
  const container = document.getElementById('timelineContainer');
  const headerBox = document.getElementById('timelinePatientHeader');
  if (!container || !window.APP_RECORDS) return;

  // Filter records for selected patient only
  const patientRecords = window.APP_RECORDS.filter(r => r.Patient_ID === patientId);

  if (patientRecords.length === 0) {
    container.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">No records available for selected patient.</div>';
    if (headerBox) headerBox.style.display = 'none';
    return;
  }

  // Sort chronologically by Visit_Date in ascending order
  patientRecords.sort((a, b) => {
    const dateA = a.Visit_Date || '';
    const dateB = b.Visit_Date || '';
    return dateA.localeCompare(dateB);
  });

  const firstRec = patientRecords[0];
  if (headerBox) {
    headerBox.style.display = 'block';
    headerBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <strong style="font-size: 1.1rem; color: var(--primary-navy);">${firstRec.Patient_ID} — ${firstRec.Patient_Name}</strong>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
            Age: <strong>${firstRec.Age || 'Not Available'}</strong> | Gender: <strong>${firstRec.Gender || 'Not Available'}</strong> | Primary Dept: <strong>${firstRec.Department || 'Not Available'}</strong>
          </div>
        </div>
        <div>
          <span class="status-pill" style="font-size: 0.775rem;">
            ${patientRecords.length} Visit Event${patientRecords.length > 1 ? 's' : ''} Recorded
          </span>
        </div>
      </div>
    `;
  }

  const formatList = (arr, tagClass) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return '<span style="color: var(--text-muted); font-style: italic;">Not Available</span>';
    const clean = arr.filter(x => x && x.toString().trim() !== '' && x.toString().toLowerCase() !== 'none' && x.toString().toLowerCase() !== 'not available');
    if (clean.length === 0) return '<span style="color: var(--text-muted); font-style: italic;">Not Available</span>';
    return clean.map(item => `<span class="tag ${tagClass}">${item}</span>`).join(' ');
  };

  const formatText = (val) => {
    if (!val || val.toString().trim() === '' || val.toString().toLowerCase() === 'none' || val.toString().toLowerCase() === 'not available') {
      return '<span style="color: var(--text-muted); font-style: italic;">Not Available</span>';
    }
    return val;
  };

  container.innerHTML = patientRecords.map((r, idx) => {
    const risk = r.Severity_Risk || 'Low';
    const riskBadge = `<span class="risk-badge risk-${risk.toLowerCase()}">${risk} Risk</span>`;

    return `
      <div class="timeline-event">
        <div class="dot"></div>
        <div class="event-date">
          ${formatText(r.Visit_Date)} &bull; ${formatText(r.Department)} &bull; ${riskBadge}
        </div>
        <div class="event-title">Visit #${idx + 1} — Clinical Evaluation</div>
        <div class="event-desc">
          <div style="margin-bottom: 12px; font-size: 0.875rem; color: var(--text-main); background: #FFFFFF; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <strong style="color: var(--primary-navy);">Clinical Note:</strong><br>
            <div style="margin-top: 4px; line-height: 1.5;">${formatText(r.Clinical_Note)}</div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; font-size: 0.825rem;">
            <div><strong style="color: var(--primary-navy);">Disease / Diagnoses:</strong><br>${formatList(r.Disease, 'tag-disease')}</div>
            <div><strong style="color: var(--primary-navy);">Symptoms & Signs:</strong><br>${formatList(r.Symptoms, 'tag-sym')}</div>
            <div><strong style="color: var(--primary-navy);">Medication Prescribed:</strong><br>${formatList(r.Medication, 'tag-med')}</div>
            <div><strong style="color: var(--primary-navy);">Dosage:</strong><br>${formatList(r.Dosage, 'tag-dose')}</div>
            <div><strong style="color: var(--primary-navy);">Frequency:</strong><br>${formatList(r.Frequency, 'tag-freq')}</div>
            <div><strong style="color: var(--primary-navy);">Treatment Duration:</strong><br>${formatList(r.Treatment_Duration, 'tag-dur')}</div>
            <div><strong style="color: var(--primary-navy);">Temporal Information:</strong><br>${formatList(r.Temporal_Information, 'tag-temp')}</div>
            <div><strong style="color: var(--primary-navy);">Adverse Drug Reaction (ADR):</strong><br>${formatList(r.Adverse_Drug_Reaction, 'tag-adr')}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}


function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
}

function calculateStatsFromDOM() {
  const tableRows = document.querySelectorAll('#section-patients .data-table tbody tr');
  if (!tableRows || tableRows.length === 0) return;

  const patientSet = new Set();
  const diseaseSet = new Set();
  const medSet = new Set();
  let adrCount = 0;
  let highRiskCount = 0;

  tableRows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 7) {
      const pId = cells[0].textContent.trim();
      if (pId) patientSet.add(pId);

      const diseases = cells[5].querySelectorAll('.tag-disease');
      diseases.forEach(d => {
        const val = d.textContent.trim();
        if (val) diseaseSet.add(val);
      });

      const risk = cells[6].textContent.trim();
      if (risk.includes('High')) highRiskCount++;
    }
  });

  document.querySelectorAll('.note-card').forEach(nc => {
    nc.querySelectorAll('.tag-med').forEach(m => {
      const val = m.textContent.trim();
      if (val) medSet.add(val);
    });
    nc.querySelectorAll('.tag-adr').forEach(a => {
      if (!a.textContent.toLowerCase().includes('none')) adrCount++;
    });
  });

  const pElem = document.getElementById('statPatientsCount');
  if (pElem && (!pElem.textContent || pElem.textContent === '0')) pElem.textContent = patientSet.size;

  const dElem = document.getElementById('statDiseasesCount');
  if (dElem && (!dElem.textContent || dElem.textContent === '0')) dElem.textContent = diseaseSet.size;

  const mElem = document.getElementById('statMedsCount');
  if (mElem && (!mElem.textContent || mElem.textContent === '0')) mElem.textContent = medSet.size;

  const aElem = document.getElementById('statAdrCount');
  if (aElem && (!aElem.textContent || aElem.textContent === '0')) aElem.textContent = adrCount;

  const hElem = document.getElementById('statHighRiskCount');
  if (hElem && (!hElem.textContent || hElem.textContent === '0')) hElem.textContent = highRiskCount;
}


function loadPresetNote(selectElem) {
  if (!selectElem || !selectElem.value) return;
  const textarea = document.getElementById('nlpText');
  if (textarea) {
    textarea.value = selectElem.value;
    runNlpExtract();
  }
}

function runNlpExtract() {
  const textarea = document.getElementById('nlpText');
  const text = textarea ? textarea.value.trim() : '';
  const grid = document.getElementById('nlpResultsGrid');
  if (!grid) return;

  if (!text) {
    grid.innerHTML = '<div style="grid-column: 1/-1; padding: 16px; color: var(--text-muted); font-size: 0.9rem;">Please enter or select a clinical note to extract entities.</div>';
    return;
  }

  grid.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: var(--medical-blue);"><i data-lucide="loader-2"></i> Extracting medical entities...</div>';
  if (window.lucide) window.lucide.createIcons();

  fetch('/api/nlp/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  .then(res => res.json())
  .then(data => {
    const renderList = (arr, tagClass) => {
      if (!arr || arr.length === 0 || (arr.length === 1 && arr[0] === 'None')) {
        return '<span style="font-size:0.8rem; color:var(--text-muted);">None detected</span>';
      }
      return arr.map(item => `<span class="tag ${tagClass}">${item}</span>`).join(' ');
    };

    const risk = data.risk || 'Low';
    const riskBadge = `<span class="risk-badge risk-${risk.toLowerCase()}">${risk} Risk</span>`;

    grid.innerHTML = `
      <div class="nlp-entity-card" style="grid-column: 1/-1; background: #F8FAFC; border-left: 4px solid var(--medical-blue);">
        <div class="nlp-entity-card-head" style="justify-content: space-between;">
          <span><i data-lucide="shield-alert"></i> Calculated Severity Risk Assessment</span>
          ${riskBadge}
        </div>
      </div>

      <div class="nlp-entity-card">
        <div class="nlp-entity-card-head"><i data-lucide="activity"></i> Diseases / Diagnoses</div>
        <div>${renderList(data.diseases, 'tag-disease')}</div>
      </div>

      <div class="nlp-entity-card">
        <div class="nlp-entity-card-head"><i data-lucide="stethoscope"></i> Symptoms & Signs</div>
        <div>${renderList(data.symptoms, 'tag-sym')}</div>
      </div>

      <div class="nlp-entity-card">
        <div class="nlp-entity-card-head"><i data-lucide="pill"></i> Medications Prescribed</div>
        <div>${renderList(data.medications, 'tag-med')}</div>
      </div>

      <div class="nlp-entity-card">
        <div class="nlp-entity-card-head"><i data-lucide="scale"></i> Dosage Details</div>
        <div>${renderList(data.dosage, 'tag-dose')}</div>
      </div>

      <div class="nlp-entity-card">
        <div class="nlp-entity-card-head"><i data-lucide="repeat"></i> Frequency</div>
        <div>${renderList(data.frequency, 'tag-freq')}</div>
      </div>

      <div class="nlp-entity-card">
        <div class="nlp-entity-card-head"><i data-lucide="calendar"></i> Treatment Duration</div>
        <div>${renderList(data.duration, 'tag-dur')}</div>
      </div>

      <div class="nlp-entity-card">
        <div class="nlp-entity-card-head"><i data-lucide="clock"></i> Temporal Information</div>
        <div>${renderList(data.temporal, 'tag-temp')}</div>
      </div>

      <div class="nlp-entity-card">
        <div class="nlp-entity-card-head"><i data-lucide="alert-triangle"></i> Adverse Drug Reactions (ADR)</div>
        <div>${renderList(data.adr, 'tag-adr')}</div>
      </div>
    `;

    if (window.lucide) {
      window.lucide.createIcons();
    }
  })
  .catch(err => {
    console.error(err);
    grid.innerHTML = '<div style="grid-column: 1/-1; padding: 16px; color: var(--risk-high-text);">Error parsing clinical entities. Please try again.</div>';
  });
}

function filterPatientTable() {
  const searchInput = document.getElementById('patientSearchInput');
  const riskSelect = document.getElementById('riskFilterSelect');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const selectedRisk = riskSelect ? riskSelect.value.toUpperCase() : 'ALL';

  const rows = document.querySelectorAll('#patientsTable tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const riskCell = row.querySelector('.risk-badge');
    const riskText = riskCell ? riskCell.textContent.toUpperCase() : '';

    const matchesSearch = !query || text.includes(query);
    const matchesRisk = selectedRisk === 'ALL' || riskText.includes(selectedRisk);

    if (matchesSearch && matchesRisk) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function handleFileUpload(input) {
  if (!input || !input.files || input.files.length === 0) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);

  const dropZone = document.querySelector('.drop-zone');
  if (dropZone) {
    dropZone.innerHTML = `
      <i data-lucide="loader-2" style="width: 48px; height: 48px; color: var(--medical-blue);"></i>
      <h3>Uploading ${file.name}...</h3>
      <p style="color: var(--text-muted);">Processing clinical dataset & updating NLP analytics</p>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  fetch('/upload', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success && dropZone) {
      dropZone.innerHTML = `
        <i data-lucide="check-circle-2" style="width: 48px; height: 48px; color: #10B981;"></i>
        <h3 style="color: #10B981;">Dataset Uploaded Successfully!</h3>
        <p>${data.message}</p>
        <button class="btn-primary" style="margin-top: 12px;" onclick="window.location.reload()">
          <i data-lucide="rotate-cw"></i> Reload Dashboard
        </button>
      `;
      if (window.lucide) window.lucide.createIcons();
    } else if (dropZone) {
      dropZone.innerHTML = `
        <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #DC2626;"></i>
        <h3 style="color: #DC2626;">Upload Failed</h3>
        <p>${data.message || 'Error processing CSV file.'}</p>
        <button class="btn-primary" style="margin-top: 12px;" onclick="window.location.reload()">Try Again</button>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  })
  .catch(err => {
    console.error(err);
    if (dropZone) {
      dropZone.innerHTML = `
        <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #DC2626;"></i>
        <h3 style="color: #DC2626;">Upload Error</h3>
        <p>An unexpected error occurred during upload.</p>
        <button class="btn-primary" style="margin-top: 12px;" onclick="window.location.reload()">Try Again</button>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  });
}


function filterTimeline() {
  const searchInput = document.getElementById('timelineSearchInput');
  const patientSelect = document.getElementById('timelinePatientSelect');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const selectedPatient = patientSelect ? patientSelect.value.toUpperCase() : 'ALL';

  const events = document.querySelectorAll('#timelineContainer .timeline-event');
  events.forEach(event => {
    const searchText = (event.getAttribute('data-search-text') || event.textContent).toLowerCase();
    const pId = (event.getAttribute('data-patient-id') || '').toUpperCase();

    const matchesSearch = !query || searchText.includes(query);
    const matchesPatient = selectedPatient === 'ALL' || pId === selectedPatient;

    if (matchesSearch && matchesPatient) {
      event.style.display = '';
    } else {
      event.style.display = 'none';
    }
  });
}

function initAnalyticsCharts() {
  const dCanvas = document.getElementById('diseaseChart');
  if (dCanvas) {
    new Chart(dCanvas, {
      type: 'bar',
      data: {
        labels: ['Type 2 Diabetes', 'Essential Hypertension', 'Bronchial Asthma', 'Community Pneumonia', 'Migraine', 'Rheumatoid Arthritis', 'GERD', 'Gastritis'],
        datasets: [{
          label: 'Identified Cases',
          data: [42, 38, 29, 24, 21, 18, 15, 12],
          backgroundColor: '#0284C7',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#E2E8F0' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  const mCanvas = document.getElementById('medChart');
  if (mCanvas) {
    new Chart(mCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Metformin', 'Lisinopril', 'Aspirin', 'Albuterol', 'Amoxicillin', 'Omeprazole', 'Sertraline'],
        datasets: [{
          data: [58, 46, 39, 32, 28, 22, 19],
          backgroundColor: [
            '#0284C7',
            '#0D9488',
            '#0A1128',
            '#38BDF8',
            '#6366F1',
            '#10B981',
            '#F59E0B'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right' }
        }
      }
    });
  }

  const rCanvas = document.getElementById('riskChart');
  if (rCanvas) {
    new Chart(rCanvas, {
      type: 'pie',
      data: {
        labels: ['High Risk', 'Moderate Risk', 'Low Risk'],
        datasets: [{
          data: [142, 268, 190],
          backgroundColor: [
            '#DC2626',
            '#D97706',
            '#059669'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right' }
        }
      }
    });
  }

  const deptCanvas = document.getElementById('deptChart');
  if (deptCanvas) {
    new Chart(deptCanvas, {
      type: 'bar',
      data: {
        labels: ['General Med', 'Diabetology', 'Cardiology', 'Pulmonology', 'Gastroenterology', 'Neurology', 'Orthopedics', 'Dermatology'],
        datasets: [{
          label: 'Patient Visits',
          data: [95, 82, 78, 64, 58, 49, 42, 38],
          backgroundColor: '#0D9488',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: '#E2E8F0' } },
          y: { grid: { display: false } }
        }
      }
    });
  }
}


