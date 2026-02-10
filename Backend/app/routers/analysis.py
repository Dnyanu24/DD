from fastapi import APIRouter, UploadFile, File
import pandas as pd

from app.services.data_cleaning import clean_data
from app.services.profiling import profile_data
from app.services.clustering import product_clustering
from app.services.unknown_data import detect_unknown_data

router = APIRouter()

@router.post("/analyze")
async def analyze_data(file: UploadFile = File(...)):
    # 1️⃣ Read file
    df = pd.read_csv(file.file)

    # 2️⃣ Clean data
    df = clean_data(df)

    # 3️⃣ Profile data
    profile = profile_data(df)

    # 4️⃣ Clustering
    df = product_clustering(df)

    # 5️⃣ Unknown data detection
    df = detect_unknown_data(df)

    return {
        "columns": list(df.columns),
        "rows": len(df),
        "profile": profile,
        "preview": df.head(5).to_dict(orient="records")
    }


from fastapi import APIRouter, UploadFile, File
import pandas as pd

from app.services.data_cleaning import clean_data
from app.services.profiling import profile_data
from app.services.clustering import product_clustering
from app.services.unknown_data import detect_unknown_data
from app.database import SessionLocal
from app.models import AnalysisResult

router = APIRouter()

@router.post("/analyze")
async def analyze_data(file: UploadFile = File(...)):
    df = pd.read_csv(file.file)

    df = clean_data(df)
    profile = profile_data(df)
    df = product_clustering(df)
    df = detect_unknown_data(df)

    db = SessionLocal()
    result = AnalysisResult(
        filename=file.filename,
        summary={
            "columns": list(df.columns),
            "rows": len(df),
            "profile": profile
        }
    )
    db.add(result)
    db.commit()
    db.close()

    return {
        "message": "Analysis completed and saved",
        "preview": df.head(5).to_dict(orient="records")
    }
