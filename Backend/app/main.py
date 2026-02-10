from fastapi import FastAPI
from app.database import engine
from app.models import Base
from app.routers import dashboard
from app.routers import upload, analysis, ai, reports

Base.metadata.create_all(bind=engine)
app = FastAPI(title="SDAS - Smart Data Analytics System")

app.include_router(reports.router, prefix="/reports")
app.include_router(upload.router, prefix="/upload")
app.include_router(analysis.router, prefix="/analysis")
app.include_router(ai.router, prefix="/ai")
app.include_router(dashboard.router, prefix="/dashboard")

@app.get("/")
def root():
    return {"message": "SDAS Backend Running"}
