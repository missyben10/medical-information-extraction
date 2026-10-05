import os
import re
import sqlite3
import pandas as pd
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_file
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = 'med-extract-system-secret-key-2026-auth-session'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'users.db')
CSV_PATH = os.path.join(BASE_DIR, 'clinical_notes.csv')
PROCESSED_DIR = os.path.join(BASE_DIR, 'processed')

os.makedirs(PROCESSED_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# DATABASE INITIALIZATION & SEEDING (users.db)
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()

    # Seed Default Demo Account: admin@medicalnpl.com / Admin@123
    cursor.execute("SELECT id FROM users WHERE email = ?", ('admin@medicalnpl.com',))
    if not cursor.fetchone():
        hashed_pw = generate_password_hash('Admin@123')
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            ('Admin', 'admin@medicalnpl.com', hashed_pw, 'admin')
        )
        conn.commit()
        print("[OK] Seeded demo account: admin@medicalnpl.com / Admin@123")
    conn.close()

init_db()

# ---------------------------------------------------------------------------
# DATA & NLP ENGINE
# ---------------------------------------------------------------------------
MEDICAL_DICTIONARIES = {
    'diseases': [
        'Type 2 Diabetes Mellitus', 'Type 2 Diabetes', 'Diabetes Mellitus', 'Essential Hypertension', 'Hypertension',
        'Acute Myocardial Infarction', 'Myocardial Infarction', 'Coronary Artery Disease', 'Bronchial Asthma', 'Asthma',
        'Oral Candidiasis', 'Stage 4 Chronic Kidney Disease', 'Chronic Kidney Disease', 'Migraine with Aura', 'Migraine',
        'Community-Acquired Pneumonia', 'Pneumonia', 'Rheumatoid Arthritis', 'Gastroesophageal Reflux Disease', 'GERD',
        'Esophagitis', 'Major Depressive Disorder', 'Systolic Congestive Heart Failure', 'Congestive Heart Failure',
        'Primary Hypothyroidism', 'Hashimoto Thyroiditis', 'Osteoarthritis of Right Knee', 'Osteoarthritis',
        'Plaque Psoriasis', 'Hepatic Steatosis', 'NAFLD', 'Invasive Ductal Carcinoma', 'Chemotherapy Nausea'
    ],
    'symptoms': [
        'polydipsia', 'polyuria', 'blurred vision', 'dry cough', 'retrosternal chest pain', 'shortness of breath',
        'left shoulder pain', 'recurrent wheezing', 'persistent nocturnal cough', 'oral thrush', 'bilateral lower extremity edema',
        'fatigue', 'decreased urine output', 'orthostatic dizziness', 'throbbing unilateral headache', 'photophobia',
        'phonophobia', 'visual aura', 'paresthesia', 'high-grade fever', 'productive cough', 'rust-colored sputum',
        'pleuritic chest pain', 'skin rash', 'morning stiffness', 'symmetrical joint swelling', 'MCP joint pain', 'nausea',
        'burning epigastric pain', 'nocturnal acid regurgitation', 'dysphagia', 'persistent low mood', 'anhedonia',
        'insomnia', 'difficulty concentrating', 'dry mouth', 'paroxysmal nocturnal dyspnea', 'orthopnea', 'pitting pedal edema',
        'hypotension', 'unexplained weight gain', 'cold intolerance', 'constipation', 'progressive right knee pain',
        'joint crepitus', 'joint stiffness', 'dyspepsia', 'erythematous plaques', 'silvery scales', 'pruritus', 'skin atrophy',
        'right upper quadrant discomfort', 'jaundice', 'severe nausea', 'persistent vomiting', 'weakness', 'headache'
    ],
    'medications': [
        'Metformin', 'Lisinopril', 'Aspirin', 'Clopidogrel', 'Atorvastatin', 'Albuterol', 'Fluticasone', 'Furosemide',
        'Losartan', 'Sumatriptan', 'Topiramate', 'Amoxicillin-Clavulanate', 'Amoxicillin', 'Paracetamol', 'Azithromycin',
        'Methotrexate', 'Folic Acid', 'Prednisone', 'Omeprazole', 'Famotidine', 'Sertraline', 'Sacubitril-Valsartan',
        'Empagliflozin', 'Spironolactone', 'Levothyroxine', 'Celecoxib', 'Diclofenac', 'Clobetasol propionate', 'Vitamin E',
        'Ursodeoxycholic Acid', 'Ondansetron', 'Dexamethasone'
    ]
}

