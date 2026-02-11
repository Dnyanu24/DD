from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app.models import Base
from app.routers import dashboard
from app.routers import upload, analysis, ai, reports

Base.metadata.create_all(bind=engine)
app = FastAPI(title="SDAS - Smart Data Analytics System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],  # Vite ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reports.router, prefix="/reports")
app.include_router(upload.router, prefix="/upload")
app.include_router(analysis.router, prefix="/analysis")
app.include_router(ai.router, prefix="/ai")
app.include_router(dashboard.router, prefix="/dashboard")

@app.get("/")
def root():
    return {"message": "SDAS Backend Running"}
