# RAILMATE AI — Python FastAPI backend

This backend is designed to connect to your existing Lovable/Vite frontend. It provides train and platform management, multilingual announcement drafts, optional AI wording, MP3 voice generation, passenger search, a database-grounded assistant, QR codes, notifications, emergency-alert records, analytics, and admin login.

## Run in Cursor (Windows)
1. Extract this ZIP.
2. In Cursor choose File → Open Folder → select `RAILMATE_AI_Backend`.
3. Open Terminal → New Terminal and run:

```powershell
python -m venv venv
venv\Scripts\activate
python -m pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/docs to test APIs.

## Database
It runs immediately with SQLite by default. It creates `railmate.db` and sample demo trains automatically.
To use MySQL, create a database:
```sql
CREATE DATABASE railmate_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
Then edit `.env`:
```env
DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/railmate_ai?charset=utf8mb4
```
Restart the server. SQLAlchemy creates the tables.

## Demo admin
Username: `admin`
Password: `RailMate@123`
Get a token at `POST /api/auth/login` with JSON `{"username":"admin","password":"RailMate@123"}`. Use `Authorization: Bearer TOKEN` for protected routes. Change credentials and SECRET_KEY before deployment.

## Connect Lovable frontend
Vite usually runs at `http://localhost:5173`. API base URL:
```js
const API_BASE_URL = "http://127.0.0.1:8000";
const response = await fetch(`${API_BASE_URL}/api/trains`);
const trains = await response.json();
```
Keep your current frontend. Replace sample-data calls with API calls gradually.

## Endpoints
- `GET /health`
- `POST /api/auth/login`
- `GET/POST /api/trains`, `GET/PUT/DELETE /api/trains/{id}`
- `GET/POST /api/platforms`, `PUT /api/platforms/{id}`, `GET /api/platforms/conflicts/check`
- `GET /api/announcements`, `POST /api/announcements/generate`
- `POST /api/announcements/{id}/approve`, `POST /api/announcements/{id}/audio`
- `GET /api/passenger/search?q=...`, `GET /api/passenger/board`
- `POST /api/assistant/chat`
- `GET /api/notifications`
- `POST/GET /api/emergencies` (admin protected)
- `GET /api/analytics/summary`
- `GET /api/qr/train/{id}`

## AI and voice
Add `OPENAI_API_KEY` to `.env` to enable AI-generated wording. Without it, built-in multilingual announcement templates and database lookup assistant work. MP3 uses gTTS and needs internet access. If audio generation fails, the announcement text remains saved.

## Honest limitations
Seed train records are demo data, not live Indian Railways data. Real-time tracking requires a verified data provider/API. QR codes encode the app's current train record. Emergency alerts are stored/displayed in this demo only; no real station PA system or emergency service is contacted. Do not use this learning project for operational railway control.