def extract_entities(text):
    if not text or not isinstance(text, str):
        return {
            'diseases': [], 'symptoms': [], 'medications': [],
            'dosage': [], 'frequency': [], 'duration': [],
            'temporal': [], 'adr': ['None'], 'risk': 'Low'
        }

    # Diseases
    diseases = [d for d in MEDICAL_DICTIONARIES['diseases'] if re.search(r'\b' + re.escape(d) + r'\b', text, re.I)]
    # Symptoms
    symptoms = [s for s in MEDICAL_DICTIONARIES['symptoms'] if re.search(r'\b' + re.escape(s) + r'\b', text, re.I)]
    # Medications
    meds = [m for m in MEDICAL_DICTIONARIES['medications'] if re.search(r'\b' + re.escape(m) + r'\b', text, re.I)]
    # Dosage
    dosage = list(set(re.findall(r'\b(?:\d+(?:\/\d+)?\s*(?:mg|mcg|g|mL|puffs?|units?|IU|%))\b', text, re.I)))
    # Frequency
    freq = list(set(re.findall(r'\b(?:once daily|twice daily|thrice daily|4 times daily|every \d+ hours?|once weekly|bedtime|before breakfast|as needed|immediately|daily)\b', text, re.I)))
    # Duration
    duration = list(set(re.findall(r'\b(?:\d+\s*(?:days?|weeks?|months?|years?)|ongoing)\b', text, re.I)))
    # Temporal
    temporal = list(set(re.findall(r'\b(?:(?:past|last|over|for|prior to|after|since|during)\s+\d+\s*(?:hours?|days?|weeks?|months?|years?)|day \d+|\d+\s*(?:hours?|days?|weeks?|months?)\s+(?:ago|prior|after))\b', text, re.I)))
    # ADR
    adr_matches = re.findall(r'\b(?:\w+[-\s]induced\s+[\w\s]+?|developed\s+[\w\s]+?\s+secondary to\s+\w+|reports?\s+[\w\s]+?\s+upset|\w+\s+nausea|\w+\s+cough|\w+\s+rash)\b', text, re.I)
    adr = list(set(adr_matches)) if adr_matches else ['None']

    # Risk Calculation
    severe_kw = ['infarction', 'failure', 'kidney', 'sepsis', 'carcinoma', 'stroke']
    if any(k in text.lower() for k in severe_kw) or len(diseases) >= 3:
        risk = 'High'
    elif len(diseases) >= 2 or len(symptoms) >= 4 or (adr and adr[0] != 'None'):
        risk = 'Moderate'
    else:
        risk = 'Low'

    return {
        'diseases': list(set(diseases)),
        'symptoms': list(set(symptoms)),
        'medications': list(set(meds)),
        'dosage': dosage,
        'frequency': freq,
        'duration': duration,
        'temporal': temporal,
        'adr': adr,
        'risk': risk
    }

def load_dataset():
    if not os.path.exists(CSV_PATH):
        return []
    df = pd.read_csv(CSV_PATH)
    records = []
    
    for idx, row in df.iterrows():
        note = str(row.get('Clinical_Note', row.get('clinical_note', '')))
        nlp = extract_entities(note)

        records.append({
            'Patient_ID': str(row.get('Patient_ID', row.get('patient_id', f'P{idx+1:04d}'))),
            'Patient_Name': str(row.get('Patient_Name', row.get('patient_name', 'Not Available'))),
            'Age': str(row.get('Age', row.get('age', 'Not Available'))),
            'Gender': str(row.get('Gender', row.get('gender', 'Not Available'))),
            'Visit_Date': str(row.get('Visit_Date', row.get('admission_date', '2026-09-01'))),
            'Department': str(row.get('Department', row.get('department', 'General Medicine'))),
            'Clinical_Note': note,
            'Disease': str(row.get('Disease', row.get('diseases', '; '.join(nlp['diseases'])))).split('; '),
            'Symptoms': str(row.get('Symptoms', row.get('symptoms', '; '.join(nlp['symptoms'])))).split('; '),
            'Medication': str(row.get('Medication', row.get('medications', '; '.join(nlp['medications'])))).split('; '),
            'Dosage': str(row.get('Dosage', row.get('dosage', '; '.join(nlp['dosage'])))).split('; '),
            'Frequency': str(row.get('Frequency', row.get('frequency', '; '.join(nlp['frequency'])))).split('; '),
            'Treatment_Duration': str(row.get('Treatment_Duration', row.get('duration', '; '.join(nlp['duration'])))).split('; '),
            'Temporal_Information': str(row.get('Temporal_Information', row.get('temporal_info', '; '.join(nlp['temporal'])))).split('; '),
            'Adverse_Drug_Reaction': str(row.get('Adverse_Drug_Reaction', row.get('adverse_reactions', '; '.join(nlp['adr'])))).split('; '),
            'Severity_Risk': str(row.get('Severity_Risk', row.get('severity_risk', nlp['risk'])))
        })
    return records

