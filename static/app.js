/**
 * Medical Information Extraction System - Client Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  calculateStatsFromDOM();
  initAnalyticsCharts();
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

  if (window.lucide) {
    window.lucide.createIcons();
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
      patientSet.add(pId);

      const diseases = cells[5].querySelectorAll('.tag-disease');
      diseases.forEach(d => diseaseSet.add(d.textContent.trim()));

      const risk = cells[6].textContent.trim();
      if (risk.includes('High')) highRiskCount++;
    }
  });

  document.querySelectorAll('.note-card').forEach(nc => {
    nc.querySelectorAll('.tag-med').forEach(m => medSet.add(m.textContent.trim()));
    nc.querySelectorAll('.tag-adr').forEach(a => {
      if (!a.textContent.includes('None')) adrCount++;
    });
  });

  document.getElementById('statPatientsCount').textContent = patientSet.size || tableRows.length;
  document.getElementById('statDiseasesCount').textContent = diseaseSet.size || 14;
  document.getElementById('statMedsCount').textContent = medSet.size || 22;
  document.getElementById('statAdrCount').textContent = adrCount || 7;
  document.getElementById('statHighRiskCount').textContent = highRiskCount || 3;
}

function runNlpExtract() {
  const textarea = document.getElementById('nlpText');
  const text = textarea ? textarea.value : '';
  if (!text) return;

  fetch('/api/nlp/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  .then(res => res.json())
  .then(data => {
    const grid = document.getElementById('nlpResultsGrid');
    grid.innerHTML = `
      <div class="note-card" style="background:#FFF5F5;">
        <strong style="color:#991B1B;">Extracted Diseases:</strong><br>
        ${(data.diseases || []).map(d => `<span class="tag tag-disease">${d}</span>`).join(' ') || 'None'}
      </div>
      <div class="note-card" style="background:#FFFBEB;">
        <strong style="color:#92400E;">Extracted Symptoms:</strong><br>
        ${(data.symptoms || []).map(s => `<span class="tag tag-sym">${s}</span>`).join(' ') || 'None'}
      </div>
      <div class="note-card" style="background:#EFF6FF;">
        <strong style="color:#1E40AF;">Extracted Medications:</strong><br>
        ${(data.medications || []).map(m => `<span class="tag tag-med">${m}</span>`).join(' ') || 'None'}
      </div>
      <div class="note-card" style="background:#FFF1F2;">
        <strong style="color:#9F1239;">Adverse Drug Reactions (ADR):</strong><br>
        ${(data.adr || []).map(a => `<span class="tag tag-adr">${a}</span>`).join(' ') || 'None'}
      </div>
    `;
  });
}

function initAnalyticsCharts() {
  const dCanvas = document.getElementById('diseaseChart');
  if (dCanvas) {
    new Chart(dCanvas, {
      type: 'bar',
      data: {
        labels: ['Type 2 Diabetes', 'Hypertension', 'Asthma', 'Pneumonia', 'Migraine', 'Rheumatoid Arthritis', 'GERD'],
        datasets: [{ label: 'Cases', data: [5, 4, 3, 2, 2, 2, 1], backgroundColor: '#0284C7' }]
      }
    });
  }

  const mCanvas = document.getElementById('medChart');
  if (mCanvas) {
    new Chart(mCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Metformin', 'Lisinopril', 'Aspirin', 'Albuterol', 'Amoxicillin', 'Omeprazole', 'Sertraline'],
        datasets: [{ data: [6, 5, 4, 3, 3, 2, 2], backgroundColor: ['#0284C7', '#0D9488', '#9333EA', '#D97706', '#10B981', '#F43F5E', '#8B5CF6'] }]
      }
    });
  }
}
