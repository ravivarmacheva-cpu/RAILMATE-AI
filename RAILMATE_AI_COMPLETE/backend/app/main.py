import os, hashlib, hmac
from datetime import datetime, timedelta
from pathlib import Path
from io import BytesIO
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, String, Integer, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, Session, relationship
import qrcode
from gtts import gTTS

DB_URL = os.getenv("DATABASE_URL", "sqlite:///./railmate.db")
if DB_URL.startswith("postgresql://"):
    DB_URL = DB_URL.replace("postgresql://", "postgresql+psycopg://", 1)
connect_args = {"check_same_thread": False} if DB_URL.startswith("sqlite") else {"sslmode": "require"}

engine = create_engine(
    DB_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
SECRET = os.getenv("SECRET_KEY", "change-this-secret-before-deployment")
ALGO = "HS256"
oauth = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
MEDIA = Path("media"); MEDIA.mkdir(exist_ok=True)

class Base(DeclarativeBase): pass
class Admin(Base):
    __tablename__="admins"
    id: Mapped[int]=mapped_column(primary_key=True)
    username: Mapped[str]=mapped_column(String(80), unique=True)
    password_hash: Mapped[str]=mapped_column(String(300))
class Train(Base):
    __tablename__="trains"
    id: Mapped[int]=mapped_column(primary_key=True)
    train_number: Mapped[str]=mapped_column(String(20), unique=True, index=True)
    train_name: Mapped[str]=mapped_column(String(120))
    source: Mapped[str]=mapped_column(String(100))
    destination: Mapped[str]=mapped_column(String(100))
    arrival_time: Mapped[str]=mapped_column(String(10), default="--:--")
    departure_time: Mapped[str]=mapped_column(String(10), default="--:--")
    platform_number: Mapped[int]=mapped_column(Integer, default=1)
    status: Mapped[str]=mapped_column(String(30), default="On Time")
    delay_minutes: Mapped[int]=mapped_column(Integer, default=0)
    is_demo: Mapped[bool]=mapped_column(Boolean, default=True)
class Platform(Base):
    __tablename__="platforms"
    id: Mapped[int]=mapped_column(primary_key=True)
    number: Mapped[int]=mapped_column(Integer, unique=True)
    status: Mapped[str]=mapped_column(String(30), default="Available")
    notes: Mapped[str]=mapped_column(String(250), default="")
class Announcement(Base):
    __tablename__="announcements"
    id: Mapped[int]=mapped_column(primary_key=True)
    train_id: Mapped[int|None]=mapped_column(ForeignKey("trains.id"), nullable=True)
    category: Mapped[str]=mapped_column(String(40))
    language: Mapped[str]=mapped_column(String(10), default="en")
    message: Mapped[str]=mapped_column(Text)
    audio_file: Mapped[str|None]=mapped_column(String(255), nullable=True)
    approved: Mapped[bool]=mapped_column(Boolean, default=False)
    created_at: Mapped[datetime]=mapped_column(DateTime, default=datetime.utcnow)
    train: Mapped[Train|None]=relationship()
class Notification(Base):
    __tablename__="notifications"
    id: Mapped[int]=mapped_column(primary_key=True)
    title: Mapped[str]=mapped_column(String(160))
    message: Mapped[str]=mapped_column(Text)
    severity: Mapped[str]=mapped_column(String(20), default="info")
    created_at: Mapped[datetime]=mapped_column(DateTime, default=datetime.utcnow)
class Emergency(Base):
    __tablename__="emergency_alerts"
    id: Mapped[int]=mapped_column(primary_key=True)
    category: Mapped[str]=mapped_column(String(50))
    location: Mapped[str]=mapped_column(String(120))
    message: Mapped[str]=mapped_column(Text)
    created_at: Mapped[datetime]=mapped_column(DateTime, default=datetime.utcnow)

def get_db():
    db=SessionLocal()
    try: yield db
    finally: db.close()

def pw_hash(pw):
    salt=os.urandom(16); digest=hashlib.pbkdf2_hmac("sha256",pw.encode(),salt,180000)
    return salt.hex()+"$"+digest.hex()
def pw_ok(pw, stored):
    try:
        salt,digest=stored.split("$",1)
        got=hashlib.pbkdf2_hmac("sha256",pw.encode(),bytes.fromhex(salt),180000).hex()
        return hmac.compare_digest(got,digest)
    except Exception: return False
def token_for(username):
    exp=datetime.utcnow()+timedelta(minutes=int(os.getenv("ACCESS_TOKEN_MINUTES","720")))
    return jwt.encode({"sub":username,"exp":exp},SECRET,algorithm=ALGO)
def admin_required(token=Depends(oauth), db:Session=Depends(get_db)):
    try: username=jwt.decode(token,SECRET,algorithms=[ALGO]).get("sub")
    except JWTError: username=None
    user=db.query(Admin).filter_by(username=username).first() if username else None
    if not user: raise HTTPException(401,"Invalid or expired admin token")
    return user

class Login(BaseModel):
    username:str
    password:str
class TrainIn(BaseModel):
    train_number:str=Field(min_length=1,max_length=20)
    train_name:str
    source:str
    destination:str
    arrival_time:str="--:--"
    departure_time:str="--:--"
    platform_number:int=Field(default=1,ge=1)
    status:str="On Time"
    delay_minutes:int=Field(default=0,ge=0)
class PlatformIn(BaseModel):
    number:int=Field(ge=1)
    status:str="Available"
    notes:str=""
class AnnIn(BaseModel):
    train_id:int
    category:str="arrival"
    language:str="en"
    extra_instructions:str=""
class ChatIn(BaseModel):
    question:str=Field(min_length=2,max_length=500)
    language:str="en"
class EmergencyIn(BaseModel):
    category:str
    location:str
    message:str

def ai_text(prompt, fallback):
    key=os.getenv("OPENAI_API_KEY","").strip()
    if not key: return fallback,False
    try:
        from openai import OpenAI
        c=OpenAI(api_key=key)
        r=c.chat.completions.create(model=os.getenv("OPENAI_MODEL","gpt-4o-mini"),
            messages=[{"role":"system","content":"Write concise, calm railway passenger information. Never invent facts; use only supplied facts."},
                      {"role":"user","content":prompt}],temperature=0.25)
        return (r.choices[0].message.content or fallback).strip(),True
    except Exception: return fallback,False

def announcement_text(t,category,lang,extra):
    if lang=="te":
        templates={
          "arrival":f"ప్రయాణికుల దృష్టికి. {t.train_name} రైలు నంబర్ {t.train_number}, ప్లాట్‌ఫారం {t.platform_number} కు చేరుకుంటుంది.",
          "departure":f"ప్రయాణికుల దృష్టికి. {t.train_name} రైలు నంబర్ {t.train_number}, ప్లాట్‌ఫారం {t.platform_number} నుండి బయలుదేరుతుంది.",
          "delay":f"ప్రయాణికుల దృష్టికి. రైలు {t.train_number} సుమారు {t.delay_minutes} నిమిషాలు ఆలస్యంగా నడుస్తోంది.",
          "cancellation":f"ప్రయాణికుల దృష్టికి. రైలు {t.train_number}, {t.train_name}, రద్దు చేయబడింది. అధికారిక సమాచారాన్ని పరిశీలించండి."}
    elif lang=="hi":
        templates={
          "arrival":f"यात्रियों कृपया ध्यान दें। ट्रेन {t.train_name}, संख्या {t.train_number}, प्लेटफॉर्म {t.platform_number} पर आ रही है।",
          "departure":f"यात्रियों कृपया ध्यान दें। ट्रेन {t.train_name}, संख्या {t.train_number}, प्लेटफॉर्म {t.platform_number} से प्रस्थान करेगी।",
          "delay":f"यात्रियों कृपया ध्यान दें। ट्रेन {t.train_number} लगभग {t.delay_minutes} मिनट देरी से चल रही है।",
          "cancellation":f"यात्रियों कृपया ध्यान दें। ट्रेन {t.train_number}, {t.train_name}, रद्द कर दी गई है। आधिकारिक सूचना देखें।"}
    else:
        templates={
          "arrival":f"Attention please. {t.train_name}, train number {t.train_number}, arriving from {t.source}, is expected on platform {t.platform_number}.",
          "departure":f"Attention please. {t.train_name}, train number {t.train_number}, will depart from platform {t.platform_number} for {t.destination}.",
          "delay":f"Attention please. Train {t.train_number}, {t.train_name}, is running approximately {t.delay_minutes} minutes late. We regret the inconvenience.",
          "cancellation":f"Attention please. Train {t.train_number}, {t.train_name}, has been marked cancelled in this demo system. Please verify official station information."}
    return templates.get(category,templates["arrival"])+(f" {extra}" if extra else "")

def train_dict(t):
    return {k:getattr(t,k) for k in ["id","train_number","train_name","source","destination","arrival_time","departure_time","platform_number","status","delay_minutes","is_demo"]}

def seed():
    db=SessionLocal()
    try:
        if not db.query(Admin).filter_by(username="admin").first():
            db.add(Admin(username="admin",password_hash=pw_hash("RailMate@123")))
        if db.query(Train).count()==0:
            db.add_all([
              Train(train_number="RB-214",train_name="Coastal Express",source="Harbor City",destination="Central Junction",arrival_time="08:02",departure_time="08:10",platform_number=4,status="On Time",is_demo=True),
              Train(train_number="RB-605",train_name="Northline Limited",source="Northgate",destination="Central Junction",arrival_time="08:18",departure_time="08:25",platform_number=2,status="Delayed",delay_minutes=12,is_demo=True),
              Train(train_number="RB-311",train_name="Valley Connector",source="Central Junction",destination="Green Valley",arrival_time="08:40",departure_time="08:45",platform_number=7,status="Boarding",is_demo=True),
              Train(train_number="RB-902",train_name="Capital Runner",source="Eastport",destination="Central Junction",arrival_time="09:24",departure_time="09:30",platform_number=6,status="On Time",is_demo=True),
              Train(train_number="RB-447",train_name="Lake District Service",source="Central Junction",destination="Lakeside",arrival_time="09:55",departure_time="10:00",platform_number=5,status="On Time",is_demo=True)])
        if db.query(Platform).count()==0:
            db.add_all([Platform(number=i,status="Assigned" if i in (2,4,5,6,7) else "Available") for i in range(1,9)])
        db.commit()
    finally: db.close()

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine); seed(); yield