# ---------------------------------------------------------------------------
# AUTHENTICATION ROUTE DECORATOR
# ---------------------------------------------------------------------------
def login_required(f):
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

# ---------------------------------------------------------------------------
# ROUTES
# ---------------------------------------------------------------------------
@app.route('/login', methods=['GET', 'POST'])
def login_page():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        conn.close()

        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            session['user_name'] = user['name']
            session['user_email'] = user['email']
            session['user_role'] = user['role']
            return redirect(url_for('dashboard'))
        
        return render_template('login.html', error="Invalid email address or password.")
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register_page():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')

        if not name or not email or not password:
            return render_template('register.html', error="All fields are required.")
        if password != confirm:
            return render_template('register.html', error="Passwords do not match.")

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        if cursor.fetchone():
            conn.close()
            return render_template('register.html', error="Email address is already registered.")

        hashed = generate_password_hash(password)
        cursor.execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", (name, email, hashed))
        conn.commit()
        
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        conn.close()

        session['user_id'] = user['id']
        session['user_name'] = user['name']
        session['user_email'] = user['email']
        session['user_role'] = user['role']
        return redirect(url_for('dashboard'))
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

@app.route('/')
@login_required
def dashboard():
    records = load_dataset()
    
    unique_patients = len(set(r['Patient_ID'] for r in records if r.get('Patient_ID')))
    all_diseases = set()
    all_meds = set()
    adr_count = 0
    high_risk_count = 0
    
    for r in records:
        for d in r.get('Disease', []):
            if d and d.strip() and d != 'None':
                all_diseases.add(d.strip())
        for m in r.get('Medication', []):
            if m and m.strip() and m != 'None':
                all_meds.add(m.strip())
        for a in r.get('Adverse_Drug_Reaction', []):
            if a and a.strip() and a.lower() != 'none':
                adr_count += 1
        if r.get('Severity_Risk') == 'High':
            high_risk_count += 1

    stats = {
        'total_notes': len(records),
        'unique_patients': unique_patients,
        'unique_diseases': len(all_diseases),
        'unique_meds': len(all_meds),
        'adr_count': adr_count,
        'high_risk_count': high_risk_count
    }

    return render_template('index.html', user=session, records=records, stats=stats)


@app.route('/api/nlp/extract', methods=['POST'])
@login_required
def api_extract():
    data = request.get_json() or {}
    text = data.get('text', '')
    res = extract_entities(text)
    return jsonify(res)

@app.route('/export')
@login_required
def export_csv():
    records = load_dataset()
    export_df = pd.DataFrame(records)
    out_path = os.path.join(PROCESSED_DIR, 'medical_information_extracted.csv')
    export_df.to_csv(out_path, index=False)
    return send_file(out_path, as_attachment=True, download_name='medical_information_extracted.csv')

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file uploaded.'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file.'}), 400
    if file and file.filename.lower().endswith('.csv'):
        file.save(CSV_PATH)
        return jsonify({'success': True, 'message': f'Dataset "{file.filename}" uploaded and processed successfully.'})
    return jsonify({'success': False, 'message': 'Invalid file format. Please upload a .csv file.'}), 400

if __name__ == '__main__':
    print("[SERVER] Starting Flask Application on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)

