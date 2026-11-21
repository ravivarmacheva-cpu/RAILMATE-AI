# RAILMATE AI — Complete Full-Stack Project

A complete starter project with a React + Vite frontend and a Python FastAPI backend. It includes a station operations dashboard, train board, platform management, AI-assisted announcements, multilingual voice playback, passenger assistant, emergency log, QR code, notifications and analytics.

## 1. Requirements
- Python 3.10+
- Node.js 18+
- Cursor
- Optional: MySQL 8+ (the backend starts with SQLite by default)
- Optional: OpenAI API key for AI-generated text

## 2. Start backend
Open a terminal in `backend`:

```powershell
python -m venv venv
venv\Scripts\activate
python -m pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```
Backend: http://127.0.0.1:8000  
API docs: http://127.0.0.1:8000/docs

Demo login: `admin` / `RailMate@123`

## 3. Start frontend
Open a second terminal in `frontend`:

```powershell
npm install
npm run dev
```
Open the Vite URL printed in the terminal (usually http://localhost:5173).

## 4. Optional MySQL setup
Create a database:
```sql
CREATE DATABASE railmate_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
In `backend/.env`, set:
```env
DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/railmate_ai?charset=utf8mb4
```
Restart the backend. Tables and demo records are created automatically.

## 5. Optional AI
Put your API key in `backend/.env`:
```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```
Without a key, announcement templates and database-backed passenger assistant still work.

## 6. Important
This is an educational demo. Seed trains are fictional sample records, not live Indian Railways data. It does not connect to station public-address hardware, real emergency services, or official train-running feeds. Do not use it for real railway operations. Change the demo admin password and SECRET_KEY before deployment.