app=FastAPI(title="RAILMATE AI API",version="1.0.0",description="Learning/demo backend; seeded train records are not live.",lifespan=lifespan)
origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://railmate-ai.vercel.app"
]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
app.mount("/media",StaticFiles(directory=str(MEDIA)),name="media")

@app.get("/")
def root(): return {"name":"RAILMATE AI","status":"running","docs":"/docs"}
@app.get("/health")
def health(): return {"status":"ok"}

@app.post("/api/auth/login")
def login(data:Login,db:Session=Depends(get_db)):
    a=db.query(Admin).filter_by(username=data.username).first()
    if not a or not pw_ok(data.password,a.password_hash): raise HTTPException(401,"Incorrect username or password")
    return {"access_token":token_for(a.username),"token_type":"bearer"}

@app.get("/api/trains")
def list_trains(q:str="",db:Session=Depends(get_db)):
    query=db.query(Train)
    if q:
        like=f"%{q}%"
        query=query.filter((Train.train_number.like(like))|(Train.train_name.like(like))|(Train.source.like(like))|(Train.destination.like(like)))
    return [train_dict(t) for t in query.order_by(Train.arrival_time).all()]
@app.get("/api/trains/{tid}")
def get_train(tid:int,db:Session=Depends(get_db)):
    t=db.get(Train,tid)
    if not t: raise HTTPException(404,"Train not found")
    return train_dict(t)
@app.post("/api/trains")
def add_train(data:TrainIn,db:Session=Depends(get_db),admin=Depends(admin_required)):
    if db.query(Train).filter_by(train_number=data.train_number).first(): raise HTTPException(409,"Train number already exists")
    t=Train(**data.model_dump(),is_demo=False); db.add(t); db.commit(); db.refresh(t); return train_dict(t)
@app.put("/api/trains/{tid}")
def edit_train(tid:int,data:TrainIn,db:Session=Depends(get_db),admin=Depends(admin_required)):
    t=db.get(Train,tid)
    if not t: raise HTTPException(404,"Train not found")
    for k,v in data.model_dump().items(): setattr(t,k,v)
    t.is_demo=False; db.commit(); return train_dict(t)
@app.delete("/api/trains/{tid}")
def remove_train(tid:int,db:Session=Depends(get_db),admin=Depends(admin_required)):
    t=db.get(Train,tid)
    if not t: raise HTTPException(404,"Train not found")
    db.delete(t); db.commit(); return {"message":"Train deleted"}

@app.get("/api/platforms")
def platforms(db:Session=Depends(get_db)):
    return [{"id":p.id,"number":p.number,"status":p.status,"notes":p.notes,
             "assigned_train":next((t.train_name for t in db.query(Train).filter_by(platform_number=p.number).all()),None)}
            for p in db.query(Platform).order_by(Platform.number).all()]
@app.post("/api/platforms")
def add_platform(data:PlatformIn,db:Session=Depends(get_db),admin=Depends(admin_required)):
    if db.query(Platform).filter_by(number=data.number).first(): raise HTTPException(409,"Platform already exists")
    p=Platform(**data.model_dump()); db.add(p); db.commit(); db.refresh(p); return {"id":p.id,"number":p.number,"status":p.status}
@app.put("/api/platforms/{pid}")
def edit_platform(pid:int,data:PlatformIn,db:Session=Depends(get_db),admin=Depends(admin_required)):
    p=db.get(Platform,pid)
    if not p: raise HTTPException(404,"Platform not found")
    for k,v in data.model_dump().items(): setattr(p,k,v)
    db.commit(); return {"message":"Platform updated"}
@app.get("/api/platforms/conflicts/check")
def conflicts(db:Session=Depends(get_db)):
    trains=db.query(Train).all(); groups={}
    for t in trains: groups.setdefault((t.platform_number,t.arrival_time),[]).append(t.train_number)
    return {"conflicts":[{"platform":k[0],"arrival_time":k[1],"trains":v} for k,v in groups.items() if len(v)>1],
            "note":"Simple same-time demo check only; not operational railway scheduling."}

@app.get("/api/announcements")
def announcements(db:Session=Depends(get_db)):
    return [{"id":a.id,"train_id":a.train_id,"train_number":a.train.train_number if a.train else None,
      "category":a.category,"language":a.language,"message":a.message,"audio_url":f"/media/{a.audio_file}" if a.audio_file else None,
      "approved":a.approved,"created_at":a.created_at.isoformat()} for a in db.query(Announcement).order_by(Announcement.created_at.desc()).limit(100).all()]
@app.post("/api/announcements/generate")
def generate(data:AnnIn,db:Session=Depends(get_db),admin=Depends(admin_required)):
    t=db.get(Train,data.train_id)
    if not t: raise HTTPException(404,"Train not found")
    fallback=announcement_text(t,data.category,data.language,data.extra_instructions)
    prompt=f"Write one {data.language} railway {data.category} announcement. Only use facts: {train_dict(t)}. Extra: {data.extra_instructions}"
    message,used_ai=ai_text(prompt,fallback)
    a=Announcement(train_id=t.id,category=data.category,language=data.language,message=message,approved=False)
    db.add(a); db.commit(); db.refresh(a)
    return {"id":a.id,"message":message,"approved":False,"ai_enabled":used_ai,"note":"Draft only; approval required before any real broadcast."}
@app.post("/api/announcements/{aid}/approve")
def approve(aid:int,db:Session=Depends(get_db),admin=Depends(admin_required)):
    a=db.get(Announcement,aid)
    if not a: raise HTTPException(404,"Announcement not found")
    a.approved=True; db.commit(); return {"message":"Approved for demo display","id":aid}
@app.post("/api/announcements/{aid}/audio")
def audio(aid:int,db:Session=Depends(get_db),admin=Depends(admin_required)):
    a=db.get(Announcement,aid)
    if not a: raise HTTPException(404,"Announcement not found")
    try:
        filename=f"announcement_{aid}.mp3"
        gTTS(text=a.message,lang={"en":"en","te":"te","hi":"hi"}.get(a.language,"en")).save(str(MEDIA/filename))
        a.audio_file=filename; db.commit()
        return {"audio_url":f"/media/{filename}"}
    except Exception as e: raise HTTPException(503,f"Voice generation failed; check internet/TTS language support. {str(e)[:140]}")

@app.get("/api/passenger/search")
def passenger_search(q:str,db:Session=Depends(get_db)):
    like=f"%{q}%"
    rows=db.query(Train).filter((Train.train_number.like(like))|(Train.train_name.like(like))|(Train.source.like(like))|(Train.destination.like(like))).limit(30).all()
    return {"results":[train_dict(t) for t in rows],"note":"is_demo=true means sample data, not live railway status."}
@app.get("/api/passenger/board")
def passenger_board(db:Session=Depends(get_db)): return {"trains":[train_dict(t) for t in db.query(Train).order_by(Train.arrival_time).all()]}

@app.post("/api/assistant/chat")
def assistant(data:ChatIn,db:Session=Depends(get_db)):
    q=data.question.lower(); rows=db.query(Train).all()
    matches=[t for t in rows if any(w in (t.train_number+" "+t.train_name+" "+t.source+" "+t.destination).lower() for w in q.split() if len(w)>2)]
    facts=[train_dict(t) for t in matches[:5]]
    if facts:
        fallback="Matching station database records: "+"; ".join(f"{t['train_name']} ({t['train_number']}), platform {t['platform_number']}, status {t['status']}, arrival {t['arrival_time']}. "+("Sample demo data. " if t["is_demo"] else "") for t in facts)
    else: fallback="I couldn't find that train in this station database. Try the exact train number or name. This demo assistant has no live railway network access."
    answer,used=ai_text(f"Reply in language {data.language}. Passenger question: {data.question}. Use only these database facts: {facts}. If none, say you cannot verify.",fallback)
    return {"answer":answer,"matched_trains":facts,"source":"station_database","ai_enabled":used}

@app.get("/api/notifications")
def notifications(db:Session=Depends(get_db)):
    return [{"id":n.id,"title":n.title,"message":n.message,"severity":n.severity,"created_at":n.created_at.isoformat()}
            for n in db.query(Notification).order_by(Notification.created_at.desc()).limit(50).all()]
@app.post("/api/emergencies")
def emergency(data:EmergencyIn,db:Session=Depends(get_db),admin=Depends(admin_required)):
    e=Emergency(**data.model_dump()); n=Notification(title="Emergency: "+data.category,message=data.location+": "+data.message,severity="critical")
    db.add_all([e,n]); db.commit(); db.refresh(e)
    return {"id":e.id,"message":"Recorded in demo app only; no public-address system or emergency service is contacted."}
@app.get("/api/emergencies")
def emergency_list(db:Session=Depends(get_db),admin=Depends(admin_required)):
    return [{"id":e.id,"category":e.category,"location":e.location,"message":e.message,"created_at":e.created_at.isoformat()}
            for e in db.query(Emergency).order_by(Emergency.created_at.desc()).limit(50).all()]
@app.get("/api/analytics/summary")
def analytics(db:Session=Depends(get_db)):
    return {"total_trains":db.query(Train).count(),"delayed_trains":db.query(Train).filter(Train.status.ilike("%delay%")).count(),
      "cancelled_trains":db.query(Train).filter(Train.status.ilike("%cancel%")).count(),"platforms":db.query(Platform).count(),
      "announcements":db.query(Announcement).count(),"notifications":db.query(Notification).count(),
      "data_note":"Database counts; seeded records are demo data."}
@app.get("/api/qr/train/{tid}")
def qr_train(tid:int,db:Session=Depends(get_db)):
    t=db.get(Train,tid)
    if not t: raise HTTPException(404,"Train not found")
    img=qrcode.make(f"RAILMATE DEMO | {t.train_number} | {t.train_name} | {t.source} to {t.destination} | Platform {t.platform_number} | {t.status}")
    buf=BytesIO(); img.save(buf,format="PNG"); buf.seek(0)
    return StreamingResponse(buf,media_type="image/png")
